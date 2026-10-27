// La position du téléphone est la seule source de progression : jamais un curseur ou une heure saisie.
import { preparerRoute, situer } from '../../server/itineraire.js';

export const PRECISION_SUIVI_M = 100;
export const FRAICHEUR_GPS_MS = 15000;

export function dateLocale(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Les anciens points restent utiles pour la trace, mais pas pour annoncer un GPS en direct. */
export function lirePoint(point) {
  if (!Array.isArray(point) || point.length < 4 || !point.slice(0, 4).every(Number.isFinite)) return null;
  const [quand, lat, lon, precision] = point;
  if (quand <= 0 || Math.abs(lat) > 90 || Math.abs(lon) > 180 || precision < 0 || precision > PRECISION_SUIVI_M) return null;
  return { quand, lat, lon, precision, nom: 'Ma position' };
}

export function positionRecente(position, maintenant = Date.now()) {
  if (!position || !Number.isFinite(position.quand)) return false;
  return maintenant - position.quand <= FRAICHEUR_GPS_MS && position.quand - maintenant <= 10000;
}

export function etatGps(etat, position, maintenant = Date.now()) {
  if (etat.autorisation === 'refusee' || etat.autorisation === 'limitee')
    return { genre: 'erreur', titre: 'Localisation non autorisée', detail: 'Autorise la localisation de TerraTrack dans les réglages de l’iPhone.' };
  if (etat.autorisation === 'desactivee')
    return { genre: 'erreur', titre: 'Localisation désactivée', detail: 'Active le service de localisation de l’iPhone pour suivre ton voyage.' };
  if (!etat.demande && !etat.actif)
    return { genre: 'attente', titre: 'Prêt à te suivre', detail: 'Active le GPS : l’heure, la position et l’avancée se mettront à jour automatiquement.' };
  if (etat.autorisation === 'a-demander')
    return { genre: 'attente', titre: 'Autorisation GPS attendue', detail: 'Réponds à la demande de localisation de l’iPhone pour commencer le suivi.' };
  if (etat.actif && positionRecente(position, maintenant))
    return { genre: 'direct', titre: 'GPS en direct', detail: `Position reçue · précision ±${Math.round(position.precision)} m` };
  if (position)
    return { genre: 'attente', titre: 'En attente du GPS', detail: 'Dernière position conservée. L’arrivée estimée reprendra avec un signal récent.' };
  return { genre: 'attente', titre: 'Recherche du signal GPS', detail: etat.erreur || 'L’avancée commencera dès que ta position sera disponible.' };
}

/** La distance faite sur la feuille de route ne prouve pas qu’une visite a été effectuée. */
export function avancerSurFeuille(jour, position, passages = new Set()) {
  const coords = jour.coords?.length ? jour.coords : [[jour.debut.lon, jour.debut.lat], [jour.fin.lon, jour.fin.lat]];
  const route = preparerRoute(coords);
  const projection = situer(route, position);
  const faitKm = Math.max(0, Math.min(projection.s, route.longueur));
  const faites = jour.etapes.filter((e) => passages.has(e.id));
  const restantes = jour.etapes.filter((e) => !passages.has(e.id));
  return {
    faitKm, totalKm: route.longueur, resteKm: Math.max(0, route.longueur - faitKm),
    pourcent: route.longueur > 0 ? Math.round(faitKm / route.longueur * 100) : 0,
    ecartKm: projection.ecart, faites, restantes, prochaine: restantes[0] ?? jour.fin,
  };
}

/**
 * Extrait des points de passage intermédiaires clés le long de la belle route (tous les ~20 km)
 * pour forcer Organic Maps à suivre le tracé exact sans recalculer par l'autoroute.
 */
export function extrairePointsPassage(jour, pasKm = 20) {
  if (!jour?.coords || jour.coords.length < 4) return [];
  const coords = jour.coords;
  const route = preparerRoute(coords);
  if (!route || route.longueur < pasKm) return [];

  const etapesTous = [jour.debut, ...(jour.etapes ?? []), jour.fin].filter(Boolean);
  const projections = etapesTous.map((e) => situer(route, e).s);
  const waypoints = [];

  for (let k = 0; k < projections.length - 1; k++) {
    const s1 = projections[k];
    const s2 = projections[k + 1];
    const distanceTroncon = s2 - s1;
    if (distanceTroncon >= pasKm * 1.2) {
      const nbPoints = Math.min(4, Math.floor(distanceTroncon / pasKm));
      for (let p = 1; p <= nbPoints; p++) {
        const sCible = s1 + (distanceTroncon * p) / (nbPoints + 1);
        let idx = 0;
        while (idx < route.cumul.length - 1 && route.cumul[idx] < sCible) idx++;
        const coord = coords[idx] ?? coords.at(-1);
        waypoints.push({
          nom: `📍 Passage ${k + 1}.${p} · Belle route`,
          lat: coord[1],
          lon: coord[0],
          s: sCible,
          apresEtapeIndex: k,
          pourquoi: 'Point de passage intermédiaire pour verrouiller la belle route',
        });
      }
    }
  }
  return waypoints;
}

/**
 * Trouve le prochain point de guidage vers l'étape cible :
 * Si un point de passage intermédiaire existe entre la position actuelle et l'étape cible,
 * on guide d'abord vers lui pour forcer l'appli de navigation sur la belle route.
 */
export function prochainPointGuidage(jour, position, etapeCible, pasKm = 20) {
  if (!jour || !position || !etapeCible || !jour.coords?.length) return etapeCible;
  const waypoints = extrairePointsPassage(jour, pasKm);
  if (!waypoints.length) return etapeCible;
  const route = preparerRoute(jour.coords);
  const posS = situer(route, position).s;
  const cibleS = situer(route, etapeCible).s;
  const wp = waypoints.find((w) => w.s > posS + 1.5 && w.s < cibleS - 2);
  return wp ?? etapeCible;
}
