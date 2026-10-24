// Étapes sûres : communes et sites labellisés (Plus Beaux Villages, Petites Cités de
// Caractère, Grands Sites…), livrés avec l'appli (outils/construire-etapes.mjs).
import fs from 'node:fs';
import { distanceKm } from '../commun/geo.js';
import { couverture } from '../commun/couverture.js';

const { etapes: ETAPES } = JSON.parse(
  fs.readFileSync(new URL('./donnees/etapes.json', import.meta.url), 'utf8'),
);

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

/** Direction (N, NE, E…) de `b` vu depuis `a`. */
export function direction(a, b) {
  const y = Math.sin(((b.lon - a.lon) * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  const x =
    Math.cos((a.lat * Math.PI) / 180) * Math.sin((b.lat * Math.PI) / 180) -
    Math.sin((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.cos(((b.lon - a.lon) * Math.PI) / 180);
  const cap = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return DIRECTIONS[Math.round(cap / 45) % 8];
}

/**
 * Étapes labellisées à portée du départ, réparties en distance pour que l'IA ait
 * du choix proche comme lointain. Chaque entrée porte distance, direction et couverture mesh.
 */
export function etapesAPortee(depart, rayonKm, { noeuds = [], rejetes = new Set(), max = 40 } = {}) {
  const aPortee = ETAPES.map((e) => ({ ...e, distanceKm: Math.round(distanceKm(depart, e)) }))
    .filter((e) => e.distanceKm <= rayonKm && !rejetes.has(e.nom.toLowerCase()))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  // Au-delà de `max`, on garde un échantillon régulier en distance.
  const choisies =
    aPortee.length <= max
      ? aPortee
      : Array.from({ length: max }, (_, i) => aPortee[Math.floor((i * aPortee.length) / max)]);
  return choisies.map((e) => ({
    ...e,
    direction: direction(depart, e),
    couverture: noeuds.length ? couverture(e, noeuds).niveau : null,
  }));
}
