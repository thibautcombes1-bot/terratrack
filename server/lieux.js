// Lieux réels : géocodage (Photon, données OpenStreetMap) et lieux notables
// autour d'un point (articles Wikipédia géolocalisés), altitude par Open-Meteo.
// Les serveurs Overpass publics refusent désormais ce genre de requêtes : on ne s'en sert pas.
import fs from 'node:fs';
import { distanceKm } from '../commun/geo.js';
import { avecCache, lireJson } from './cache.js';

/**
 * Envies liées à de vrais lieux. On classe chaque article d'après son titre et sa
 * description Wikipédia. Les autres envies (calme, photo…) ne guident que l'IA.
 */
export const ENVIES = {
  nature: {
    nom: 'Nature',
    motif: /grotte|gorges?\b|cascade|cirque|forêt|réserve naturelle|aven\b|source|vallée|parc naturel|site naturel|grand site|falaise|causse|chaos|marais|étang|dune/i,
  },
  randonnee: {
    nom: 'Randonnée',
    motif: /\bmont\b|montagne|sommet|\bpic\b|\bcol\b|puech|crête|plateau|massif|sentier|\bGR\b/i,
  },
  panoramas: { nom: 'Panoramas', motif: /belvédère|panorama|point de vue|table d'orientation|\bmont\b|sommet|\bpic\b|signal/i },
  villages: { nom: 'Villages', motif: /commune française|village|bastide|hameau|cité médiévale/i },
  patrimoine: {
    nom: 'Patrimoine',
    motif: /abbaye|abbatiale|château|castellas|église|chapelle|cathédrale|prieuré|\bpont\b|aqueduc|rempart|\btour\b|dolmen|menhir|oppidum|archéolog|édifice|\bfort\b|commanderie|monastère|basilique|arènes|théâtre antique/i,
  },
  musees: { nom: 'Musées', motif: /musée|galerie|écomusée|centre d'interprétation/i },
  gastronomie: {
    nom: 'Gastronomie & vin',
    motif: /domaine viticole|vignoble|\bvins?\b|cave|appellation|AOC|fromage|marché|distillerie|brasserie|restaurant|huîtres|olive/i,
  },
  baignade: { nom: 'Baignade', motif: /\blac\b|plage|plan d'eau|base de loisirs|calanque|rivière|lagune/i },
  aventure: { nom: 'Aventure', motif: /via ferrata|escalade|canoë|kayak|parapente|accrobranche|parc aventure|base nautique|canyon/i },
  insolite: {
    nom: 'Insolite',
    motif: /insolite|curiosité|moulin|phare|émetteur|viaduc|troglodyt|tunnel|\bmine\b|fontaine|labyrinthe|jardin/i,
  },
  astronomie: { nom: 'Astronomie', motif: /observatoire|planétarium|ciel étoilé|réserve de ciel/i },
};

/** Articles géolocalisés sans intérêt pour un voyage. */
export const SANS_INTERET =
  /parc naturel régional|parc national|région naturelle|pays traditionnel|plateau calcaire|massif montagneux|canton|arrondissement|intercommunal|communauté de communes|monument aux morts|\bgare\b|aéroport|collège|lycée|école|stade|autoroute|route (départementale|nationale)|hôpital|cimetière|élection|club|entreprise|usine|zone d'activité|circonscription|liste d|bataille|siège|guerre|combat|traité|massacre|incendie|accident|attentat|séisme|inondation|station d'épuration|prison|caserne/i;

/** Sommets, cols et belvédères : candidats « point haut radio ». */
export const POINT_HAUT = /\bmont\b|montagne|sommet|\bpic\b|puech|\bcol\b|signal|crête|plateau|émetteur|belvédère|\broc\b|\btuc\b/i;

// Géocodage : Photon d'abord (rapide, sans quota), Nominatim en secours.
// Nominatim demande au plus une requête par seconde : on les espace.
let photonEnPanneJusqua = 0;
let prochainNominatim = 0;

async function photon(chemin, p) {
  if (Date.now() < photonEnPanneJusqua) throw new Error('Photon en pause');
  try {
    return await lireJson(`https://photon.komoot.io/${chemin}?${p}`, { delaiMs: 8000 });
  } catch (erreur) {
    photonEnPanneJusqua = Date.now() + 10 * 60_000;
    throw erreur;
  }
}

async function nominatim(chemin, p) {
  const attente = prochainNominatim - Date.now();
  prochainNominatim = Math.max(Date.now(), prochainNominatim) + 1100;
  if (attente > 0) await new Promise((r) => setTimeout(r, attente));
  return lireJson(`https://nominatim.openstreetmap.org/${chemin}?${p}`, { delaiMs: 20_000 });
}

/** Géocode un nom de lieu, en privilégiant les résultats proches de `pres`. */
export async function geocoder(texte, pres) {
  const cle = `geo-${texte}-${pres ? `${pres.lat.toFixed(1)},${pres.lon.toFixed(1)}` : ''}`;
  const { valeur } = await avecCache(cle, 30 * 86_400_000, async () => {
    try {
      const p = new URLSearchParams({ q: texte, limit: '1', lang: 'fr' });
      if (pres) {
        p.set('lat', pres.lat.toFixed(4));
        p.set('lon', pres.lon.toFixed(4));
      }
      const f = (await photon('api/', p)).features?.[0];
      if (!f) return null;
      const [lon, lat] = f.geometry.coordinates;
      const pr = f.properties;
      return { nom: pr.name ?? texte, lat, lon, departement: pr.county ?? pr.state, pays: pr.country };
    } catch {
      const p = new URLSearchParams({
        q: texte,
        format: 'jsonv2',
        limit: '1',
        addressdetails: '1',
        'accept-language': 'fr',
      });
      // Nominatim n'a pas de « près de » : une boîte de ±2° autour du point favorise le secteur.
      if (pres)
        p.set('viewbox', [pres.lon - 2, pres.lat + 2, pres.lon + 2, pres.lat - 2].map((x) => x.toFixed(3)).join(','));
      const r = (await nominatim('search', p))[0];
      if (!r) return null;
      const a = r.address ?? {};
      return {
        nom: r.name || texte,
        lat: Number(r.lat),
        lon: Number(r.lon),
        departement: a.county ?? a.state,
        pays: a.country,
      };
    }
  });
  return valeur;
}

/** Nom lisible d'un point (commune la plus proche, département). */
export async function nomDuLieu({ lat, lon }) {
  try {
    const { valeur } = await avecCache(`nom-${lat.toFixed(3)},${lon.toFixed(3)}`, 30 * 86_400_000, async () => {
      try {
        const p = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4), lang: 'fr' });
        const pr = (await photon('reverse', p)).features?.[0]?.properties;
        return pr ? [pr.city ?? pr.name, pr.county].filter(Boolean).join(', ') : null;
      } catch {
        const p = new URLSearchParams({
          lat: lat.toFixed(4),
          lon: lon.toFixed(4),
          format: 'jsonv2',
          zoom: '12',
          'accept-language': 'fr',
        });
        const a = (await nominatim('reverse', p)).address ?? {};
        const commune = a.village ?? a.town ?? a.city ?? a.municipality;
        return commune ? [commune, a.county].filter(Boolean).join(', ') : null;
      }
    });
    return valeur;
  } catch {
    return null;
  }
}

