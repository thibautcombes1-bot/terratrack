// Construit server/donnees/lieux.json : les lieux de France qui valent un détour
// (articles Wikipédia géolocalisés, via Wikidata), classés comme le fait l'appli.
// Une fois construit, Cap Away n'a plus besoin d'interroger Wikipédia (qui limite les requêtes).
//   node outils/construire-lieux.mjs
import fs from 'node:fs/promises';
import { categorieDe, POINT_HAUT, SANS_INTERET } from '../server/lieux.js';

const AGENT = 'Cap Away/0.1 (projet open source, construction de données)';
const FRANCE = { sud: 41.3, nord: 51.2, ouest: -5.2, est: 9.7 };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const requete = ({ sud, nord, ouest, est }) => `
SELECT ?item ?coord ?nom ?desc ?s ?image ?article ?ele ?mh WHERE {
  SERVICE wikibase:box {
    ?item wdt:P625 ?coord.
    bd:serviceParam wikibase:cornerSouthWest "Point(${ouest} ${sud})"^^geo:wktLiteral;
                    wikibase:cornerNorthEast "Point(${est} ${nord})"^^geo:wktLiteral.
  }
  ?item wikibase:sitelinks ?s. FILTER(?s >= 2)
  ?article schema:about ?item; schema:isPartOf <https://fr.wikipedia.org/>.
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P2044 ?ele }
  OPTIONAL { ?item wdt:P1435 wd:Q10387684. BIND(1 AS ?mh) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr". ?item rdfs:label ?nom. ?item schema:description ?desc. }
}`;

async function interroger(boite) {
  const reponse = await fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: {
      'User-Agent': AGENT,
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ query: requete(boite) }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!reponse.ok) throw new Error(`Wikidata ${reponse.status}`);
  return (await reponse.json()).results.bindings;
}

/** Interroge une boîte ; si Wikidata dépasse son délai (villes denses), on la coupe en quatre. */
async function fouiller(boite, profondeur = 0) {
  try {
    return await interroger(boite);
  } catch (erreur) {
    if (profondeur >= 3) {
      console.warn(`  abandon de ${JSON.stringify(boite)} : ${erreur.message}`);
      return [];
    }
    await pause(5000);
    const milieuLat = (boite.sud + boite.nord) / 2;
    const milieuLon = (boite.ouest + boite.est) / 2;
    const quarts = [
      { sud: boite.sud, nord: milieuLat, ouest: boite.ouest, est: milieuLon },
      { sud: boite.sud, nord: milieuLat, ouest: milieuLon, est: boite.est },
      { sud: milieuLat, nord: boite.nord, ouest: boite.ouest, est: milieuLon },
      { sud: milieuLat, nord: boite.nord, ouest: milieuLon, est: boite.est },
    ];
    const resultats = [];
    for (const q of quarts) {
      resultats.push(...(await fouiller(q, profondeur + 1)));
      await pause(1000);
    }
    return resultats;
  }
}

// --essai : un seul carré (autour de Montpellier), rien n'est écrit.
const essai = process.argv.includes('--essai');
const zone = essai ? { sud: 43, nord: 44, ouest: 3, est: 4 } : FRANCE;
const lieux = new Map();
let boites = 0;
for (let sud = zone.sud; sud < zone.nord; sud += 1)
  for (let ouest = zone.ouest; ouest < zone.est; ouest += 1) {
    const boite = { sud, nord: sud + 1, ouest, est: ouest + 1 };
    const lignes = await fouiller(boite);
    boites++;
    let gardes = 0;
    for (const l of lignes) {
      const id = l.item.value.split('/').pop();
      if (lieux.has(id) || !l.nom || !l.desc) continue;
      const nom = l.nom.value;
      const description = l.desc.value;
      const texte = `${nom} ${description}`;
      // Les communes viennent de la liste labellisée (etapes.json) ; le reste est classé comme dans l'appli.
      if (/commune (française|nouvelle)|ancienne commune/i.test(description)) continue;
      // Rivières, canaux, régions : leur point n'est pas un endroit où l'on s'arrête.
      if (/^(rivière|fleuve|cours d'eau|affluent|canal|zone géographique|région)/i.test(description)) continue;
      if (SANS_INTERET.test(texte) || categorieDe(texte, []) === 'autre') continue;
      const [lon, lat] = l.coord.value.match(/-?[\d.]+(?:e-?\d+)?/gi).map(Number);
      lieux.set(id, [
        id,
        nom,
        Math.round(lat * 1e5) / 1e5,
        Math.round(lon * 1e5) / 1e5,
        description,
        Number(l.s.value),
        l.mh ? 1 : 0,
        l.ele && POINT_HAUT.test(texte) ? Math.round(Number(l.ele.value)) : null,
        l.image ? decodeURIComponent(l.image.value.split('/Special:FilePath/')[1]) : null,
        decodeURIComponent(l.article.value.split('/wiki/')[1]),
      ]);
      gardes++;
    }
    console.log(`boîte ${boites} (${sud}°N ${ouest}°E) : ${lignes.length} lignes, ${gardes} lieux gardés, total ${lieux.size}`);
    await pause(800);
  }

if (essai) {
  for (const l of [...lieux.values()].sort((a, b) => b[5] - a[5]).slice(0, 25)) console.log(l.slice(1, 8).join(' | '));
  process.exit(0);
}

await fs.writeFile(
  new URL('../server/donnees/lieux.json', import.meta.url),
  JSON.stringify({
    source: 'Wikidata (CC0), articles Wikipédia en français',
    date: new Date().toISOString().slice(0, 10),
    colonnes: ['id', 'nom', 'lat', 'lon', 'description', 'liens', 'monumentClasse', 'altitude', 'image', 'article'],
    lieux: [...lieux.values()],
  }),
);
console.log(`TERMINÉ : ${lieux.size} lieux écrits`);
