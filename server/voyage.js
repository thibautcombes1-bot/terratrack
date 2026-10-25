// Génération d'un road trip.
// 1. On trace la route vers la destination (ou le coin à explorer).
// 2. On ramasse les lieux intéressants dans un couloir le long de la route et autour du coin
//    (Wikipédia + villages et sites labellisés).
// 3. L'IA note ces lieux selon les goûts de la personne.
// 4. Le moteur (itineraire.js) choisit les lieux sur tout le parcours, les met dans un ordre
//    sans allers-retours et découpe les journées.
// 5. L'IA écrit le carnet ; on ajoute nuits, tracé réel, points hauts et couverture mesh.
import { couverture, noeudsDansRayon } from '../commun/couverture.js';
import { distanceKm, parLots } from '../commun/geo.js';
import { ETAPES } from './etapes.js';
import { demanderJson, nomModele } from './ia.js';
import { cleOrdre, decouperJours, echantillonner, grilleCoin, preparerRoute, selectionner } from './itineraire.js';
import { ajouterImages, ENVIES, geocoder, lieuxAutour, nomDuLieu } from './lieux.js';
import { noeudsDe, RESEAUX } from './mesh.js';
import { TRANSPORTS, tracer } from './trace.js';

/** Envies de style : elles guident le tri et l'écriture, sans correspondre à un type de lieu. */
export const STYLES = {
  routes: 'routes panoramiques',
  calme: 'calme, loin de la foule',
  photo: 'beaux spots photo',
  local: 'produits et rencontres locales',
  soiree: 'sorties le soir',
};

const ENVIES_PAR_DEFAUT = ['nature', 'panoramas', 'patrimoine', 'villages'];
const POIDS_LABELS = {
  'Grand Site de France': 3.5,
  'Plus Beaux Villages de France': 3,
  'Plus Beaux Détours de France': 2.5,
  'Petite Cité de Caractère': 2,
  "Ville ou Pays d'art et d'histoire": 2,
};
/** Intérêt de base d'un type de lieu (une commune quelconque vaut peu, un site naturel beaucoup). */
const INTERET = {
  villages: 0.2,
  patrimoine: 1,
  nature: 1.2,
  panoramas: 1.2,
  randonnee: 0.8,
  baignade: 1,
  musees: 0.8,
  gastronomie: 0.9,
  aventure: 0.8,
  insolite: 1,
  astronomie: 0.8,
  autre: 0,
};
const DUREE_VISITE = {
  randonnee: 2.5,
  aventure: 2,
  baignade: 1.5,
  musees: 1.5,
  nature: 1.2,
  astronomie: 1,
  villages: 1,
  patrimoine: 1,
  gastronomie: 1,
  insolite: 0.8,
  panoramas: 0.5,
  autre: 0.8,
};
const VISITES_PAR_JOUR = { voiture: 4, moto: 4, van: 3, train: 3, velo: 3, pied: 2 };
/** Détour maximal (km) de part et d'autre de la route. */
const LARGEUR = { voiture: 12, moto: 12, van: 10, train: 6, velo: 5, pied: 2.5 };
const ESPACEMENT = { voiture: 4, moto: 4, van: 4, train: 2, velo: 2, pied: 1 };
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

const SYSTEME = `Tu es TerraTrack, un spécialiste du road trip et du voyage lent, qui connaît très bien la France.
Tu écris en français, avec un ton chaleureux et concret, sans superlatifs creux.
Tu n'inventes jamais d'horaires, de prix, de numéros de route ni de faits précis dont tu n'es pas sûr.
Tu réponds uniquement avec du JSON conforme au schéma demandé.`;

// Les bornes de longueur empêchent un modèle local de boucler dans un champ (ia.js les retire pour Claude).
const objet = (proprietes) => ({
  type: 'object',
  properties: proprietes,
  required: Object.keys(proprietes),
  additionalProperties: false,
});
const texte = (max) => ({ type: 'string', maxLength: max });
const entier = { type: 'integer' };
const liste = (items, max) => ({ type: 'array', items, maxItems: max });

