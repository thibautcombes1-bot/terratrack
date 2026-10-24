// Génération d'un voyage : l'IA choisit les étapes (de préférence parmi des communes
// labellisées), Wikipédia fournit les vrais lieux autour, l'IA choisit parmi eux et
// écrit le carnet, puis on ajoute couverture mesh, points hauts et tracé.
import { distanceKm, plusProcheVoisin, parLots } from '../commun/geo.js';
import { couverture, noeudsDansRayon, zonesDenses } from '../commun/couverture.js';
import { etapesAPortee } from './etapes.js';
import { demanderJson, nomModele } from './ia.js';
import { noeudsDe, RESEAUX } from './mesh.js';
import { ENVIES, geocoder, lieuxAutour, nomDuLieu } from './lieux.js';
import { TRANSPORTS, tracer } from './trace.js';

/** Envies de style : elles guident l'IA mais ne correspondent pas à des lieux OSM. */
export const STYLES = {
  calme: 'calme, loin de la foule',
  photo: 'beaux spots photo',
  routes: 'routes panoramiques',
  local: 'produits et rencontres locales',
  soiree: 'sorties le soir',
};

const ENVIES_PAR_DEFAUT = ['nature', 'panoramas', 'patrimoine', 'villages'];
const ALTITUDE_MAX = { tranquille: 1200, moyen: 2000, sportif: 2800 };

const LIBELLES = {
  budget: {
    petit: 'petit budget (moins de 50 € par jour et par personne)',
    moyen: 'budget moyen (50 à 120 € par jour et par personne)',
    confort: 'confort (plus de 120 € par jour et par personne)',
    libre: 'pas de contrainte de budget',
  },
  niveau: {
    tranquille: 'tranquille, peu de marche',
    moyen: 'en forme, randonnées faciles à moyennes',
    sportif: 'sportif, longues randonnées et dénivelé',
  },
  compagnie: {
    seul: 'seul',
    couple: 'en couple',
    amis: 'entre amis',
    famille: 'en famille avec des enfants',
    chien: 'avec un chien',
  },
  hebergement: {
    camping: 'camping, van ou bivouac',
    gite: "gîte ou chambre d'hôte",
    hotel: 'hôtel',
    libre: 'peu importe',
  },
};

const SYSTEME = `Tu es Horizon, un guide de voyage qui connaît très bien la France et le voyage lent.
Tu proposes des voyages réalistes, adaptés aux goûts, à l'énergie et au budget de la personne.
Tu écris en français, avec un ton chaleureux et concret, sans superlatifs creux.
Tu écris tout en français, y compris les thèmes et les titres.
Tu n'inventes jamais d'horaires, de prix, de jours d'ouverture ni de faits précis dont tu n'es pas sûr.
Tu réponds uniquement avec du JSON conforme au schéma demandé.`;

const objet = (proprietes) => ({
  type: 'object',
  properties: proprietes,
  required: Object.keys(proprietes),
  additionalProperties: false,
});
// Les bornes de longueur empêchent un modèle local de boucler dans un champ (ia.js les retire pour Claude).
const texte = (max) => ({ type: 'string', maxLength: max });
const entier = { type: 'integer' };
const liste = (items, max) => ({ type: 'array', items, maxItems: max });

const SCHEMA_PLAN = objet({
  titre: texte(80),
  idee: texte(200),
  etapes: liste(
    objet({ jour: entier, id: texte(12), lieu: texte(60), departement: texte(40), theme: texte(70) }),
    14,
  ),
});

const SCHEMA_CARNET = objet({
  titre: texte(80),
  resume: texte(400),
  jours: liste(
    objet({
      jour: entier,
      visites: liste(objet({ id: texte(16), pourquoi: texte(260) }), 4),
      nuit: texte(200),
      budget: entier,
      astuce: texte(260),
    }),
    14,
  ),
  conseils: liste(texte(260), 5),
});

/**
 * @param {object} d la demande venue du formulaire
 * @param {(texte: string) => void} signaler progression affichée à l'écran
 */
