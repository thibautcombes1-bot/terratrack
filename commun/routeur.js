// Routeur hors ligne : plus court chemin (en temps) sur le graphe d'un pack,
// et calcul des détours. Tourne aussi bien dans le téléphone que sous Node.
// À l'échelle de la France (millions de carrefours), tout est en tableaux typés :
// pas de liste d'objets, et les tampons de recherche sont réutilisés d'un calcul à l'autre.
import { distanceKm } from './geo.js';

const TYPES = { Int32Array, Uint32Array, Uint8Array, Int8Array, Float32Array };

/** Lit graphe.bin (voir outils/pack/construire-pack.mjs) : les tableaux pointent dans le fichier, sans copie. */
export function lireGrapheBinaire(tampon) {
  const octets = tampon instanceof ArrayBuffer ? tampon : tampon.buffer.slice(tampon.byteOffset, tampon.byteOffset + tampon.byteLength);
  const vue = new DataView(octets);
  if (String.fromCharCode(...new Uint8Array(octets, 0, 4)) !== 'TTG1') throw new Error('graphe.bin illisible');
  const longueur = vue.getUint32(4, true);
  const entete = JSON.parse(new TextDecoder().decode(new Uint8Array(octets, 8, longueur)));
  const debut = Math.ceil((8 + longueur) / 8) * 8;
  const t = Object.fromEntries(entete.tableaux.map(({ nom, type, longueur: n, decalage }) => [nom, new TYPES[type](octets, debut + decalage, n)]));
  const { sommets, geometrie, composante, principal, ...aretes } = t;
  return { classes: entete.classes, noms: entete.noms, sommets, geometrie, composante, principal, aretes };
}

/** Prépare le graphe du pack : listes d'adjacence dans les deux sens, index spatial. */
export function chargerGraphe(donnees) {
  const n = donnees.sommets.length / 2;
  const lon = new Float64Array(n);
  const lat = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    lon[i] = donnees.sommets[2 * i] / 1e5;
    lat[i] = donnees.sommets[2 * i + 1] / 1e5;
  }
  const graphe = {
    n,
    lon,
    lat,
    aretes: donnees.aretes,
    geometrie: donnees.geometrie,
    noms: donnees.noms,
    avant: adjacence(n, donnees.aretes, false),
    arriere: adjacence(n, donnees.aretes, true),
  };
  // Calculés une fois à la construction du pack (graphe.bin), ou ici pour un petit graphe.
  const { composante, principal } = donnees.composante ? donnees : composantes(graphe);
  graphe.composante = composante;
  graphe.principal = principal;
  graphe.grille = indexSpatial(graphe);
  return graphe;
}

/**
 * Composantes fortement connexes (Kosaraju, sans récursion) : deux carrefours d'une même
 * composante se rejoignent dans les deux sens. Le réseau principal réunit les grandes
 * composantes (le continent, la Corse…) : on ne s'accroche jamais à un îlot de sens uniques.
 */
export function composantes(g, tailleMin = 500) {
  const { n, avant, arriere } = g;
  const ordre = new Int32Array(n);
  const vu = new Uint8Array(n);
  const pile = new Int32Array(n);
  const curseur = new Int32Array(n);
  let fin = 0;
  for (let r = 0; r < n; r++) {
    if (vu[r]) continue;
    let h = 0;
    pile[h++] = r;
    vu[r] = 1;
    curseur[r] = avant.debut[r];
    while (h) {
      const u = pile[h - 1];
      if (curseur[u] < avant.debut[u + 1]) {
        const v = avant.cible[curseur[u]++];
        if (!vu[v]) {
          vu[v] = 1;
          curseur[v] = avant.debut[v];
          pile[h++] = v;
        }
      } else {
        ordre[fin++] = u;
        h--;
      }
    }
  }
  const composante = new Int32Array(n).fill(-1);
  const tailles = [];
  for (let i = n - 1; i >= 0; i--) {
    const r = ordre[i];
    if (composante[r] >= 0) continue;
    const c = tailles.length;
    let taille = 0;
    let h = 0;
    pile[h++] = r;
    composante[r] = c;
    while (h) {
      const u = pile[--h];
      taille++;
      for (let k = arriere.debut[u]; k < arriere.debut[u + 1]; k++) {
        const v = arriere.cible[k];
        if (composante[v] < 0) {
          composante[v] = c;
          pile[h++] = v;
        }
      }
    }
    tailles.push(taille);
  }
  // Un petit graphe (tests) n'a pas de composante de 500 carrefours : on garde la plus grande.
  const seuil = Math.min(tailleMin, Math.max(0, ...tailles));
  const principal = new Uint8Array(n);
  for (let i = 0; i < n; i++) principal[i] = tailles[composante[i]] >= seuil ? 1 : 0;
  return { composante, principal };
}

