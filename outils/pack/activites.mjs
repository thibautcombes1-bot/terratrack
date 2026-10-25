// Activités du pack : randonnées (itinéraires OSM), via ferrata, escalade, canoë-kayak,
// plages et baignades, et biens du patrimoine mondial UNESCO (Wikidata).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline';

const arrondi = (x) => Math.round(x * 1e5) / 1e5;
const decoder = (texte) => texte.replace(/%([0-9a-f]+)%/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
const tagsOpl = (champ = '') =>
  Object.fromEntries(
    champ
      .split(',')
      .filter((p) => p.includes('='))
      .map((p) => p.split('=').map(decoder)),
  );

const osmium = (...args) => execFileSync('osmium', args, { stdio: ['ignore', 'ignore', 'inherit'] });

/** Itinéraires de randonnée : un point de départ par itinéraire (début de sa première voie). */
async function randonnees(brut) {
  const pbf = new URL('randos.osm.pbf', brut).pathname;
  const opl = new URL('randos.opl', brut).pathname;
  osmium('tags-filter', new URL('zone.osm.pbf', brut).pathname, 'r/route=hiking', '-o', pbf, '--overwrite');
  osmium('add-locations-to-ways', pbf, '-f', 'opl', '-o', opl, '--overwrite');
  const debuts = new Map();
  const relations = [];
  const lecteur = readline.createInterface({ input: fs.createReadStream(opl) });
  for await (const ligne of lecteur) {
    const champs = Object.fromEntries(ligne.split(' ').map((c) => [c[0], c.slice(1)]));
    if (ligne.startsWith('w')) {
      const premier = (champs.N ?? '').split(',')[0]?.match(/x([-\d.]+)y([-\d.]+)/);
      if (premier) debuts.set(ligne.split(' ')[0].slice(1), { lon: Number(premier[1]), lat: Number(premier[2]) });
    } else if (ligne.startsWith('r')) {
      const voies = (champs.M ?? '').split(',').filter((m) => m.startsWith('w')).map((m) => m.slice(1).split('@')[0]);
      relations.push({ id: ligne.split(' ')[0].slice(1), tags: tagsOpl(champs.T), voies });
    }
  }
  const lieux = [];
  for (const { id, tags, voies } of relations) {
    const depart = voies.map((v) => debuts.get(v)).find(Boolean);
    const nom = tags.name || tags.ref;
    if (!depart || !nom) continue;
    const distance = Number.parseFloat(tags.distance);
    lieux.push({
      id: `r${id}`,
      categorie: 'decouvrir',
      type: /^GR|nwn|rwn/.test(`${tags.ref ?? ''} ${tags.network ?? ''}`) ? 'Grande randonnée' : 'Randonnée',
      activite: 'randonnee',
      nom,
      lat: arrondi(depart.lat),
      lon: arrondi(depart.lon),
      longueurKm: Number.isFinite(distance) ? distance : undefined,
      source: 'osm',
    });
  }
  return lieux;
}

const ACTIVITES = [
  { test: (t) => t.highway === 'via_ferrata', type: 'Via ferrata', activite: 'viaferrata' },
  { test: (t) => /climbing/.test(t.sport ?? ''), type: 'Escalade', activite: 'escalade' },
  { test: (t) => /canoe|kayak/.test(t.sport ?? ''), type: 'Canoë-kayak', activite: 'canoe' },
  { test: (t) => t.natural === 'beach', type: 'Plage', activite: 'baignade' },
  { test: (t) => t.leisure === 'bathing_place', type: 'Baignade', activite: 'baignade' },
];

function centre(g) {
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'LineString') return g.coordinates[0];
  const anneau = g.type === 'MultiPolygon' ? g.coordinates[0][0] : g.coordinates[0];
  return [anneau.reduce((s, p) => s + p[0], 0) / anneau.length, anneau.reduce((s, p) => s + p[1], 0) / anneau.length];
}

/** Via ferrata, escalade, canoë, plages : une via ferrata en plusieurs tronçons ne compte qu'une fois. */
async function sportsNature(brut) {
  const pbf = new URL('activites.osm.pbf', brut).pathname;
  const geo = new URL('activites.geojsonseq', brut).pathname;
  osmium('tags-filter', new URL('zone.osm.pbf', brut).pathname, 'nwr/highway=via_ferrata', 'nwr/sport', 'nwr/natural=beach', 'nwr/leisure=bathing_place', '-o', pbf, '--overwrite');
  osmium('export', pbf, '-f', 'geojsonseq', '-a', 'type,id', '-o', geo, '--overwrite');
  const lieux = [];
  const vus = new Set();
  const lecteur = readline.createInterface({ input: fs.createReadStream(geo) });
  for await (const brute of lecteur) {
    const ligne = brute.replace(/^\x1e/, '').trim();
    if (!ligne) continue;
    const f = JSON.parse(ligne);
    const t = f.properties;
    const regle = ACTIVITES.find((a) => a.test(t));
    if (!regle || (regle.activite !== 'baignade' && !t.name && regle.activite !== 'viaferrata')) continue;
    // Une via ferrata est souvent découpée en tronçons « Nom : Échappatoire » : on garde le nom commun.
    const nom = (regle.activite === 'viaferrata' ? (t.name ?? '').split(/\s*[:–-]\s*/)[0] : t.name ?? '').trim();
    const cle = `${regle.activite}:${nom.toLowerCase()}`;
    if (nom && vus.has(cle)) continue;
    vus.add(cle);
    const [lon, lat] = centre(f.geometry);
    lieux.push({
      id: `${t['@type'][0]}${t['@id']}`,
      categorie: regle.activite === 'baignade' ? 'pause' : 'decouvrir',
      type: t.via_ferrata_scale ? `${regle.type} (difficulté ${t.via_ferrata_scale})` : regle.type,
      activite: regle.activite,
      nom,
      lat: arrondi(lat),
      lon: arrondi(lon),
      source: 'osm',
    });
  }
  return lieux;
}

/** Biens du patrimoine mondial (et leurs composantes) dans le rectangle, depuis Wikidata. */
async function unesco(bbox, brut) {
  const cache = new URL('unesco.json', brut);
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'));
  const [o, s, e, n] = bbox;
  const requete = `SELECT ?item ?nom ?coord WHERE {
    SERVICE wikibase:box { ?item wdt:P625 ?coord.
      bd:serviceParam wikibase:cornerSouthWest "Point(${o} ${s})"^^geo:wktLiteral; wikibase:cornerNorthEast "Point(${e} ${n})"^^geo:wktLiteral. }
    { ?item wdt:P1435 wd:Q9259 } UNION { ?item wdt:P361 ?bien. ?bien wdt:P1435 wd:Q9259 }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "fr". ?item rdfs:label ?nom. } }`;
  const reponse = await fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: { 'User-Agent': 'TerraTrack/0.1 (construction de données)', Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ query: requete }),
  });
  const biens = new Map();
  for (const l of (await reponse.json()).results.bindings) {
    const [lon, lat] = l.coord.value.match(/-?[\d.]+/g).map(Number);
    const id = l.item.value.split('/').pop();
    if (!biens.has(id)) biens.set(id, { id, nom: l.nom.value, lat: arrondi(lat), lon: arrondi(lon) });
  }
  const liste = [...biens.values()];
  fs.writeFileSync(cache, JSON.stringify(liste));
  return liste;
}

export async function lireActivites(brut, bbox) {
  return { activites: [...(await randonnees(brut)), ...(await sportsNature(brut))], unesco: await unesco(bbox, brut) };
}
