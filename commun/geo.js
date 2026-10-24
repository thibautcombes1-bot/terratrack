// Petits calculs géographiques partagés par le serveur.

const RAYON_TERRE_KM = 6371;
const rad = (deg) => (deg * Math.PI) / 180;

/** Distance à vol d'oiseau entre deux points {lat, lon}, en km. */
export function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ordonne des points au plus proche voisin, en partant de `depart`. */
export function plusProcheVoisin(depart, points) {
  const reste = [...points];
  const ordre = [];
  let courant = depart;
  while (reste.length) {
    let meilleur = 0;
    for (let i = 1; i < reste.length; i++)
      if (distanceKm(courant, reste[i]) < distanceKm(courant, reste[meilleur]))
        meilleur = i;
    courant = reste.splice(meilleur, 1)[0];
    ordre.push(courant);
  }
  return ordre;
}

/** Exécute `travail` sur chaque élément, `n` à la fois au plus. */
export async function parLots(elements, n, travail) {
  const resultats = new Array(elements.length);
  let suivant = 0;
  async function ouvrier() {
    while (suivant < elements.length) {
      const i = suivant++;
      resultats[i] = await travail(elements[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, elements.length) }, ouvrier));
  return resultats;
}
