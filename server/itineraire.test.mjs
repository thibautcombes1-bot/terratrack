import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distanceKm } from '../commun/geo.js';
import { cleOrdre, decouperJours, echantillonner, grilleCoin, preparerRoute, selectionner, situer } from './itineraire.js';

// Route droite d'ouest en est : Montpellier (3.88) → Nîmes (4.36), latitude 43.7.
const montpellier = { lat: 43.7, lon: 3.88 };
const nimes = { lat: 43.7, lon: 4.36 };
const route = preparerRoute([
  [3.88, 43.7],
  [4.12, 43.7],
  [4.36, 43.7],
]);

test('la route fait environ 39 km', () => {
  assert.ok(Math.abs(route.longueur - 38.6) < 1, `${route.longueur}`);
});

test('un lieu au nord est à gauche, au sud à droite', () => {
  assert.equal(situer(route, { lat: 43.75, lon: 4.1 }).cote, 1);
  assert.equal(situer(route, { lat: 43.65, lon: 4.1 }).cote, -1);
  assert.ok(Math.abs(situer(route, { lat: 43.75, lon: 4.1 }).ecart - 5.5) < 0.3);
});

test('échantillons réguliers jusqu’au bout', () => {
  const points = echantillonner(route, 10);
  assert.equal(points.length, 5);
  assert.deepEqual(points.at(-1), nimes);
});

test('la grille couvre tout le coin (chaque point à moins de 10 km d’une recherche)', () => {
  const grille = grilleCoin(nimes, 35);
  for (let k = 0; k < 200; k++) {
    const a = (k * 137.5 * Math.PI) / 180;
    const d = 35 * Math.sqrt(((k * 7) % 200) / 200);
    const p = { lat: nimes.lat + (d * Math.sin(a)) / 110.57, lon: nimes.lon + (d * Math.cos(a)) / 80.5 };
    assert.ok(Math.min(...grille.map((g) => distanceKm(g, p))) < 10, `trou à ${JSON.stringify(p)}`);
  }
});

test('aller simple : ordre le long de la route, hors couloir ignoré', () => {
  const ctx = { route, depart: montpellier, largeur: 10, boucle: false };
  const a = cleOrdre({ lat: 43.72, lon: 4.0 }, ctx);
  const b = cleOrdre({ lat: 43.68, lon: 4.3 }, ctx);
  assert.ok(a.cle < b.cle);
  assert.equal(cleOrdre({ lat: 44.2, lon: 4.1 }, ctx), null);
});

test('aller simple : rien derrière le départ ni au-delà de l’arrivée', () => {
  const ctx = { route, depart: montpellier, largeur: 25, boucle: false };
  assert.equal(cleOrdre({ lat: 43.72, lon: 3.75 }, ctx), null, 'à l’ouest de Montpellier');
  assert.equal(cleOrdre({ lat: 43.7, lon: 4.5 }, ctx), null, 'à l’est de Nîmes');
  assert.ok(cleOrdre({ lat: 43.8, lon: 4.1 }, ctx), 'au nord du milieu de la route');
});

test('boucle : aller par la gauche, tour du coin, retour par la droite', () => {
  const ctx = { route, depart: montpellier, centre: nimes, rayonCoin: 12, largeur: 10, boucle: true };
  const allerNord = cleOrdre({ lat: 43.74, lon: 4.0 }, ctx).cle;
  const coinNord = cleOrdre({ lat: 43.76, lon: 4.38 }, ctx).cle;
  const coinEst = cleOrdre({ lat: 43.7, lon: 4.46 }, ctx).cle;
  const coinSud = cleOrdre({ lat: 43.64, lon: 4.38 }, ctx).cle;
  const retourSud = cleOrdre({ lat: 43.66, lon: 4.0 }, ctx).cle;
  const ordre = [allerNord, coinNord, coinEst, coinSud, retourSud];
  assert.deepEqual([...ordre].sort((x, y) => x - y), ordre, `ordre ${ordre}`);
});

test('sélection répartie : un lieu par tronçon avant les doublons', () => {
  const candidats = [
    { lat: 43.7, lon: 3.9, cle: 0.05, score: 9 },
    { lat: 43.7, lon: 3.95, cle: 0.1, score: 8 },
    { lat: 43.7, lon: 4.2, cle: 0.55, score: 1 },
    { lat: 43.7, lon: 4.33, cle: 0.95, score: 2 },
  ];
  const choix = selectionner(candidats, 3, 2);
  assert.deepEqual(choix.map((c) => c.score), [9, 1, 2]);
});

test('journées équilibrées et dans l’ordre', () => {
  const lieux = [3.9, 3.95, 4.0, 4.1, 4.2, 4.3].map((lon) => ({ lat: 43.7, lon, dureeH: 2 }));
  const jours = decouperJours(lieux, 3, { depart: montpellier, fin: montpellier, vitesse: 60 });
  assert.equal(jours.length, 3);
  assert.deepEqual(jours.flat(), lieux);
  assert.ok(jours.every((j) => j.length === 2), jours.map((j) => j.length).join(','));
});