/**
 * Listes d'adjacence compactes (CSR), remplies en deux passes sur les arêtes.
 * `inverse` : arcs retournés, pour les temps « jusqu'à » un point.
 */
function adjacence(n, { a, b, m, v, s }, inverse) {
  const debut = new Int32Array(n + 1);
  // Arc a→b si la voie se prend dans ce sens (s ≥ 0), arc b→a si s ≤ 0.
  for (let e = 0; e < a.length; e++) {
    if (s[e] >= 0) debut[(inverse ? b[e] : a[e]) + 1]++;
    if (s[e] <= 0) debut[(inverse ? a[e] : b[e]) + 1]++;
  }
  for (let i = 0; i < n; i++) debut[i + 1] += debut[i];
  const total = debut[n];
  const curseur = debut.slice(0, n);
  const cible = new Int32Array(total);
  const arete = new Int32Array(total);
  const sens = new Int8Array(total);
  const temps = new Float32Array(total);
  const ajouter = (de, vers, e, sensArc) => {
    const k = curseur[inverse ? vers : de]++;
    cible[k] = inverse ? de : vers;
    arete[k] = e;
    sens[k] = sensArc;
    temps[k] = m[e] / (v[e] / 3.6);
  };
  for (let e = 0; e < a.length; e++) {
    if (s[e] >= 0) ajouter(a[e], b[e], e, 1);
    if (s[e] <= 0) ajouter(b[e], a[e], e, -1);
  }
  return { debut, cible, arete, sens, temps };
}

const PAS_GRILLE = 50; // cases de 1/50 de degré, environ 2 km

/** Index spatial des carrefours du réseau principal : une grille en tableaux (CSR), pas de table de hachage. */
function indexSpatial(g) {
  let [iMin, iMax, jMin, jMax] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let s = 0; s < g.n; s++) {
    if (!g.principal[s]) continue;
    const i = Math.floor(g.lat[s] * PAS_GRILLE);
    const j = Math.floor(g.lon[s] * PAS_GRILLE);
    if (i < iMin) iMin = i;
    if (i > iMax) iMax = i;
    if (j < jMin) jMin = j;
    if (j > jMax) jMax = j;
  }
  const lignes = iMax - iMin + 1;
  const colonnes = jMax - jMin + 1;
  const case_ = (s) => (Math.floor(g.lat[s] * PAS_GRILLE) - iMin) * colonnes + (Math.floor(g.lon[s] * PAS_GRILLE) - jMin);
  const debut = new Int32Array(lignes * colonnes + 1);
  for (let s = 0; s < g.n; s++) if (g.principal[s]) debut[case_(s) + 1]++;
  for (let c = 0; c < lignes * colonnes; c++) debut[c + 1] += debut[c];
  const curseur = debut.slice(0, lignes * colonnes);
  const sommets = new Int32Array(debut[lignes * colonnes]);
  for (let s = 0; s < g.n; s++) if (g.principal[s]) sommets[curseur[case_(s)]++] = s;
  return { iMin, jMin, lignes, colonnes, debut, sommets };
}

