import { comparerItineraires, planifier, verifierConditions } from './parcours.js';

export const COULEURS_ROADTRIPS = ['#1769d2', '#b24a19', '#743eb5'];

/** Des visites différentes, pas trois réglages routiers pour les mêmes arrêts. */
export function roadtripsDifferents(a, b) {
  const visites = (p) => new Set(p.jours.flatMap((j) => j.etapes.map((e) => e.id ?? `${e.lat},${e.lon}`)));
  const aa = visites(a), bb = visites(b);
  const communs = [...aa].filter((id) => bb.has(id)).length;
  const union = new Set([...aa, ...bb]).size;
  if (!union || communs / union > 0.7) return false;
  return JSON.stringify(a.jours.map((j) => j.coords)) !== JSON.stringify(b.jours.map((j) => j.coords));
}

/** Recherche bornée ; les conditions restent identiques, même s'il n'existe qu'un seul voyage. */
export async function proposerRoadtrips(pack, params, { preparer = async (plan) => plan, progression = () => {}, essaisMax = 6 } = {}) {
  const plans = [], dejaProposes = new Set(), coins = [], raisons = new Set();
  for (let essai = 0; essai < essaisMax && plans.length < 3; essai++) {
    progression(essai + 1, plans.length);
    // Cède la main au rendu avant les calculs sur le graphe local.
    await new Promise((resolve) => setTimeout(resolve, 0));
    let graine = 1234567 + essai * 971;
    const variation = { dejaProposes, coins, aleatoire: () => {
      graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0;
      return graine / 4294967296;
    } };
    try {
      let candidat = planifier(pack, { ...params, conditionsStrictes: true }, variation);
      candidat = await preparer(candidat, variation);
      for (const e of candidat.jours.flatMap((j) => j.etapes)) if (!(params.favoris ?? []).includes(e.id)) dejaProposes.add(e.id);
      coins.push(candidat.cible);
      if (verifierConditions(candidat).length) {
        const compatibles = comparerItineraires(pack, candidat);
        if (compatibles.length) {
          candidat.jours = compatibles[0].jours;
          candidat.params.optionsItineraire = compatibles[0].options;
        }
      }
      const problemes = verifierConditions(candidat);
      if (problemes.length) { problemes.forEach((r) => raisons.add(r)); continue; }
      if (plans.some((autre) => !roadtripsDifferents(candidat, autre))) continue;
      candidat.params.itineraireChoisi = false;
      plans.push(candidat);
    } catch (e) { raisons.add(e.message); }
  }
  return { plans, raisons: [...raisons] };
}