export async function genererVoyage(d, signaler) {
  const transport = TRANSPORTS[d.transport] ? d.transport : 'voiture';
  const t = TRANSPORTS[transport];
  const jours = Math.min(14, Math.max(0.5, Number(d.jours) || 1));
  const nbEtapes = jours <= 1 ? 1 : Math.round(jours);
  const kmJour = Math.round(t.kmJour * (jours < 1 ? 0.5 : 1));
  const retour = d.retour !== false;
  const rayonGlobal = Math.min(600, (kmJour * Math.max(1, jours)) / (retour ? 2 : 1));
  const envies = (d.envies ?? []).filter((e) => ENVIES[e]);
  const styles = (d.envies ?? []).filter((e) => STYLES[e]);
  const reseaux = (d.mesh?.reseaux ?? []).filter((r) => RESEAUX.includes(r));
  const profil = d.profil ?? {};
  const ia = d.ia === 'claude' ? 'claude' : 'ollama';
  const avertissements = [];

  signaler('Je trouve ton point de départ…');
  const depart =
    d.depart?.lat != null
      ? {
          nom: d.depart.texte || (await nomDuLieu(d.depart)) || 'Ma position',
          lat: d.depart.lat,
          lon: d.depart.lon,
        }
      : await geocoder(d.depart?.texte ?? '');
  if (!depart) throw new Error(`Départ introuvable : « ${d.depart?.texte ?? ''} ».`);

  let noeuds = [];
  if (reseaux.length) {
    signaler('Je charge les nœuds mesh en direct…');
    noeuds = await noeudsDe(reseaux);
  }

  let zones = [];
  if (d.mesh?.couvert && noeuds.length) {
    signaler('Je repère les zones couvertes par le mesh…');
    // Les relais comptent le plus ; le secteur du départ n'apporte rien comme suggestion.
    zones = zonesDenses(depart, rayonGlobal, noeuds, 12)
      .filter((z) => z.relais > 0 && distanceKm(depart, z) > 15)
      .slice(0, 6);
    await parLots(zones, 3, async (z) => {
      z.nom = await nomDuLieu(z);
    });
    zones = zones.filter((z) => z.nom);
  }

  const rejetes = new Set((profil.lieuxRejetes ?? []).map((n) => n.toLowerCase()));
  const sures = etapesAPortee(depart, Math.max(rayonGlobal, 40), { noeuds, rejetes });

  const modele = await nomModele(ia);
  const contexte = { depart, jours, nbEtapes, kmJour, retour, t, envies, styles, profil, d };

  signaler(`L'IA (${modele}) dessine les grandes étapes…`);
  const plan = await demanderJson({
    ia,
    systeme: SYSTEME,
    message: messagePlan(contexte, zones, sures),
    schema: SCHEMA_PLAN,
  });

  if (process.env.HORIZON_DEBUG) console.log('[voyage] plan', JSON.stringify(plan, null, 1));

  signaler('Je vérifie que chaque étape existe vraiment…');
  const bases = [];
  const prises = new Set();
  let precedente = depart;
  // Une étape trop loin ou introuvable est remplacée par l'étape sûre la mieux placée.
  const remplacante = () =>
    sures
      .filter((e) => !prises.has(e.id) && distanceKm(precedente, e) <= kmJour)
      .sort((a, b) => Math.abs(distanceKm(precedente, a) - kmJour * 0.6) - Math.abs(distanceKm(precedente, b) - kmJour * 0.6))[0];
  const etapesIA = (plan.etapes ?? []).slice(0, nbEtapes);
  for (let i = 0; i < nbEtapes; i++) {
    const e = etapesIA[i] ?? { lieu: '', theme: '' };
    let lieu = sures.find((s) => s.id === e.id && !prises.has(s.id));
    if (!lieu && e.lieu) {
      lieu =
        (await geocoder(`${e.lieu}, ${e.departement}`, precedente).catch(() => null)) ??
        (await geocoder(e.lieu, precedente).catch(() => null));
      if (!lieu) avertissements.push(`« ${e.lieu} » introuvable sur la carte : remplacé.`);
      else if (distanceKm(precedente, lieu) > kmJour * 2) {
        avertissements.push(`${lieu.nom} était à ${Math.round(distanceKm(precedente, lieu))} km de l'étape d'avant : remplacé.`);
        lieu = null;
      }
    }
    if (!lieu) {
      lieu = remplacante();
      if (!lieu) continue;
      e.theme = e.theme || lieu.labels?.join(', ');
    }
    if (lieu.id) prises.add(lieu.id);
    bases.push({ ...lieu, theme: e.theme, jour: bases.length + 1 });
    precedente = lieu;
  }
  if (!bases.length) throw new Error("Aucune étape n'a pu être placée sur la carte. Réessaie.");
  if (bases.length < nbEtapes)
    avertissements.push(`Voyage raccourci à ${bases.length} jour(s) : pas assez d'étapes à portée.`);

  signaler('Je cherche de vrais lieux autour de chaque étape (Wikipédia)…');
  // Le modèle local est lent et se perd dans les longues listes : on lui en donne moins.
  const parJour = ia === 'claude' ? Math.min(25, Math.max(10, Math.floor(240 / bases.length))) : 12;
  const enviesLieux = envies.length ? envies : ENVIES_PAR_DEFAUT;
  await parLots(bases, 3, async (b) => {
    let trouves = [];
    try {
      trouves = await lieuxAutour(b, {
        envies: enviesLieux,
        pointsHauts: Boolean(d.mesh?.pointsHauts),
      });
    } catch (erreur) {
      avertissements.push(`Lieux autour de ${b.nom} indisponibles (${erreur.message}).`);
    }
    b.hauts = trouves.filter((l) => l.hautPossible && l.ele);
    b.candidats = varier(
      trouves.filter(
        (l) =>
          l.distanceKm <= Math.max(t.rayonLocal, 4) &&
          !rejetes.has(l.nom.toLowerCase()) &&
          l.nom.toLowerCase() !== b.nom.toLowerCase(),
      ),
      enviesLieux,
      profil,
      parJour,
    );
  });

  signaler(`L'IA (${modele}) choisit les visites et écrit ton carnet…`);
  const carnet = await demanderJson({
    ia,
    systeme: SYSTEME,
    message: messageCarnet(contexte, plan, bases, reseaux.length > 0),
    schema: SCHEMA_CARNET,
  });

  const nbVisites = jours < 1 || transport === 'pied' ? 2 : 3;
  let position = depart;
  const joursFinaux = bases.map((b) => {
    const j = (carnet.jours ?? []).find((x) => x.jour === b.jour) ?? {};
    const choisis = new Map();
    for (const v of j.visites ?? []) {
      const lieu = b.candidats.find((c) => c.id === v.id);
      if (lieu && !choisis.has(lieu.id)) choisis.set(lieu.id, { ...lieu, pourquoi: v.pourquoi });
    }
    // L'IA locale oublie parfois les identifiants : on complète avec les meilleurs candidats.
    for (const c of b.candidats) {
      if (choisis.size >= Math.min(nbVisites, b.candidats.length)) break;
      if (!choisis.has(c.id)) choisis.set(c.id, { ...c, pourquoi: '' });
    }
    const visites = plusProcheVoisin(position, [...choisis.values()].slice(0, nbVisites + 1));
    position = b;
    return {
      jour: b.jour,
      base: {
        nom: b.nom,
        lat: b.lat,
        lon: b.lon,
        departement: b.departement,
        theme: b.theme,
        couverture: noeuds.length ? couverture(b, noeuds) : null,
      },
      visites: visites.map((v) => ({ ...v, couverture: noeuds.length ? couverture(v, noeuds) : null })),
      nuit: j.nuit ?? '',
      budget: j.budget ?? null,
      astuce: j.astuce ?? '',
      pointHaut: d.mesh?.pointsHauts ? pointHaut(b.hauts, d.niveau, noeuds) : null,
      candidats: b.candidats,
    };
  });

  signaler('Je calcule le trajet…');
  const trace = await tracerVoyage(depart, joursFinaux, transport, retour);

  return {
    // Le modèle local recopie parfois « Jour 1 : » en tête du titre du voyage.
    titre: (carnet.titre || plan.titre || 'Mon voyage').replace(/^jour \d+\s*[:–-]\s*/i, ''),
    resume: carnet.resume || plan.idee || '',
    conseils: carnet.conseils ?? [],
    modele,
    transport,
    retour,
    depart,
    jours: joursFinaux,
    trace,
    zones,
    reseaux,
    avertissements,
  };
}

