// Le moteur du road trip : couloir autour de la route, ordre de passage sans
// allers-retours, choix des lieux réparti sur tout le trajet, journées équilibrées.
// Fonctions pures (testées dans itineraire.test.mjs).
import { distanceKm } from '../commun/geo.js';

const TOUR = 2 * Math.PI;

/** Projection plane locale en km (suffisante à l'échelle d'un road trip). */
function projeteur(lat0) {
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
  return (p) => ({ x: p.lon * kx, y: p.lat * 110.57 });
}

/**
 * Prépare une route [[lon, lat], …] : points projetés et abscisses cumulées (km).
 * Les longues géométries OSRM sont allégées à ~1500 points.
 */
export function preparerRoute(coords) {
  const pas = Math.max(1, Math.floor(coords.length / 1500));
  const gardes = coords.filter((_, i) => i % pas === 0 || i === coords.length - 1);
  const proj = projeteur(gardes[0][1]);
  const pts = gardes.map(([lon, lat]) => proj({ lat, lon }));
  const cumul = [0];
  for (let i = 1; i < pts.length; i++)
    cumul.push(cumul[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { coords: gardes, proj, pts, cumul, longueur: cumul.at(-1) };
}

/** Test rapide : le point est-il dans le rectangle des coordonnées [lon, lat], élargi de `margeKm` ? */
export function rectangle(coords, margeKm) {
  let [o, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of coords) {
    if (lon < o) o = lon;
    if (lon > e) e = lon;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  const dLat = margeKm / 110.57;
  const dLon = margeKm / (111.32 * Math.cos((((s + n) / 2) * Math.PI) / 180));
  return ({ lat, lon }) => lat >= s - dLat && lat <= n + dLat && lon >= o - dLon && lon <= e + dLon;
}

/** Position d'un lieu par rapport à la route : abscisse `s` (km), `ecart` (km), `cote` (+1 gauche, -1 droite). */
export function situer(route, lieu) {
  const q = route.proj(lieu);
  if (route.pts.length === 1) return { s: 0, ecart: Math.hypot(q.x - route.pts[0].x, q.y - route.pts[0].y), cote: 1 };
  let meilleur = { s: 0, ecart: Infinity, cote: 1 };
  for (let i = 1; i < route.pts.length; i++) {
    const a = route.pts[i - 1];
    const b = route.pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)) : 0;
    const ecart = Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
    if (ecart < meilleur.ecart)
      meilleur = {
        s: route.cumul[i - 1] + t * Math.sqrt(l2),
        ecart,
        cote: dx * (q.y - a.y) - dy * (q.x - a.x) >= 0 ? 1 : -1,
      };
  }
  return meilleur;
}

/** Points tous les `pasKm` le long de la route (pour chercher les lieux du couloir). */
export function echantillonner(route, pasKm) {
  const points = [];
  for (let s = 0; s <= route.longueur; s += pasKm) {
    let i = route.cumul.findIndex((c) => c >= s);
    if (i <= 0) i = 1;
    if (i >= route.coords.length) break;
    const t = (s - route.cumul[i - 1]) / (route.cumul[i] - route.cumul[i - 1] || 1);
    const [lon1, lat1] = route.coords[i - 1];
    const [lon2, lat2] = route.coords[i];
    points.push({ lat: lat1 + t * (lat2 - lat1), lon: lon1 + t * (lon2 - lon1) });
  }
  const [lon, lat] = route.coords.at(-1);
  points.push({ lat, lon });
  return points;
}

/**
 * Grille hexagonale couvrant un coin à explorer : avec des recherches de 10 km de
 * rayon tous les 16 km, aucun endroit du coin n'échappe à la recherche.
 */
export function grilleCoin(centre, rayonKm, pasKm = 16) {
  const kx = 111.32 * Math.cos((centre.lat * Math.PI) / 180);
  const hauteur = (pasKm * Math.sqrt(3)) / 2;
  const points = [];
  const lignes = Math.ceil(rayonKm / hauteur);
  const colonnes = Math.ceil(rayonKm / pasKm) + 1;
  for (let j = -lignes; j <= lignes; j++)
    for (let i = -colonnes; i <= colonnes; i++) {
      const x = i * pasKm + (j % 2 ? pasKm / 2 : 0);
      const y = j * hauteur;
      if (Math.hypot(x, y) <= rayonKm + pasKm * 0.3)
        points.push({ lat: centre.lat + y / 110.57, lon: centre.lon + x / kx });
    }
  return points;
}

/**
 * Clé d'ordre de passage entre 0 et 1, ou null si le lieu est hors du parcours.
 * - Aller simple : position le long de la route.
 * - Boucle : aller par la gauche de la route, tour du coin dans le sens des aiguilles
 *   d'une montre, retour par la droite. On ne reprend jamais la même route.
 */
export function cleOrdre(lieu, { route, depart, centre, rayonCoin, largeur, boucle }) {
  const dansCoin = centre && distanceKm(centre, lieu) <= rayonCoin;
  const sit = situer(route, lieu);
  if (!boucle) {
    if (sit.ecart > largeur && !dansCoin) return null;
    // Derrière le départ ou au-delà de l'arrivée : ce serait un aller-retour.
    const auBout = (s) => sit.ecart > 3 && Math.abs(sit.s - s) < 0.5;
    if (route.longueur && (auBout(0) || (auBout(route.longueur) && !dansCoin))) return null;
    return { cle: route.longueur ? sit.s / route.longueur : 0, ecart: dansCoin ? 0 : sit.ecart };
  }
  if (dansCoin) {
    const c = route.proj(centre);
    const q = route.proj(lieu);
    const a = route.proj(depart);
    const versDepart = Math.hypot(a.x - c.x, a.y - c.y) > 1 ? Math.atan2(a.y - c.y, a.x - c.x) : Math.PI / 2;
    const alpha = (((Math.atan2(q.y - c.y, q.x - c.x) - versDepart) % TOUR) + TOUR) % TOUR;
    return { cle: 0.3 + 0.4 * (1 - alpha / TOUR), ecart: 0 };
  }
  if (sit.ecart > largeur) return null;
  const avance = route.longueur ? sit.s / route.longueur : 0;
  return sit.cote > 0
    ? { cle: 0.3 * avance, ecart: sit.ecart }
    : { cle: 0.7 + 0.3 * (1 - avance), ecart: sit.ecart };
}

/**
 * Choisit `n` lieux répartis sur tout le parcours : le meilleur de chaque tronçon
 * d'abord (pour ne rater aucun coin), puis les meilleurs restants. Deux lieux
 * gardent au moins `espacementKm` entre eux. Le résultat est trié dans l'ordre de passage.
 */
export function selectionner(candidats, n, espacementKm) {
  const tries = [...candidats].sort((a, b) => b.score - a.score);
  const choisis = [];
  const libre = (c) => choisis.every((x) => distanceKm(x, c) >= espacementKm);
  for (let t = 0; t < n; t++) {
    const meilleur = tries.find((c) => c.cle >= t / n && c.cle < (t + 1) / n && !choisis.includes(c) && libre(c));
    if (meilleur) choisis.push(meilleur);
  }
  for (const c of tries) {
    if (choisis.length >= n) break;
    if (!choisis.includes(c) && libre(c)) choisis.push(c);
  }
  return choisis.sort((a, b) => a.cle - b.cle);
}

/**
 * Découpe une suite de lieux en `nbJours` journées consécutives aussi équilibrées
 * que possible (trajet + visites, en heures). Programmation dynamique : on minimise
 * la journée la plus chargée.
 * @returns {object[][]} les lieux de chaque journée
 */
export function decouperJours(lieux, nbJours, { depart, fin, vitesse }) {
  const n = lieux.length;
  if (!n) return [];
  const k = Math.min(nbJours, n);
  const route = (a, b) => (distanceKm(a, b) * 1.3) / vitesse;
  const charges = lieux.map((l, i) => route(i ? lieux[i - 1] : depart, l) + (l.dureeH ?? 1));
  if (fin) charges[n - 1] += route(lieux[n - 1], fin);
  const somme = [0];
  for (const c of charges) somme.push(somme.at(-1) + c);
  const cout = (i, j) => somme[j] - somme[i];

  // meilleur[j][g] : plus petite charge maximale pour les j premiers lieux en g journées
  const meilleur = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(Infinity));
  const coupe = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(0));
  meilleur[0][0] = 0;
  for (let g = 1; g <= k; g++)
    for (let j = g; j <= n; j++)
      for (let i = g - 1; i < j; i++) {
        const valeur = Math.max(meilleur[i][g - 1], cout(i, j));
        if (valeur < meilleur[j][g]) {
          meilleur[j][g] = valeur;
          coupe[j][g] = i;
        }
      }
  const jours = [];
  for (let j = n, g = k; g > 0; g--) {
    const i = coupe[j][g];
    jours.unshift(lieux.slice(i, j));
    j = i;
  }
  return jours;
}
