// Goûts appris au fil des voyages (repris de Roadtrip AI) : 👍 / 👎 / remplacé.
import { memoire } from './outils.js';

const POIDS = { aime: 2, aimePas: -2, remplace: -1 };

const lire = () => memoire.lire('gouts', { scores: {}, aimes: [], rejetes: [] });

/** Note un lieu ; renvoie le nouvel avis (1, -1 ou 0). */
export function noter(lieu, action) {
  const g = lire();
  const avant = avisSur(lieu.nom, g);
  g.aimes = g.aimes.filter((n) => n !== lieu.nom);
  g.rejetes = g.rejetes.filter((n) => n !== lieu.nom);
  let avis = 0;
  // Un deuxième 👍 sur un lieu déjà aimé l'annule.
  if (!(action === 'aime' && avant === 1)) {
    const score = (g.scores[lieu.categorie] ?? 0) + POIDS[action];
    g.scores[lieu.categorie] = Math.max(-10, Math.min(10, score));
    if (action === 'aime') {
      g.aimes = [...g.aimes, lieu.nom].slice(-40);
      avis = 1;
    } else {
      g.rejetes = [...g.rejetes, lieu.nom].slice(-40);
      avis = -1;
    }
  }
  memoire.ecrire('gouts', g);
  return avis;
}

export function avisSur(nom, g = lire()) {
  if (g.aimes.includes(nom)) return 1;
  if (g.rejetes.includes(nom)) return -1;
  return 0;
}

export const rejetes = () => new Set(lire().rejetes.map((n) => n.toLowerCase()));

/** Ce qu'on envoie à l'IA. */
export function profil() {
  const g = lire();
  const tries = Object.entries(g.scores).sort((a, b) => b[1] - a[1]);
  return {
    aime: tries.filter(([, s]) => s >= 2).map(([c]) => c),
    evite: tries.filter(([, s]) => s <= -2).map(([c]) => c),
    lieuxAimes: g.aimes.slice(-20),
    lieuxRejetes: g.rejetes.slice(-30),
  };
}

export function oublier() {
  memoire.ecrire('gouts', { scores: {}, aimes: [], rejetes: [] });
}
