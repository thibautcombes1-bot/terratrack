// Les manœuvres viennent d'OSRM ; aucune consigne n'est déduite des virages du tracé.
import { distanceKm } from '../../commun/geo.js';
import { positionRecente } from './suivi.js';
import { facteurRoute } from '../../commun/carburant.js';

export const SERVEUR_GUIDAGE = 'https://routing.openstreetmap.de/routed-car/route/v1/driving/';
const pointValide = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
const coordValide = (c) => Array.isArray(c) && c.length >= 2 && pointValide({ lon: c[0], lat: c[1] });
const lieu = (c) => ({ lon: c[0], lat: c[1] });

export function capEntre(a, b) {
  const r = Math.PI / 180;
  const d = (b.lon - a.lon) * r;
  return (Math.atan2(Math.sin(d) * Math.cos(b.lat * r), Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos(d)) / r + 360) % 360;
}

export function texteManoeuvre(m) {
  const type = m.type;
  const direction = {
    left: 'à gauche', right: 'à droite', 'slight left': 'légèrement à gauche', 'slight right': 'légèrement à droite',
    'sharp left': 'franchement à gauche', 'sharp right': 'franchement à droite', straight: 'tout droit',
  }[m.modifier] ?? 'dans la direction indiquée';
  const vers = m.nom ? ' sur ' + m.nom : '';
  if (type === 'arrive') return 'Vous arrivez à destination';
  if (m.modifier === 'uturn') return 'Faites demi-tour dès que possible';
  if (['roundabout', 'rotary', 'roundabout turn'].includes(type))
    return m.sortie ? 'Au rond-point, prenez la sortie ' + m.sortie + vers : 'Entrez dans le rond-point' + vers;
  if (['exit roundabout', 'exit rotary'].includes(type)) return 'Sortez du rond-point' + vers;
  if (type === 'depart') return 'Rejoignez ' + (m.nom || 'le tracé indiqué');
  if (type === 'merge') return 'Insérez-vous ' + direction + vers;
  if (type === 'on ramp') return 'Prenez la bretelle ' + direction + vers;
  if (type === 'off ramp') return 'Prenez la sortie ' + direction + vers;
  if (type === 'fork') return 'Serrez ' + direction + vers;
  if (type === 'end of road') return 'Au bout de la route, tournez ' + direction + vers;
  if (m.modifier === 'straight' || ['continue', 'new name', 'notification'].includes(type)) return 'Continuez ' + direction + vers;
  return ['turn', 'end of road'].includes(type) ? 'Tournez ' + direction + vers : 'Suivez la route indiquée' + vers;
}

export function symboleManoeuvre(m) {
  if (m.type === 'arrive') return '⚑';
  if (['roundabout', 'rotary', 'roundabout turn', 'exit roundabout', 'exit rotary'].includes(m.type)) return '↻';
  return { left: '↰', right: '↱', 'slight left': '↖', 'slight right': '↗', 'sharp left': '↰', 'sharp right': '↱', uturn: '↶' }[m.modifier] ?? '↑';
}

/** Géométries détaillées des étapes : leur cumul conserve l'ordre, même sur une boucle. */
export function lireGuidage(reponse, cible, index = 0) {
  const route = reponse?.routes?.[index];
  if (reponse?.code !== 'Ok' || !pointValide(cible) || !route?.legs?.length) throw new Error('Aucun itinéraire de guidage disponible.');
  const coords = [], cumul = [], manoeuvres = [];
  let metres = 0;
  for (const etape of route.legs.flatMap((l) => l.steps ?? [])) {
    const m = etape.maneuver;
    const points = etape.geometry?.coordinates;
    if (!m || !coordValide(m.location) || !points?.length || !points.every(coordValide) || !Number.isFinite(etape.duration) || etape.duration < 0)
      throw new Error('Les consignes reçues sont incomplètes.');
    const debut = metres;
    for (const c of points) {
      const precedent = coords.at(-1);
      if (precedent && c[0] === precedent[0] && c[1] === precedent[1]) continue;
      if (precedent) metres += distanceKm(lieu(precedent), lieu(c)) * 1000;
      coords.push(c); cumul.push(metres);
    }
    manoeuvres.push({ type: m.type, modifier: m.modifier, sortie: m.exit, nom: etape.name || etape.ref || '', debut, fin: metres, secondes: etape.duration, cap: m.bearing_after ?? 0 });
  }
  if (coords.length < 2 || !manoeuvres.length || manoeuvres.at(-1).type !== 'arrive') throw new Error('Le trajet reçu est incomplet.');
  return { coords, cumul, manoeuvres, metres, equivalents: manoeuvres.reduce((s, m) => s + (m.fin - m.debut) / 1000 * facteurRoute(m.secondes > 0 ? (m.fin - m.debut) / m.secondes * 3.6 : 50), 0),
    secondes: manoeuvres.reduce((s, m) => s + m.secondes, 0),
    routes: [...new Set(manoeuvres.map((m) => m.nom).filter(Boolean))].slice(0, 3),
    cible: { lat: cible.lat, lon: cible.lon, nom: cible.nom || 'Destination' }, cree: Date.now() };
}

export function lireItineraires(reponse, cible) {
  if (reponse?.code !== 'Ok' || !Array.isArray(reponse.routes) || !reponse.routes.length) throw new Error('Aucun itinéraire de guidage disponible.');
  const vus = new Set();
  const trajets = reponse.routes.flatMap((_, i) => {
    try {
      const trajet = lireGuidage(reponse, cible, i);
      const cle = JSON.stringify(trajet.coords);
      if (vus.has(cle)) return [];
      vus.add(cle);
      return [trajet];
    } catch { return []; }
  });
  if (!trajets.length) throw new Error('Les consignes reçues sont incomplètes.');
  return trajets;
}

