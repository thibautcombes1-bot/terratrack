// Couverture mesh (MeshCore / Meshtastic) : partagé entre le serveur et la page.
import { distanceKm } from './geo.js';

/**
 * Couverture mesh autour d'un point, à partir de nœuds {lat, lon, relais, nom, reseau, type}.
 * - bonne : un relais à moins de 10 km, ou au moins 3 nœuds à moins de 15 km ;
 * - faible : au moins un nœud à moins de 25 km ;
 * - aucune : rien à 25 km.
 */
export function couverture(point, noeuds) {
  let proches = 0;
  let relaisProches = 0;
  let plusProche = null;
  let dMin = Infinity;
  for (const n of noeuds) {
    // Préfiltre grossier (~25 km) pour éviter 30 000 calculs exacts.
    if (Math.abs(n.lat - point.lat) > 0.25 || Math.abs(n.lon - point.lon) > 0.35) continue;
    const d = distanceKm(point, n);
    if (d < 15) proches++;
    if (d < 10 && n.relais) relaisProches++;
    if (d < dMin) {
      dMin = d;
      plusProche = n;
    }
  }
  const niveau =
    relaisProches > 0 || proches >= 3 ? 'bonne' : dMin < 25 ? 'faible' : 'aucune';
  return {
    niveau,
    proches,
    relaisProches,
    plusProche: plusProche && {
      nom: plusProche.nom,
      reseau: plusProche.reseau,
      type: plusProche.type,
      distanceKm: Math.round(dMin * 10) / 10,
    },
  };
}

/** Nombre de nœuds dans un rayon (portée possible depuis un point haut). */
export function noeudsDansRayon(point, noeuds, rayonKm) {
  const marge = rayonKm / 80;
  let total = 0;
  for (const n of noeuds)
    if (
      Math.abs(n.lat - point.lat) < marge &&
      Math.abs(n.lon - point.lon) < marge * 1.5 &&
      distanceKm(point, n) <= rayonKm
    )
      total++;
  return total;
}