// Wikipédia limite les requêtes trop rapprochées (erreur 429) : une à la fois, espacées,
// avec de nouvelles tentatives.
let fileWikipedia = Promise.resolve();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function wikipedia(url) {
  const tache = fileWikipedia.then(async () => {
    for (let essai = 0; ; essai++) {
      try {
        return await lireJson(url, { delaiMs: 20_000 });
      } catch (erreur) {
        if (!/ 429/.test(erreur.message) || essai >= 4) throw erreur;
        await pause(2000 * (essai + 1));
      }
    }
  });
  fileWikipedia = tache.then(
    () => pause(300),
    () => pause(300),
  );
  return tache;
}

/** Articles Wikipédia dans un rayon de 10 km au plus (limite de l'API). */
async function articlesAutour(centre, langue) {
  const p = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'geosearch',
    ggscoord: `${centre.lat.toFixed(5)}|${centre.lon.toFixed(5)}`,
    ggsradius: '10000',
    ggslimit: '100',
    // Pas de vignettes ici : Wikipédia les limite fortement. On les demande à la fin,
    // seulement pour les lieux retenus (ajouterImages).
    prop: 'description|coordinates|info',
    colimit: 'max',
  });
  const reponse = await wikipedia(`https://${langue}.wikipedia.org/w/api.php?${p}`);
  return (reponse.query?.pages ?? []).map((page) => ({ ...page, langue }));
}

