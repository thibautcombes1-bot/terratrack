// Carburant dans l'appli : le véhicule (gardé sur le téléphone, d'un voyage à l'autre) et les prix
// du jour, demandés au service de l'État (prix-carburants.gouv.fr) quand il y a du réseau.
// Sans réseau, on garde les prix du pack (au plus une semaine).
import { memoire } from './outils.js';
import { serviceAutorise } from './confidentialite.js';

export const CARBURANTS = { gazole: 'Gazole', SP95: 'SP95', E10: 'E10', SP98: 'SP98', E85: 'E85', GPL: 'GPL' };
/** Véhicules : consommation et réservoir habituels (modifiables). */
export const VEHICULES = {
  voiture: { nom: '🚗 Voiture', conso: 6.5, reservoir: 50 },
  van: { nom: '🚐 Van, camping-car', conso: 10, reservoir: 80 },
  moto: { nom: '🏍️ Moto', conso: 5, reservoir: 17 },
};
const DEFAUT = { type: 'voiture', carburant: 'gazole', litresDepart: 40, reservoir: 50, conso: 6.5, prix: null, reserveKm: 60, budget: null };

export const lireVehicule = () => ({ ...DEFAUT, ...memoire.lire('vehicule', {}) });
export const ecrireVehicule = (vehicule) => memoire.ecrire('vehicule', vehicule);

const medianes = new Map();
/** Prix médian du carburant dans le pack : l'estimation tant qu'on n'a pas saisi son prix. */
export function prixMedian(lieux, carburant) {
  if (!medianes.has(carburant)) {
    const prix = lieux.filter((l) => l.prix?.[carburant]).map((l) => l.prix[carburant]).sort((a, b) => a - b);
    medianes.set(carburant, prix.length ? prix[prix.length >> 1] : 2);
  }
  return medianes.get(carburant);
}

const SERVICE = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records';
const CHAMPS = { gazole: 'gazole', SP95: 'sp95', E10: 'e10', SP98: 'sp98', E85: 'e85', GPL: 'gplc' };
const demandes = new Map();

/**
 * Prix du jour des stations (si réseau), écrits dans chaque objet donné. Une station n'est
 * redemandée qu'après 30 min. Renvoie true si des prix ont été mis à jour.
 */
export async function rafraichirPrix(stations) {
  const ids = [...new Set(stations.map((s) => s.idPrix).filter((id) => id && Date.now() - (demandes.get(id) ?? 0) > 30 * 60 * 1000))].slice(0, 100);
  if (!serviceAutorise('services') || !ids.length || navigator.onLine === false) return false;
  const params = new URLSearchParams({
    where: `id in (${ids.join(',')})`,
    select: ['id', ...Object.values(CHAMPS).flatMap((c) => [`${c}_prix`, `${c}_maj`])].join(','),
    limit: '100',
  });
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), 5000);
  try {
    const reponse = await fetch(`${SERVICE}?${params}`, { signal: arret.signal });
    if (!reponse.ok) return false;
    const parId = new Map((await reponse.json()).results.map((r) => [r.id, r]));
    for (const id of ids) demandes.set(id, Date.now());
    for (const s of stations) {
      const r = parId.get(s.idPrix);
      if (!r) continue;
      const prix = {};
      let le = '';
      for (const [nom, champ] of Object.entries(CHAMPS))
        if (r[`${champ}_prix`]) {
          prix[nom] = r[`${champ}_prix`];
          if ((r[`${champ}_maj`] ?? '') > le) le = r[`${champ}_maj`];
        }
      Object.assign(s, { prix, prixLe: le.slice(0, 10), prixDuJour: true });
    }
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(minuterie);
  }
}

export const euros = (x) => `${Math.round(x)} €`;
export const prixTexte = (p) => `${p.toFixed(3).replace('.', ',')} €/L`;
export const litresTexte = (l) => `${Math.max(0, Math.round(l))} L`;
/** « 2,249 €/L, prix du 24/10 » (ou « prix du jour »). */
export function prixStation(s, carburant) {
  const p = s.prix?.[carburant];
  if (!p) return '';
  const le = s.prixLe ? new Date(s.prixLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' }) : '';
  return `${prixTexte(p)}${s.prixDuJour ? ', prix du jour' : le ? `, prix du ${le}` : ''}`;
}
