import assert from 'node:assert/strict';
import test from 'node:test';
import { chargerGraphe } from '../../commun/routeur.js';
import { changerNuit, planifier, recalculerJour, surLeTrajet } from './parcours.js';

// Un vrai petit réseau routier : les cas sans lieu doivent être testés même sans le pack France.
const graphe = chargerGraphe({
  sommets: [300000, 4400000, 310000, 4400000],
  aretes: { a: [0], b: [1], m: [8000], v: [80], s: [0], p: [0], n: [-1], g: [0, 2] },
  geometrie: [300000, 4400000, 310000, 4400000],
  noms: [],
});
const depart = { nom: 'Départ', lat: 44, lon: 3 };
const arrivee = { nom: 'Arrivée', lat: 44, lon: 3.1 };
const pack = (lieux = []) => ({ graphe, lieux, communes: [depart, arrivee] });
const preparer = (donnees, choix = {}) => planifier(donnees, {
  depart, mode: 'surprise', jours: 3, date: '2026-10-26', heure: 570,
  rythme: 'normal', envies: ['viaferrata'], nuits: ['camping'], exclus: [], favoris: [], ...choix,
});

test('sans visite ni hébergement : le voyage garde ses jours et signale ce qui manque', () => {
  const donnees = pack();
  const plan = preparer(donnees);
  assert.equal(plan.jours.length, 3);
  assert.deepEqual(plan.jours.map((j) => j.date), ['2026-10-26', '2026-10-27', '2026-10-28']);
  assert.ok(plan.avertissements.some((a) => a.includes('Aucune étape')));
  for (const jour of plan.jours) {
    assert.deepEqual(jour.etapes, []);
    assert.ok(Number.isFinite(jour.metres));
    assert.ok(Number.isFinite(jour.conduiteMin));
    assert.ok(Number.isFinite(jour.fin.arriveeMin));
    assert.deepEqual([jour.fin.lat, jour.fin.lon], [depart.lat, depart.lon]);
  }
  for (const jour of plan.jours.slice(0, -1)) {
    assert.equal(jour.fin.aTrouver, true);
    assert.ok(jour.alertes.some((a) => a.includes('Aucun hébergement')));
  }
  assert.equal(plan.jours.at(-1).fin.genre, 'retour');
  assert.ok(surLeTrajet(donnees, plan).every((j) => j.nuits.length === 0));
});

test('une visite sans hébergement à proximité ne devient pas une nuit proposée', () => {
  const village = { ...arrivee, id: 'village', nom: 'Village à visiter', type: 'Village', categorie: 'decouvrir' };
  const plan = preparer(pack([village]), { mode: 'destination', destination: arrivee, jours: 2, envies: ['villages'] });
  const jour = plan.jours[0];
  assert.equal(jour.etapes[0].id, village.id);
  assert.equal(jour.fin.aTrouver, true);
  assert.equal(jour.fin.type, 'Hébergement à trouver');
  assert.notEqual(jour.fin.id, village.id);
  assert.deepEqual([jour.fin.lat, jour.fin.lon], [village.lat, village.lon]);
  assert.ok(jour.alertes.some((a) => a.includes('Aucun hébergement')));
});

test('choisir ensuite un hébergement retire l’alerte et actualise le départ du lendemain', () => {
  const donnees = pack();
  const plan = preparer(donnees);
  recalculerJour(donnees, plan.jours[0], 3);
  assert.equal(plan.jours[0].alertes.filter((a) => a.includes('Aucun hébergement')).length, 1);
  const hotel = { ...arrivee, id: 'hotel', nom: 'Hôtel du test', categorie: 'dormir', type: 'Hôtel' };
  changerNuit(donnees, plan, 0, hotel);
  assert.equal(plan.jours[0].fin.id, hotel.id);
  assert.ok(!plan.jours[0].fin.aTrouver);
  assert.ok(!plan.jours[0].alertes.some((a) => a.includes('Aucun hébergement')));
  assert.deepEqual([plan.jours[1].debut.lat, plan.jours[1].debut.lon], [hotel.lat, hotel.lon]);
  assert.ok(plan.jours[1].metres > 0);
});

test('« je me débrouille » reste une nuit libre sans alerte d’hébergement manquant', () => {
  const plan = preparer(pack(), { nuits: ['debrouille'] });
  assert.equal(plan.jours.length, 3);
  for (const jour of plan.jours.slice(0, -1)) {
    assert.equal(jour.fin.libre, true);
    assert.ok(!jour.fin.aTrouver);
    assert.ok(!jour.alertes.some((a) => a.includes('Aucun hébergement')));
  }
});
