// Activités du pack, chacune avec son niveau : randonnées (itinéraires OSM), via ferrata
// (regroupées par parcours, cotation de 1 à 6), escalade (cotations, voies), canoë-kayak,
// plages et baignades, et biens du patrimoine mondial UNESCO (Wikidata).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline';
import { lignes } from './lignes.mjs';
import { distanceKm } from '../../commun/geo.js';

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

/** Longueur (km) d'une suite de points [lon, lat]. */
function longueurKm(points) {
  let km = 0;
  for (let i = 1; i < points.length; i++)
    km += distanceKm({ lon: points[i - 1][0], lat: points[i - 1][1] }, { lon: points[i][0], lat: points[i][1] });
  return km;
}

// ---------- Randonnées ----------

/** Niveau d'une randonnée d'après l'effort (km + 1 km par 100 m de montée), à la manière suisse. */
function niveauRando(km, montee, boucle) {
  const effort = km + (montee ?? 0) / 100;
  if (km > 40 && !boucle) return { niveau: 'Itinérance', niveauRang: 3, dureeH: null };
  const dureeH = Math.round((effort / 4) * 2) / 2;
  if (effort < 12) return { niveau: 'Facile', niveauRang: 1, dureeH };
  if (effort < 22) return { niveau: 'Moyen', niveauRang: 2, dureeH };
  return { niveau: 'Difficile', niveauRang: 3, dureeH };
}

/** Itinéraires de randonnée : départ, longueur (calculée sur le tracé si absente), dénivelé, niveau. */
async function randonnees(brut) {
  const pbf = new URL('randos.osm.pbf', brut).pathname;
  const opl = new URL('randos.opl', brut).pathname;
  osmium('tags-filter', new URL('zone.osm.pbf', brut).pathname, 'r/route=hiking', '-o', pbf, '--overwrite');
  osmium('add-locations-to-ways', pbf, '-f', 'opl', '-o', opl, '--overwrite');
  const voies = new Map();
  const relations = [];
  const lecteur = readline.createInterface({ input: fs.createReadStream(opl) });
  for await (const ligne of lecteur) {
    const champs = Object.fromEntries(ligne.split(' ').map((c) => [c[0], c.slice(1)]));
    if (ligne.startsWith('w')) {
      const points = (champs.N ?? '')
        .split(',')
        .map((n) => n.match(/x([-\d.]+)y([-\d.]+)/))
        .filter(Boolean)
        .map((m) => [Number(m[1]), Number(m[2])]);
      if (points.length) voies.set(ligne.split(' ')[0].slice(1), { debut: points[0], km: longueurKm(points) });
    } else if (ligne.startsWith('r')) {
      const membres = (champs.M ?? '').split(',').filter((m) => m.startsWith('w')).map((m) => m.slice(1).split('@')[0]);
      relations.push({ id: ligne.split(' ')[0].slice(1), tags: tagsOpl(champs.T), membres });
    }
  }
  const lieux = [];
  for (const { id, tags, membres } of relations) {
    const nom = tags.name || tags.ref;
    const premiere = membres.map((m) => voies.get(m)).find(Boolean);
    if (!premiere || !nom) continue;
    const kmTrace = membres.reduce((s, m) => s + (voies.get(m)?.km ?? 0), 0);
    const kmTag = Number.parseFloat((tags.distance ?? '').replace(',', '.'));
    const km = Math.round((Number.isFinite(kmTag) && kmTag > 0 ? kmTag : kmTrace) * 10) / 10;
    if (!(km > 0)) continue;
    const montee = Number.parseInt(tags.ascent, 10);
    const boucle = tags.roundtrip === 'yes';
    const niveau = niveauRando(km, Number.isFinite(montee) ? montee : null, boucle);
    lieux.push({
      id: `r${id}`,
      categorie: 'decouvrir',
      type: /^GR|nwn|rwn|iwn/.test(`${tags.ref ?? ''} ${tags.network ?? ''}`) ? 'Grande randonnée' : 'Randonnée',
      activite: 'randonnee',
      nom,
      lat: arrondi(premiere.debut[1]),
      lon: arrondi(premiere.debut[0]),
      longueurKm: km,
      deniveleM: Number.isFinite(montee) ? montee : undefined,
      boucle,
      ...niveau,
      details: [
        `${String(km).replace('.', ',')} km`,
        Number.isFinite(montee) && `${montee} m de montée`,
        boucle ? 'boucle' : 'aller simple',
        niveau.dureeH && `environ ${String(niveau.dureeH).replace('.', ',')} h de marche`,
      ].filter(Boolean),
      description: tags.description?.slice(0, 220),
      source: 'osm',
    });
  }
  return lieux;
}

