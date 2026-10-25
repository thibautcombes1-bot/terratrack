// Carnet de voyage : les parcours faits (historique) et les lieux gardés « pour plus tard »,
// qui sont ajoutés d'office au prochain parcours quand ils tombent près du trajet.
import { memoire } from './outils.js';

// ---------- Plus tard ----------

const plusTard = new Map(memoire.lire('plusTard', []).map((l) => [l.id, l]));
const sauverPlusTard = () => memoire.ecrire('plusTard', [...plusTard.values()]);

export const estPourPlusTard = (id) => plusTard.has(id);
export const lieuxPourPlusTard = () => [...plusTard.values()].sort((a, b) => b.ajoute - a.ajoute);

/** Garde le lieu pour plus tard, ou le retire s'il y est déjà. Renvoie true s'il est gardé. */
export function basculerPlusTard(l) {
  if (plusTard.delete(l.id)) {
    sauverPlusTard();
    return false;
  }
  const { id, nom, type, activite, categorie, unesco, niveau, niveauRang, niveauTexte, details, dureeH, longueurKm, labels, notoriete, classe, lat, lon } = l;
  plusTard.set(id, { id, nom, type, activite, categorie, unesco, niveau, niveauRang, niveauTexte, details, dureeH, longueurKm, labels, notoriete, classe, lat, lon, ajoute: Date.now() });
  sauverPlusTard();
  return true;
}

export function retirerPlusTard(id) {
  if (plusTard.delete(id)) sauverPlusTard();
}

// ---------- Historique des parcours ----------

const POINTS_MAX = 250;
/** Un tracé allégé (250 points au plus) : assez pour le revoir, sans remplir la mémoire. */
function alleger(coords = []) {
  const pas = Math.max(1, Math.ceil(coords.length / POINTS_MAX));
  return coords
    .filter((_, i) => i % pas === 0 || i === coords.length - 1)
    .map(([lon, lat]) => [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]);
}

export const voyages = () => memoire.lire('historique', []);

/** Range un parcours dans l'historique (30 voyages gardés). */
export function archiver(plan) {
  const voyage = { ...plan, id: plan.cree ?? Date.now(), termine: Date.now(), jours: plan.jours.map((j) => ({ ...j, coords: alleger(j.coords) })) };
  memoire.ecrire('historique', [voyage, ...voyages().filter((v) => v.id !== voyage.id)].slice(0, 30));
}

export function oublierVoyage(id) {
  memoire.ecrire('historique', voyages().filter((v) => v.id !== id));
}