/** Altitudes (modèle numérique de terrain d'Open-Meteo), par lots de 100. */
async function altitudes(points) {
  const resultat = [];
  for (let i = 0; i < points.length; i += 100) {
    const lot = points.slice(i, i + 100);
    const p = new URLSearchParams({
      latitude: lot.map((x) => x.lat.toFixed(5)).join(','),
      longitude: lot.map((x) => x.lon.toFixed(5)).join(','),
    });
    const reponse = await lireJson(`https://api.open-meteo.com/v1/elevation?${p}`, { delaiMs: 15_000 });
    resultat.push(...reponse.elevation);
  }
  return resultat;
}

export function categorieDe(texte, envies) {
  for (const id of envies) if (ENVIES[id].motif.test(texte)) return id;
  for (const [id, envie] of Object.entries(ENVIES)) if (envie.motif.test(texte)) return id;
  return 'autre';
}

// Base locale des lieux de France (outils/construire-lieux.mjs) : aucune requête,
// aucun quota. Chargée à la première utilisation, rangée par cases de 0,1°.
const FRANCE = { sud: 41.3, nord: 51.2, ouest: -5.2, est: 9.7 };
let baseLocale;

function chargerBase() {
  if (baseLocale !== undefined) return baseLocale;
  try {
    const { lieux } = JSON.parse(fs.readFileSync(new URL('./donnees/lieux.json', import.meta.url), 'utf8'));
    const cases = new Map();
    for (const l of lieux) {
      const cle = `${Math.floor(l[2] * 10)}:${Math.floor(l[3] * 10)}`;
      if (!cases.has(cle)) cases.set(cle, []);
      cases.get(cle).push(l);
    }
    baseLocale = cases;
  } catch {
    baseLocale = null;
  }
  return baseLocale;
}

const majuscule = (texte) => texte.charAt(0).toUpperCase() + texte.slice(1);

function lieuxLocaux(centre, rayonKm, envies) {
  const cases = chargerBase();
  const dLat = rayonKm / 110.57;
  const dLon = rayonKm / (111.32 * Math.cos((centre.lat * Math.PI) / 180));
  const lieux = [];
  for (let i = Math.floor((centre.lat - dLat) * 10); i <= Math.floor((centre.lat + dLat) * 10); i++)
    for (let j = Math.floor((centre.lon - dLon) * 10); j <= Math.floor((centre.lon + dLon) * 10); j++)
      for (const [id, nom, lat, lon, description, liens, classe, ele, image, article] of cases.get(`${i}:${j}`) ?? []) {
        const distance = distanceKm(centre, { lat, lon });
        if (distance > rayonKm) continue;
        const texte = `${nom} ${description}`;
        lieux.push({
          id,
          categorie: categorieDe(texte, envies),
          nom: majuscule(nom),
          description,
          lat,
          lon,
          distanceKm: Math.round(distance * 10) / 10,
          liens,
          monumentClasse: classe === 1,
          ele: ele ?? undefined,
          image: image ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}?width=400` : undefined,
          lien: `https://fr.wikipedia.org/wiki/${encodeURIComponent(article)}`,
          hautPossible: POINT_HAUT.test(texte),
        });
      }
  return lieux;
}

