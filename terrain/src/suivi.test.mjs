import assert from 'node:assert/strict';
import test from 'node:test';
import { avancerSurFeuille, dateLocale, etatGps, extrairePointsPassage, lirePoint, positionRecente, prochainPointGuidage } from './suivi.js';

const maintenant = Date.UTC(2026, 9, 25, 12);
test('le GPS écarte les points imprécis, incomplets ou impossibles', () => {
  assert.equal(lirePoint([maintenant, 44, 3, 150]), null);
  assert.equal(lirePoint([maintenant, 44, 3, -1]), null);
  assert.equal(lirePoint([maintenant, 92, 3, 5]), null);
  assert.equal(lirePoint([maintenant, 44, NaN, 5]), null);
  assert.equal(lirePoint([maintenant, 44]), null);
  assert.equal(lirePoint([maintenant, 44, 3, 8]).precision, 8);
});

test('un point ancien ou daté dans le futur ne devient pas un suivi en direct', () => {
  const point = lirePoint([maintenant, 44, 3, 8]);
  assert.equal(positionRecente(point, maintenant + 5000), true);
  assert.equal(positionRecente(point, maintenant + 16000), false);
  assert.equal(positionRecente(point, maintenant + 61000), false);
  assert.equal(positionRecente(point, maintenant - 20000), false);
  assert.equal(positionRecente(null, maintenant), false);
  assert.equal(etatGps({ actif: true }, point, maintenant + 61000).genre, 'attente');
});

test('une autorisation refusée ne peut pas être présentée comme un GPS actif', () => {
  const position = lirePoint([maintenant, 44, 3, 8]);
  assert.equal(etatGps({ demande: true, actif: true, autorisation: 'refusee' }, position, maintenant).genre, 'erreur');
  assert.equal(etatGps({ demande: true, autorisation: 'a-demander' }, null, maintenant).titre, 'Autorisation GPS attendue');
  assert.equal(etatGps({ demande: true, actif: true }, position, maintenant).genre, 'direct');
  assert.notEqual(etatGps({ demande: true, actif: false, erreur: 'Signal indisponible' }, position, maintenant).genre, 'direct');
});

test('la position avance sur le trajet sans inventer une visite faite', () => {
  const a = { lat: 44, lon: 3, nom: 'Départ' };
  const b = { lat: 44, lon: 3.2, nom: 'Arrivée' };
  const etape = { lat: 44, lon: 3.05, id: 'arret', nom: 'Arrêt choisi' };
  const jour = { debut: a, fin: b, coords: [[3, 44], [3.1, 44], [3.2, 44]], etapes: [etape] };
  const milieu = avancerSurFeuille(jour, { lat: 44, lon: 3.1 });
  assert.ok(milieu.pourcent >= 49 && milieu.pourcent <= 51);
  assert.equal(milieu.faites.length, 0);
  assert.equal(milieu.prochaine.id, 'arret');
  const apresPassage = avancerSurFeuille(jour, b, new Set(['arret']));
  assert.equal(apresPassage.pourcent, 100);
  assert.equal(apresPassage.resteKm, 0);
  assert.equal(apresPassage.faites.length, 1);
  assert.equal(apresPassage.prochaine.nom, 'Arrivée');
  assert.ok(avancerSurFeuille(jour, { lat: 44.1, lon: 3.1 }).ecartKm > 5);
});

test('un jour sur place reste calculable sans division par zéro', () => {
  const lieu = { lat: 44, lon: 3 };
  const etat = avancerSurFeuille({ debut: lieu, fin: lieu, coords: [[3, 44]], etapes: [] }, lieu);
  assert.equal(etat.resteKm, 0);
  assert.equal(etat.pourcent, 0);
});

test('les jours du voyage utilisent le calendrier local du téléphone', () => {
  const date = new Date(2026, 9, 25, 0, 5);
  assert.equal(dateLocale(date), '2026-10-25');
});

test('extraire des points de passage intermédiaires sur un tronçon long pour verrouiller la belle route', () => {
  // Tronçon d'environ 60 km
  const coords = [];
  for (let i = 0; i <= 60; i++) coords.push([3 + (i * 0.01), 44]);
  const a = { lat: 44, lon: 3, nom: 'Départ' };
  const b = { lat: 44, lon: 3.6, nom: 'Étape lointaine' };
  const jour = { debut: a, fin: b, coords, etapes: [] };
  const points = extrairePointsPassage(jour, 20);
  assert.ok(points.length >= 2, 'au moins 2 points de passage générés sur 60 km');
  assert.ok(points[0].nom.includes('Passage 1.1'));
  assert.ok(points[1].nom.includes('Passage 1.2'));

  // Guidage : depuis le départ, le prochain point est le premier passage
  const suivant = prochainPointGuidage(jour, a, b, 20);
  assert.equal(suivant.nom, points[0].nom);

  // Après le premier passage, le suivant devient le deuxième passage
  const suivantApresP1 = prochainPointGuidage(jour, { lat: points[0].lat, lon: points[0].lon }, b, 20);
  assert.equal(suivantApresP1.nom, points[1].nom);

  // Proche de l'arrivée (après le dernier passage), on guide vers l'étape finale
  const suivantFin = prochainPointGuidage(jour, { lat: points[1].lat, lon: points[1].lon + 0.05 }, b, 20);
  assert.equal(suivantFin.nom, b.nom);
});
