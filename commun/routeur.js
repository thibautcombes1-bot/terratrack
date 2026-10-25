// Routeur hors ligne : plus court chemin (en temps) sur le graphe d'un pack régional,
// et calcul des détours. Tourne aussi bien dans le téléphone que sous Node.
import { distanceKm } from './geo.js';

/** Prépare le graphe du pack (graphe.json) : listes d'adjacence dans les deux sens, index spatial. */
export function chargerGraphe(donnees) {
  const n = donnees.sommets.length / 2;
  const lon = new Float64Array(n);
  const lat = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    lon[i] = donnees.sommets[2 * i] / 1e5;
    lat[i] = donnees.sommets[2 * i + 1] / 1e5;
  }
  const { a, b, m, v, s } = donnees.aretes;
  const arcs = [];
  for (let e = 0; e < a.length; e++) {
    const secondes = m[e] / (v[e] / 3.6);
    if (s[e] >= 0) arcs.push([a[e], b[e], e, 1, secondes]);
    if (s[e] <= 0) arcs.push([b[e], a[e], e, -1, secondes]);
  }
  const graphe = {
    n,
    lon,
    lat,
    aretes: donnees.aretes,
    geometrie: donnees.geometrie,
    noms: donnees.noms,
    avant: adjacence(n, arcs, false),
    arriere: adjacence(n, arcs, true),
  };
  graphe.principal = reseauPrincipal(graphe);
  graphe.grille = indexSpatial(graphe);
  return graphe;
}

/**
 * Carrefours du réseau principal : atteignables depuis le carrefour le plus relié, et
 * capables d'y revenir. On ne s'accroche qu'à eux (pas à un îlot de sens uniques).
 */
function reseauPrincipal(g) {
  let racine = 0;
  for (let i = 1; i < g.n; i++)
    if (g.avant.debut[i + 1] - g.avant.debut[i] > g.avant.debut[racine + 1] - g.avant.debut[racine]) racine = i;
  const atteint = (adj) => {
    const vu = new Uint8Array(g.n);
    const pile = [racine];
    vu[racine] = 1;
    while (pile.length) {
      const u = pile.pop();
      for (let k = adj.debut[u]; k < adj.debut[u + 1]; k++)
        if (!vu[adj.cible[k]]) {
          vu[adj.cible[k]] = 1;
          pile.push(adj.cible[k]);
        }
    }
    return vu;
  };
  const aller = atteint(g.avant);
  const retour = atteint(g.arriere);
  return aller.map((x, i) => x & retour[i]);
}

/** Listes d'adjacence compactes (CSR). `inverse` : arcs retournés, pour les temps « jusqu'à » un point. */
function adjacence(n, arcs, inverse) {
  const debut = new Int32Array(n + 1);
  for (const arc of arcs) debut[(inverse ? arc[1] : arc[0]) + 1]++;
  for (let i = 0; i < n; i++) debut[i + 1] += debut[i];
  const curseur = debut.slice(0, n);
  const cible = new Int32Array(arcs.length);
  const arete = new Int32Array(arcs.length);
  const sens = new Int8Array(arcs.length);
  const temps = new Float32Array(arcs.length);
  for (const [de, vers, e, s, secondes] of arcs) {
    const k = curseur[inverse ? vers : de]++;
    cible[k] = inverse ? de : vers;
    arete[k] = e;
    sens[k] = s;
    temps[k] = secondes;
  }
  return { debut, cible, arete, sens, temps };
}

function indexSpatial(g) {
  const grille = new Map();
  for (let i = 0; i < g.n; i++) {
    if (!g.principal[i]) continue;
    const cle = `${Math.floor(g.lat[i] * 50)}:${Math.floor(g.lon[i] * 50)}`;
    if (!grille.has(cle)) grille.set(cle, []);
    grille.get(cle).push(i);
  }
  return grille;
}

/** Sommet du réseau le plus proche d'un point (recherche en anneaux de ~2 km). */
export function plusProcheSommet(g, p) {
  const ci = Math.floor(p.lat * 50);
  const cj = Math.floor(p.lon * 50);
  let meilleur = -1;
  let dMin = Infinity;
  for (let r = 0; r < 25; r++) {
    for (let i = ci - r; i <= ci + r; i++)
      for (let j = cj - r; j <= cj + r; j++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        for (const s of g.grille.get(`${i}:${j}`) ?? []) {
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

/**
 * Dijkstra depuis `source` (ou vers `source` si `inverse`). S'arrête sur `cible` si fournie.
 * Avec `eviterPeages`, les routes à péage ne sont prises que s'il n'y a vraiment pas d'autre chemin.
 * @returns {{ temps: Float64Array, precedent: Int32Array }} temps en secondes, arc d'arrivée
 */
export function dijkstra(g, source, { inverse = false, cible = -1, limite = Infinity, eviterPeages = false } = {}) {
  const adj = inverse ? g.arriere : g.avant;
  const temps = new Float64Array(g.n).fill(Infinity);
  const precedent = new Int32Array(g.n).fill(-1);
  const tas = new Tas();
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
      if (t < temps[v]) {
        temps[v] = t;
        precedent[v] = k;
        tas.ajouter(t, v);
      }
    }
  }
  return { temps, precedent };
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
  if (s === c) return { secondes: 0, metres: 0, peage: false, routes: [], coords: [[g.lon[s], g.lat[s]]] };
  const { temps, precedent } = dijkstra(g, s, { cible: c, eviterPeages });
  if (!Number.isFinite(temps[c])) return null;
  const arcs = [];
  for (let v = c; v !== s; ) {
    const k = precedent[v];
    arcs.push(k);
    v = trouverOrigine(g, k, v);
  }
  arcs.reverse();
  let metres = 0;
  let secondes = 0;
  let peage = false;
  const routes = [];
  const coords = [];
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
  }
  return { secondes, metres, peage, routes, coords };
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
 * temps pour l'atteindre, et marche éventuelle depuis la route. Deux Dijkstra suffisent pour tous.
 */
export function detours(g, depuis, vers, lieux, { eviterPeages = false } = {}) {
  const s = plusProcheSommet(g, depuis);
  const d = plusProcheSommet(g, vers);
  const aller = dijkstra(g, s, { eviterPeages }).temps;
  const retour = dijkstra(g, d, { inverse: true, eviterPeages }).temps;
  const direct = aller[d];
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
