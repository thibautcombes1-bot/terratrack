// Construit le pack hors ligne d'une région : graphe routier, lieux des 4 boutons,
// lieux à découvrir, communes (recherche) et carte. Prérequis (voir terrain/README.md) :
//   sh outils/pack/preparer-brut.sh france.osm.pbf   routes.opl, pois.geojsonseq, zone.osm.pbf
//   .brut/france.pmtiles                              carte de la zone (pmtiles extract)
//   node outils/pack/construire-pack.mjs [france|lozere]
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import readline from 'node:readline';
import { lignes } from './lignes.mjs';
import { distanceKm } from '../../commun/geo.js';
import { lireActivites } from './activites.mjs';
import { ajouterPrix } from './prix-carburants.mjs';
import { chargerGraphe } from '../../commun/routeur.js';

const REGIONS = {
  // France métropolitaine et Corse : carte jusqu'au zoom 13, graphe sans rues de quartier.
  france: {
    id: 'france',
    nom: 'France',
    bbox: [-5.2, 41.3, 9.6, 51.15],
    source: 'france.osm.pbf',
    carte: 'france.pmtiles',
    contour: 'france-metropole.geojson',
    tolerance: 0.0001,
  },
  lozere: {
    id: 'lozere',
    nom: 'Hérault, Lozère et Cévennes',
    bbox: [2.45, 43.15, 4.25, 44.98],
    source: 'languedoc-roussillon.osm.pbf',
    carte: 'lozere.pmtiles',
    tolerance: 0.00005,
  },
};
const REGION = REGIONS[process.argv[2] ?? 'france'];
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

/**
 * Lit routes.opl et appelle `traiter(tags, ids, lon, lat)` pour chaque voie roulable.
 * Avec `coordonnees: false`, seuls les identifiants des nœuds sont lus (plus rapide).
 */
async function parcourirRoutes(traiter, { coordonnees = true } = {}) {
  const lecteur = readline.createInterface({ input: fs.createReadStream(new URL('routes.opl', BRUT)), crlfDelay: Infinity });
  for await (const ligne of lecteur) {
    if (!ligne.startsWith('w')) continue;
    const champs = Object.fromEntries(ligne.split(' ').map((c) => [c[0], c.slice(1)]));
    const tags = lireTags(champs.T);
    if (!VITESSES[tags.highway] || !champs.N) continue;
    const morceaux = champs.N.split(',');
    const ids = new Float64Array(morceaux.length);
    const lon = coordonnees ? new Float64Array(morceaux.length) : null;
    const lat = coordonnees ? new Float64Array(morceaux.length) : null;
    let k = 0;
    for (const m of morceaux) {
      const x = m.indexOf('x');
      const y = m.indexOf('y');
      if (x < 0 || y < 0) continue;
      ids[k] = Number(m.slice(1, x));
      if (coordonnees) {
        lon[k] = Number(m.slice(x + 1, y));
        lat[k] = Number(m.slice(y + 1));
      }
      k++;
    }
    if (k >= 2) traiter(tags, ids.subarray(0, k), lon?.subarray(0, k), lat?.subarray(0, k));
  }
}

/** Tableau typé qui s'agrandit : des listes JS ordinaires seraient trop lourdes pour la France. */
class Croissant {
  constructor(Type, capacite = 1 << 20) {
    this.Type = Type;
    this.t = new Type(capacite);
    this.n = 0;
  }
  push(x) {
    if (this.n === this.t.length) {
      const t = new this.Type(this.t.length * 2);
      t.set(this.t);
      this.t = t;
    }
    this.t[this.n++] = x;
  }
  get valeurs() {
    return this.t.subarray(0, this.n);
  }
}

