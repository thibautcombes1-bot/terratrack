// Nœuds Meshtastic et MeshCore publics : téléchargement, tri, couverture.
import { avecCache, lireJson } from './cache.js';

const JOUR_MS = 86_400_000;

const ROLES_RELAIS_MESHTASTIC = new Set([
  'ROUTER',
  'ROUTER_LATE',
  'ROUTER_CLIENT',
  'REPEATER',
]);
const TYPES_MESHCORE = { 1: 'compagnon', 2: 'répéteur', 3: 'salon', 4: 'capteur' };

/**
 * Un nœud allégé : { reseau, id, nom, type, relais, lat, lon, vu (ms) }.
 * meshmap.net agrège le MQTT public Meshtastic (nœuds entendus ces dernières heures).
 */
function nettoyerMeshtastic(brut) {
  const noeuds = [];
  for (const [id, n] of Object.entries(brut)) {
    if (!n.latitude || !n.longitude) continue;
    const vus = Object.values(n.seenBy ?? {});
    noeuds.push({
      reseau: 'meshtastic',
      id,
      nom: (n.longName || n.shortName || id).trim(),
      type: (n.role || 'CLIENT').toLowerCase(),
      relais: ROLES_RELAIS_MESHTASTIC.has(n.role),
      lat: n.latitude / 1e7,
      lon: n.longitude / 1e7,
      vu: vus.length ? Math.max(...vus) * 1000 : 0,
    });
  }
  return noeuds;
}

/** map.meshcore.io garde des nœuds très anciens : on ne retient que les 30 derniers jours. */
function nettoyerMeshcore(brut) {
  const maintenant = Date.now();
  const noeuds = [];
  for (const n of brut) {
    const vu = Date.parse(n.last_advert);
    if (!(vu > maintenant - 30 * JOUR_MS && vu < maintenant + JOUR_MS)) continue;
    if (!n.adv_lat || !n.adv_lon || Math.abs(n.adv_lat) > 90) continue;
    noeuds.push({
      reseau: 'meshcore',
      id: n.public_key.slice(0, 12),
      nom: (n.adv_name || n.public_key.slice(0, 8)).trim(),
      type: TYPES_MESHCORE[n.type] ?? 'autre',
      relais: n.type === 2,
      lat: n.adv_lat,
      lon: n.adv_lon,
      vu,
    });
  }
  return noeuds;
}

const SOURCES = {
  meshtastic: {
    url: 'https://meshmap.net/nodes.json',
    dureeMs: 5 * 60_000,
    nettoyer: nettoyerMeshtastic,
  },
  meshcore: {
    url: 'https://map.meshcore.io/api/v1/nodes',
    dureeMs: 30 * 60_000,
    nettoyer: nettoyerMeshcore,
  },
};

export const RESEAUX = Object.keys(SOURCES);

/** @returns {Promise<{noeuds: object[], date: number}>} */
export async function noeuds(reseau) {
  const source = SOURCES[reseau];
  if (!source) throw new Error(`Réseau inconnu : ${reseau}`);
  const { valeur, date } = await avecCache(`noeuds-${reseau}`, source.dureeMs, async () =>
    source.nettoyer(await lireJson(source.url, { delaiMs: 120_000 })),
  );
  return { noeuds: valeur, date };
}

/** Tous les nœuds des réseaux demandés (un réseau en panne n'empêche pas les autres). */
export async function noeudsDe(reseaux) {
  const listes = await Promise.allSettled(reseaux.map(noeuds));
  return listes.flatMap((l) => (l.status === 'fulfilled' ? l.value.noeuds : []));
}