/** Sommet du réseau le plus proche d'un point (recherche en anneaux de ~2 km). */
export function plusProcheSommet(g, p) {
  const ci = Math.floor(p.lat * PAS_GRILLE);
  const cj = Math.floor(p.lon * PAS_GRILLE);
  const grille = g.grille;
  let meilleur = -1;
  let dMin = Infinity;
  for (let r = 0; r < 25; r++) {
    for (let i = ci - r; i <= ci + r; i++)
      for (let j = cj - r; j <= cj + r; j++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        const li = i - grille.iMin;
        const cj2 = j - grille.jMin;
        if (li < 0 || cj2 < 0 || li >= grille.lignes || cj2 >= grille.colonnes) continue;
        const c = li * grille.colonnes + cj2;
        for (let k = grille.debut[c]; k < grille.debut[c + 1]; k++) {
          const s = grille.sommets[k];
          const d = distanceKm(p, { lat: g.lat[s], lon: g.lon[s] });
          if (d < dMin) {
            dMin = d;
            meilleur = s;
          }
        }
      }
    if (meilleur >= 0 && dMin < r * 1.4) break;
  }
  return meilleur;
}

/** Tas binaire minimal (clés réelles, valeurs entières). */
class Tas {
  constructor() {
    this.cles = [];
    this.valeurs = [];
  }
  get taille() {
    return this.cles.length;
  }
  ajouter(cle, valeur) {
    const { cles, valeurs } = this;
    let i = cles.length;
    cles.push(cle);
    valeurs.push(valeur);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (cles[p] <= cle) break;
      cles[i] = cles[p];
      valeurs[i] = valeurs[p];
      i = p;
    }
    cles[i] = cle;
    valeurs[i] = valeur;
  }
  retirer() {
    const { cles, valeurs } = this;
    const valeur = valeurs[0];
    const derniereCle = cles.pop();
    const derniereValeur = valeurs.pop();
    if (cles.length) {
      let i = 0;
      for (;;) {
        let e = 2 * i + 1;
        if (e >= cles.length) break;
        if (e + 1 < cles.length && cles[e + 1] < cles[e]) e++;
        if (cles[e] >= derniereCle) break;
        cles[i] = cles[e];
        valeurs[i] = valeurs[e];
        i = e;
      }
      cles[i] = derniereCle;
      valeurs[i] = derniereValeur;
    }
    return valeur;
  }
}

/** Éviter les péages : une route à péage « coûte » 30 fois son temps, sans être interdite. */
const PENALITE_PEAGE = 30;

/** Temps minimal (s) à vol d'oiseau entre le sommet `v` et le point (lat, lon), à 110 km/h. */
function volOiseau(g, v, lat, lon) {
  const latMoy = ((g.lat[v] + lat) / 2) * (Math.PI / 180);
  const dx = (g.lon[v] - lon) * 111.32 * Math.cos(latMoy);
  const dy = (g.lat[v] - lat) * 110.57;
  return Math.sqrt(dx * dx + dy * dy) * SECONDES_PAR_KM;
}

/**
 * Dijkstra depuis `source` (ou vers `source` si `inverse`). S'arrête sur `cible` si fournie.
 * Avec `eviterPeages`, les routes à péage ne sont prises que s'il n'y a vraiment pas d'autre chemin.
 * Avec `limite` et `borne` (un sommet), on n'explore que l'ellipse des sommets par où passer
 * pour aller à `borne` en moins de `limite` : les temps y restent exacts.
 * @returns {{ temps: Float64Array, precedent: Int32Array }} temps en secondes, arc d'arrivée
 */
export function dijkstra(g, source, { inverse = false, cible = -1, limite = Infinity, eviterPeages = false, borne = -1 } = {}) {
  const adj = inverse ? g.arriere : g.avant;
  const temps = new Float64Array(g.n).fill(Infinity);
  const precedent = new Int32Array(g.n).fill(-1);
  const tas = new Tas();
  const [latB, lonB] = borne >= 0 ? [g.lat[borne], g.lon[borne]] : [0, 0];
  temps[source] = 0;
  tas.ajouter(0, source);
  while (tas.taille) {
    const u = tas.retirer();
    if (u === cible) break;
    const tu = temps[u];
    if (tu > limite) break;
    for (let k = adj.debut[u]; k < adj.debut[u + 1]; k++) {
      const v = adj.cible[k];
      const t = tu + (eviterPeages && g.aretes.p[adj.arete[k]] ? adj.temps[k] * PENALITE_PEAGE : adj.temps[k]);
      if (t < temps[v] && (borne < 0 || t + volOiseau(g, v, latB, lonB) <= limite)) {
        temps[v] = t;
        precedent[v] = k;
        tas.ajouter(t, v);
      }
    }
  }
  return { temps, precedent };
}