/** Trace le voyage complet et range la distance de chaque tronçon dans son jour. */
export async function tracerVoyage(depart, jours, transport, retour) {
  const points = [{ ...depart, jour: 1 }];
  jours.forEach((j, i) => {
    const dernier = i === jours.length - 1;
    for (const v of j.visites) points.push({ ...v, jour: j.jour });
    if (!(dernier && retour)) points.push({ ...j.base, jour: j.jour });
  });
  if (retour) points.push({ ...depart, jour: jours.at(-1)?.jour ?? 1 });
  const distincts = points.filter((p, i) => i === 0 || distanceKm(points[i - 1], p) > 0.05);

  const trace = await tracer(distincts, transport);
  for (const j of jours) {
    j.distanceKm = 0;
    j.dureeH = 0;
  }
  trace.troncons.forEach((troncon, i) => {
    const jour = jours.find((j) => j.jour === distincts[i + 1].jour);
    if (!jour) return;
    jour.distanceKm += troncon.distanceKm;
    jour.dureeH += troncon.dureeH;
  });
  return { coords: trace.coords, distanceKm: trace.distanceKm, dureeH: trace.dureeH, reel: trace.reel };
}

/** Garde des catégories variées : tour à tour, la meilleure de chaque catégorie. */
function varier(lieux, envies, profil, max) {
  const score = (l) => (l.image ? 0.5 : 0) - l.distanceKm / 20;
  const groupes = new Map();
  const vus = new Set();
  for (const l of [...lieux].sort((a, b) => score(b) - score(a))) {
    const cle = l.nom.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    if (!groupes.has(l.categorie)) groupes.set(l.categorie, []);
    groupes.get(l.categorie).push(l);
  }
  const preference = (c) =>
    (envies.includes(c) ? 2 : 0) +
    (profil.aime?.includes(c) ? 1 : 0) -
    (profil.evite?.includes(c) ? 2 : 0) -
    (c === 'autre' ? 3 : 0);
  const ordre = [...groupes.keys()].sort((a, b) => preference(b) - preference(a));
  const resultat = [];
  for (let rang = 0; resultat.length < max; rang++) {
    let ajoute = false;
    for (const c of ordre) {
      const l = groupes.get(c)[rang];
      if (l && resultat.length < max) {
        resultat.push(l);
        ajoute = true;
      }
    }
    if (!ajoute) break;
  }
  return resultat;
}