// ---------- Via ferrata ----------

const COTATIONS_VF = ['Sentier', 'F (facile)', 'PD (peu difficile)', 'AD (assez difficile)', 'D (difficile)', 'TD (très difficile)', 'ED (extrêmement difficile)'];
const rangVF = (cote) => (cote <= 1 ? 1 : cote <= 3 ? 2 : cote === 4 ? 3 : 4);
const NIVEAUX = ['', 'Facile', 'Moyen', 'Difficile', 'Très difficile'];
/** « Via Ferrata du Thaurac: Les Deux Cheminées » → « via ferrata du thaurac » (le parcours, pas la variante). */
const parcoursVF = (nom) => nom.split(/\s*:\s*/)[0].replace(/\s+/g, ' ').trim();

/**
 * Une fiche par via ferrata : tous ses tronçons et variantes sont regroupés,
 * avec la cotation du parcours principal, l'écart de difficulté et le départ.
 */
function viaFerrata(segments, departs) {
  const groupes = new Map();
  for (const s of segments.filter((x) => x.nom)) {
    const cle = parcoursVF(s.nom).toLowerCase();
    const g = groupes.get(cle) ?? { nom: parcoursVF(s.nom), segments: [], variantes: new Set() };
    g.segments.push(s);
    const variante = s.nom.split(/\s*:\s*/)[1];
    if (variante) g.variantes.add(variante);
    groupes.set(cle, g);
  }
  // Les tronçons sans nom rejoignent la via ferrata la plus proche (à moins de 500 m).
  for (const s of segments.filter((x) => !x.nom)) {
    const proche = [...groupes.values()].find((g) => g.segments.some((t) => distanceKm(t.debut, s.debut) < 0.5));
    if (proche) proche.segments.push(s);
  }
  return [...groupes.values()].map((g) => {
    const principaux = g.segments.filter((s) => !s.nom || !s.nom.includes(':'));
    const cotes = (principaux.length ? principaux : g.segments).map((s) => s.cote).filter((c) => Number.isFinite(c));
    const toutes = g.segments.map((s) => s.cote).filter((c) => Number.isFinite(c));
    const cote = cotes.length ? Math.round(cotes.reduce((a, b) => a + b, 0) / cotes.length) : null;
    const depart =
      departs.find((d) => d.texte.toLowerCase().includes(g.nom.toLowerCase().replace(/^mini /, ''))) ??
      { lat: g.segments[0].debut.lat, lon: g.segments[0].debut.lon };
    const km = g.segments.reduce((s, x) => s + x.km, 0);
    const [min, max] = toutes.length ? [Math.min(...toutes), Math.max(...toutes)] : [null, null];
    return {
      id: `vf-${g.segments[0].id}`,
      categorie: 'decouvrir',
      type: 'Via ferrata',
      activite: 'viaferrata',
      nom: g.nom,
      lat: arrondi(depart.lat),
      lon: arrondi(depart.lon),
      cotation: cote,
      niveau: cote != null ? NIVEAUX[rangVF(cote)] : undefined,
      niveauRang: cote != null ? rangVF(cote) : undefined,
      niveauTexte: cote != null ? `${COTATIONS_VF[cote]}${max > cote ? `, passages jusqu'à ${COTATIONS_VF[max].split(' ')[0]}` : ''}${min < cote ? `, échappatoire ${COTATIONS_VF[min].split(' ')[0]}` : ''}` : undefined,
      dureeH: cote == null ? 3 : cote <= 2 ? 2 : cote <= 4 ? 3 : 4,
      details: [
        km >= 0.1 && `${Math.round(km * 1000)} m de câbles et passages`,
        g.variantes.size && `variantes : ${[...g.variantes].slice(0, 4).join(', ')}`,
      ].filter(Boolean),
      source: 'osm',
    };
  });
}