/** Douglas-Peucker en degrés (5 m pour une région, 10 m pour la France), pour alléger le dessin des routes. */
function simplifier(points, tolerance = REGION.tolerance) {
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

/**
 * Graphe routier en deux lectures de routes.opl, sans grande table de hachage :
 * 1. tous les nœuds des voies (les extrémités deux fois), triés : ceux vus au moins deux fois
 *    sont les carrefours, c'est-à-dire les sommets ;
 * 2. chaque voie est coupée à ses carrefours ; chaque morceau devient une arête.
 */
async function construireGraphe() {
  const references = new Croissant(Float64Array, 1 << 24);
  await parcourirRoutes(
    (tags, ids) => {
      for (let i = 0; i < ids.length; i++) {
        references.push(ids[i]);
        if (i === 0 || i === ids.length - 1) references.push(ids[i]);
      }
    },
    { coordonnees: false },
  );
  const tries = references.valeurs.sort();
  const carrefours = new Croissant(Float64Array, 1 << 22);
  for (let i = 1; i < tries.length; i++)
    if (tries[i] === tries[i - 1] && (!carrefours.n || carrefours.t[carrefours.n - 1] !== tries[i])) carrefours.push(tries[i]);
  const ids = carrefours.valeurs;
  references.t = null;
  console.log(`graphe : ${tries.length} références de nœuds, ${ids.length} carrefours`);
  const indice = (id) => {
    let bas = 0;
    let haut = ids.length - 1;
    while (bas <= haut) {
      const milieu = (bas + haut) >> 1;
      if (ids[milieu] === id) return milieu;
      if (ids[milieu] < id) bas = milieu + 1;
      else haut = milieu - 1;
    }
    return -1;
  };

  const sommets = new Int32Array(2 * ids.length);
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
  const aretes = {
    a: new Croissant(Int32Array),
    b: new Croissant(Int32Array),
    m: new Croissant(Uint32Array),
    v: new Croissant(Uint8Array),
    s: new Croissant(Int8Array),
    p: new Croissant(Uint8Array),
    n: new Croissant(Int32Array),
    g: new Croissant(Uint32Array),
  };
  const geometrie = new Croissant(Int32Array, 1 << 24);
  await parcourirRoutes((tags, nids, lon, lat) => {
    const vitesseClasse = VITESSES[tags.highway];
    const limite = Number.parseInt(tags.maxspeed, 10);
    const vitesseBase = Number.isFinite(limite) ? Math.min(vitesseClasse, limite) : vitesseClasse;
    const sens = sensUnique(tags);
    const peage = tags.toll === 'yes' ? 1 : 0;
    const nom = nomDe(tags);
    const sommetDe = (i) => {
      const k = indice(nids[i]);
      sommets[2 * k] = Math.round(lon[i] * 1e5);
      sommets[2 * k + 1] = Math.round(lat[i] * 1e5);
      return k;
    };
    let debut = 0;
    for (let i = 1; i < nids.length; i++) {
      if (i < nids.length - 1 && indice(nids[i]) < 0) continue;
      const morceau = [];
      for (let k = debut; k <= i; k++) morceau.push({ lon: lon[k], lat: lat[k] });
      let metres = 0;
      for (let k = 1; k < morceau.length; k++) metres += distanceKm(morceau[k - 1], morceau[k]) * 1000;
      const droit = distanceKm(morceau[0], morceau.at(-1)) * 1000;
      // Route sinueuse (lacets) : on roule moins vite que la vitesse de la catégorie.
      const sinuosite = droit > 50 ? metres / droit : 1;
      const vitesse = Math.round(vitesseBase / Math.min(1.6, Math.max(1, Math.sqrt(sinuosite))));
      aretes.a.push(sommetDe(debut));
      aretes.b.push(sommetDe(i));
      aretes.m.push(Math.round(metres));
      aretes.v.push(Math.max(5, vitesse));
      aretes.s.push(sens);
      aretes.p.push(peage);
      aretes.n.push(nom);
      aretes.g.push(geometrie.n / 2);
      for (const p of simplifier(morceau)) {
        geometrie.push(Math.round(p.lon * 1e5));
        geometrie.push(Math.round(p.lat * 1e5));
      }
      aretes.g.push(geometrie.n / 2);
      debut = i;
    }
  });
  return {
    sommets,
    aretes: Object.fromEntries(Object.entries(aretes).map(([k, c]) => [k, c.valeurs])),
    geometrie: geometrie.valeurs,
    noms,
  };
}

/**
 * Graphe en binaire (graphe.bin) : « TTG1 », longueur de l'en-tête, en-tête JSON (classes, noms,
 * emplacement des tableaux), puis les tableaux typés alignés sur 8 octets. Le téléphone les lit
 * sans copie ; en JSON, le graphe de la France ne tiendrait pas en mémoire.
 */
function ecrireGrapheBinaire(fichier, { sommets, aretes, geometrie, noms, composante, principal }) {
  const tableaux = [['sommets', sommets], ...Object.entries(aretes), ['geometrie', geometrie], ['composante', composante], ['principal', principal]];
  const aligne = (n) => Math.ceil(n / 8) * 8;
  let decalage = 0;
  const plan = tableaux.map(([nom, t]) => {
    const place = { nom, type: t.constructor.name, longueur: t.length, decalage };
    decalage += aligne(t.byteLength);
    return place;
  });
  const entete = Buffer.from(JSON.stringify({ version: 1, classes: CLASSES, noms, tableaux: plan }));
  const tete = Buffer.alloc(aligne(8 + entete.length));
  tete.write('TTG1', 0);
  tete.writeUInt32LE(entete.length, 4);
  entete.copy(tete, 8);
  const fd = fs.openSync(fichier, 'w');
  fs.writeSync(fd, tete);
  for (const [, t] of tableaux) {
    fs.writeSync(fd, Buffer.from(t.buffer, t.byteOffset, t.byteLength));
    if (aligne(t.byteLength) > t.byteLength) fs.writeSync(fd, Buffer.alloc(aligne(t.byteLength) - t.byteLength));
  }
  fs.closeSync(fd);
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
  // Stations-service : avec ou sans nom (la marque suffit), pour le carburant en route.
  if (t.amenity === 'fuel') return { categorie: 'carburant', type: 'Station-service' };
  if (!t.name) return null;
  if (t.tourism === 'museum') return { categorie: 'decouvrir', type: 'Musée' };
  if (t.tourism === 'attraction') return { categorie: 'decouvrir', type: 'À voir' };
  if (t.natural === 'cave_entrance') return { categorie: 'decouvrir', type: 'Grotte' };
  if (t.natural === 'peak') return { categorie: 'decouvrir', type: 'Sommet' };
  if (t.historic && HISTORIQUES[t.historic]) return { categorie: 'decouvrir', type: HISTORIQUES[t.historic] };
  return null;
}

const CARBURANTS = { gazole: 'fuel:diesel', SP95: 'fuel:octane_95', SP98: 'fuel:octane_98', E10: 'fuel:e10', E85: 'fuel:e85', GPL: 'fuel:lpg' };
/** Carburants vendus (s'ils sont indiqués) et ouverture 24 h/24 (automate ou horaires 24/7). */
function carburants(t) {
  const vendus = Object.entries(CARBURANTS).filter(([, cle]) => t[cle] === 'yes').map(([nom]) => nom);
  return {
    ...(vendus.length ? { carburants: vendus } : {}),
    ...(t.opening_hours === '24/7' || t.automated === 'yes' ? { h24: true } : {}),
  };
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
  for await (const brute of lignes(new URL('pois.geojsonseq', BRUT))) {
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
      nom: t.name || (classe.categorie === 'carburant' ? t.brand : '') || '',
      lat: arrondi(lat),
      lon: arrondi(lon),
      horaires: t.opening_hours,
      date,
      verifie,
      tel: t.phone || t['contact:phone'],
      site: t.website || t['contact:website'],
      payant: t.fee,
      ...(classe.categorie === 'carburant' ? carburants(t) : {}),
      source: 'osm',
    });
  }
  return { lieux, communes };
}

