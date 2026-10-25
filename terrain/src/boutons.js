// Les 4 boutons d'en route : Une pause, À découvrir, Manger, Dormir.
// Chaque suggestion dit ce qu'elle coûte (détour) et ce qu'elle change à la journée (arrivée, nuit).
import { distanceKm } from '../../commun/geo.js';
import { detours, itineraire } from '../../commun/routeur.js';
import { preparerRoute, rectangle, situer } from '../../server/itineraire.js';
import { NUITS, aMonNiveau, dureeVisite, interet, plaitA } from './parcours.js';
import { coucherSoleil } from './soleil.js';

export const BOUTONS = {
  pause: {
    titre: 'Une pause',
    emoji: '⏸️',
    critere: "Eau potable, pique-nique, baignade ou abri, à moins de 8 min de détour.",
    detourMax: 8,
    arretMin: 20,
  },
  decouvrir: {
    titre: 'À découvrir',
    emoji: '🏛️',
    critere: 'Point de vue, patrimoine, site naturel ou village remarquable.',
    detourMax: 30,
  },
  manger: {
    titre: 'Manger',
    emoji: '🥖',
    critere: 'Épicerie, boulangerie, ferme, marché ou table, avec la date de l’info.',
    detourMax: 15,
    arretMin: 45,
  },
  dormir: {
    titre: 'Dormir',
    emoji: '🏕️',
    critere: 'Lieux déclarés seulement (campings, aires, gîtes, refuges), pour arriver avant la nuit.',
    detourMax: 40,
  },
};

const PRIORITE_PAUSE = ['Eau potable', 'Pique-nique', 'Baignade', 'Abri', 'Toilettes'];

/**
 * Suggestions pour un bouton, depuis `position` à l'heure `minute` (minutes depuis minuit),
 * en allant vers la fin du jour `j` du plan.
 */
export function suggerer(pack, plan, { j, position, minute }, bouton, { correspond, detourMaxMin, dejaVus = new Set() } = {}) {
  const jour = plan.jours[j];
  const regle = { ...BOUTONS[bouton], ...(detourMaxMin > 0 ? { detourMax: detourMaxMin } : {}) };
  const cible = jour.fin;

  // Ce qui reste du trajet du jour, depuis le point du tracé le plus proche de la position.
  let plusProche = 0;
  jour.coords.forEach(([lon, lat], i) => {
    const [l0, la0] = jour.coords[plusProche];
    if (distanceKm(position, { lat, lon }) < distanceKm(position, { lat: la0, lon: l0 })) plusProche = i;
  });
  const reste = jour.coords.slice(plusProche);
  const route = preparerRoute(reste.length > 1 ? reste : [[position.lon, position.lat], [cible.lon, cible.lat]]);

  const dejaPrevus = new Set([...dejaVus, ...plan.jours.flatMap((x) => [...x.etapes.map((e) => e.id), x.fin.id])]);
  const typesNuit = Object.entries(NUITS)
    .filter(([cle]) => plan.params.nuits.includes(cle))
    .flatMap(([, n]) => n.types);
  const voulu = (l) => {
    if (l.categorie !== bouton || dejaPrevus.has(l.id)) return false;
    if (bouton === 'decouvrir') return Boolean(l.nom) && aMonNiveau(l, plan.params.niveauMax);
    if (bouton === 'dormir') return typesNuit.length === 0 || typesNuit.includes(l.type);
    return true;
  };
  // D'abord le rectangle du trajet restant (+ marge) : à l'échelle de la France, situer chaque lieu serait trop long.
  const ecartMax = bouton === 'dormir' ? 12 : 6;
  const dedans = rectangle(route.coords, ecartMax);
  const proches = pack.lieux
    .filter((l) => dedans(l) && voulu(l))
    .map((l) => ({ l, sit: situer(route, l) }))
    .filter(({ sit }) => sit.ecart <= ecartMax)
    .sort((a, b) => a.sit.ecart - b.sit.ecart)
    .slice(0, 80)
    .map(({ l }) => l);
  if (!proches.length) return { suggestions: [], resteMin: 0 };

  const options = { eviterPeages: Boolean(plan.params.eviterPeages) };
  const direct = itineraire(pack.graphe, position, cible, options);
  const resteMin = direct ? direct.secondes / 60 : 0;
  const coucher = coucherSoleil(jour.date, cible);

  const avecDetours = detours(pack.graphe, position, cible, proches, { ...options, detourMaxSec: (regle.detourMax + 10) * 60 }).map((s) => {
    const detourMin = (s.detourSec + s.marcheSec) / 60;
    const arretMin = bouton === 'decouvrir' ? dureeVisite(s) : regle.arretMin ?? 0;
    const atteindreMin = s.atteindreSec / 60;
    // Arrivée à l'étape du soir si l'on fait cet arrêt.
    const arriveeFin = minute + resteMin + detourMin + arretMin;
    const suggestion = { ...s, detourMin, arretMin, atteindreMin, arriveeFin, margeNuit: coucher - arriveeFin };
    if (bouton === 'dormir') {
      suggestion.arrivee = minute + atteindreMin;
      suggestion.margeNuit = coucherSoleil(jour.date, s) - suggestion.arrivee;
    }
    return suggestion;
  });

  let liste;
  if (bouton === 'pause')
    liste = avecDetours
      .filter((s) => s.detourMin <= regle.detourMax)
      .sort((a, b) => PRIORITE_PAUSE.indexOf(a.type) - PRIORITE_PAUSE.indexOf(b.type) || a.atteindreMin - b.atteindreMin);
  else if (bouton === 'decouvrir')
    liste = avecDetours
      .filter((s) => s.detourMin <= regle.detourMax)
      .map((s) => ({ ...s, valeur: (interet(s) + (plaitA(s, plan.params.envies) ? 2 : 0)) / (s.detourMin + s.arretMin + 15) }))
      .sort((a, b) => b.valeur - a.valeur);
  else if (bouton === 'manger')
    liste = avecDetours.filter((s) => s.detourMin <= regle.detourMax).sort((a, b) => a.detourMin - b.detourMin || a.atteindreMin - b.atteindreMin);
  // Dormir : d'abord ce qu'on atteint avant la nuit, le plus loin possible sur la route.
  else
    liste = avecDetours
      .filter((s) => s.detourMin <= regle.detourMax)
      .sort((a, b) => (b.margeNuit >= 30) - (a.margeNuit >= 30) || b.atteindreMin - a.atteindreMin);

  // Demande faite à l'IA : ce qui correspond passe devant, dans l'ordre déjà établi.
  if (correspond) liste = [...liste.filter(correspond), ...liste.filter((s) => !correspond(s))];
  return { suggestions: liste.slice(0, 6), resteMin, coucher };
}
