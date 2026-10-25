import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { chargerGraphe, detours, itineraire } from './routeur.js';

// Petit réseau : A —D1— B —A75 (péage, sens unique B→C)— C, un raccourci lent A — C,
// et E au bout d'une route à double sens depuis B.
//   A(3.0,44.0)  B(3.1,44.0)  C(3.2,44.0)  E(3.1,44.05)
const pt = (lon, lat) => [Math.round(lon * 1e5), Math.round(lat * 1e5)];
const mini = {
  sommets: [...pt(3.0, 44.0), ...pt(3.1, 44.0), ...pt(3.2, 44.0), ...pt(3.1, 44.05)],
  aretes: {
    a: [0, 1, 0, 1],
    b: [1, 2, 2, 3],
    m: [8000, 8000, 16000, 5500],
    v: [80, 80, 20, 50],
    s: [0, 1, 0, 0],
    p: [0, 1, 0, 0],
    n: [0, 1, -1, -1],
    g: [0, 2, 2, 4, 4, 6, 6, 8],
  },
  geometrie: [...pt(3.0, 44.0), ...pt(3.1, 44.0), ...pt(3.1, 44.0), ...pt(3.2, 44.0), ...pt(3.0, 44.0), ...pt(3.2, 44.0), ...pt(3.1, 44.0), ...pt(3.1, 44.05)],
  noms: ['D1', 'A75'],
};
const g = chargerGraphe(mini);
const A = { lat: 44.0, lon: 3.0 };
const B = { lat: 44.0, lon: 3.1 };
const C = { lat: 44.0, lon: 3.2 };
const E = { lat: 44.05, lon: 3.1 };

test('prend le chemin le plus rapide, pas le plus court', () => {
  const t = itineraire(g, A, C);
  assert.equal(t.metres, 16000);
  assert.ok(Math.abs(t.secondes - 720) < 1, `${t.secondes}`);
  assert.deepEqual(t.routes, ['D1', 'A75']);
  assert.equal(t.peage, true);
  assert.deepEqual(t.coords.at(-1), [3.2, 44.0]);
});

test('respecte les sens uniques : retour par la petite route', () => {
  const t = itineraire(g, C, A);
  assert.equal(t.metres, 16000);
  assert.ok(Math.abs(t.secondes - 2880) < 1, `${t.secondes}`);
  assert.equal(t.peage, false);
});

test('détour : B est sur la route, E demande un aller-retour', () => {
  const [b, e] = detours(g, A, C, [
    { nom: 'B', ...B },
    { nom: 'E', ...E },
  ]);
  assert.ok(b.detourSec < 1, `${b.detourSec}`);
  assert.ok(Math.abs(e.detourSec - 792) < 1, `${e.detourSec}`);
  assert.ok(Math.abs(e.atteindreSec - 360 - 396) < 1, `${e.atteindreSec}`);
});

const pack = new URL('../terrain/public/pack/lozere/graphe.json', import.meta.url);
test('pack Lozère : Mende → Florac par la route, en moins de 1 h 15', { skip: !fs.existsSync(pack) }, () => {
  const lozere = chargerGraphe(JSON.parse(fs.readFileSync(pack, 'utf8')));
  const t = itineraire(lozere, { lat: 44.5181, lon: 3.5006 }, { lat: 44.3245, lon: 3.5933 });
  assert.ok(t, 'itinéraire trouvé');
  assert.ok(t.metres > 30000 && t.metres < 50000, `${t.metres} m`);
  assert.ok(t.secondes > 1800 && t.secondes < 4500, `${t.secondes} s`);
});

test('pack étendu : communes de l’Hérault et itinéraires continus vers la Lozère', { skip: !fs.existsSync(pack) }, () => {
  const graphe = chargerGraphe(JSON.parse(fs.readFileSync(pack, 'utf8')));
  const { communes } = JSON.parse(fs.readFileSync(new URL('../terrain/public/pack/lozere/lieux.json', import.meta.url), 'utf8'));
  const noms = ['Montpellier', 'Lodève', 'Béziers', 'Sète', 'Agde', 'Saint-Pons-de-Thomières', 'Mende'];
  const points = new Map(noms.map((nom) => [nom, communes.find((c) => c.nom === nom)]));
  for (const nom of noms) assert.ok(points.get(nom), `${nom} disponible dans la recherche hors ligne`);
  for (const [depart, arrivee, minimumKm, maximumKm] of [
    ['Lodève', 'Montpellier', 45, 85],
    ['Béziers', 'Sète', 40, 90],
    ['Montpellier', 'Mende', 140, 230],
  ]) {
    const trajet = itineraire(graphe, points.get(depart), points.get(arrivee));
    assert.ok(trajet, `${depart} → ${arrivee} connecté`);
    assert.ok(trajet.metres > minimumKm * 1000 && trajet.metres < maximumKm * 1000, `${depart} → ${arrivee} : ${trajet.metres} m`);
    assert.ok(Number.isFinite(trajet.secondes) && trajet.coords.length > 1);
  }
});
