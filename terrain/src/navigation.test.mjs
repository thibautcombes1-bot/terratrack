import test from 'node:test';
import assert from 'node:assert/strict';
import { calculerGuidage, calculerItineraires, lireItineraires, lireGuidage, suivreGuidage, texteManoeuvre } from './navigation.js';

const maintenant = Date.UTC(2026, 9, 26, 12);
const cible = { lat: 44.002, lon: 3.002, nom: 'Destination' };
const etape = (type, modifier, points, name, duration = 40, exit) => ({ name, duration,
  maneuver: { type, modifier, location: points[0], bearing_after: 0, exit }, geometry: { type: 'LineString', coordinates: points } });
const reponse = { code: 'Ok', routes: [{ legs: [{ steps: [
  etape('depart', 'straight', [[3,44],[3,44.002]], 'Rue du départ'),
  etape('turn', 'right', [[3,44.002],[3.002,44.002]], 'Rue de droite'),
  etape('arrive', 'straight', [[3.002,44.002]], ''),
] }] }] };
const position = (lat, lon, extras = {}) => ({ lat, lon, precision: 5, quand: maintenant, ...extras });

test('les vraies étapes OSRM donnent des consignes françaises et un trajet ordonné', () => {
  const t = lireGuidage(reponse, cible);
  assert.equal(t.coords.length, 3);
  assert.equal(t.manoeuvres.length, 3);
  const a = suivreGuidage(t, position(44,3), null, maintenant);
  assert.equal(a.genre, 'direct');
  assert.equal(a.texte, 'Tournez à droite sur Rue de droite');
  assert.ok(a.distance > 200 && a.distance < 230);
  const b = suivreGuidage(t, position(44.0015,3), a, maintenant);
  assert.ok(b.distance < a.distance);
  assert.ok(b.secondes < a.secondes);
  const fin = suivreGuidage(t, position(44.002,3.002), b, maintenant);
  assert.equal(fin.genre, 'arrivee');
});

test('un GPS perdu, ancien ou imprécis suspend le guidage et ne fabrique pas une progression', () => {
  const t = lireGuidage(reponse, cible);
  const a = suivreGuidage(t, position(44.001,3), null, maintenant);
  for (const p of [null, position(44.002,3.002,{ quand: maintenant - 61000 }), position(44.002,3.002,{ precision: 200 }), position(NaN,3)]) {
    const etat = suivreGuidage(t, p, a, maintenant);
    assert.equal(etat.genre, 'gps');
    assert.equal(etat.progression, a.progression);
  }
});

test('hors du trajet, aucune annonce de virage ou estimation d’arrivée n’est donnée', () => {
  const t = lireGuidage(reponse, cible);
  const etat = suivreGuidage(t, position(44.001,3.01), null, maintenant);
  assert.equal(etat.genre, 'hors-route');
  assert.equal(etat.prochaine, undefined);
  assert.equal(etat.secondes, undefined);
});

test('un croisement revisité ne fait pas sauter une boucle', () => {
  const points = [[3,44],[3,44.01],[3.01,44.01],[3.01,44],[3,44],[3,43.999]];
  const t = lireGuidage({ code: 'Ok', routes: [{ legs: [{ steps: [etape('depart','straight',points,''), etape('arrive','straight',[points.at(-1)],'')] }] }] }, { lat: 43.999, lon: 3 });
  const etat = suivreGuidage(t, position(44,3), null, maintenant);
  assert.equal(etat.genre, 'direct');
  assert.equal(etat.progression, 0);
  assert.ok(etat.reste > 3000);
});

test('la sortie de rond-point et les bretelles utilisent les attributs fournis par OSRM', () => {
  assert.equal(texteManoeuvre({ type: 'roundabout', sortie: 3, nom: 'D 9' }), 'Au rond-point, prenez la sortie 3 sur D 9');
  assert.match(texteManoeuvre({ type: 'off ramp', modifier: 'right' }), /sortie à droite/);
  assert.match(texteManoeuvre({ type: 'turn', modifier: 'uturn' }), /demi-tour/);
});

test('une réponse sans consignes complètes ne devient pas du guidage', () => {
  assert.throws(() => lireGuidage({ code: 'NoRoute' }, cible));
  assert.throws(() => lireGuidage({ code: 'Ok', routes: [{ legs: [{ steps: [] }] }] }, cible));
  const malformee = structuredClone(reponse);
  malformee.routes[0].legs[0].steps[1].geometry.coordinates[0][0] = NaN;
  assert.throws(() => lireGuidage(malformee, cible));
});

test('le calcul demande les manœuvres, garde les points de passage et ne masque pas une erreur réseau', async () => {
  let url;
  await calculerGuidage({ lat:44, lon:3 }, cible, { passages: [{ lat:44.001,lon:3 }], eviterPeages: true,
    demander: async (adresse) => { url = new URL(adresse); return { ok:true, json: async () => reponse }; } });
  assert.equal(url.searchParams.get('steps'), 'true');
  assert.equal(url.searchParams.get('exclude'), 'toll');
  assert.equal(url.searchParams.get('waypoints'), '0;2');
  await assert.rejects(calculerGuidage({ lat:44,lon:3 },cible,{demander:async () => { throw new Error('Réseau coupé'); }}), /Réseau coupé/);
});

test('les alternatives gardent leur géométrie, durée et consignes propres', () => {
  const alternative = structuredClone(reponse.routes[0]);
  alternative.legs[0].steps[0] = etape('depart', 'straight', [[3,44],[3.001,44.002]], 'Autre route', 75);
  alternative.legs[0].steps[1] = etape('turn', 'right', [[3.001,44.002],[3.002,44.002]], 'Rue de droite', 50);
  const trajets = lireItineraires({ code:'Ok', routes:[reponse.routes[0], alternative] }, cible);
  assert.equal(trajets.length, 2);
  assert.notDeepEqual(trajets[0].coords, trajets[1].coords);
  assert.notEqual(trajets[0].secondes, trajets[1].secondes);
  assert.equal(trajets[1].routes[0], 'Autre route');
});

test('les variantes dupliquées et incomplètes ne créent pas de faux choix', () => {
  const trajets = lireItineraires({ code:'Ok', routes:[reponse.routes[0], reponse.routes[0], {legs:[]}] }, cible);
  assert.equal(trajets.length, 1);
  assert.throws(() => lireItineraires({ code:'Ok', routes:[{legs:[]}] }, cible));
});

test('le calcul entre départ et arrivée demande les alternatives au serveur', async () => {
  let url;
  const trajets = await calculerItineraires({ lat:44,lon:3 }, cible, { demander:async (adresse) => {
    url = new URL(adresse); return { ok:true, json:async () => reponse };
  } });
  assert.equal(url.searchParams.get('alternatives'), 'true');
  assert.equal(trajets.length, 1);
});
