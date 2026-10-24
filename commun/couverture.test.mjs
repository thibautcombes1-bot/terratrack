import assert from 'node:assert/strict';
import { test } from 'node:test';
import { couverture, noeudsDansRayon, zonesDenses } from './couverture.js';
import { distanceKm, plusProcheVoisin } from './geo.js';

const montpellier = { lat: 43.6112, lon: 3.8767 };
const noeud = (lat, lon, relais = false) => ({ lat, lon, relais, nom: `n${lat}`, reseau: 'meshcore', type: 'x' });

test('distance Montpellier – Nîmes ≈ 45 km', () => {
  const d = distanceKm(montpellier, { lat: 43.8367, lon: 4.3601 });
  assert.ok(d > 44 && d < 47, `${d}`);
});

test('plus proche voisin', () => {
  const ordre = plusProcheVoisin(montpellier, [
    { nom: 'loin', lat: 44.5, lon: 3.9 },
    { nom: 'près', lat: 43.65, lon: 3.88 },
  ]);
  assert.deepEqual(ordre.map((p) => p.nom), ['près', 'loin']);
});

test('couverture bonne avec un relais à moins de 10 km', () => {
  const c = couverture(montpellier, [noeud(43.65, 3.9, true)]);
  assert.equal(c.niveau, 'bonne');
  assert.equal(c.relaisProches, 1);
});

test('couverture faible avec un seul nœud à 20 km', () => {
  assert.equal(couverture(montpellier, [noeud(43.79, 3.88)]).niveau, 'faible');
});

test('aucune couverture sans nœud à 25 km', () => {
  const c = couverture(montpellier, [noeud(45, 5)]);
  assert.equal(c.niveau, 'aucune');
});

test('nœuds dans un rayon', () => {
  assert.equal(noeudsDansRayon(montpellier, [noeud(43.62, 3.88), noeud(45, 5)], 40), 1);
});

test('zones denses : les relais pèsent plus', () => {
  const zones = zonesDenses(montpellier, 100, [
    noeud(43.9, 4.3),
    noeud(43.9, 4.31),
    noeud(43.5, 3.5, true),
  ]);
  assert.equal(zones[0].relais, 1);
});