// ---------- Escalade ----------

const RANGS_COTE = (cote) => {
  const m = String(cote ?? '').match(/^(\d)([abc])?/);
  return m ? Number(m[1]) + (m[2] ? 'abc'.indexOf(m[2]) / 3 : 0) : null;
};

function escalade(t) {
  const min = t['climbing:grade:french:min'] ?? t['climbing:grade:french'];
  const max = t['climbing:grade:french:max'];
  const rang = RANGS_COTE(min);
  const genres = [
    t['climbing:boulder'] === 'yes' && 'bloc',
    t['climbing:sport'] === 'yes' && 'voies équipées',
    t['climbing:multipitch'] === 'yes' && 'grandes voies',
  ].filter(Boolean);
  return {
    niveau: rang == null ? undefined : rang < 6 ? 'Facile' : rang < 6.67 ? 'Moyen' : 'Difficile',
    niveauRang: rang == null ? undefined : rang < 6 ? 1 : rang < 6.67 ? 2 : 3,
    niveauTexte: min ? `cotations ${min}${max && max !== min ? ` à ${max}` : ''}` : undefined,
    dureeH: 2.5,
    details: [
      t['climbing:routes'] && `${t['climbing:routes']} voies`,
      t['climbing:length:max'] && `jusqu'à ${t['climbing:length:max']} m`,
      genres.length && genres.join(', '),
      t['climbing:rock'] && `rocher : ${t['climbing:rock']}`,
    ].filter(Boolean),
  };
}

// ---------- Canoë, baignade ----------

const ACTIVITES = [
  { test: (t) => /climbing/.test(t.sport ?? '') && t.sport !== 'via_ferrata', type: 'Escalade', activite: 'escalade', infos: escalade },
  {
    test: (t) => /canoe|kayak/.test(t.sport ?? ''),
    type: 'Canoë-kayak',
    activite: 'canoe',
    infos: (t) => ({ dureeH: 2.5, details: [t.rental === 'yes' && 'location sur place'].filter(Boolean) }),
  },
  {
    test: (t) => t.natural === 'beach' || t.leisure === 'bathing_place',
    type: 'Baignade',
    activite: 'baignade',
    infos: (t) => ({
      dureeH: 1,
      details: [
        t.supervised === 'yes' || t.lifeguard === 'yes' ? 'surveillée' : t.supervised === 'no' || t.lifeguard === 'no' ? 'non surveillée' : null,
        t.surface && ({ sand: 'sable', pebblestone: 'galets', stone: 'rochers', gravel: 'graviers', grass: 'herbe' }[t.surface] ?? t.surface),
      ].filter(Boolean),
    }),
  },
];

function centre(g) {
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'LineString') return g.coordinates[0];
  const anneau = g.type === 'MultiPolygon' ? g.coordinates[0][0] : g.coordinates[0];
  return [anneau.reduce((s, p) => s + p[0], 0) / anneau.length, anneau.reduce((s, p) => s + p[1], 0) / anneau.length];
}

