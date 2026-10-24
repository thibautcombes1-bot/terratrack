// Tracé routier réel (OSRM de FOSSGIS, routing.openstreetmap.de), ou lignes droites en secours.
import { distanceKm } from '../commun/geo.js';
import { lireJson } from './cache.js';

export const TRANSPORTS = {
  voiture: { nom: 'voiture', kmJour: 150, rayonLocal: 15, profil: 'routed-car', vitesse: 60 },
  moto: { nom: 'moto', kmJour: 180, rayonLocal: 15, profil: 'routed-car', vitesse: 60 },
  van: { nom: 'van ou camping-car', kmJour: 120, rayonLocal: 15, profil: 'routed-car', vitesse: 50 },
  velo: { nom: 'vélo', kmJour: 50, rayonLocal: 8, profil: 'routed-bike', vitesse: 15 },
  pied: { nom: 'à pied', kmJour: 18, rayonLocal: 5, profil: 'routed-foot', vitesse: 4 },
  train: { nom: 'train, puis marche sur place', kmJour: 250, rayonLocal: 6, profil: null, vitesse: 90 },
};

/**
 * Tracé passant par `points` ([{lat, lon}]) dans l'ordre.
 * @returns {Promise<{coords: number[][], distanceKm: number, dureeH: number, troncons: {distanceKm: number, dureeH: number}[], reel: boolean}>}
 */
export async function tracer(points, transport) {
  const t = TRANSPORTS[transport] ?? TRANSPORTS.voiture;
  if (points.length < 2) return { coords: [], distanceKm: 0, dureeH: 0, troncons: [], reel: false };
  if (t.profil && points.length <= 90) {
    try {
      const chemin = points.map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
      const reponse = await lireJson(
        `https://routing.openstreetmap.de/${t.profil}/route/v1/driving/${chemin}?overview=full&geometries=geojson`,
        { delaiMs: 30_000 },
      );
      const route = reponse.routes?.[0];
      if (route)
        return {
          coords: route.geometry.coordinates,
          distanceKm: route.distance / 1000,
          dureeH: route.duration / 3600,
          troncons: route.legs.map((l) => ({ distanceKm: l.distance / 1000, dureeH: l.duration / 3600 })),
          reel: true,
        };
    } catch (erreur) {
      console.warn(`[trace] ${erreur.message}, lignes droites à la place`);
    }
  }
  // Secours : vol d'oiseau majoré de 30 % pour approcher la distance par la route.
  const troncons = points.slice(1).map((p, i) => {
    const d = distanceKm(points[i], p) * 1.3;
    return { distanceKm: d, dureeH: d / t.vitesse };
  });
  return {
    coords: points.map((p) => [p.lon, p.lat]),
    distanceKm: troncons.reduce((s, x) => s + x.distanceKm, 0),
    dureeH: troncons.reduce((s, x) => s + x.dureeH, 0),
    troncons,
    reel: false,
  };
}
