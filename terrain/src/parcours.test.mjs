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
