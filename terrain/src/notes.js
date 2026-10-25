// Notes des lieux, contrôlées par le GPS : on ne note que là où l'on est vraiment passé.
// Un passage compte si une vraie position GPS (pas la simulation) est à moins de 250 m
// du lieu, avec une précision d'au moins 100 m. Il reste valable 24 h pour noter.
// Le format est prêt pour un partage futur (signalements communautaires).
import { distanceKm } from '../../commun/geo.js';
import { memoire } from './outils.js';

export const RAYON_M = 250;
export const PRECISION_MAX_M = 100;
const VALIDITE_MS = 24 * 3600 * 1000;
export const MOTS = ['Vaut le détour', 'Bondé', 'Calme', 'Fermé', 'Accès difficile', 'Ombragé', 'Eau potable OK'];

const passages = new Map(memoire.lire('passages', []).map((p) => [p.id, p]));
const notes = new Map(memoire.lire('notes', []).map((n) => [n.id, n]));
const sauver = () => {
  memoire.ecrire('passages', [...passages.values()]);
  memoire.ecrire('notes', [...notes.values()]);
};

/** Enregistre les passages vérifiés à partir d'une vraie position GPS. Renvoie les lieux validés. */
export function verifierPassages(position, precisionM, lieux) {
  if (!(precisionM <= PRECISION_MAX_M)) return [];
  const valides = [];
  for (const l of lieux) {
    const metres = distanceKm(position, l) * 1000;
    if (metres > RAYON_M) continue;
    const ancien = passages.get(l.id);
    if (!ancien || ancien.metres > metres || Date.now() - ancien.date > VALIDITE_MS) {
      passages.set(l.id, { id: l.id, nom: l.nom, lat: l.lat, lon: l.lon, date: Date.now(), metres: Math.round(metres), precisionM: Math.round(precisionM) });
      valides.push(l);
    }
  }
  if (valides.length) sauver();
  return valides;
}

/** Passage vérifié encore valable pour noter ce lieu ? */
export function passageValide(id) {
  const p = passages.get(id);
  return p && Date.now() - p.date <= VALIDITE_MS ? p : null;
}

export function noter(lieu, etoiles, mots = []) {
  const passage = passageValide(lieu.id);
  if (!passage) throw new Error('Passage non vérifié par le GPS');
  notes.set(lieu.id, {
    id: lieu.id,
    nom: lieu.nom,
    type: lieu.type,
    activite: lieu.activite,
    lat: lieu.lat,
    lon: lieu.lon,
    etoiles,
    mots,
    date: Date.now(),
    verification: { methode: 'gps', metres: passage.metres, precisionM: passage.precisionM, le: passage.date },
  });
  sauver();
}

export const noteDe = (id) => notes.get(id);
export const tousLesPassages = () => [...passages.values()];
export const toutesLesNotes = () => [...notes.values()];

/**
 * Ce que les notes changent au calcul : lieux mal notés écartés, et un bonus ou malus
 * par type de lieu (moyenne des notes de ce type, 3 ★ = neutre).
 */
export function effetDesNotes() {
  const parType = new Map();
  for (const n of notes.values()) {
    const cle = n.activite ?? n.type;
    const t = parType.get(cle) ?? { somme: 0, nb: 0 };
    t.somme += n.etoiles;
    t.nb++;
    parType.set(cle, t);
  }
  return {
    ecartes: [...notes.values()].filter((n) => n.etoiles <= 2).map((n) => n.id),
    bonusParType: Object.fromEntries([...parType].map(([cle, t]) => [cle, (t.somme / t.nb - 3) * 0.6])),
  };
}