/** Le point haut le plus élevé qui reste raisonnable pour le niveau physique. */
function pointHaut(hauts, niveau, noeuds) {
  const plafond = ALTITUDE_MAX[niveau] ?? ALTITUDE_MAX.moyen;
  const choix = hauts.filter((h) => h.ele && h.ele <= plafond).sort((a, b) => b.ele - a.ele)[0];
  if (!choix) return null;
  return {
    id: choix.id,
    nom: choix.nom,
    lat: choix.lat,
    lon: choix.lon,
    ele: Math.round(choix.ele),
    noeuds40: noeuds.length ? noeudsDansRayon(choix, noeuds, 40) : null,
  };
}

function profilEnTexte({ d, t, kmJour, envies, styles, profil }) {
  const lignes = [
    `Transport : ${t.nom}, au plus ~${kmJour} km par jour.`,
    d.quand && `Quand : ${d.quand}.`,
    `Budget : ${LIBELLES.budget[d.budget] ?? LIBELLES.budget.moyen}.`,
    `Niveau physique : ${LIBELLES.niveau[d.niveau] ?? LIBELLES.niveau.moyen}.`,
    `Avec : ${LIBELLES.compagnie[d.compagnie] ?? 'non précisé'}.`,
    `Hébergement : ${LIBELLES.hebergement[d.hebergement] ?? 'peu importe'}.`,
    `Envies : ${[...envies.map((e) => ENVIES[e].nom), ...styles.map((s) => STYLES[s])].join(', ') || 'surprends-moi'}.`,
    d.texte?.trim() && `Ce que la personne écrit : « ${d.texte.trim().slice(0, 600)} »`,
    profil.aime?.length &&
      `Goûts appris : aime ${profil.aime.map((c) => ENVIES[c]?.nom ?? c).join(', ')}.`,
    profil.evite?.length &&
      `Goûts appris : aime moins ${profil.evite.map((c) => ENVIES[c]?.nom ?? c).join(', ')}.`,
    profil.lieuxRejetes?.length &&
      `Lieux déjà refusés, à ne pas reproposer : ${profil.lieuxRejetes.slice(-20).join(', ')}.`,
    d.eviter?.length && `Propose un voyage différent du précédent, avec d'autres étapes que : ${d.eviter.slice(0, 14).join(', ')}.`,
  ];
  return lignes.filter(Boolean).join('\n');
}

