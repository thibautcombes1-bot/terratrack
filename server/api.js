// Routes /api/* servies par Vite (en développement comme en aperçu).
import { etatIA } from './ia.js';
import { noeuds, RESEAUX } from './mesh.js';
import { ENVIES, nomDuLieu } from './lieux.js';
import { TRANSPORTS } from './trace.js';
import { genererVoyage, STYLES, tracerVoyage } from './voyage.js';

const routes = {
  'GET /api/etat': async () => ({
    ia: await etatIA(),
    reseaux: RESEAUX,
    envies: Object.fromEntries(Object.entries(ENVIES).map(([id, e]) => [id, e.nom])),
    styles: STYLES,
    transports: Object.fromEntries(Object.entries(TRANSPORTS).map(([id, t]) => [id, t.nom])),
  }),

  // Nœuds compactés : [lat, lon, relais, vu (s), nom, type, id]
  'GET /api/noeuds': async (url) => {
    const reseau = url.searchParams.get('reseau');
    const { noeuds: liste, date } = await noeuds(reseau);
    return {
      reseau,
      date,
      noeuds: liste.map((n) => [
        Math.round(n.lat * 1e5) / 1e5,
        Math.round(n.lon * 1e5) / 1e5,
        n.relais ? 1 : 0,
        Math.round(n.vu / 1000),
        n.nom,
        n.type,
        n.id,
      ]),
    };
  },

  'GET /api/position': async (url) => ({
    nom: await nomDuLieu({
      lat: Number(url.searchParams.get('lat')),
      lon: Number(url.searchParams.get('lon')),
    }),
  }),

  // Recalcule le tracé après le remplacement d'une visite.
  'POST /api/trace': async (_url, corps) => {
    const { depart, jours, transport, fin } = corps;
    const trace = await tracerVoyage(depart, jours, transport, fin);
    return { trace, jours: jours.map((j) => ({ distanceKm: j.distanceKm, dureeH: j.dureeH })) };
  },
};

async function lireCorps(req) {
  let texte = '';
  for await (const morceau of req) {
    texte += morceau;
    if (texte.length > 1_000_000) throw new Error('Demande trop grosse');
  }
  return texte ? JSON.parse(texte) : {};
}

function envoyer(res, statut, donnees) {
  res.statusCode = statut;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(donnees));
}

/** La génération envoie sa progression ligne par ligne (NDJSON), puis le voyage. */
async function voyage(req, res) {
  const demande = await lireCorps(req);
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  const ecrire = (objet) => res.write(JSON.stringify(objet) + '\n');
  try {
    const resultat = await genererVoyage(demande, (texte) => ecrire({ type: 'progres', texte }));
    ecrire({ type: 'resultat', voyage: resultat });
  } catch (erreur) {
    console.error('[voyage]', erreur);
    ecrire({ type: 'erreur', texte: erreur.message });
  }
  res.end();
}

async function gerer(req, res, suite) {
  const url = new URL(req.url, 'http://terratrack.local');
  if (!url.pathname.startsWith('/api/')) return suite();
  try {
    if (req.method === 'POST' && url.pathname === '/api/voyage') return await voyage(req, res);
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return envoyer(res, 404, { erreur: 'Route inconnue' });
    const corps = req.method === 'POST' ? await lireCorps(req) : null;
    envoyer(res, 200, await route(url, corps));
  } catch (erreur) {
    console.error(`[api] ${url.pathname}`, erreur);
    envoyer(res, 500, { erreur: erreur.message });
  }
}

/** Greffon Vite : branche l'API sur le serveur de développement et d'aperçu. */
export function apiTerraTrack() {
  return {
    name: 'terratrack-api',
    configureServer(serveur) {
      serveur.middlewares.use(gerer);
    },
    configurePreviewServer(serveur) {
      serveur.middlewares.use(gerer);
    },
  };
}
