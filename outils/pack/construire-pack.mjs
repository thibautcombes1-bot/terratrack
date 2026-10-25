// Construit le pack hors ligne d'une région : graphe routier, lieux des 4 boutons,
// lieux à découvrir, communes (recherche) et carte. Prérequis (voir terrain/README.md) :
//   .brut/routes.opl       routes de la zone avec leurs coordonnées (osmium)
//   .brut/pois.geojsonseq  lieux de la zone (osmium export)
//   .brut/lozere.pmtiles   carte de la zone (pmtiles extract)
//   node outils/pack/construire-pack.mjs
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import readline from 'node:readline';
import { distanceKm } from '../../commun/geo.js';
import { lireActivites } from './activites.mjs';

const REGION = {
  // Identifiant conservé pour les parcours et installations existants.
  id: 'lozere',
  nom: 'Hérault, Lozère et Cévennes',
  bbox: [2.45, 43.15, 4.25, 44.98],
};
const BRUT = new URL('../../.brut/', import.meta.url);
const SORTIE = new URL(`../../terrain/public/pack/${REGION.id}/`, import.meta.url);

// ---------- Réseau routier ----------

/** Vitesse moyenne réaliste (km/h) par type de route, hors agglomération. */
const VITESSES = {
  motorway: 110,
  motorway_link: 60,
  trunk: 85,
  trunk_link: 50,
  primary: 75,
  primary_link: 45,
  secondary: 65,
  secondary_link: 40,
  tertiary: 55,
  tertiary_link: 35,
  unclassified: 45,
  residential: 30,
  living_street: 10,
};
const CLASSES = Object.keys(VITESSES);

const decoder = (texte) => texte.replace(/%([0-9a-f]+)%/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));

function lireTags(champ) {
  const tags = {};
  if (!champ) return tags;
  for (const paire of champ.split(',')) {
    const i = paire.indexOf('=');
    if (i > 0) tags[decoder(paire.slice(0, i))] = decoder(paire.slice(i + 1));
  }
  return tags;
}

async function lireRoutes() {
  const voies = [];
  const lecteur = readline.createInterface({ input: fs.createReadStream(new URL('routes.opl', BRUT)) });
  for await (const ligne of lecteur) {
    if (!ligne.startsWith('w')) continue;
    const champs = Object.fromEntries(ligne.split(' ').map((c) => [c[0], c.slice(1)]));
    const tags = lireTags(champs.T);
    const noeuds = (champs.N ?? '')
      .split(',')
      .map((n) => n.match(/^n(\d+)x([-\d.]+)y([-\d.]+)$/))
      .filter(Boolean)
      .map(([, id, lon, lat]) => ({ id, lon: Number(lon), lat: Number(lat) }));
    if (noeuds.length >= 2 && VITESSES[tags.highway]) voies.push({ tags, noeuds });
  }
  return voies;
}

/** Douglas-Peucker en degrés (tolérance ~5 m), pour alléger le dessin des routes. */
function simplifier(points, tolerance = 0.00005) {
  if (points.length <= 2) return points;
  const [a, b] = [points[0], points.at(-1)];
  let max = 0;
  let indice = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const dx = b.lon - a.lon;
    const dy = b.lat - a.lat;
    const l2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((p.lon - a.lon) * dx + (p.lat - a.lat) * dy) / l2));
    const d = Math.hypot(p.lon - (a.lon + t * dx), p.lat - (a.lat + t * dy));
    if (d > max) {
      max = d;
      indice = i;
    }
  }
  if (max <= tolerance) return [a, b];
  return [...simplifier(points.slice(0, indice + 1), tolerance).slice(0, -1), ...simplifier(points.slice(indice), tolerance)];
}

function sensUnique(tags) {
  if (['yes', 'true', '1'].includes(tags.oneway)) return 1;
  if (tags.oneway === '-1') return -1;
  if (tags.oneway === 'no') return 0;
  if (tags.highway === 'motorway' || tags.junction === 'roundabout' || tags.junction === 'circular') return 1;
  return 0;
}

