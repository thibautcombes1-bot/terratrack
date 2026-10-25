import assert from 'node:assert/strict';
import test from 'node:test';
import { bilanCarburant, facteurRoute, niveauA, profilConso } from './carburant.js';

// Une ligne droite de ~111 km vers le nord (1° de latitude), découpée en 10 segments.
const ligne = Array.from({ length: 11 }, (_, i) => [3, 44 + i / 10]);
const vehicule = { litresDepart: 20, reservoir: 50, conso: 6, prix: 2, reserveKm: 60 };

test('consommation selon la route : autoroute +20 %, routes de campagne −5 %', () => {
  assert.equal(facteurRoute(110), 1.2);
  assert.equal(facteurRoute(80), 1);
  assert.equal(facteurRoute(60), 0.95);
  assert.equal(facteurRoute(30), 1.15);
  const autoroute = profilConso(ligne, Array(10).fill(110)).at(-1);
  assert.ok(Math.abs(autoroute[0] - 111.2) < 0.5, `${autoroute[0]} km`);
  assert.ok(Math.abs(autoroute[1] - autoroute[0] * 1.2) < 0.5);
});

test('bilan : litres, coût, réserve atteinte, plein en route', () => {
  const jours = [{ profil: profilConso(ligne, Array(10).fill(80)) }, { profil: profilConso(ligne, Array(10).fill(80)) }];
  const sansPlein = bilanCarburant(jours, vehicule);
  assert.ok(Math.abs(sansPlein.litres - 13.3) < 0.2, `${sansPlein.litres} L`);
  assert.ok(Math.abs(sansPlein.cout - sansPlein.litres * 2) < 1e-9);
  // 20 L − 13,3 L = 6,7 L < réserve (5 L = 10 % du réservoir, 3,6 L = 60 km) ? Non : pas d'alerte.
  assert.equal(sansPlein.alerte, null);
  const peu = bilanCarburant(jours, { ...vehicule, litresDepart: 10 });
  assert.equal(peu.alerte.jour, 0);
  assert.equal(peu.panne.jour, 1);
  // Plein complet à mi-chemin du 2e jour : on finit avec un réservoir presque plein.
  const avecPlein = bilanCarburant(jours, { ...vehicule, litresDepart: 10 }, [{ jour: 1, km: 50 }]);
  assert.equal(avecPlein.panne, null);
  assert.ok(avecPlein.niveauFin > 45 && avecPlein.niveauFin < 50, `${avecPlein.niveauFin} L`);
  // Niveau en route, au km 50 du 1er jour : 20 L − ~3 L.
  assert.ok(Math.abs(niveauA(jours, vehicule, [], 0, 50) - 17) < 0.3);
});
