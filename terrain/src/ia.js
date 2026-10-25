// Couche IA : une demande en français devient un bouton, des envies et des mots-clés.
// Sur iPhone, c'est le modèle d'Apple, sur l'appareil et sans réseau (plugin natif « IA »).
// Sinon (web, simulateur, Apple Intelligence coupée), un repli par mots-clés, annoncé comme tel.
import { registerPlugin } from '@capacitor/core';
import { simplifier } from './outils.js';

const IA = registerPlugin('IA');

let disponibilite;
export async function iaDisponible() {
  disponibilite ??= IA.disponible().catch(() => ({ disponible: false, raison: 'pas sur iPhone' }));
  return disponibilite;
}

const BOUTONS = ['pause', 'decouvrir', 'manger', 'dormir'];
const MOTS_VIDES = new Set(
  'un une des le la les de du d l au aux et ou a à pour pas plus moins on nous je tu il on veut voudrait voudrais aimerait aimerais trouve trouver cherche chercher envie besoin coin endroit lieu ici pres près proche avant apres après minutes min heure heures quelque chose faire peu tres très bien bon bonne sur dans avec sans ce cette ces qui que quoi'.split(' '),
);

/** Repli sans IA : quelques règles simples, pour que la demande donne quand même un résultat. */
export function comprendreSansIA(texte) {
  const t = simplifier(texte);
  const bouton = /dormir|nuit|camp|bivouac|gite|hotel|refuge|coucher|tente/.test(t)
    ? 'dormir'
    : /manger|faim|fromage|pain|boulang|epicerie|marche|resto|dejeuner|diner|courses|ferme|vin/.test(t)
      ? 'manger'
      : /pause|eau|soif|pique|toilette|repos|souffler|baign|plage/.test(t)
        ? 'pause'
        : 'decouvrir';
  const envies = [
    [/rando|marche|sentier|gr\b/, 'randonnee'],
    [/via ferrata|ferrata/, 'viaferrata'],
    [/escalad|grimp/, 'escalade'],
    [/canoe|kayak/, 'canoe'],
    [/baign|plage|nager/, 'baignade'],
    [/unesco|patrimoine mondial/, 'unesco'],
    [/chateau|abbaye|eglise|ruine|patrimoine|histoire/, 'patrimoine'],
    [/vue|panorama|belvedere|sommet/, 'panoramas'],
    [/grotte|cascade|gorge|nature|lac/, 'nature'],
    [/village/, 'villages'],
  ]
    .filter(([motif]) => motif.test(t))
    .map(([, e]) => e);
  const minutes = t.match(/(\d+)\s*(min|minutes)/);
  const motsCles = t.split(/[^a-z0-9]+/).filter((m) => m.length > 3 && !MOTS_VIDES.has(m)).slice(0, 5);
  return { bouton, envies, motsCles, detourMaxMin: minutes ? Number(minutes[1]) : 0, reponse: '', source: 'mots-clés' };
}

/** Comprend une demande ; `contexte` : où l'on va, l'heure, les envies du voyage. */
export async function comprendre(texte, contexte) {
  const { disponible } = await iaDisponible();
  if (disponible) {
    try {
      const r = await IA.comprendre({ texte, contexte });
      return {
        ...r,
        bouton: BOUTONS.includes(r.bouton) ? r.bouton : comprendreSansIA(texte).bouton,
        motsCles: (r.motsCles ?? []).map(simplifier),
        source: 'IA de l’iPhone',
      };
    } catch {
      // On retombe sur les mots-clés plutôt que de laisser la personne sans réponse.
    }
  }
  return comprendreSansIA(texte);
}

/** Un lieu correspond-il à la demande comprise ? */
export function correspond(lieu, demande) {
  const texte = simplifier(`${lieu.type ?? ''} ${lieu.nom ?? ''}`);
  return (
    demande.envies.some((e) => lieu.activite === e || (e === 'unesco' && lieu.unesco)) ||
    demande.motsCles.some((m) => m.length > 2 && texte.includes(m.replace(/s$/, '')))
  );
}