function construireGraphe(voies) {
  // Un nœud devient un sommet du graphe s'il est partagé par plusieurs voies ou s'il est une extrémité.
  const usages = new Map();
  for (const v of voies)
    v.noeuds.forEach((n, i) => {
      const bonus = i === 0 || i === v.noeuds.length - 1 ? 2 : 1;
      usages.set(n.id, (usages.get(n.id) ?? 0) + bonus);
    });
  const indices = new Map();
  const sommets = [];
  const sommet = (n) => {
    if (!indices.has(n.id)) {
      indices.set(n.id, sommets.length / 2);
      sommets.push(Math.round(n.lon * 1e5), Math.round(n.lat * 1e5));
    }
    return indices.get(n.id);
  };

  const noms = [];
  const indiceNom = new Map();
  const nomDe = (tags) => {
    const nom = tags.ref || tags.name;
    if (!nom) return -1;
    if (!indiceNom.has(nom)) {
      indiceNom.set(nom, noms.length);
      noms.push(nom);
    }
    return indiceNom.get(nom);
  };

  const aretes = { a: [], b: [], m: [], v: [], s: [], p: [], n: [], g: [] };
  const geometrie = [];
  for (const { tags, noeuds } of voies) {
    const vitesseClasse = VITESSES[tags.highway];
    const limite = Number.parseInt(tags.maxspeed, 10);
    const vitesseBase = Number.isFinite(limite) ? Math.min(vitesseClasse, limite) : vitesseClasse;
    const sens = sensUnique(tags);
    const peage = tags.toll === 'yes' ? 1 : 0;
    const nom = nomDe(tags);
    let debut = 0;
    for (let i = 1; i < noeuds.length; i++) {
      if (usages.get(noeuds[i].id) < 2 && i < noeuds.length - 1) continue;
      const morceau = noeuds.slice(debut, i + 1);
      let metres = 0;
      for (let k = 1; k < morceau.length; k++) metres += distanceKm(morceau[k - 1], morceau[k]) * 1000;
      const droit = distanceKm(morceau[0], morceau.at(-1)) * 1000;
      // Route sinueuse (lacets) : on roule moins vite que la vitesse de la catégorie.
      const sinuosite = droit > 50 ? metres / droit : 1;
      const vitesse = Math.round(vitesseBase / Math.min(1.6, Math.max(1, Math.sqrt(sinuosite))));
      aretes.a.push(sommet(morceau[0]));
      aretes.b.push(sommet(morceau.at(-1)));
      aretes.m.push(Math.round(metres));
      aretes.v.push(Math.max(5, vitesse));
      aretes.s.push(sens);
      aretes.p.push(peage);
      aretes.n.push(nom);
      aretes.g.push(geometrie.length / 2);
      for (const p of simplifier(morceau)) geometrie.push(Math.round(p.lon * 1e5), Math.round(p.lat * 1e5));
      aretes.g.push(geometrie.length / 2);
      debut = i;
    }
  }
  // g contient [début, fin[ de chaque géométrie : on le ramène à une paire par arête.
  const g = [];
  for (let i = 0; i < aretes.g.length; i += 2) g.push(aretes.g[i], aretes.g[i + 1]);
  aretes.g = g;
  return { sommets, aretes, geometrie, noms };
}

// ---------- Lieux des 4 boutons ----------

const DORMIR = {
  camp_site: 'Camping',
  caravan_site: 'Aire de camping-car',
  alpine_hut: 'Refuge',
  wilderness_hut: 'Cabane',
  guest_house: "Chambre d'hôte",
  chalet: 'Gîte',
  hostel: "Gîte d'étape",
  hotel: 'Hôtel',
};
const MANGER_COMMERCES = {
  bakery: 'Boulangerie',
  convenience: 'Épicerie',
  general: 'Épicerie',
  supermarket: 'Supermarché',
  farm: 'Vente à la ferme',
  cheese: 'Fromagerie',
  butcher: 'Boucherie',
  greengrocer: 'Primeur',
  deli: 'Traiteur',
  wine: 'Cave à vin',
};
const MANGER_LIEUX = { marketplace: 'Marché', restaurant: 'Restaurant', cafe: 'Café' };
const HISTORIQUES = {
  castle: 'Château',
  ruins: 'Ruines',
  archaeological_site: 'Site archéologique',
  monument: 'Monument',
  church: 'Église',
  chapel: 'Chapelle',
  monastery: 'Monastère',
  bridge: 'Pont ancien',
  tower: 'Tour',
  city_gate: 'Porte de ville',
  fort: 'Fort',
  manor: 'Manoir',
  aqueduct: 'Aqueduc',
  mine: 'Ancienne mine',
};

