import assert from 'node:assert/strict';
import test from 'node:test';
import { ajustementMeteo } from './parcours.js';

test('météo : orage et vent écartent la via ferrata, la pluie favorise les visites à l’abri', () => {
  const viaFerrata = { nom: 'Via ferrata du Thaurac', type: 'Via ferrata', activite: 'viaferrata' };
  const grotte = { nom: 'Grotte de Dargilan', type: 'Grotte' };
  const plage = { nom: 'Plage du lac', type: 'Plage', activite: 'baignade' };
  assert.equal(ajustementMeteo(viaFerrata, { orage: true }), -Infinity);
  assert.equal(ajustementMeteo(viaFerrata, { vent: true }), -Infinity);
  assert.ok(ajustementMeteo(grotte, { pluie: true }) > 0);
  assert.ok(ajustementMeteo(plage, { pluie: true }) < 0);
  assert.ok(ajustementMeteo(plage, { chaleur: true }) > 0);
  assert.equal(ajustementMeteo(grotte, {}), 0);
});

// Le créateur d'itinéraire sur le vrai pack France (si présent) : ce qui avait coincé ne doit plus revenir.
import fs from 'node:fs';
import { chargerGraphe, lireGrapheBinaire } from '../../commun/routeur.js';
import { planifier } from './parcours.js';

const dossier = new URL('../public/pack/france/', import.meta.url);
const avecPack = fs.existsSync(new URL('graphe.bin', dossier));
const pack = avecPack
  ? (() => {
      const { lieux, communes } = JSON.parse(fs.readFileSync(new URL('lieux.json', dossier), 'utf8'));
      return { graphe: chargerGraphe(lireGrapheBinaire(fs.readFileSync(new URL('graphe.bin', dossier)))), lieux, communes };
    })()
  : null;
const commune = (nom) => pack.communes.find((c) => c.nom === nom && c.type !== 'hamlet');
const voyage = (p) =>
  planifier(pack, { date: '2026-10-26', heure: 570, rythme: 'normal', nuits: ['camping', 'gite'], exclus: [], favoris: [], ...p });

test('une semaine « via ferrata » avec un plein depuis Bédarieux enchaîne les via ferrata', { skip: !avecPack }, () => {
  const plan = voyage({ depart: commune('Bédarieux'), mode: 'plein', jours: 7, envies: ['viaferrata'], kmMax: 580, porteeMaxKm: 250 });
  const vf = new Set(plan.jours.flatMap((j) => j.etapes).filter((e) => e.activite === 'viaferrata').map((e) => e.nom));
  assert.equal(plan.jours.length, 7);
  assert.ok(vf.size >= 6, `${vf.size} via ferrata`);
  const km = plan.jours.reduce((s, j) => s + j.metres, 0) / 1000;
  assert.ok(km <= 700, `${Math.round(km)} km pour un plein d'environ 660 km`);
});

test('un week-end loin (Paris → Saint-Malo) garde des étapes en route, dans l’ordre', { skip: !avecPack }, () => {
  const plan = voyage({ depart: commune('Paris'), destination: commune('Saint-Malo'), mode: 'destination', jours: 2, envies: ['patrimoine', 'villages'] });
  const etapes = plan.jours.flatMap((j) => j.etapes);
  assert.ok(etapes.length >= 4, `${etapes.length} étapes`);
  // Pas d'aller-retour : la place dans la tournée croît dans l'ordre de passage.
  for (let i = 1; i < etapes.length; i++) assert.ok(etapes[i].cle >= etapes[i - 1].cle);
});
