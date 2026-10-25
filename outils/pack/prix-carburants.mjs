// Prix des carburants de chaque station (open data de l'État, prix-carburants.gouv.fr,
// Licence Ouverte) : au jour du pack, pour proposer la station la moins chère sur la route.
// L'appli les rafraîchit en direct quand elle a du réseau (même service, voir terrain/src/carburant.js).
import fs from 'node:fs';
import { distanceKm } from '../../commun/geo.js';

export const SERVICE_PRIX =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2';
/** Nom du carburant dans l'appli → préfixe des champs du service. */
export const CHAMPS_PRIX = { gazole: 'gazole', SP95: 'sp95', E10: 'e10', SP98: 'sp98', E85: 'e85', GPL: 'gplc' };
const PERIME_JOURS = 30;

/** Stations et prix, depuis le cache du jour (.brut/prix-carburants.json) ou le service. */
async function lirePrix(brut) {
  const cache = new URL('prix-carburants.json', brut);
  if (!fs.existsSync(cache) || Date.now() - fs.statSync(cache).mtimeMs > 12 * 3600 * 1000) {
    const champs = ['id', 'geom', 'ville', 'adresse', 'horaires_automate_24_24', ...Object.values(CHAMPS_PRIX).flatMap((c) => [`${c}_prix`, `${c}_maj`])];
    const reponse = await fetch(`${SERVICE_PRIX}/exports/json?select=${champs.join(',')}`);
    if (!reponse.ok) throw new Error(`Prix des carburants : ${reponse.status}`);
    fs.writeFileSync(cache, await reponse.text());
  }
  return JSON.parse(fs.readFileSync(cache, 'utf8'));
}

/** Prix (€/L) encore valables (mis à jour il y a moins de 30 jours) et date du plus récent. */
function prixDe(station) {
  const limite = Date.now() - PERIME_JOURS * 86400 * 1000;
  const prix = {};
  let le = '';
  for (const [nom, champ] of Object.entries(CHAMPS_PRIX)) {
    const valeur = station[`${champ}_prix`];
    const maj = station[`${champ}_maj`];
    if (!valeur || !maj || Date.parse(maj) < limite) continue;
    prix[nom] = valeur;
    if (maj > le) le = maj;
  }
  return { prix, le: le.slice(0, 10) };
}

/**
 * Ajoute les prix aux stations OSM (la même station à moins de 200 m) ; les stations du service
 * sans équivalent OSM deviennent des lieux. Renvoie le nombre de stations avec prix.
 */
export async function ajouterPrix(lieux, brut, dansRegion) {
  const stations = (await lirePrix(brut)).filter((s) => s.geom && dansRegion({ lat: s.geom.lat, lon: s.geom.lon }));
  // Grille d'environ 1 km pour retrouver vite la station OSM la plus proche.
  const cle = (lat, lon) => `${Math.round(lat * 100)}:${Math.round(lon * 100)}`;
  const grille = new Map();
  for (const l of lieux) {
    if (l.categorie !== 'carburant') continue;
    const k = cle(l.lat, l.lon);
    if (!grille.has(k)) grille.set(k, []);
    grille.get(k).push(l);
  }
  let avecPrix = 0;
  for (const s of stations) {
    const { prix, le } = prixDe(s);
    if (!Object.keys(prix).length) continue;
    const position = { lat: s.geom.lat, lon: s.geom.lon };
    let proche = null;
    let dMin = 0.2;
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++)
        for (const l of grille.get(`${Math.round(s.geom.lat * 100) + di}:${Math.round(s.geom.lon * 100) + dj}`) ?? []) {
          const d = distanceKm(position, l);
          if (d < dMin && !l.idPrix) [dMin, proche] = [d, l];
        }
    const infos = { idPrix: s.id, prix, prixLe: le, ...(s.horaires_automate_24_24 === 'Oui' ? { h24: true } : {}) };
    if (proche) Object.assign(proche, infos, { carburants: Object.keys(prix) });
    else
      lieux.push({
        id: `pc${s.id}`,
        categorie: 'carburant',
        type: 'Station-service',
        nom: `Station ${s.ville ?? ''}`.trim(),
        adresse: s.adresse,
        lat: Math.round(s.geom.lat * 1e5) / 1e5,
        lon: Math.round(s.geom.lon * 1e5) / 1e5,
        carburants: Object.keys(prix),
        ...infos,
      });
    avecPrix++;
  }
  return avecPrix;
}
