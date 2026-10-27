import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerGraphe } from '../../commun/routeur.js';
import { verifierConditions } from './parcours.js';
import { proposerRoadtrips, roadtripsDifferents } from './roadtrips.js';

const depart = { nom: 'Départ GPS', lat: 44, lon: 3, origine: 'gps' };
const visites = Array.from({ length: 6 }, (_, i) => ({
  id: 'village-' + i, nom: 'Village ' + i, type: 'Village', categorie: 'decouvrir',
  lat: 44 + Math.sin(i * Math.PI / 3) * .08,
  lon: 3 + Math.cos(i * Math.PI / 3) * .11,
}));
function pack(lieux = visites) {
  const points = [depart, ...visites];
  const geometrie = [], g = [];
  for (const l of visites) {
    g.push(geometrie.length / 2);
    geometrie.push(300000, 4400000, Math.round(l.lon * 1e5), Math.round(l.lat * 1e5));
    g.push(geometrie.length / 2);
  }
  return { lieux, communes: [depart], graphe: chargerGraphe({
    sommets: points.flatMap((l) => [Math.round(l.lon * 1e5), Math.round(l.lat * 1e5)]), geometrie, noms: ['Route locale'],
    aretes: { a: visites.map(() => 0), b: visites.map((_, i) => i + 1),
      m: visites.map(() => 9000), v: visites.map(() => 60), s: visites.map(() => 0),
      p: visites.map(() => 0), n: visites.map(() => 0), g },
  }) };
}
const params = () => ({
  depart: { ...depart }, destination: { ...depart }, mode: 'boucle', jours: .5,
  date: '2026-10-27', heure: 570, rythme: 'normal', envies: ['villages'],
  nuits: ['debrouille'], exclus: [], favoris: [], eviterPeages: true,
  conditionsStrictes: true,
  vehicule: { type: 'voiture', conso: 6.5, prix: 2, litresDepart: 40, reservoir: 50, reserveKm: 60, budget: null },
});

test('trois voyages réels avec des visites et des tracés différents, depuis le même départ GPS', async () => {
  const p = params(), avant = structuredClone(p);
  const { plans } = await proposerRoadtrips(pack(), p);
  assert.equal(plans.length, 3);
  assert.deepEqual(p, avant);
  for (const plan of plans) {
    assert.deepEqual(verifierConditions(plan), []);
    assert.deepEqual(plan.params.depart, depart);
    assert.deepEqual(plan.params.envies, p.envies);
    assert.equal(plan.params.itineraireChoisi, false);
    assert.equal(plan.valide, false);
  }
  for (let i = 0; i < plans.length; i++) for (let j = i + 1; j < plans.length; j++)
    assert.ok(roadtripsDifferents(plans[i], plans[j]));
});

test('un seul voyage compatible reste un choix unique, jamais trois copies', async () => {
  const { plans } = await proposerRoadtrips(pack(visites.slice(0, 1)), params());
  assert.equal(plans.length, 1);
});

test('les exclusions et le budget sont conservés, aucune condition n’est assouplie pour remplir la liste', async () => {
  const p = params();
  p.exclus = visites.slice(0, 4).map((l) => l.id);
  const { plans } = await proposerRoadtrips(pack(), p);
  assert.equal(plans.length, 1);
  assert.ok(plans.every((plan) => plan.jours.every((j) => j.etapes.every((e) => !p.exclus.includes(e.id)))));
  p.vehicule.budget = .01;
  const impossible = await proposerRoadtrips(pack(), p);
  assert.equal(impossible.plans.length, 0);
  assert.ok(impossible.raisons.some((r) => r.includes('budget')));
});

test('une modification de la météo est vérifiée avant de retenir un voyage', async () => {
  const p = params(); p.veutBeauTemps = true;
  const sansPrevision = await proposerRoadtrips(pack(), p);
  assert.equal(sansPrevision.plans.length, 0);
  const avecPrevision = await proposerRoadtrips(pack(), p, { preparer: async (plan) => {
    plan.params.meteoCompatible = true; return plan;
  } });
  assert.equal(avecPrevision.plans.length, 3);
});

test('changer les noms des arrêts ou seulement leur ordre ne crée pas de nouveau road trip', async () => {
  const { plans } = await proposerRoadtrips(pack(), params());
  const copie = structuredClone(plans[0]);
  copie.jours[0].etapes.reverse();
  assert.equal(roadtripsDifferents(plans[0], copie), false);
  copie.jours[0].etapes = copie.jours[0].etapes.map((e) => ({ ...e, id: 'copie-' + e.id }));
  assert.equal(roadtripsDifferents(plans[0], copie), false);
});