/** Via ferrata, escalade, canoë, baignade, avec niveau et détails. */
async function sportsNature(brut) {
  const pbf = new URL('activites.osm.pbf', brut).pathname;
  const geo = new URL('activites.geojsonseq', brut).pathname;
  osmium('tags-filter', new URL('zone.osm.pbf', brut).pathname, 'nwr/highway=via_ferrata', 'nwr/sport=climbing,bouldering,climbing_adventure,via_ferrata,canoe,kayak', 'nwr/natural=beach', 'nwr/leisure=bathing_place', '-o', pbf, '--overwrite');
  osmium('export', pbf, '-f', 'geojsonseq', '-a', 'type,id', '-o', geo, '--overwrite');
  const lieux = [];
  const segments = [];
  const departs = [];
  const vus = new Set();
  for await (const brute of lignes(geo)) {
    const ligne = brute.replace(/^\x1e/, '').trim();
    if (!ligne) continue;
    const f = JSON.parse(ligne);
    const t = f.properties;
    const [lon, lat] = centre(f.geometry);
    const id = `${t['@type'][0]}${t['@id']}`;
    if (t.highway === 'via_ferrata') {
      const cote = Number.parseInt(t.via_ferrata_scale, 10);
      segments.push({
        id,
        nom: t.name?.trim(),
        cote: Number.isFinite(cote) ? cote : null,
        debut: { lat, lon },
        km: f.geometry.type === 'LineString' ? longueurKm(f.geometry.coordinates) : 0,
      });
      continue;
    }
    if (t.sport === 'via_ferrata' && t.via_ferrata === 'start') {
      departs.push({ texte: t.description ?? t.name ?? '', lat, lon });
      continue;
    }
    const regle = ACTIVITES.find((a) => a.test(t));
    if (!regle || (regle.activite !== 'baignade' && !t.name)) continue;
    const nom = (t.name ?? '').trim();
    const cle = `${regle.activite}:${nom.toLowerCase()}`;
    if (nom && vus.has(cle)) continue;
    vus.add(cle);
    lieux.push({
      id,
      categorie: regle.activite === 'baignade' ? 'pause' : 'decouvrir',
      type: regle.activite === 'baignade' ? (t.natural === 'beach' ? 'Plage' : 'Baignade') : regle.type,
      activite: regle.activite,
      nom,
      lat: arrondi(lat),
      lon: arrondi(lon),
      ...regle.infos(t),
      source: 'osm',
    });
  }
  return [...viaFerrata(segments, departs), ...lieux];
}

// ---------- UNESCO ----------

/**
 * Biens du patrimoine mondial (et leurs composantes) situés en France, depuis Wikidata,
 * gardés s'ils tombent dans le rectangle. Filtrer par pays plutôt que par rectangle :
 * la recherche par rectangle sur toute la France dépasse le temps permis par Wikidata.
 */
async function unesco(bbox, brut) {
  const cache = new URL('unesco-france.json', brut);
  if (!fs.existsSync(cache)) {
    const requete = `SELECT ?item ?nom ?coord WHERE {
      { ?item wdt:P1435 wd:Q9259 } UNION { ?item wdt:P361 ?bien. ?bien wdt:P1435 wd:Q9259 }
      ?item wdt:P17 wd:Q142; wdt:P625 ?coord.
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr". ?item rdfs:label ?nom. } }`;
    let donnees;
    for (let essai = 1; !donnees; essai++) {
      const reponse = await fetch('https://query.wikidata.org/sparql', {
        method: 'POST',
        headers: { 'User-Agent': 'TerraTrack/0.1 (construction de données)', Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ query: requete }),
      });
      if (reponse.ok) donnees = await reponse.json();
      else if (essai >= 3) throw new Error(`Wikidata UNESCO : ${reponse.status} ${(await reponse.text()).slice(0, 80)}`);
      else await new Promise((ok) => setTimeout(ok, 10000 * essai));
    }
    const biens = new Map();
    for (const l of donnees.results.bindings) {
      const [lon, lat] = l.coord.value.match(/-?[\d.]+/g).map(Number);
      const id = l.item.value.split('/').pop();
      if (!biens.has(id)) biens.set(id, { id, nom: l.nom.value, lat: arrondi(lat), lon: arrondi(lon) });
    }
    fs.writeFileSync(cache, JSON.stringify([...biens.values()]));
  }
  const [o, s, e, n] = bbox;
  return JSON.parse(fs.readFileSync(cache, 'utf8')).filter((b) => b.lon >= o && b.lon <= e && b.lat >= s && b.lat <= n);
}

export async function lireActivites(brut, bbox) {
  return { activites: [...(await randonnees(brut)), ...(await sportsNature(brut))], unesco: await unesco(bbox, brut) };
}
