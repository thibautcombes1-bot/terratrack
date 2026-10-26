import assert from 'node:assert/strict';
import test from 'node:test';
import { corrigerViaFerrata, resumerCotationsVia } from './via-ferrata.js';

test('des tronçons OSM hétérogènes gardent leur plage, sans cotation moyenne inventée', () => {
  const fiche = resumerCotationsVia([{ nom: 'Via', cote: 3 }, { nom: 'Via', cote: 4 }]);
  assert.equal(fiche.cotation, null);
  assert.equal(fiche.cotationMin, 3);
  assert.equal(fiche.cotationMax, 4);
  assert.equal(fiche.niveauRang, 3);
  assert.match(fiche.niveauTexte, /AD.*D.*variantes à vérifier/);
  assert.ok(!fiche.niveauTexte.includes('échappatoire'));
});

test('une variante difficile n’est pas confondue avec les tronçons du parcours principal', () => {
  const fiche = resumerCotationsVia([{ nom: 'Via', cote: 2 }, { nom: 'Via: Variante sportive', cote: 5 }]);
  assert.equal(fiche.cotation, 2);
  assert.equal(fiche.niveauRang, 2);
  assert.match(fiche.niveauTexte, /Cotation OSM.*PD.*variantes jusqu’à TD/);
});

test('sans cotation valide, aucun niveau ou grade précis n’est fabriqué', () => {
  const fiche = resumerCotationsVia([{ cote: null }, { cote: 9 }, { cote: 2.5 }]);
  assert.equal(fiche.cotation, null);
  assert.equal(fiche.niveauRang, undefined);
  assert.equal(fiche.niveauTexte, undefined);
  assert.equal(fiche.dureeEstimee, true);
});

const ancienne = {
  id: 'vf-w1183917213', activite: 'viaferrata', categorie: 'decouvrir', type: 'Via ferrata',
  nom: 'Via Ferrata les Balcons de l’Orb', lat: 43.64222, lon: 3.17792,
  niveau: 'Difficile', niveauRang: 3, cotation: 4, niveauTexte: 'D (difficile), échappatoire AD',
  dureeH: 3, details: ['163 m de câbles et passages'], source: 'osm',
};

test('les Balcons de l’Orb proposent explicitement la partie inférieure d’initiation', () => {
  const [fiche] = corrigerViaFerrata([ancienne]);
  assert.equal(fiche.id, ancienne.id);
  assert.match(fiche.nom, /parcours inférieur/);
  assert.equal(fiche.niveau, 'Facile');
  assert.equal(fiche.niveauRang, 1);
  assert.equal(fiche.dureeH, 0.5);
  assert.equal(fiche.dureeEstimee, false);
  assert.equal(fiche.cotation, null);
  assert.match(fiche.niveauTexte, /initiation.*non publiée/);
  assert.equal(fiche.cotationOsm.cotation, 4);
  assert.equal(fiche.difficulteSource.url, 'https://www.acroroc.com/activites/via-ferrata-herault-caroux/');
  assert.ok(!fiche.details.some((d) => /163 m/.test(d)));
});

test('la partie supérieure reste une option distincte, sans lettre ni classement facile inventés', () => {
  const [fiche] = corrigerViaFerrata([ancienne]);
  const [haute] = fiche.variantes;
  assert.equal(haute.dureeH, 1.5);
  assert.equal(haute.cotation, null);
  assert.equal(haute.niveauRang, null);
  assert.equal(haute.propositionAutomatique, false);
  assert.match(haute.niveau, /aérien.*vérifier/);
});

test('la correction reconnaît le nom local si l’id OSM change, sans toucher un autre site homonyme', () => {
  const proche = { ...ancienne, id: 'vf-autre-id', nom: "Via ferrata les Balcons de l'Orb" };
  const loin = { ...proche, id: 'vf-loin', lat: 48.8, lon: 2.3 };
  const autres = { ...ancienne, id: 'autre-sport', activite: 'escalade' };
  const [corrigee, intacte, sportIntact] = corrigerViaFerrata([proche, loin, autres]);
  assert.equal(corrigee.niveauRang, 1);
  assert.equal(intacte, loin);
  assert.equal(sportIntact, autres);
});

test('construction puis chargement ne dupliquent pas la correction et ne modifient pas l’entrée brute', () => {
  const initiale = structuredClone(ancienne);
  const construit = corrigerViaFerrata([ancienne]);
  const charge = corrigerViaFerrata(construit);
  assert.deepEqual(charge, construit);
  assert.equal(charge[0], construit[0]);
  assert.deepEqual(ancienne, initiale);
});
