// Carburant : consommation estimée selon la route, niveau au fil du voyage, réserve, coût.
// Tout est hors ligne et recalculé à chaque affichage : changer le véhicule ne refait pas le parcours.
import { distanceKm } from './geo.js';

/**
 * Surconsommation selon la vitesse de la route (estimation) : autoroute +20 %, routes de campagne
 * −5 % (le plus sobre), petites routes sinueuses et traversées +15 %.
 */
export function facteurRoute(vitesse) {
  if (vitesse >= 95) return 1.2;
  if (vitesse >= 70) return 1;
  if (vitesse >= 50) return 0.95;
  return 1.15;
}

const un = (x) => Math.round(x * 10) / 10;

/**
 * Profil d'une journée, tous les ~5 km : [km parcourus, km « équivalents » (km × facteur de la route), lon, lat].
 * Les litres s'en déduisent pour n'importe quelle consommation : km équivalents × conso / 100.
 */
export function profilConso(coords, vitesses = []) {
  if (!coords?.length) return [];
  const profil = [[0, 0, coords[0][0], coords[0][1]]];
  let km = 0;
  let equivalents = 0;
  let dernier = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = distanceKm({ lon: coords[i - 1][0], lat: coords[i - 1][1] }, { lon: coords[i][0], lat: coords[i][1] });
    km += d;
    equivalents += d * facteurRoute(vitesses[i - 1] ?? 70);
    if (km - dernier >= 5 || i === coords.length - 1) {
      profil.push([un(km), un(equivalents), coords[i][0], coords[i][1]]);
      dernier = km;
    }
  }
  return profil;
}

/** Point du profil le plus proche d'un lieu : son km dans la journée. */
export function kmDansLaJournee(profil, lieu) {
  let meilleur = profil[0];
  for (const p of profil) if (distanceKm({ lon: p[2], lat: p[3] }, lieu) < distanceKm({ lon: meilleur[2], lat: meilleur[3] }, lieu)) meilleur = p;
  return meilleur?.[0] ?? 0;
}

/**
 * Niveau de carburant le long du voyage.
 * `vehicule` : { litresDepart, reservoir, conso (L/100 km), prix (€/L), reserveKm }.
 * `pleins` : [{ jour, km, litres? , prix? }] ; sans `litres`, c'est un plein complet.
 * Renvoie le niveau en fin de chaque jour, les litres et le coût estimés, et le premier point
 * où l'on passe sous la réserve (`alerte`) ou à sec (`panne`).
 */
export function bilanCarburant(jours, vehicule, pleins = []) {
  const parKm = vehicule.conso / 100;
  const reserveL = Math.max(vehicule.reservoir * 0.1, (vehicule.reserveKm ?? 60) * parKm);
  let niveau = Math.min(vehicule.litresDepart, vehicule.reservoir);
  let litres = 0;
  let km = 0;
  let alerte = null;
  let panne = null;
  const parJour = jours.map((j, i) => {
    const debut = niveau;
    const aFaire = pleins.filter((p) => p.jour === i).sort((a, b) => a.km - b.km);
    const profil = j.profil ?? [];
    const remplir = (p) => (niveau = Math.min(vehicule.reservoir, p.litres ? niveau + p.litres : vehicule.reservoir));
    // Rouler de `de` à `vers` (deux points du profil), en s'arrêtant aux pleins faits entre les deux.
    const rouler = (de, vers) => {
      const longueur = vers[0] - de[0] || 1e-9;
      let fait = de[0];
      for (;;) {
        const plein = aFaire[0] && aFaire[0].km <= vers[0] ? aFaire[0] : null;
        const jusquA = plein ? Math.max(plein.km, fait) : vers[0];
        const consomme = ((vers[1] - de[1]) * (jusquA - fait)) / longueur * parKm;
        niveau -= consomme;
        litres += consomme;
        if (!alerte && niveau < reserveL) alerte = { jour: i, km: Math.round(jusquA), lon: vers[2], lat: vers[3] };
        if (!panne && niveau < 0) panne = { jour: i, km: Math.round(jusquA), lon: vers[2], lat: vers[3] };
        fait = jusquA;
        if (!plein) break;
        remplir(aFaire.shift());
      }
      km += vers[0] - de[0];
    };
    while (aFaire.length && aFaire[0].km <= 0) remplir(aFaire.shift());
    for (let k = 1; k < profil.length; k++) rouler(profil[k - 1], profil[k]);
    while (aFaire.length) remplir(aFaire.shift());
    return { debut, fin: niveau, km: profil.at(-1)?.[0] ?? 0 };
  });
  return {
    parJour,
    km,
    litres,
    cout: litres * (vehicule.prix ?? 0),
    niveauFin: niveau,
    autonomieKm: Math.max(0, niveau) / parKm,
    autonomieDepartKm: Math.min(vehicule.litresDepart, vehicule.reservoir) / parKm,
    reserveL,
    alerte,
    panne,
  };
}

/** Niveau estimé au km `km` du jour `jour` (position en route). */
export function niveauA(jours, vehicule, pleins, jour, km) {
  // Le profil du jour coupé exactement au km voulu (point interpolé entre deux points du profil).
  const couper = (profil = []) => {
    const avant = profil.filter((p) => p[0] <= km);
    const apres = profil.find((p) => p[0] > km);
    const dernier = avant.at(-1);
    if (!apres || !dernier) return avant;
    const t = (km - dernier[0]) / (apres[0] - dernier[0]);
    return [...avant, [km, dernier[1] + t * (apres[1] - dernier[1]), apres[2], apres[3]]];
  };
  const coupe = jours.slice(0, jour + 1).map((j, i) => (i < jour ? j : { ...j, profil: couper(j.profil) }));
  return bilanCarburant(coupe, vehicule, pleins.filter((p) => p.jour < jour || (p.jour === jour && p.km <= km))).niveauFin;
}