/** { categorie, type } d'un lieu OSM, ou null s'il n'aide pas en route. */
function classer(t) {
  // Bivouac : seulement les lieux déclarés (aire sommaire, mention bivouac) ou les abris sommaires.
  if (t.tourism === 'camp_site' && (t.camp_site === 'basic' || t.backcountry === 'yes' || /bivouac/i.test(t.name ?? '')))
    return { categorie: 'dormir', type: 'Bivouac' };
  if (t.amenity === 'shelter' && ['basic_hut', 'lean_to'].includes(t.shelter_type))
    return { categorie: 'dormir', type: 'Abri (bivouac à vérifier)' };
  // Gratuit seulement si OSM le dit (fee=no) : sinon on ne sait pas, on ne promet rien.
  if (t.fee === 'no' && t.tourism === 'camp_site') return { categorie: 'dormir', type: 'Camping gratuit' };
  if (t.fee === 'no' && t.tourism === 'caravan_site') return { categorie: 'dormir', type: 'Aire de camping-car gratuite' };
  if (t.tourism && DORMIR[t.tourism]) return { categorie: 'dormir', type: DORMIR[t.tourism] };
  if (t.shop && MANGER_COMMERCES[t.shop]) return { categorie: 'manger', type: MANGER_COMMERCES[t.shop] };
  if (t.amenity && MANGER_LIEUX[t.amenity]) return { categorie: 'manger', type: MANGER_LIEUX[t.amenity] };
  if (t.amenity === 'drinking_water' || (t.natural === 'spring' && t.drinking_water === 'yes'))
    return { categorie: 'pause', type: 'Eau potable' };
  if (t.tourism === 'picnic_site' || t.leisure === 'picnic_table') return { categorie: 'pause', type: 'Pique-nique' };
  if (t.leisure === 'bathing_place') return { categorie: 'pause', type: 'Baignade' };
  if (t.amenity === 'shelter') return { categorie: 'pause', type: 'Abri' };
  if (t.amenity === 'toilets') return { categorie: 'pause', type: 'Toilettes' };
  if (t.tourism === 'viewpoint') return { categorie: 'decouvrir', type: 'Point de vue' };
  if (t.natural === 'waterfall') return { categorie: 'decouvrir', type: 'Cascade' };
  if (t.natural === 'arch') return { categorie: 'decouvrir', type: 'Arche naturelle' };
  if (!t.name) return null;
  if (t.tourism === 'museum') return { categorie: 'decouvrir', type: 'Musée' };
  if (t.tourism === 'attraction') return { categorie: 'decouvrir', type: 'À voir' };
  if (t.natural === 'cave_entrance') return { categorie: 'decouvrir', type: 'Grotte' };
  if (t.natural === 'peak') return { categorie: 'decouvrir', type: 'Sommet' };
  if (t.historic && HISTORIQUES[t.historic]) return { categorie: 'decouvrir', type: HISTORIQUES[t.historic] };
  return null;
}

/** Date de la dernière vérification connue : un contrôle sur place, sinon la dernière modification. */
function dateInfo(t, horodatage) {
  const verifie = t.check_date || t['survey:date'] || t['check_date:opening_hours'];
  if (verifie && /^\d{4}(-\d{2})?/.test(verifie)) return { date: verifie.slice(0, 7), verifie: true };
  // osmium donne l'horodatage en secondes depuis 1970 (ou en texte ISO selon les versions).
  const iso = typeof horodatage === 'number' ? new Date(horodatage * 1000).toISOString() : horodatage;
  return { date: iso?.slice(0, 7), verifie: false };
}

function centre(geometrie) {
  if (geometrie.type === 'Point') return geometrie.coordinates;
  const anneau = geometrie.coordinates[0][0]?.[0] !== undefined && Array.isArray(geometrie.coordinates[0][0][0])
    ? geometrie.coordinates[0][0]
    : geometrie.coordinates[0];
  const n = anneau.length;
  return [anneau.reduce((s, p) => s + p[0], 0) / n, anneau.reduce((s, p) => s + p[1], 0) / n];
}

async function lireLieux() {
  const lieux = [];
  const communes = [];
  const lecteur = readline.createInterface({ input: fs.createReadStream(new URL('pois.geojsonseq', BRUT)) });
  for await (const brute of lecteur) {
    const ligne = brute.replace(/^\x1e/, '');
    if (!ligne.trim()) continue;
    const f = JSON.parse(ligne);
    const t = f.properties;
    const [lon, lat] = centre(f.geometry);
    if (t.place && t.name) {
      communes.push({ nom: t.name, lat: arrondi(lat), lon: arrondi(lon), type: t.place });
      continue;
    }
    const classe = classer(t);
    if (!classe) continue;
    const { date, verifie } = dateInfo(t, t['@timestamp']);
    lieux.push({
      id: `${t['@type'][0]}${t['@id']}`,
      ...classe,
      nom: t.name ?? '',
      lat: arrondi(lat),
      lon: arrondi(lon),
      horaires: t.opening_hours,
      date,
      verifie,
      tel: t.phone || t['contact:phone'],
      site: t.website || t['contact:website'],
      payant: t.fee,
      source: 'osm',
    });
  }
  return { lieux, communes };
}

const arrondi = (x) => Math.round(x * 1e5) / 1e5;
const dansRegion = ({ lat, lon }) =>
  lon >= REGION.bbox[0] && lon <= REGION.bbox[2] && lat >= REGION.bbox[1] && lat <= REGION.bbox[3];