const SCHEMA_NOTES = objet({ notes: liste(objet({ id: texte(20), note: entier }), 60) });

const SCHEMA_CARNET = objet({
  titre: texte(80),
  resume: texte(400),
  jours: liste(
    objet({
      jour: entier,
      titre: texte(70),
      route: texte(300),
      visites: liste(objet({ id: texte(20), pourquoi: texte(260) }), 8),
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
  const jours = Math.min(14, Math.max(0.25, Number(d.jours) || 1));
  const nbJours = jours <= 1 ? 1 : Math.round(jours);
  const kmJour = t.kmJour * Math.min(1, jours);
  const mode = ['destination', 'coin', 'surprise'].includes(d.mode) ? d.mode : 'surprise';
  const boucle = mode === 'destination' ? Boolean(d.retour) : d.retour !== false;
  const envies = (d.envies ?? []).filter((e) => ENVIES[e]);
  const styles = (d.envies ?? []).filter((e) => STYLES[e]);
  const reseaux = (d.mesh?.reseaux ?? []).filter((r) => RESEAUX.includes(r));
  const profil = d.profil ?? {};
  const ia = d.ia === 'claude' ? 'claude' : 'ollama';
  const largeur = LARGEUR[transport];
  const avertissements = [];

  signaler('Je situe ton départ…');
  const depart =
    d.depart?.lat != null
      ? { nom: d.depart.texte || (await nomDuLieu(d.depart)) || 'Ma position', lat: d.depart.lat, lon: d.depart.lon }
      : await geocoder(d.depart?.texte ?? '');
  if (!depart) throw new Error(`Départ introuvable : « ${d.depart?.texte ?? ''} ».`);

  const eviter = new Set((d.eviter ?? []).map((n) => n.toLowerCase()));
  let cible;
  let rayonCoin;
  if (mode === 'surprise') {
    signaler('Je cherche un coin qui vaut le détour…');
    const portee = Math.max(15, kmJour * Math.max(1, jours) * (boucle ? 0.35 : 0.8));
    cible = choisirCoin(depart, portee, eviter) ?? depart;
    rayonCoin = cible === depart ? Math.min(40, Math.max(8, portee)) : rayonDuCoin(kmJour, jours);
  } else {
    signaler(mode === 'destination' ? 'Je situe ta destination…' : 'Je situe le coin à explorer…');
    cible = await geocoder(d.cible ?? '', depart);
    if (!cible) throw new Error(`Lieu introuvable : « ${d.cible ?? ''} ».`);
    rayonCoin = mode === 'destination' ? 10 : rayonDuCoin(kmJour, jours);
  }

  let noeuds = [];
  if (reseaux.length) {
    signaler('Je charge les nœuds radio mesh…');
    noeuds = await noeudsDe(reseaux);
  }

  signaler('Je trace la route…');
  const loin = distanceKm(depart, cible) > 2;
  const squelette = loin ? await tracer([depart, cible], transport) : null;
  const route = preparerRoute(loin ? squelette.coords : [[depart.lon, depart.lat]]);
  const aParcourir = boucle ? route.longueur * 2 + rayonCoin * 3 : route.longueur + rayonCoin;
  if (aParcourir > kmJour * Math.max(1, jours) * 1.3)
    avertissements.push(
      `C'est loin pour ${nbJours} jour${nbJours > 1 ? 's' : ''} (${Math.round(aParcourir)} km environ) : attends-toi à de longues journées de route.`,
    );

  signaler('Je cherche les coins sympas le long de la route…');
  const pasKm = Math.max({ pied: 4, velo: 8 }[transport] ?? 12, route.longueur / 40);
  const points = [...(loin ? echantillonner(route, pasKm) : []), ...grilleCoin(cible, rayonCoin)];
  const enviesLieux = envies.length ? envies : ENVIES_PAR_DEFAUT;
  const pointsHauts = Boolean(d.mesh?.pointsHauts);
  const trouves = new Map();
  let ratees = 0;
  for (const lot of await parLots(points, 4, (p) =>
    lieuxAutour(p, { envies: enviesLieux, pointsHauts }).catch(() => {
      ratees++;
      return [];
    }),
  ))
    for (const l of lot) trouves.set(l.id, l);
  if (ratees)
    avertissements.push(`${ratees} zone(s) sur ${points.length} n'ont pas pu être fouillées (Wikipédia saturé) : réessaie dans un moment pour un parcours complet.`);
  const ctx = { route, depart, centre: cible, rayonCoin, largeur, boucle };
  ajouterLabels(trouves, (e) => cleOrdre(e, ctx));

  const rejetes = new Set((profil.lieuxRejetes ?? []).map((n) => n.toLowerCase()));
  const candidats = [];
  for (const l of trouves.values()) {
    if (rejetes.has(l.nom.toLowerCase()) || distanceKm(depart, l) < 2) continue;
    const position = cleOrdre(l, ctx);
    if (!position) continue;
    const c = { ...l, ...position, dureeH: DUREE_VISITE[l.categorie] ?? 1 };
    c.score = scorer(c, { envies, styles, profil, eviter, largeur, noeuds, couvert: d.mesh?.couvert });
    candidats.push(c);
  }
  if (!candidats.length) throw new Error('Aucun lieu intéressant trouvé sur ce parcours. Essaie une autre destination.');

  const modele = await nomModele(ia);
  const contexte = { depart, cible, mode, boucle, jours, nbJours, kmJour, t, envies, styles, profil, d };

  signaler(`L'IA (${modele}) trie les lieux selon tes goûts…`);
  const top = [...candidats].sort((a, b) => b.score - a.score).slice(0, ia === 'claude' ? 45 : 30);
  try {
    const { notes } = await demanderJson({ ia, systeme: SYSTEME, message: messageNotes(contexte, top), schema: SCHEMA_NOTES });
    const parId = new Map(top.map((c) => [c.id, c]));
    for (const { id, note } of notes ?? []) {
      const c = parId.get(id);
      if (c) c.score += (Math.max(0, Math.min(3, note)) - 1) * 1.2;
    }
  } catch (erreur) {
    avertissements.push(`Tri par l'IA indisponible (${erreur.message}) : lieux triés par intérêt général.`);
  }

  signaler('Je calcule un itinéraire logique, sans allers-retours…');
  const parJour = Math.max(1, VISITES_PAR_JOUR[transport] - (d.niveau === 'tranquille' ? 1 : 0));
  const nbVisites = jours < 1 ? Math.max(2, Math.round(parJour * jours * 1.5)) : nbJours * parJour;
  const choisis = selectionner(candidats, nbVisites, ESPACEMENT[transport]);
  const fin = boucle ? depart : mode === 'destination' ? cible : null;
  const groupes = decouperJours(choisis, nbJours, { depart, fin, vitesse: t.vitesse });
  if (groupes.length < nbJours)
    avertissements.push(`Peu de lieux trouvés : voyage ramené à ${groupes.length} jour(s).`);

  const joursFinaux = await parLots(groupes, 3, async (visites, i) => {
    const dernier = i === groupes.length - 1;
    const base = dernier
      ? boucle
        ? { ...depart, nom: depart.nom, retour: true }
        : mode === 'destination'
          ? { nom: cible.nom, lat: cible.lat, lon: cible.lon, departement: cible.departement }
          : await lieuNuit(visites.at(-1))
      : await lieuNuit(visites.at(-1));
    return { jour: i + 1, base, visites };
  });
  // Lieux de remplacement : non choisis, dans le même tronçon du parcours.
  joursFinaux.forEach((j, i) => {
    const debut = i ? groupes[i - 1].at(-1).cle : 0;
    const finTroncon = i < groupes.length - 1 ? groupes[i + 1][0].cle : 1;
    j.candidats = candidats
      .filter((c) => !choisis.includes(c) && c.cle >= debut && c.cle <= finTroncon)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  });
  await ajouterImages(joursFinaux.flatMap((j) => [...j.visites, ...j.candidats]));
  for (const j of joursFinaux) {
    j.visites = j.visites.map(allege);
    j.candidats = j.candidats.map(allege);
  }

  signaler('Je calcule la route complète…');
  const trace = await tracerVoyage(depart, joursFinaux, transport, fin);

  for (const j of joursFinaux) {
    j.pointHaut = pointsHauts ? pointHaut(j.visites, trouves, d.niveau, noeuds) : null;
    if (noeuds.length) {
      j.base.couverture = couverture(j.base, noeuds);
      for (const v of j.visites) v.couverture = couverture(v, noeuds);
    }
  }

  signaler(`L'IA (${modele}) écrit ton carnet de route…`);
  let carnet = {};
  try {
    carnet = await demanderJson({
      ia,
      systeme: SYSTEME,
      message: messageCarnet(contexte, joursFinaux, reseaux.length > 0),
      schema: SCHEMA_CARNET,
    });
  } catch (erreur) {
    avertissements.push(`Carnet de l'IA indisponible (${erreur.message}) : l'itinéraire reste valable.`);
  }
  for (const j of joursFinaux) {
    const ecrit = (carnet.jours ?? []).find((x) => x.jour === j.jour) ?? {};
    const pourquoi = new Map((ecrit.visites ?? []).map((v) => [v.id, v.pourquoi]));
    j.titre = ecrit.titre ?? '';
    j.route = ecrit.route ?? '';
    j.nuit = ecrit.nuit ?? '';
    j.budget = ecrit.budget ?? null;
    j.astuce = ecrit.astuce ?? '';
    for (const v of j.visites) v.pourquoi = pourquoi.get(v.id) ?? '';
  }

  return {
    // Le modèle local recopie parfois « Jour 1 : » en tête du titre du voyage.
    titre: (carnet.titre || `Road trip ${cible === depart ? `autour de ${depart.nom}` : `vers ${cible.nom}`}`).replace(/^jour \d+\s*[:–-]\s*/i, ''),
    resume: carnet.resume ?? '',
    conseils: carnet.conseils ?? [],
    modele,
    transport,
    mode,
    retour: boucle,
    depart,
    arrivee: fin,
    jours: joursFinaux,
    trace,
    reseaux,
    avertissements,
  };
}

/** Rayon du coin à explorer : plus le séjour est long, plus on rayonne. */
function rayonDuCoin(kmJour, jours) {
  return Math.min(35, Math.max(8, kmJour * Math.max(1, jours) * 0.15));
}

/** « Surprends-moi » : le secteur le plus riche en villages et sites labellisés à bonne distance. */
function choisirCoin(depart, portee, eviter) {
  const aBonneDistance = ETAPES.filter((e) => {
    const d = distanceKm(depart, e);
    return d >= portee * 0.25 && d <= portee && !eviter.has(e.nom.toLowerCase());
  });
  let meilleur = null;
  let meilleurScore = -Infinity;
  for (const e of aBonneDistance) {
    let score = (Math.random() - 0.5) * 3;
    for (const voisin of ETAPES)
      if (distanceKm(e, voisin) < 25)
        score += voisin.labels.reduce((s, l) => s + (POIDS_LABELS[l] ?? 1), 0);
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleur = e;
    }
  }
  return meilleur && { nom: meilleur.nom, lat: meilleur.lat, lon: meilleur.lon, departement: meilleur.departement };
}

/**
 * Ajoute les labels (Plus Beaux Villages…) aux lieux trouvés, et tous les sites labellisés
 * du parcours qui manquent : ceux-là ne doivent jamais être ratés.
 */
function ajouterLabels(trouves, surLeParcours) {
  const parNom = new Map([...trouves.values()].map((l) => [l.nom.toLowerCase(), l]));
  for (const e of ETAPES) {
    const existant = parNom.get(e.nom.toLowerCase());
    if (existant && distanceKm(existant, e) < 5) {
      existant.labels = e.labels;
      continue;
    }
    if (!surLeParcours(e)) continue;
    trouves.set(e.id, {
      id: e.id,
      categorie: e.labels.includes('Grand Site de France') ? 'nature' : 'villages',
      nom: e.nom,
      description: e.labels.join(' · '),
      lat: e.lat,
      lon: e.lon,
      labels: e.labels,
    });
  }
}

function scorer(l, { envies, styles, profil, eviter, largeur, noeuds, couvert }) {
  // Une commune quelconque compte peu, même si on aime les villages : ce sont les labellisées qui valent le détour.
  const communeOrdinaire = l.categorie === 'villages' && !l.labels?.length;
  let s = communeOrdinaire ? 0 : (INTERET[l.categorie] ?? 0);
  for (const label of l.labels ?? []) s += POIDS_LABELS[label] ?? 1;
  // Notoriété : nombre de Wikipédias qui en parlent (base locale) ou longueur de l'article.
  s += l.liens != null ? Math.min(1.2, l.liens / 10) + (l.monumentClasse ? 0.4 : 0) : Math.min(0.8, (l.longueur ?? 0) / 25_000);
  if (envies.includes(l.categorie)) s += communeOrdinaire ? 0.6 : 2;
  if (styles.includes('routes') && ['panoramas', 'randonnee'].includes(l.categorie)) s += 0.8;
  if (profil.aime?.includes(l.categorie)) s += 1;
  if (profil.evite?.includes(l.categorie)) s -= 2;
  if (eviter.has(l.nom.toLowerCase())) s -= 3;
  if (couvert && noeuds.length && couverture(l, noeuds).niveau === 'bonne') s += 0.8;
  s -= (l.ecart / largeur) * 1.5;
  // Un peu de hasard : « Autre version » ne redonne pas exactement le même voyage.
  return s + (Math.random() - 0.5) * 0.6;
}

/** Où dormir après la dernière visite : un village labellisé tout près, sinon la commune. */
async function lieuNuit(dernier) {
  const labellise = ETAPES.filter((e) => distanceKm(e, dernier) < 12).sort(
    (a, b) => distanceKm(a, dernier) - distanceKm(b, dernier),
  )[0];
  if (labellise)
    return { nom: labellise.nom, lat: labellise.lat, lon: labellise.lon, departement: labellise.departement };
  const nom = (await nomDuLieu(dernier)) ?? dernier.nom;
  return { nom: nom.split(',')[0], departement: nom.split(',')[1]?.trim(), lat: dernier.lat, lon: dernier.lon };
}

const allege = ({ id, categorie, nom, description, lat, lon, image, lien, labels, cle, ecart, ele, pourquoi }) => ({
  id,
  categorie,
  nom,
  description,
  lat,
  lon,
  image,
  lien,
  labels,
  cle,
  detourKm: Math.round(ecart * 10) / 10,
  ele,
  pourquoi,
});

/** Le point haut le plus élevé, raisonnable pour le niveau physique, près des visites du jour. */
function pointHaut(visites, trouves, niveau, noeuds) {
  const plafond = ALTITUDE_MAX[niveau] ?? ALTITUDE_MAX.moyen;
  const choix = [...trouves.values()]
    .filter((h) => h.hautPossible && h.ele && h.ele <= plafond && visites.some((v) => distanceKm(v, h) < 15))
    .sort((a, b) => b.ele - a.ele)[0];
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

/**
 * Trace tout le road trip (départ → visites → nuits → arrivée) et range la distance
 * de chaque tronçon dans son jour.
 */
export async function tracerVoyage(depart, jours, transport, fin) {
  const points = [{ ...depart, jour: 1 }];
  jours.forEach((j, i) => {
    for (const v of j.visites) points.push({ lat: v.lat, lon: v.lon, jour: j.jour });
    if (i < jours.length - 1) points.push({ lat: j.base.lat, lon: j.base.lon, jour: j.jour });
  });
  if (fin) points.push({ lat: fin.lat, lon: fin.lon, jour: jours.at(-1)?.jour ?? 1 });
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

function profilEnTexte({ d, t, kmJour, envies, styles, profil }) {
  const lignes = [
    `Transport : ${t.nom}, au plus ~${Math.round(kmJour)} km par jour.`,
    d.quand && `Quand : ${d.quand}.`,
    `Budget : ${LIBELLES.budget[d.budget] ?? LIBELLES.budget.moyen}.`,
    `Niveau physique : ${LIBELLES.niveau[d.niveau] ?? LIBELLES.niveau.moyen}.`,
    `Avec : ${LIBELLES.compagnie[d.compagnie] ?? 'non précisé'}.`,
    `Hébergement : ${LIBELLES.hebergement[d.hebergement] ?? 'peu importe'}.`,
    `Envies : ${[...envies.map((e) => ENVIES[e].nom), ...styles.map((s) => STYLES[s])].join(', ') || 'surprends-moi'}.`,
    d.texte?.trim() && `Ce que la personne écrit : « ${d.texte.trim().slice(0, 600)} »`,
    profil.aime?.length && `Goûts appris : aime ${profil.aime.map((c) => ENVIES[c]?.nom ?? c).join(', ')}.`,
    profil.evite?.length && `Goûts appris : aime moins ${profil.evite.map((c) => ENVIES[c]?.nom ?? c).join(', ')}.`,
  ];
  return lignes.filter(Boolean).join('\n');
}

function decrireParcours(c) {
  if (c.cible === c.depart) return `Boucle autour de ${c.depart.nom}.`;
  if (c.mode === 'destination')
    return `De ${c.depart.nom} à ${c.cible.nom}${c.boucle ? ', puis retour par une autre route' : ''}.`;
  return `De ${c.depart.nom} vers le coin de ${c.cible.nom}${c.boucle ? ', puis retour par une autre route' : ''}.`;
}

const ligneLieu = (l) =>
  `${l.id} | ${ENVIES[l.categorie]?.nom ?? 'À voir'} | ${l.nom}${l.description ? ` | ${l.description}` : ''}${
    l.labels?.length ? ` | ${l.labels.join(', ')}` : ''
  }`;

function messageNotes(c, lieux) {
  return `Road trip : ${decrireParcours(c)}
${profilEnTexte(c)}

Voici des lieux réels sur le parcours. Format : id | type | nom | description.
${lieux.map(ligneLieu).join('\n')}

Note chaque lieu de 0 à 3 selon ce qui plaira à CETTE personne :
3 = à ne pas rater pour elle, 2 = lui plaira, 1 = bof, 0 = pas pour elle.
Recopie chaque id exactement.`;
}

function messageCarnet(c, jours, avecMesh) {
  const heures = (h) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  const blocs = jours.map((j, i) => {
    const derniere = i === jours.length - 1;
    const soir = j.base.retour ? 'retour à la maison' : `${derniere && c.mode === 'destination' ? 'arrivée' : 'nuit'} à ${j.base.nom}`;
    return `Jour ${j.jour} — ${Math.round(j.distanceKm)} km, ${heures(j.dureeH)} de route — ${soir}\n${j.visites.map(ligneLieu).join('\n')}`;
  });
  return `Road trip : ${decrireParcours(c)}
${profilEnTexte(c)}

L'itinéraire est déjà calculé (ordre logique, sans allers-retours). Voici les visites de chaque jour, dans l'ordre :

${blocs.join('\n\n')}

Écris le carnet de route :
- "titre" : titre court et accrocheur du road trip ; "resume" : 2 à 3 phrases.
- Pour chaque jour : "titre" (l'esprit de la journée, moins de 8 mots) ; "route" (la route du jour en 1 ou 2 phrases : par où passer, le plus beau passage, une pause en chemin) ;
  "visites" : pour CHAQUE lieu du jour, recopie son id et écris "pourquoi" (une phrase concrète sur ce lieu précis, qui donne envie à cette personne) ;
  "nuit" : où et comment dormir ce soir-là, adapté au budget et à l'hébergement souhaité (écris "Retour à la maison" si c'est le retour) ;
  "budget" : estimation en euros par personne pour la journée (nombre entier) ; "astuce" : un conseil pratique pour ce jour.
- "conseils" : 3 à 5 conseils pour tout le road trip.${avecMesh ? ' Inclus un conseil sur la radio mesh (MeshCore / Meshtastic).' : ''}`;
}