/** Aucune route ne dépasse 110 km/h dans le graphe : le temps à vol d'oiseau à cette vitesse ne surestime jamais. */
const SECONDES_PAR_KM = (3600 / 110) * 0.99;

/** Tampons de recherche, alloués une fois par graphe ; `marque` dit s'ils valent pour la recherche en cours. */
function tampons(g) {
  g.tampons ??= { cout: new Float64Array(g.n), precedent: new Int32Array(g.n), marque: new Uint32Array(g.n), generation: 0 };
  const t = g.tampons;
  if (++t.generation === 0xffffffff) {
    t.marque.fill(0);
    t.generation = 1;
  }
  return t;
}

/**
 * A* de `source` à `cible` : comme Dijkstra, mais guidé vers la cible (vol d'oiseau à 110 km/h),
 * il n'explore qu'un fuseau autour du trajet. Renvoie les arcs du chemin (CSR « avant »), ou null.
 */
function aEtoile(g, source, cible, { eviterPeages = false } = {}) {
  const { cout, precedent, marque, generation } = tampons(g);
  const adj = g.avant;
  const latC = g.lat[cible];
  const lonC = g.lon[cible];
  const estimation = (v) => volOiseau(g, v, latC, lonC);
  const tas = new Tas();
  cout[source] = 0;
  precedent[source] = -1;
  marque[source] = generation;
  tas.ajouter(estimation(source), source);
  while (tas.taille) {
    const f = tas.cles[0];
    const u = tas.retirer();
    const cu = cout[u];
    // Entrée périmée : le sommet a déjà été atteint plus vite.
    if (f > cu + estimation(u) + 1e-6) continue;
    if (u === cible) break;
    for (let k = adj.debut[u]; k < adj.debut[u + 1]; k++) {
      const v = adj.cible[k];
      const c = cu + (eviterPeages && g.aretes.p[adj.arete[k]] ? adj.temps[k] * PENALITE_PEAGE : adj.temps[k]);
      if (marque[v] !== generation || c < cout[v]) {
        marque[v] = generation;
        cout[v] = c;
        precedent[v] = k;
        tas.ajouter(c + estimation(v), v);
      }
    }
  }
  if (marque[cible] !== generation) return null;
  const arcs = [];
  for (let v = cible; v !== source; ) {
    const k = precedent[v];
    arcs.push(k);
    v = trouverOrigine(g, k, v);
  }
  return arcs.reverse();
}

/** Points de la géométrie d'une arête, dans le sens de parcours. */
function pointsArete(g, e, sens) {
  const debut = g.aretes.g[2 * e];
  const fin = g.aretes.g[2 * e + 1];
  const points = [];
  for (let i = debut; i < fin; i++) points.push([g.geometrie[2 * i] / 1e5, g.geometrie[2 * i + 1] / 1e5]);
  return sens > 0 ? points : points.reverse();
}

/**
 * Itinéraire entre deux points : durée, distance, péage, routes empruntées, tracé.
 * @returns {null | { secondes, metres, peage, routes: string[], coords: number[][] }}
 */
export function itineraire(g, de, vers, { eviterPeages = false } = {}) {
  const s = plusProcheSommet(g, de);
  const c = plusProcheSommet(g, vers);
  if (s < 0 || c < 0) return null;
  if (s === c) return { secondes: 0, metres: 0, peage: false, routes: [], coords: [[g.lon[s], g.lat[s]]], vitesses: [] };
  // Pas de route entre la Corse et le continent (ni vers une île) : inutile de tout explorer.
  if (g.composante[s] !== g.composante[c]) return null;
  const arcs = aEtoile(g, s, c, { eviterPeages });
  if (!arcs) return null;
  let metres = 0;
  let secondes = 0;
  let peage = false;
  const routes = [];
  const coords = [];
  // Vitesse de la route pour chaque segment du tracé : sert à estimer la consommation.
  const vitesses = [];
  for (const k of arcs) {
    const e = g.avant.arete[k];
    metres += g.aretes.m[e];
    // Le vrai temps de route, sans la pénalité qui sert seulement à choisir le chemin.
    secondes += g.avant.temps[k];
    if (g.aretes.p[e]) peage = true;
    const nom = g.noms[g.aretes.n[e]];
    if (nom && routes.at(-1) !== nom) routes.push(nom);
    const points = pointsArete(g, e, g.avant.sens[k]);
    coords.push(...(coords.length ? points.slice(1) : points));
    for (let i = 1; i < points.length; i++) vitesses.push(g.aretes.v[e]);
  }
  return { secondes, metres, peage, routes, coords, vitesses };
}

