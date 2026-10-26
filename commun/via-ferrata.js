// Une cotation décrit un parcours, pas la moyenne de tous les morceaux d'un site.
import { distanceKm } from './geo.js';

const COTATIONS = ['Sentier', 'F (facile)', 'PD (peu difficile)', 'AD (assez difficile)', 'D (difficile)', 'TD (très difficile)', 'ED (extrêmement difficile)'];
const NIVEAUX = ['', 'Facile', 'Moyen', 'Difficile', 'Très difficile'];
const rang = (cote) => cote <= 1 ? 1 : cote <= 3 ? 2 : cote === 4 ? 3 : 4;
const valides = (segments) => segments.map((s) => s.cote).filter((c) => Number.isInteger(c) && c >= 0 && c < COTATIONS.length);

/** La plage OSM reste une plage : sa moyenne ne constitue pas une cotation de parcours. */
export function resumerCotationsVia(segments) {
  const principaux = segments.filter((s) => !s.nom?.includes(':'));
  const cotes = valides(principaux.length ? principaux : segments);
  const toutes = valides(segments);
  if (!cotes.length) return { cotation: null, dureeH: 3, dureeEstimee: true };
  const min = Math.min(...cotes), max = Math.max(...cotes);
  const maxVariantes = Math.max(...toutes);
  const niveauRang = rang(max);
  const niveauTexte = min === max
    ? `Cotation OSM du parcours : ${COTATIONS[max]}`
    : `Tronçons principaux OSM : ${COTATIONS[min]} à ${COTATIONS[max]} ; répartition des variantes à vérifier`;
  return {
    cotation: min === max ? max : null,
    cotationMin: min,
    cotationMax: max,
    niveau: min === max ? NIVEAUX[niveauRang] : `Jusqu’à ${NIVEAUX[niveauRang].toLowerCase()} (OSM)`,
    niveauRang,
    niveauTexte: niveauTexte + (maxVariantes > max ? ` ; variantes jusqu’à ${COTATIONS[maxVariantes]}` : ''),
    // Durée de planification seulement, quand aucune durée documentée n'est disponible.
    dureeH: max <= 2 ? 2 : max <= 4 ? 3 : 4,
    dureeEstimee: true,
    difficulteSource: { nom: 'OpenStreetMap', nature: 'Cotations des tronçons ; parcours et variantes à vérifier' },
  };
}

const CORRECTION_ORB = 'balcons-orb-initiation-2026-10-25';
const EQUIPEUR = 'https://www.acroroc.com/activites/via-ferrata-herault-caroux/';
const TOPO = 'https://www.grandorb.fr/phototheque_publique/flyer/2022/09/Plaquette-Via-FerrataBATpdf.pdf';
const CENTRE_ORB = { lat: 43.64222, lon: 3.17792 };
const normaliser = (nom = '') => nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
const estBalconsOrb = (l) => l.activite === 'viaferrata' && (
  l.id === 'vf-w1183917213' ||
  (/balcons de l orb/.test(normaliser(l.nom)) && Number.isFinite(l.lat) && Number.isFinite(l.lon) && distanceKm(l, CENTRE_ORB) < 2)
);

/**
 * Correction partagée par le constructeur et l'appli : elle reste applicable aux anciens
 * packs et aux futures mises à jour. L'id historique désigne désormais explicitement
 * la partie inférieure ; la supérieure est documentée comme option, pas classée facile.
 */
export function corrigerViaFerrata(lieux) {
  return lieux.map((l) => {
    if (!estBalconsOrb(l) || l.correctionDifficulte === CORRECTION_ORB) return l;
    return {
      ...l,
      nom: 'Via ferrata les Balcons de l’Orb — parcours inférieur',
      nomSite: 'Via ferrata les Balcons de l’Orb',
      parcours: 'inférieur',
      cotationOsm: { cotation: l.cotation, cotationMin: l.cotationMin, cotationMax: l.cotationMax, niveauTexte: l.niveauTexte },
      cotation: null,
      cotationMin: null,
      cotationMax: null,
      niveau: 'Facile',
      niveauRang: 1,
      niveauTexte: 'Parcours inférieur d’initiation, progressif ; cotation alphabétique non publiée par les sources consultées',
      difficulteSource: { nom: 'ACROROC, concepteur et équipeur', url: EQUIPEUR, nature: 'Description qualitative du parcours inférieur', consulteLe: '2026-10-25' },
      dureeH: 0.5,
      dureeEstimee: false,
      dureeSource: { nom: 'Grand Orb, plaquette officielle', url: TOPO, concerne: 'Temps annoncé pour la partie inférieure, hors approche et retour' },
      longueurKm: undefined,
      details: [
        'Partie inférieure d’initiation : environ 30 min, hors approche et retour',
        'Partie supérieure facultative : environ 1 h 30, plus aérienne ; cotation à vérifier avant de la poursuivre',
        'Accès : Le Bousquet-de-la-Balme, La Tour-sur-Orb',
        'Parcours décrit par ACROROC (équipeur) ; durées de la plaquette officielle Grand Orb',
      ],
      variantes: [{
        id: 'balcons-orb-superieur',
        nom: 'Parcours supérieur',
        dureeH: 1.5,
        niveau: 'Plus aérien — cotation à vérifier',
        // Une exposition plus forte ne permet pas d'inventer une lettre de cotation.
        cotation: null,
        niveauRang: null,
        source: TOPO,
        difficulteSource: EQUIPEUR,
        propositionAutomatique: false,
      }],
      correctionDifficulte: CORRECTION_ORB,
    };
  });
}
