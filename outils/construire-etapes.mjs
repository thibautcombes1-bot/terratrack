// Construit server/donnees/etapes.json : communes et sites labellisés (Wikidata),
// proposés à l'IA comme étapes sûres. À relancer de temps en temps : node outils/construire-etapes.mjs
import fs from 'node:fs/promises';

const LABELS = {
  Q1010307: 'Plus Beaux Villages de France',
  Q3377466: 'Petite Cité de Caractère',
  Q3234783: 'Plus Beaux Détours de France',
  Q1003405: "Ville ou Pays d'art et d'histoire",
  Q1154112: 'Grand Site de France',
};

const requete = `
SELECT ?lieu ?nom ?coord ?label ?depNom WHERE {
  VALUES ?label { ${Object.keys(LABELS).map((q) => `wd:${q}`).join(' ')} }
  { ?lieu wdt:P463 ?label } UNION { ?lieu wdt:P1435 ?label } UNION { ?lieu wdt:P31 ?label } UNION { ?lieu wdt:P166 ?label }
  ?lieu wdt:P625 ?coord.
  ?lieu rdfs:label ?nom. FILTER(LANG(?nom) = "fr")
  OPTIONAL { ?lieu wdt:P131+ ?dep. ?dep wdt:P31 wd:Q6465. ?dep rdfs:label ?depNom. FILTER(LANG(?depNom) = "fr") }
}`;

const reponse = await fetch('https://query.wikidata.org/sparql', {
  method: 'POST',
  headers: {
    'User-Agent': 'Horizon/0.1 (projet open source)',
    Accept: 'application/sparql-results+json',
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({ query: requete }),
});
if (!reponse.ok) throw new Error(`Wikidata a répondu ${reponse.status}`);
const lignes = (await reponse.json()).results.bindings;

const parLieu = new Map();
for (const l of lignes) {
  const id = l.lieu.value.split('/').pop();
  const [lon, lat] = l.coord.value.match(/-?[\d.]+/g).map(Number);
  const e = parLieu.get(id) ?? { id, nom: l.nom.value, lat, lon, labels: [], departement: l.depNom?.value };
  const label = LABELS[l.label.value.split('/').pop()];
  if (!e.labels.includes(label)) e.labels.push(label);
  parLieu.set(id, e);
}
const etapes = [...parLieu.values()]
  .map((e) => ({ ...e, lat: Math.round(e.lat * 1e5) / 1e5, lon: Math.round(e.lon * 1e5) / 1e5 }))
  .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
await fs.writeFile(
  new URL('../server/donnees/etapes.json', import.meta.url),
  JSON.stringify({ source: 'Wikidata (CC0)', date: new Date().toISOString().slice(0, 10), etapes }, null, 0),
);
console.log(`${etapes.length} étapes écrites`);