function messagePlan(c, zones, sures) {
  const duree =
    c.nbEtapes === 1
      ? `Durée : ${c.jours < 1 ? 'une demi-journée' : 'une journée'}, donc exactement 1 étape : le coin à explorer, à moins de ${c.kmJour} km du départ.`
      : `Durée : ${c.nbEtapes} jours, donc exactement ${c.nbEtapes} étapes (une par jour : là où l'on dort${c.retour ? ', sauf le dernier jour où l\'on rentre' : ''}).`;
  const mesh = zones.length
    ? `\nSecteurs où la radio mesh (MeshCore / Meshtastic) a des relais. C'est un bonus : préfère une étape dans ou près de ces secteurs seulement si elle colle aussi aux envies :\n${zones
        .map((z) => `- ${z.nom} : ${z.noeuds} nœuds dont ${z.relais} relais`)
        .join('\n')}\n`
    : '';
  const liste = sures.length
    ? `\nÉtapes vérifiées à portée (villages et sites labellisés). Choisis-les de préférence et recopie leur id :\n${sures
        .map(
          (e) =>
            `${e.id} | ${e.nom}${e.departement ? ` (${e.departement})` : ''} | ${e.distanceKm} km ${e.direction} du départ | ${e.labels.join(', ')}${e.couverture ? ` | mesh : ${e.couverture}` : ''}`,
        )
        .join('\n')}\nTu peux choisir un autre lieu réel que tu connais très bien : laisse alors "id" vide.\n`
    : '\nLaisse "id" vide pour chaque étape.\n';
  return `Prépare les grandes étapes d'un voyage.

Départ : ${c.depart.nom}${c.depart.departement ? ` (${c.depart.departement})` : ''}.
${duree}
Retour au départ à la fin : ${c.retour ? 'oui' : 'non'}.
${profilEnTexte(c)}
${liste}${mesh}
Règles :
- Chaque "lieu" est le nom exact d'une vraie commune ou d'un site connu, avec son département dans "departement".
- Les étapes sont des endroits différents du point de départ.
- Si la personne veut du calme ou de la nature, préfère les villages et petites villes aux grandes villes.
- Les étapes s'enchaînent logiquement, sans allers-retours, en respectant la distance par jour.
- Évite les lieux déjà refusés et adapte-toi aux goûts appris.
- "theme" : ce qu'on vient y faire, en moins de 10 mots.
- "titre" : un titre court ; "idee" : l'esprit du voyage en une phrase.`;
}

function messageCarnet(c, plan, bases, avecMesh) {
  const nb = c.jours < 1 || c.d.transport === 'pied' ? 2 : 3;
  const blocs = bases.map((b) => {
    const lignes = b.candidats.map(
      (l) =>
        `${l.id} | ${ENVIES[l.categorie]?.nom ?? 'À voir'} | ${l.nom} | ${l.distanceKm} km${l.description ? ` | ${l.description}` : ''}${l.ele ? ` | ${l.ele} m` : ''}`,
    );
    return `Jour ${b.jour} — étape : ${b.nom}${b.departement ? ` (${b.departement})` : ''} — thème : ${b.theme}\n${lignes.join('\n') || '(aucun lieu trouvé : propose quand même la journée dans "astuce")'}`;
  });
  return `Voyage « ${plan.titre} » : ${plan.idee}
Départ : ${c.depart.nom}. Retour au départ à la fin : ${c.retour ? 'oui' : 'non'}.
${profilEnTexte(c)}

Pour chaque jour, voici de vrais lieux (articles Wikipédia géolocalisés) autour de l'étape.
Format : id | type | nom | distance de l'étape | infos

${blocs.join('\n\n')}

Consignes :
- Pour chaque jour, choisis ${nb} lieux dans SA liste (recopie l'id exact), les mieux adaptés au profil, dans un ordre de visite logique. Varie les types.
- "pourquoi" : une phrase concrète sur CE lieu précis (appuie-toi sur sa description), qui donne envie à cette personne. Pas d'horaires ni de prix inventés.
- "nuit" : où et comment dormir ce soir-là, adapté au budget et à l'hébergement souhaité, en une phrase.${c.retour ? ' Le dernier jour : "Retour à la maison".' : ''}
- "budget" : estimation en euros par personne pour la journée (nombre entier).
- "astuce" : un conseil pratique pour ce jour (horaires, parking, marché, saison…).
- "titre" : titre court et accrocheur ; "resume" : 2 à 3 phrases.
- "conseils" : 3 à 5 conseils pour tout le voyage.${avecMesh ? ' Inclus un conseil sur la radio mesh (MeshCore / Meshtastic) : où ça capte, quoi emporter.' : ''}`;
}