const arrondi = (x) => Math.round(x * 1e5) / 1e5;
// Le contour de la France (Geofabrik) écarte les lieux des pays voisins compris dans le rectangle.
const contour = REGION.contour && JSON.parse(fs.readFileSync(new URL(REGION.contour, BRUT), 'utf8')).coordinates[0];
function dansContour({ lat, lon }) {
  let dedans = false;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    const [xi, yi] = contour[i];
    const [xj, yj] = contour[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}
const dansRegion = ({ lat, lon }) =>
  lon >= REGION.bbox[0] - 2 && lon <= REGION.bbox[2] + 1 && lat >= REGION.bbox[1] - 1 && lat <= REGION.bbox[3] + 1 &&
  (contour ? dansContour({ lat, lon }) : lon >= REGION.bbox[0] && lon <= REGION.bbox[2] && lat >= REGION.bbox[1] && lat <= REGION.bbox[3]);

/** Index des lieux par nom (en minuscules), pour trouver vite un doublon tout proche. */
function indexParNom(liste) {
  const index = new Map();
  for (const l of liste) {
    if (!l.nom) continue;
    const cle = l.nom.toLowerCase();
    if (!index.has(cle)) index.set(cle, []);
    index.get(cle).push(l);
  }
  return index;
}
const procheDuMeme = (index, x) => (index.get(x.nom.toLowerCase()) ?? []).find((l) => distanceKm(l, x) < 0.5);

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
const graphe = await construireGraphe();
// Composantes et réseau principal calculés ici, une fois : le téléphone n'a plus qu'à les lire.
Object.assign(graphe, (({ composante, principal }) => ({ composante, principal }))(chargerGraphe(graphe)));
const { lieux, communes } = await lireLieux();
const notables = lieuxNotables();
// Un lieu notable déjà présent dans OSM (même nom à moins de 500 m) n'est pas doublé.
const tous = [...lieux];
const parNomOSM = indexParNom(lieux);
for (const n of notables) if (!procheDuMeme(parNomOSM, n)) tous.push(n);

// Activités (randonnée, via ferrata, escalade, canoë, baignade) et patrimoine mondial UNESCO.
const { activites, unesco } = await lireActivites(BRUT, REGION.bbox);
// Prix des carburants (France seulement : le service de l'État ne couvre que la France).
if (REGION.id === 'france') console.log(`prix des carburants : ${await ajouterPrix(tous, BRUT, dansRegion)} stations`);
const dejaLa = new Set(tous.map((l) => l.id));
for (const a of activites) if (!dejaLa.has(a.id)) tous.push(a);
const parId = new Map(tous.map((l) => [l.id, l]));
const parNom = indexParNom(tous);
for (const bien of unesco.filter(dansRegion)) {
  const meme = parId.get(bien.id) ?? procheDuMeme(parNom, bien);
  if (meme) meme.unesco = true;
  // Les biens très étendus (paysages, chemins, canal entier) n'ont pas de point où s'arrêter.
  else if (!/paysage|chemins? de|canal du midi$|^canal |^(cévennes|causses?)$/i.test(bien.nom))
    tous.push({ ...bien, categorie: 'decouvrir', type: 'Patrimoine mondial UNESCO', unesco: true, source: 'wikidata' });
}

const fichierOSM = new URL(REGION.source, BRUT);
const enteteOSM = JSON.parse(execFileSync('osmium', ['fileinfo', '-j', fichierOSM.pathname], { encoding: 'utf8' }));
const dateDonnees = enteteOSM.header.option.timestamp.slice(0, 10);
ecrireGrapheBinaire(new URL('graphe.bin', SORTIE), graphe);
// Allégé pour le téléphone : sans les champs par défaut (source OSM, info non vérifiée), et pour
// la France, sans les 230 000 hameaux dans la recherche (villages, villes et bourgs suffisent).
const leger = (l) => {
  const { source, verifie, payant, ...reste } = l;
  return { ...reste, ...(source !== 'osm' ? { source } : {}), ...(verifie ? { verifie } : {}) };
};
const communesGardees = communes.filter((c) => dansRegion(c) && (REGION.id !== 'france' || ['city', 'town', 'village'].includes(c.type)));
fs.writeFileSync(new URL('lieux.json', SORTIE), JSON.stringify({ lieux: tous.filter(dansRegion).map(leger), communes: communesGardees }));
// La carte change rarement : sans nouvelle carte dans .brut, on garde celle du pack déjà publié
// (sa ligne de meta-precedent.json), et l'appli n'a pas à la retélécharger.
const carteNeuve = fs.existsSync(new URL(REGION.carte, BRUT));
if (carteNeuve) fs.copyFileSync(new URL(REGION.carte, BRUT), new URL('carte.pmtiles', SORTIE));
const lireJSON = (nom) => (fs.existsSync(new URL(nom, BRUT)) ? JSON.parse(fs.readFileSync(new URL(nom, BRUT), 'utf8')) : null);
// Version de la carte : le jour de la construction Protomaps dont elle est extraite.
const versionCarte = fs.existsSync(new URL('carte-version.txt', BRUT)) ? fs.readFileSync(new URL('carte-version.txt', BRUT), 'utf8').trim() : dateDonnees;
const taille = (f) => fs.statSync(new URL(f, SORTIE)).size;
// Chaque fichier a sa taille et sa version : l'appli ne télécharge que ce qui a changé.
// Version = date des données + empreinte du contenu : un pack refait le même jour (nouveau code) se voit aussi.
const empreinte = (f) => createHash('sha256').update(fs.readFileSync(new URL(f, SORTIE))).digest('hex').slice(0, 8);
const fichiers = {
  'graphe.bin': { taille: taille('graphe.bin'), version: `${dateDonnees}-${empreinte('graphe.bin')}` },
  'lieux.json': { taille: taille('lieux.json'), version: `${dateDonnees}-${empreinte('lieux.json')}` },
};
if (carteNeuve) fichiers['carte.pmtiles'] = { taille: taille('carte.pmtiles'), version: versionCarte };
else if (lireJSON('meta-precedent.json')?.fichiers?.['carte.pmtiles']) fichiers['carte.pmtiles'] = lireJSON('meta-precedent.json').fichiers['carte.pmtiles'];
else throw new Error(`Pas de carte : ni .brut/${REGION.carte}, ni .brut/meta-precedent.json`);
const meta = {
  id: REGION.id,
  nom: REGION.nom,
  bbox: REGION.bbox,
  format: 2,
  version: dateDonnees,
  donnees: `OpenStreetMap (© contributeurs, ODbL) au ${dateDonnees}, Wikidata (CC0), carte Protomaps`,
  fichiers,
};
fs.writeFileSync(new URL('meta.json', SORTIE), JSON.stringify(meta, null, 1));

const parCategorie = {};
for (const l of tous) parCategorie[l.categorie] = (parCategorie[l.categorie] ?? 0) + 1;
console.log(`graphe : ${graphe.sommets.length / 2} sommets, ${graphe.aretes.a.length} arêtes`);
console.log('lieux :', parCategorie, `communes : ${communes.length}`);
console.log('tailles (Mo) :', Object.fromEntries(Object.entries(meta.fichiers).map(([f, o]) => [f, `${(o.taille / 1e6).toFixed(1)} (${o.version})`])));