let prochainDepart = 0;
export async function calculerItineraires(depart, cible, { signal, passages = [], eviterPeages = false, demander = fetch } = {}) {
  if (!pointValide(depart) || !pointValide(cible)) throw new Error('Position ou destination invalide.');
  const points = [depart, ...passages.slice(0, 23), cible];
  if (!points.every(pointValide)) throw new Error('Point de passage invalide.');
  const url = new URL(points.map((p) => p.lon.toFixed(6) + ',' + p.lat.toFixed(6)).join(';'), SERVEUR_GUIDAGE);
  url.search = new URLSearchParams({ alternatives: points.length === 2 ? 'true' : 'false', steps: 'true', overview: 'full', geometries: 'geojson', continue_straight: 'true', waypoints: '0;' + (points.length - 1), ...(eviterPeages ? { exclude: 'toll' } : {}) });
  // Le serveur public limite les requêtes à une par seconde, même après des changements rapides d'options.
  if (demander === fetch) {
    const attente = Math.max(0, prochainDepart - Date.now());
    prochainDepart = Date.now() + attente + 1100;
    if (attente) await new Promise((resolu) => setTimeout(resolu, attente));
    signal?.throwIfAborted();
  }
  const reponse = await demander(url.href, { signal });
  if (!reponse.ok) throw new Error(eviterPeages ? 'Le guidage sans péage est indisponible sur ce serveur.' : 'Le calcul du guidage est indisponible.');
  return lireItineraires(await reponse.json(), cible);
}

export async function calculerGuidage(depart, cible, options) {
  return (await calculerItineraires(depart, cible, options))[0];
}

/** Cherche dans une fenêtre de progression pour ne pas sauter une boucle ou un carrefour revisité. */
export function suivreGuidage(trajet, position, precedent = null, maintenant = Date.now()) {
  if (!positionRecente(position, maintenant) || !pointValide(position) || !Number.isFinite(position.precision) || position.precision < 0 || position.precision > 100)
    return { genre: 'gps', texte: 'En attente d’une position GPS précise', progression: precedent?.progression ?? 0 };
  const ancien = precedent?.progression ?? 0;
  const mouvement = precedent?.position ? distanceKm(precedent.position, position) * 1000 : 0;
  const limite = ancien + Math.max(500, mouvement * 2 + position.precision);
  const kx = 111320 * Math.cos(position.lat * Math.PI / 180);
  let meilleur = { ecart: Infinity, s: ancien, index: 1, t: 0 };
  for (let i = 1; i < trajet.coords.length; i++) {
    if (trajet.cumul[i] < ancien - 35 || trajet.cumul[i - 1] > limite) continue;
    const [a, b] = [trajet.coords[i - 1], trajet.coords[i]];
    const ax = (a[0] - position.lon) * kx, ay = (a[1] - position.lat) * 110570;
    const dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * 110570;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    const ecart = Math.hypot(ax + t * dx, ay + t * dy);
    if (ecart < meilleur.ecart - 0.1) meilleur = { ecart, s: trajet.cumul[i - 1] + t * (trajet.cumul[i] - trajet.cumul[i - 1]), index: i, t };
  }
  if (meilleur.ecart > Math.max(50, position.precision * 1.5)) {
    const debut = lieu(trajet.coords[0]), distance = distanceKm(position, debut) * 1000;
    if (ancien <= 5 && precedent?.genre !== 'direct' && distance <= 300)
      return { genre: 'rejoindre', texte: 'Rejoignez le départ du tracé routier', progression: 0, position, cap: capEntre(position, debut), distance };
    return { genre: 'hors-route', texte: 'Vous avez quitté le trajet', progression: ancien, position, ecart: meilleur.ecart };
  }
  const progression = Math.max(ancien, meilleur.s);
  const arrive = trajet.metres - progression < 40 && distanceKm(position, trajet.cible) * 1000 < 70;
  // La prochaine consigne est celle à l'entrée du segment suivant, pas celle déjà dépassée.
  const prochaine = trajet.manoeuvres.find((m) => m.debut > progression + 8) ?? trajet.manoeuvres.at(-1);
  const active = trajet.manoeuvres.find((m) => m.fin > progression) ?? trajet.manoeuvres.at(-1);
  const secondes = trajet.manoeuvres.reduce((total, m) => total + (m.fin > progression ? m.secondes * (m.fin - Math.max(progression, m.debut)) / (m.fin - m.debut || 1) : 0), 0);
  const cap = mouvement > Math.max(8, position.precision) && precedent?.position && position.quand > precedent.position.quand
    ? capEntre(precedent.position, position) : precedent?.cap ?? capEntre(lieu(trajet.coords[meilleur.index - 1]), lieu(trajet.coords[meilleur.index]));
  return { genre: arrive ? 'arrivee' : 'direct', progression, position, cap, prochaine, active,
    distance: Math.max(0, prochaine.debut - progression), reste: Math.max(0, trajet.metres - progression), secondes,
    texte: arrive ? 'Vous êtes arrivé à proximité de ' + trajet.cible.nom : texteManoeuvre(prochaine),
    coord: [trajet.coords[meilleur.index - 1][0] + meilleur.t * (trajet.coords[meilleur.index][0] - trajet.coords[meilleur.index - 1][0]),
      trajet.coords[meilleur.index - 1][1] + meilleur.t * (trajet.coords[meilleur.index][1] - trajet.coords[meilleur.index - 1][1])] };
}

export const distanceGuidage = (m) => m < 1000 ? Math.max(0, Math.round(m / (m < 100 ? 10 : 50)) * (m < 100 ? 10 : 50)) + ' m' : (m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' km';