/** Les lieux notables (Wikidata) et villages labellisés de la zone rejoignent « À découvrir ». */
function lieuxNotables() {
  const notables = [];
  try {
    const { lieux } = JSON.parse(fs.readFileSync(new URL('../../server/donnees/lieux.json', import.meta.url), 'utf8'));
    // Massifs, plateaux, régions : leur point n'est pas un endroit où s'arrêter.
    const zone = /chaîne de montagnes|massif|plateau|causse\b|région|parc national|parc naturel|territoire|pays\b/i;
    for (const [id, nom, lat, lon, description, liens, classe] of lieux)
      if (dansRegion({ lat, lon }) && !zone.test(description))
        notables.push({
          id,
          categorie: 'decouvrir',
          type: description,
          nom: nom.charAt(0).toUpperCase() + nom.slice(1),
          lat,
          lon,
          notoriete: liens,
          classe: classe === 1,
          source: 'wikidata',
        });
  } catch {
    console.warn('server/donnees/lieux.json absent : pas de lieux notables Wikidata');
  }
  const { etapes } = JSON.parse(fs.readFileSync(new URL('../../server/donnees/etapes.json', import.meta.url), 'utf8'));
  for (const e of etapes)
    if (dansRegion(e))
      notables.push({ id: e.id, categorie: 'decouvrir', type: e.labels.join(' · '), nom: e.nom, lat: e.lat, lon: e.lon, labels: e.labels, source: 'wikidata' });
  return notables;
}

// ---------- Assemblage ----------

fs.mkdirSync(SORTIE, { recursive: true });
const voies = await lireRoutes();
const graphe = construireGraphe(voies);
const { lieux, communes } = await lireLieux();
const notables = lieuxNotables();
// Un lieu notable déjà présent dans OSM (même nom à moins de 500 m) n'est pas doublé.
const tous = [...lieux];
for (const n of notables)
  if (!lieux.some((l) => l.nom && l.nom.toLowerCase() === n.nom.toLowerCase() && distanceKm(l, n) < 0.5)) tous.push(n);

// Activités (randonnée, via ferrata, escalade, canoë, baignade) et patrimoine mondial UNESCO.
const { activites, unesco } = await lireActivites(BRUT, REGION.bbox);
const dejaLa = new Set(tous.map((l) => l.id));
for (const a of activites) if (!dejaLa.has(a.id)) tous.push(a);
for (const bien of unesco) {
  const meme = tous.find((l) => l.id === bien.id || (l.nom && l.nom.toLowerCase() === bien.nom.toLowerCase() && distanceKm(l, bien) < 0.5));
  if (meme) meme.unesco = true;
  // Les biens très étendus (paysages, chemins, canal entier) n'ont pas de point où s'arrêter.
  else if (!/paysage|chemins? de|canal du midi$|^canal |^(cévennes|causses?)$/i.test(bien.nom))
    tous.push({ ...bien, categorie: 'decouvrir', type: 'Patrimoine mondial UNESCO', unesco: true, source: 'wikidata' });
}

const fichierOSM = new URL('languedoc-roussillon.osm.pbf', BRUT);
const enteteOSM = JSON.parse(execFileSync('osmium', ['fileinfo', '-j', fichierOSM.pathname], { encoding: 'utf8' }));
const dateDonnees = enteteOSM.header.option.timestamp.slice(0, 10);
fs.writeFileSync(new URL('graphe.json', SORTIE), JSON.stringify({ classes: CLASSES, ...graphe }));
fs.writeFileSync(new URL('lieux.json', SORTIE), JSON.stringify({ lieux: tous, communes }));
fs.copyFileSync(new URL('lozere.pmtiles', BRUT), new URL('carte.pmtiles', SORTIE));
const taille = (f) => fs.statSync(new URL(f, SORTIE)).size;
const meta = {
  ...REGION,
  version: dateDonnees,
  donnees: `OpenStreetMap (© contributeurs, ODbL) au ${dateDonnees}, Wikidata (CC0), carte Protomaps`,
  fichiers: Object.fromEntries(['carte.pmtiles', 'graphe.json', 'lieux.json'].map((f) => [f, taille(f)])),
};
fs.writeFileSync(new URL('meta.json', SORTIE), JSON.stringify(meta, null, 1));

const parCategorie = {};
for (const l of tous) parCategorie[l.categorie] = (parCategorie[l.categorie] ?? 0) + 1;
console.log(`graphe : ${graphe.sommets.length / 2} sommets, ${graphe.aretes.a.length} arêtes`);
console.log('lieux :', parCategorie, `communes : ${communes.length}`);
console.log('tailles (Mo) :', Object.fromEntries(Object.entries(meta.fichiers).map(([f, o]) => [f, (o / 1e6).toFixed(1)])));