/** Sommet de départ d'un arc (CSR « avant ») arrivant sur `v`. */
function trouverOrigine(g, k, v) {
  const e = g.avant.arete[k];
  return g.avant.sens[k] > 0 ? (g.aretes.a[e] === v ? g.aretes.b[e] : g.aretes.a[e]) : g.aretes.b[e] === v ? g.aretes.a[e] : g.aretes.b[e];
}

/** Itinéraire passant par plusieurs points ; renvoie aussi chaque tronçon. */
export function itineraireMulti(g, points, options = {}) {
  const troncons = [];
  for (let i = 1; i < points.length; i++) {
    const t = itineraire(g, points[i - 1], points[i], options);
    if (!t) return null;
    troncons.push(t);
  }
  return {
    secondes: troncons.reduce((s, t) => s + t.secondes, 0),
    metres: troncons.reduce((s, t) => s + t.metres, 0),
    peage: troncons.some((t) => t.peage),
    coords: troncons.flatMap((t, i) => (i ? t.coords.slice(1) : t.coords)),
    vitesses: troncons.flatMap((t) => t.vitesses),
    troncons,
  };
}

/** Temps de marche (s) entre un lieu et la route la plus proche, au-delà de 150 m. */
const accesAPied = (g, sommet, lieu) => {
  const km = distanceKm(lieu, { lat: g.lat[sommet], lon: g.lon[sommet] });
  return km > 0.15 ? { metres: Math.round(km * 1000), secondes: (km / 4) * 3600 } : { metres: 0, secondes: 0 };
};

/**
 * Détour de chaque lieu sur le trajet `depuis` → `vers` : temps ajouté (s) en passant par lui,
 * temps pour l'atteindre, et marche éventuelle depuis la route. Deux Dijkstra suffisent pour tous ;
 * ils s'arrêtent au temps direct + `detourMaxSec` (un lieu plus loin ferait un détour plus long).
 */
export function detours(g, depuis, vers, lieux, { eviterPeages = false, detourMaxSec = 3600 } = {}) {
  const s = plusProcheSommet(g, depuis);
  const d = plusProcheSommet(g, vers);
  if (s < 0 || d < 0 || g.composante[s] !== g.composante[d]) return [];
  const chemin = s === d ? [] : aEtoile(g, s, d, { eviterPeages });
  if (!chemin) return [];
  // Le temps direct, avec la même pénalité de péage que les deux recherches.
  const direct = chemin.reduce((t, k) => t + (eviterPeages && g.aretes.p[g.avant.arete[k]] ? g.avant.temps[k] * PENALITE_PEAGE : g.avant.temps[k]), 0);
  const limite = direct + detourMaxSec;
  const aller = dijkstra(g, s, { eviterPeages, limite, borne: d }).temps;
  const retour = dijkstra(g, d, { inverse: true, eviterPeages, limite, borne: s }).temps;
  return lieux
    .map((lieu) => {
      const v = plusProcheSommet(g, lieu);
      if (v < 0 || !Number.isFinite(aller[v]) || !Number.isFinite(retour[v])) return null;
      const pied = accesAPied(g, v, lieu);
      return {
        ...lieu,
        detourSec: Math.max(0, aller[v] + retour[v] - direct),
        atteindreSec: aller[v],
        marcheMetres: pied.metres,
        marcheSec: pied.secondes * 2,
      };
    })
    .filter(Boolean);
}