/**
 * Lieux notables autour d'un point : { id, categorie, nom, description, lat, lon,
 * distanceKm, image, lien, ele? }. En France, la base locale ; ailleurs, Wikipédia en direct.
 */
export async function lieuxAutour(centre, { envies, pointsHauts }) {
  const enFrance =
    centre.lat > FRANCE.sud && centre.lat < FRANCE.nord && centre.lon > FRANCE.ouest && centre.lon < FRANCE.est;
  if (enFrance && chargerBase()) return lieuxLocaux(centre, 10, envies);

  const cle = `wiki2-${centre.lat.toFixed(3)}-${centre.lon.toFixed(3)}`;
  const { valeur: pages } = await avecCache(cle, 7 * 86_400_000, async () => {
    let liste = await articlesAutour(centre, 'fr');
    // Hors de France, Wikipédia en français est maigre : on complète en anglais.
    if (liste.length < 10) liste = liste.concat(await articlesAutour(centre, 'en'));
    return liste;
  });

  const lieux = [];
  for (const page of pages) {
    const coord = page.coordinates?.[0];
    if (!coord) continue;
    const texte = `${page.title} ${page.description ?? ''}`;
    if (SANS_INTERET.test(texte)) continue;
    lieux.push({
      id: `w${page.langue}${page.pageid}`,
      categorie: categorieDe(texte, envies),
      nom: page.title.replace(/ \([^)]*\)$/, ''),
      description: page.description ?? '',
      lat: coord.lat,
      lon: coord.lon,
      distanceKm: Math.round(distanceKm(centre, coord) * 10) / 10,
      pageid: page.pageid,
      langue: page.langue,
      // Longueur de l'article : un indice de notoriété qui ne coûte rien.
      longueur: page.length,
      lien: `https://${page.langue}.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}`,
      hautPossible: POINT_HAUT.test(texte),
    });
  }

  if (pointsHauts) {
    const hauts = lieux.filter((l) => l.hautPossible);
    try {
      const eles = await avecCache(`ele-${cle}`, 30 * 86_400_000, () => altitudes(hauts));
      hauts.forEach((h, i) => (h.ele = Math.round(eles.valeur[i])));
    } catch (erreur) {
      console.warn(`[lieux] altitudes indisponibles : ${erreur.message}`);
    }
  }
  return lieux;
}

/** Vignettes des lieux retenus : une requête par langue (50 pages au plus). */
export async function ajouterImages(lieux) {
  const parLangue = new Map();
  for (const l of lieux) if (l.pageid && !l.image) parLangue.set(l.langue, [...(parLangue.get(l.langue) ?? []), l]);
  for (const [langue, liste] of parLangue)
    for (let i = 0; i < liste.length; i += 50) {
      const lot = liste.slice(i, i + 50);
      const p = new URLSearchParams({
        action: 'query',
        format: 'json',
        formatversion: '2',
        pageids: lot.map((l) => l.pageid).join('|'),
        prop: 'pageimages',
        piprop: 'thumbnail',
        pithumbsize: '400',
        pilimit: '50',
      });
      try {
        const reponse = await wikipedia(`https://${langue}.wikipedia.org/w/api.php?${p}`);
        const images = new Map((reponse.query?.pages ?? []).map((page) => [page.pageid, page.thumbnail?.source]));
        for (const l of lot) l.image = images.get(l.pageid);
      } catch (erreur) {
        console.warn(`[lieux] vignettes indisponibles : ${erreur.message}`);
      }
    }
}
