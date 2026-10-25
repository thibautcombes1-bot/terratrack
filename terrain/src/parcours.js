// Le parcours, calculé et recalculé entièrement hors ligne avec le pack de la région :
// lieux dans un couloir le long de la route, ordre sans allers-retours (server/itineraire.js),
// vrais temps de route (commun/routeur.js), nuits avant la tombée du jour.
import { distanceKm } from '../../commun/geo.js';
import { detours, itineraire, itineraireMulti } from '../../commun/routeur.js';
import { cleOrdre, decouperJours, preparerRoute, rectangle, selectionner, situer } from '../../server/itineraire.js';
import { ajouterJours } from './outils.js';
import { kmDansLaJournee, profilConso } from '../../commun/carburant.js';
import { coucherSoleil } from './soleil.js';

export const ENVIES = {
  randonnee: 'Randonnée',
  viaferrata: 'Via ferrata',
  escalade: 'Escalade',
  canoe: 'Canoë-kayak',
  baignade: 'Baignade',
  unesco: 'Patrimoine UNESCO',
  patrimoine: 'Patrimoine',
  panoramas: 'Panoramas',
  nature: 'Nature et grottes',
  villages: 'Villages',
};
/** Envies qui sont des activités (le lieu porte `activite`), et pas seulement un type de lieu. */
const ACTIVITES = new Set(['randonnee', 'viaferrata', 'escalade', 'canoe', 'baignade']);
export const NUITS = {
  gratuit: { nom: 'Camping gratuit', types: ['Camping gratuit', 'Aire de camping-car gratuite'] },
  camping: { nom: 'Camping', types: ['Camping'] },
  aire: { nom: 'Aire de camping-car', types: ['Aire de camping-car'] },
  gite: { nom: "Gîte, chambre d'hôte", types: ["Chambre d'hôte", 'Gîte', "Gîte d'étape", 'Hôtel'] },
  refuge: { nom: 'Refuge, cabane', types: ['Refuge', 'Cabane'] },
  bivouac: { nom: 'Bivouac', types: ['Bivouac', 'Abri (bivouac à vérifier)', 'Cabane'] },
  // Aucun hébergement choisi : la journée s'arrête à la dernière étape.
  debrouille: { nom: 'Je me débrouille', types: [] },
};
/** Niveau des activités, de 1 (facile) à 4 (très difficile). Une activité sans niveau connu reste proposée ; on écarte seulement ce qui dépasse. */
export const aMonNiveau = (l, niveauMax) => !niveauMax || !l.niveauRang || l.niveauRang <= niveauMax;
export const RYTHMES = {
  tranquille: { nom: 'Tranquille', etapes: 2, conduiteH: 2 },
  normal: { nom: 'Normal', etapes: 3, conduiteH: 3 },
  soutenu: { nom: 'Soutenu', etapes: 4, conduiteH: 4 },
};

const MOTIFS_ENVIES = {
  patrimoine: /château|ruines|archéolog|monument|église|chapelle|monastère|abbaye|pont ancien|\btour\b|porte de ville|\bfort\b|manoir|aqueduc|musée|dolmen|menhir|histori/i,
  panoramas: /point de vue|sommet|belvédère|panorama|\bcol\b|\bmont\b|montagne/i,
  nature: /cascade|chute|grotte|arche|gorge|aven|lac|rivière|source|chaos|cirque|réserve|forêt/i,
  villages: /village|cité|bastide|Plus Beaux|Petite Cité|Détours/i,
};
const INTERET = [
  [/Grand Site|Plus Beaux Villages/, 4],
  [/Petite Cité|Détours/, 3],
  [/château|abbaye|cascade|grotte|gorge|point de vue|archéolog/i, 1.5],
  [/sommet|ruines|musée|arche|chaos|cirque/i, 1.2],
  [/église|chapelle|monument|tour|pont/i, 0.6],
];

const texteLieu = (l) => `${l.type ?? ''} ${l.nom ?? ''} ${l.labels?.join(' ') ?? ''}`;

/** Intérêt propre d'un lieu (type, labels, notoriété), indépendant de la personne. */
export function interet(l) {
  let s = 0.5;
  for (const [motif, valeur] of INTERET) if (motif.test(texteLieu(l))) s = Math.max(s, valeur);
  if (l.unesco) s = Math.max(s, 4);
  if (l.activite === 'viaferrata') s = Math.max(s, 2.5);
  if (l.activite === 'canoe' || l.type === 'Grande randonnée') s = Math.max(s, 2);
  if (l.activite === 'escalade' || l.activite === 'randonnee') s = Math.max(s, 1.5);
  return s + Math.min(2, (l.notoriete ?? 0) / 8) + (l.classe ? 0.5 : 0);
}

export const plaitA = (l, envies) =>
  envies.some((e) => l.activite === e || (e === 'unesco' && l.unesco) || MOTIFS_ENVIES[e]?.test(texteLieu(l)));

/** Les envies du début auxquelles un lieu répond. */
export const enviesDe = (l, envies) =>
  envies.filter((e) => l.activite === e || (e === 'unesco' && l.unesco) || MOTIFS_ENVIES[e]?.test(texteLieu(l)));

/** Pourquoi ce lieu est dans le parcours, en lien avec les envies cochées au départ. */
export function justifier(l, envies) {
  const raisons = [];
  const pour = enviesDe(l, envies).map((e) => ENVIES[e]);
  raisons.push(pour.length ? `Choisi pour : ${pour.join(', ')}` : 'Lieu remarquable sur ta route');
  if (l.unesco) raisons.push('patrimoine mondial UNESCO');
  for (const label of l.labels ?? []) raisons.push(label);
  if (l.classe) raisons.push('monument historique classé');
  if ((l.notoriete ?? 0) >= 8) raisons.push(`très connu (cité dans ${l.notoriete} Wikipédias)`);
  else if ((l.notoriete ?? 0) >= 4) raisons.push('assez connu');
  // Le niveau et ce qui attend sur place (longueur, dénivelé, cotations, variantes).
  if (l.niveau) raisons.push(`niveau ${l.niveau.toLowerCase()}${l.niveauTexte ? ` : ${l.niveauTexte}` : ''}`);
  else if (l.niveauTexte) raisons.push(l.niveauTexte);
  for (const d of l.details ?? []) raisons.push(d);
  if (l.activite === 'randonnee' && !l.details && l.longueurKm) raisons.push(`${l.longueurKm} km`);
  return raisons.join(' · ');
}

/** Temps de visite conseillé (minutes). */
export function dureeVisite(l) {
  // Durée donnée par le pack (marche selon l'effort, via ferrata selon la cotation).
  if (l.activite && l.dureeH) return Math.min(360, Math.max(45, Math.round(l.dureeH * 60)));
  // Une randonnée de 8 km prend environ 2 h 30 ; on plafonne à une demi-journée.
  if (l.activite === 'randonnee') return Math.min(240, Math.max(90, Math.round(((l.longueurKm ?? 8) / 3.5) * 60)));
  if (l.activite === 'viaferrata') return 180;
  if (l.activite === 'escalade' || l.activite === 'canoe') return 150;
  if (l.activite === 'baignade') return 60;
  const t = texteLieu(l);
  if (/point de vue/i.test(t)) return 15;
  if (/grotte|musée/i.test(t)) return 60;
  if (/sommet|Grand Site/i.test(t)) return 60;
  if (/village|Plus Beaux|Petite Cité|château|abbaye/i.test(t)) return 45;
  return 30;
}

const resume = (l) => ({ notoriete: l.notoriete, classe: l.classe, id: l.id, nom: l.nom, type: l.type, activite: l.activite, unesco: l.unesco, longueurKm: l.longueurKm, niveau: l.niveau, niveauRang: l.niveauRang, niveauTexte: l.niveauTexte, details: l.details, dureeH: l.activite ? l.dureeH : undefined, lat: l.lat, lon: l.lon, labels: l.labels, categorie: l.categorie, horaires: l.horaires, date: l.date, verifie: l.verifie, tel: l.tel, site: l.site, prix: l.prix, prixLe: l.prixLe, h24: l.h24, carburants: l.carburants, idPrix: l.idPrix, adresse: l.adresse });

/** « Surprends-moi » : le coin le plus riche en lieux remarquables à bonne distance. */
function choisirCoin(lieux, depart, porteeKm, favoris = new Set()) {
  // Les lieux gardés « pour plus tard » attirent le voyage vers leur coin.
  // Seulement ceux à portée, rangés dans une grille de ~15 km : on ne compare que les voisins.
  const remarquables = lieux.filter(
    (l) => (favoris.has(l.id) || (l.categorie === 'decouvrir' && l.nom && interet(l) >= 2.5)) && distanceKm(depart, l) <= porteeKm + 15,
  );
  const grille = new Map();
  const cle = (i, j) => `${i}:${j}`;
  for (const l of remarquables) {
    const k = cle(Math.floor(l.lat / 0.15), Math.floor(l.lon / 0.2));
    if (!grille.has(k)) grille.set(k, []);
    grille.get(k).push(l);
  }
  const voisins = (l) => {
    const [i, j] = [Math.floor(l.lat / 0.15), Math.floor(l.lon / 0.2)];
    return [-1, 0, 1].flatMap((di) => [-1, 0, 1].flatMap((dj) => grille.get(cle(i + di, j + dj)) ?? []));
  };
  let meilleur = null;
  let meilleurScore = -Infinity;
  for (const l of remarquables) {
    const d = distanceKm(depart, l);
    if (d < porteeKm * 0.25 || d > porteeKm) continue;
    let score = (Math.random() - 0.5) * 2;
    for (const autre of voisins(l)) if (distanceKm(l, autre) < 15) score += favoris.has(autre.id) ? 6 : interet(autre);
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleur = l;
    }
  }
  return meilleur && { nom: meilleur.nom, lat: meilleur.lat, lon: meilleur.lon };
}

/** « Je me débrouille » : la nuit se passe là où s'arrête la journée, près de la commune la plus proche. */
function nuitLibre(pack, pres) {
  // Un village ou une ville parle plus qu'un hameau, s'il y en a un à moins de 10 km.
  const plusProche = (liste) => liste.reduce((a, b) => (distanceKm(pres, a) <= distanceKm(pres, b) ? a : b), liste[0]);
  const village = plusProche(pack.communes.filter((c) => c.type !== 'hamlet'));
  const commune = village && distanceKm(pres, village) < 10 ? village : plusProche(pack.communes);
  return {
    id: `libre-${pres.lat}-${pres.lon}`,
    nom: distanceKm(pres, commune) < 10 ? `Nuit libre vers ${commune.nom}` : 'Nuit libre',
    type: 'Nuit libre (tu te débrouilles)',
    lat: pres.lat,
    lon: pres.lon,
    genre: 'nuit',
    libre: true,
  };
}

/** Un endroit où dormir près de `pres`, du type souhaité, le plus vite atteint. */
export function choisirNuit(pack, pres, types, exclus = new Set()) {
  const voulus = Object.values(NUITS)
    .filter((_, i) => types.includes(Object.keys(NUITS)[i]))
    .flatMap((n) => n.types);
  const proches = (liste) =>
    liste
      .filter((l) => l.categorie === 'dormir' && l.nom && !exclus.has(l.id) && Math.abs(l.lat - pres.lat) < 0.2 && Math.abs(l.lon - pres.lon) < 0.3)
      .map((l) => ({ l, d: distanceKm(pres, l) }))
      .filter((x) => x.d < 20)
      .sort((a, b) => a.d - b.d)
      .slice(0, 12)
      .map((x) => x.l);
  let candidats = proches(pack.lieux.filter((l) => voulus.includes(l.type)));
  if (!candidats.length) candidats = proches(pack.lieux);
  if (!candidats.length) return null;
  const [meilleur] = detours(pack.graphe, pres, pres, candidats).sort((a, b) => a.atteindreSec - b.atteindreSec);
  return meilleur && { ...resume(meilleur), genre: 'nuit' };
}

/**
 * Calcule (ou recalcule) une journée : tracé réel, heure d'arrivée à chaque étape,
 * détour ajouté par chaque étape, marge avant la nuit, alertes.
 */
export function recalculerJour(pack, jour, conduiteMaxH) {
  const g = pack.graphe;
  const points = [jour.debut, ...jour.etapes, jour.fin];
  const options = { eviterPeages: Boolean(jour.eviterPeages) };
  const trajet = itineraireMulti(g, points, options);
  if (!trajet) {
    jour.alertes = ['Une étape est injoignable par la route depuis le parcours.'];
    return jour;
  }
  let minute = jour.heureDepart;
  jour.etapes.forEach((e, k) => {
    minute += trajet.troncons[k].secondes / 60;
    e.arriveeMin = minute;
    minute += e.visiteMin;
    // Détour : passer par l'étape plutôt qu'aller directement de la précédente à la suivante.
    const direct = itineraire(g, points[k], points[k + 2], options);
    e.detourMin = direct
      ? Math.max(0, (trajet.troncons[k].secondes + trajet.troncons[k + 1].secondes - direct.secondes) / 60)
      : 0;
  });
  minute += trajet.troncons.at(-1).secondes / 60;
  jour.fin.arriveeMin = minute;
  jour.coords = trajet.coords;
  // Pour le carburant : km et km « équivalents » (autoroute, lacets) tous les ~5 km.
  jour.profil = profilConso(trajet.coords, trajet.vitesses);
  jour.metres = trajet.metres;
  jour.conduiteMin = trajet.secondes / 60;
  jour.peage = trajet.peage;
  // Les numéros de route (D 986, N 106) parlent plus que les noms de rues.
  const routes = [...new Set(trajet.troncons.flatMap((t) => t.routes))];
  const numeros = routes.filter((r) => /^[ADNMC] ?\d/.test(r));
  jour.routes = (numeros.length ? numeros : routes).slice(0, 6);
  jour.coucherMin = coucherSoleil(jour.date, jour.fin);
  jour.margeMin = jour.coucherMin - jour.fin.arriveeMin;
  jour.alertes = [];
  if (jour.margeMin < 0) jour.alertes.push(`Arrivée ${Math.round(-jour.margeMin)} min après le coucher du soleil.`);
  else if (jour.margeMin < 30) jour.alertes.push('Arrivée juste avant la nuit.');
  if (jour.conduiteMin > conduiteMaxH * 60 + 20)
    jour.alertes.push(`Plus de ${conduiteMaxH} h de route dans la journée.`);
  return jour;
}

/**
 * Propose un parcours. `p` : { depart, mode: 'destination'|'boucle'|'surprise', destination,
 * jours, date, heure (min), rythme, envies[], nuits[], niveauMax (1 à 3, ou rien),
 * favoris[] (identifiants des lieux gardés « pour plus tard ») }.
 */
export function planifier(pack, p) {
  const favoris = new Set(p.favoris ?? []);
  const rythme = RYTHMES[p.rythme] ?? RYTHMES.normal;
  const nbJours = p.jours <= 1 ? 1 : Math.round(p.jours);
  const boucle = p.mode !== 'destination';
  // Jusqu'où aller : selon les jours et le rythme, et pas plus loin que ce que permet le plein (mode « Avec mon plein »).
  const porteeKm = Math.min(p.porteeMaxKm ?? Infinity, rythme.conduiteH * 45 * Math.max(1, nbJours) * (boucle ? 0.35 : 0.8));
  const cible =
    p.mode === 'destination' ? p.destination : p.mode === 'boucle' && p.destination ? p.destination : choisirCoin(pack.lieux, p.depart, porteeKm, favoris) ?? p.depart;

  const loin = distanceKm(p.depart, cible) > 1.5;
  const base = loin ? itineraire(pack.graphe, p.depart, cible, { eviterPeages: Boolean(p.eviterPeages) }) : null;
  if (loin && !base) throw new Error('Pas de route trouvée vers cette destination dans la région.');
  const route = preparerRoute(base ? base.coords : [[p.depart.lon, p.depart.lat]]);
  const rayonCoin = p.mode === 'destination' ? 6 : Math.min(25, Math.max(8, porteeKm * 0.3));
  // Corridor de liberté : plus il reste de temps de route par rapport au trajet direct, plus on s'écarte.
  const budgetKm = rythme.conduiteH * 45 * Math.max(1, nbJours) * Math.min(1, p.jours);
  const largeur = Math.min(25, Math.max(7, (budgetKm - (base?.metres ?? 0) / 1000) / (4 * Math.max(1, nbJours))));
  const ctx = { route, depart: p.depart, centre: cible, rayonCoin, largeur, boucle };
  const exclus = new Set(p.exclus ?? []);
  // À l'échelle de la France, on ne regarde que le rectangle du trajet (avec la marge du couloir).
  const dansZone = rectangle([...route.coords, [cible.lon, cible.lat]], Math.max(largeur * 2, rayonCoin) + 2);

  const candidats = [];
  // Lieux remarquables du trajet qui ne répondent pas aux envies : proposés seulement en alternative.
  const autres = [];
  const favorisAPortee = [];
  const ecartesMeteo = [];
  for (const l of pack.lieux) {
    if (!dansZone(l)) continue;
    // Un lieu gardé « pour plus tard » passe avant les envies et le niveau, s'il est à portée (couloir élargi).
    if (favoris.has(l.id)) {
      const position = !exclus.has(l.id) && cleOrdre(l, { ...ctx, largeur: largeur * 2 });
      if (position) favorisAPortee.push({ ...l, ...position, favori: true, qualite: interet(l) + 3, score: 10, dureeH: dureeVisite(l) / 60 });
      continue;
    }
    // Les baignades sont des « pauses » ; elles deviennent des étapes si on en a envie.
    const etapePossible = l.categorie === 'decouvrir' || (l.activite && p.envies.includes(l.activite));
    if (!etapePossible || !l.nom || exclus.has(l.id) || distanceKm(p.depart, l) < 1) continue;
    // Une activité qu'on n'a pas choisie ne remplit pas la journée à la place des visites.
    if (ACTIVITES.has(l.activite) && !p.envies.includes(l.activite)) continue;
    if (!aMonNiveau(l, p.niveauMax)) continue;
    const position = cleOrdre(l, ctx);
    if (!position) continue;
    // Ce qui est coché est un filtre strict : seulement des lieux qui y répondent.
    if (p.envies.length && !plaitA(l, p.envies)) {
      if (interet(l) >= 1.5) autres.push({ ...l, ...position, interet: interet(l), score: interet(l) - position.ecart / largeur });
      continue;
    }
    // La météo prévue ce jour-là (si on l'a) : orage ou vent fort écartent via ferrata, escalade, canoë, rando.
    const effetMeteo = p.meteo ? ajustementMeteo(l, p.meteo(l, ajouterJours(p.date, Math.min(nbJours - 1, Math.floor(position.cle * nbJours))))) : 0;
    if (effetMeteo === -Infinity) {
      ecartesMeteo.push(l);
      continue;
    }
    // L'envie compte, mais un lieu doit aussi être remarquable (labels, notoriété, type).
    // Tes notes vérifiées sur place favorisent (ou écartent) les lieux du même type.
    const qualite = interet(l) + (plaitA(l, p.envies) ? 1.5 : 0) + (p.bonusParType?.[l.activite ?? l.type] ?? 0) + effetMeteo;
    const score = qualite - (position.ecart / largeur) * 1.5 + (Math.random() - 0.5) * 0.4;
    candidats.push({ ...l, ...position, qualite, score, dureeH: dureeVisite(l) / 60 });
  }
  const nbEtapes = p.jours < 1 ? 2 : nbJours * rythme.etapes;
  // Moins d'arrêts mais de qualité : seulement les lieux remarquables ou qui collent aux envies.
  // S'il en manque, on baisse le seuil plutôt que de laisser des journées vides.
  let retenus = [];
  for (const seuil of [3.5, 2.5, 1.5, -Infinity]) {
    retenus = candidats.filter((c) => c.qualite >= seuil);
    if (retenus.length >= nbEtapes * 2) break;
  }
  // De la variété : pas plus d'un tiers du voyage avec le même type de lieu.
  const parType = new Map();
  // Avec une seule envie (ex. via ferrata), on veut justement que des lieux de ce type.
  const maxParType = p.envies.length <= 1 ? Infinity : Math.max(2, Math.ceil(nbEtapes / 3));
  retenus = [...retenus]
    .sort((a, b) => b.score - a.score)
    .filter((c) => {
      const cle = c.activite ?? c.type;
      parType.set(cle, (parType.get(cle) ?? 0) + 1);
      return parType.get(cle) <= maxParType;
    });
  const choisis = selectionner(retenus, nbEtapes, 3);
  // Chaque activité cochée doit apparaître si elle est à portée : on remplace l'étape la plus faible.
  const avertissements = [];
  for (const envie of p.envies.filter((e) => ACTIVITES.has(e) || e === 'unesco')) {
    const repond = (c) => c.activite === envie || (envie === 'unesco' && c.unesco);
    if (choisis.some(repond)) continue;
    const meilleur = candidats.filter(repond).sort((a, b) => b.score - a.score)[0];
    if (!meilleur) {
      avertissements.push(
        ecartesMeteo.some(repond)
          ? `⛈️ Orage ou vent fort prévus : ${ENVIES[envie].toLowerCase()} déconseillée sur ce trajet à ces dates.`
          : `Pas de ${ENVIES[envie].toLowerCase()} près de ce trajet : essaie « Boucle et retour » ou une autre destination.`,
      );
      continue;
    }
    const remplacable = choisis.filter((c) => !enviesDe(c, p.envies).some((e) => ACTIVITES.has(e) || e === 'unesco'));
    if (remplacable.length >= 1 && choisis.length >= nbEtapes) choisis.splice(choisis.indexOf(remplacable.sort((a, b) => a.score - b.score)[0]), 1);
    choisis.push(meilleur);
  }
  // Les favoris à portée sont ajoutés d'office, à la place des étapes les plus faibles.
  for (const f of favorisAPortee) {
    const remplacable = choisis.filter((c) => !c.favori && !enviesDe(c, p.envies).some((e) => ACTIVITES.has(e) || e === 'unesco'));
    if (choisis.length >= nbEtapes && remplacable.length) choisis.splice(choisis.indexOf(remplacable.sort((a, b) => a.score - b.score)[0]), 1);
    choisis.push(f);
  }
  choisis.sort((a, b) => a.cle - b.cle);

  // Pas assez de lieux pour ce qui est coché : on propose (sans les imposer) la même envie
  // un peu plus loin du trajet, puis d'autres lieux remarquables sur le trajet.
  const alternatives = [];
  if (p.envies.length && choisis.length < nbEtapes) {
    const pris = new Set(choisis.map((c) => c.id));
    const dansCouloir40 = rectangle([...route.coords, [cible.lon, cible.lat]], 41);
    for (const envie of p.envies) {
      if (choisis.some((c) => enviesDe(c, [envie]).length)) continue;
      const plusLoin = pack.lieux
        // Pas les grands espaces (parc national, massif…) : il faut un endroit où s'arrêter.
        .filter((l) => dansCouloir40(l) && l.nom && !pris.has(l.id) && !exclus.has(l.id) && enviesDe(l, [envie]).length && !/parc (national|naturel)|massif|réserve/i.test(`${l.nom} ${l.type}`))
        .map((l) => ({ l, sit: situer(route, l) }))
        .filter(({ sit }) => sit.ecart > largeur && sit.ecart <= 40)
        .sort((a, b) => a.sit.ecart - b.sit.ecart)
        .slice(0, 2);
      for (const { l, sit } of plusLoin)
        alternatives.push({
          ...resume(l),
          cle: route.longueur ? sit.s / route.longueur : 0,
          pourquoi: `${ENVIES[envie]}, un peu plus loin : à ${Math.round(sit.ecart)} km de ton trajet${justifier(l, []).replace(/^Lieu remarquable sur ta route/, '')}`,
          genre: 'plus-loin',
        });
    }
    // Une idée par portion du trajet (une par jour), la meilleure de chaque portion ;
    // on complète ensuite avec les suivantes s'il en manque.
    const idees = [];
    const portions = Math.max(2, nbJours);
    for (let k = 0; k < portions; k++) {
      const meilleure = autres.filter((l) => l.cle >= k / portions && l.cle < (k + 1) / portions).sort((a, b) => b.score - a.score)[0];
      if (meilleure) idees.push(meilleure);
    }
    for (const l of [...autres].sort((a, b) => b.score - a.score)) if (idees.length < 3 && l.interet >= 2.4 && !idees.includes(l)) idees.push(l);
    for (const l of idees) {
      const raisons = justifier(l, []).replace(/^Lieu remarquable sur ta route( · )?/, '');
      alternatives.push({ ...resume(l), cle: l.cle, pourquoi: `Autre idée sur ton trajet${raisons ? ` · ${raisons}` : ''}`, genre: 'autre' });
    }
  }
  const fin = boucle ? p.depart : cible;
  const groupes = choisis.length ? decouperJours(choisis, nbJours, { depart: p.depart, fin, vitesse: 45 }) : [[]];

  const jours = [];
  const nuitsPrises = new Set();
  let debut = { nom: p.depart.nom, lat: p.depart.lat, lon: p.depart.lon };
  groupes.forEach((etapes, i) => {
    const dernier = i === groupes.length - 1;
    let finJour;
    if (dernier) finJour = { nom: fin.nom, lat: fin.lat, lon: fin.lon, genre: boucle ? 'retour' : 'arrivee' };
    else {
      finJour = p.nuits.includes('debrouille')
        ? nuitLibre(pack, etapes.at(-1) ?? debut)
        : choisirNuit(pack, etapes.at(-1) ?? debut, p.nuits, nuitsPrises) ?? { ...resume(etapes.at(-1)), genre: 'nuit' };
      nuitsPrises.add(finJour.id);
    }
    const jour = {
      date: ajouterJours(p.date, i),
      heureDepart: i === 0 ? p.heure : 9 * 60,
      eviterPeages: Boolean(p.eviterPeages),
      debut,
      etapes: etapes.map((e) => ({ ...resume(e), cle: e.cle, score: e.score, visiteMin: dureeVisite(e), pourquoi: `${e.favori ? '⭐ De ta liste « Plus tard » · ' : ''}${justifier(e, p.envies)}` })),
      fin: finJour,
    };
    recalculerJour(pack, jour, rythme.conduiteH);
    // Journée trop chargée : on retire l'étape qui rapporte le moins pour le temps qu'elle prend,
    // jusqu'à arriver au moins 30 min avant la nuit.
    while (jour.margeMin < 30 && jour.etapes.length > 1) {
      const moinsUtile = jour.etapes.reduce((a, b) => (a.score / a.visiteMin <= b.score / b.visiteMin ? a : b));
      jour.etapes.splice(jour.etapes.indexOf(moinsUtile), 1);
      recalculerJour(pack, jour, rythme.conduiteH);
    }
    jours.push(jour);
    debut = { nom: finJour.nom, lat: finJour.lat, lon: finJour.lon };
  });
  // Chaque alternative est rattachée au jour où elle tombe sur le trajet.
  for (const a of alternatives) {
    const j = groupes.findIndex((g) => g.length && g.at(-1).cle >= a.cle);
    a.jour = j < 0 ? jours.length - 1 : j;
  }
  const favorisInclus = jours.flatMap((j) => j.etapes).filter((e) => favoris.has(e.id)).length;
  const activitesEcartees = ecartesMeteo.filter((l) => l.activite && p.envies.includes(l.activite));
  if (activitesEcartees.length && !avertissements.some((a) => a.startsWith('⛈️')))
    avertissements.push(`⛈️ Météo : ${activitesEcartees.length} activité(s) écartée(s) (orage ou vent fort prévus), d'autres choisies à la place.`);
  // Pas encore validé : le compte rendu doit être relu avant le départ.
  return { params: p, cible: { nom: cible.nom, lat: cible.lat, lon: cible.lon }, jours, avertissements, alternatives, favorisInclus, valide: false, cree: Date.now() };
}

/** Totaux du parcours : distance, temps de route, péages identifiés, détours ajoutés. */
export function totaux(plan) {
  return {
    metres: plan.jours.reduce((s, j) => s + (j.metres ?? 0), 0),
    conduiteMin: plan.jours.reduce((s, j) => s + (j.conduiteMin ?? 0), 0),
    peage: plan.jours.some((j) => j.peage),
    detourMin: plan.jours.reduce((s, j) => s + j.etapes.reduce((t, e) => t + (e.detourMin ?? 0), 0), 0),
  };
}

// ---------- Quand les plans changent (tout est recalculé hors ligne) ----------

const conduiteMax = (plan) => (RYTHMES[plan.params.rythme] ?? RYTHMES.normal).conduiteH;

export function supprimerEtape(pack, plan, j, k) {
  plan.jours[j].etapes.splice(k, 1);
  recalculerJour(pack, plan.jours[j], conduiteMax(plan));
}

export function prolongerEtape(pack, plan, j, k, minutes) {
  const e = plan.jours[j].etapes[k];
  e.visiteMin = Math.max(5, e.visiteMin + minutes);
  recalculerJour(pack, plan.jours[j], conduiteMax(plan));
}

/** Ajoute un lieu au jour `j`, à l'endroit où il allonge le moins le trajet. */
export function ajouterEtape(pack, plan, j, lieu) {
  const jour = plan.jours[j];
  const points = [jour.debut, ...jour.etapes, jour.fin];
  let meilleur = 0;
  let surcout = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const s = distanceKm(points[i], lieu) + distanceKm(lieu, points[i + 1]) - distanceKm(points[i], points[i + 1]);
    if (s < surcout) {
      surcout = s;
      meilleur = i;
    }
  }
  jour.etapes.splice(meilleur, 0, { ...resume(lieu), pourquoi: justifier(lieu, plan.params.envies), visiteMin: lieu.categorie === 'decouvrir' || lieu.activite ? dureeVisite(lieu) : lieu.categorie === 'manger' ? 45 : lieu.categorie === 'carburant' ? 10 : 20 });
  recalculerJour(pack, jour, conduiteMax(plan));
}

/**
 * Dormir à `lieu` le soir du jour `j` : les étapes qui viennent après ce lieu passent
 * au lendemain (créé si besoin, pour finir le voyage).
 */
export function dormirIci(pack, plan, j, lieu) {
  const jour = plan.jours[j];
  const ancienneFin = jour.fin;
  const reste = jour.etapes.filter((e) => distanceKm(jour.debut, e) > distanceKm(jour.debut, lieu));
  jour.etapes = jour.etapes.filter((e) => !reste.includes(e));
  jour.fin = { ...resume(lieu), genre: 'nuit' };
  const nuit = { nom: lieu.nom, lat: lieu.lat, lon: lieu.lon };
  if (j === plan.jours.length - 1) {
    plan.jours.push({ date: ajouterJours(jour.date, 1), heureDepart: 9 * 60, eviterPeages: jour.eviterPeages, debut: nuit, etapes: reste, fin: ancienneFin });
  } else {
    const suivant = plan.jours[j + 1];
    suivant.debut = nuit;
    suivant.etapes = [...reste, ...suivant.etapes];
  }
  recalculerJour(pack, jour, conduiteMax(plan));
  recalculerJour(pack, plan.jours[j + 1], conduiteMax(plan));
}

/** Nouvelle destination à partir du jour `j` (depuis son départ ou la position actuelle). */
export function changerDestination(pack, plan, j, destination, depuis) {
  const restants = plan.jours.length - j;
  const nouveau = planifier(pack, {
    ...plan.params,
    depart: depuis ?? plan.jours[j].debut,
    mode: 'destination',
    destination,
    jours: Math.max(1, restants),
    date: plan.jours[j].date,
    heure: plan.jours[j].heureDepart,
  });
  plan.jours = [...plan.jours.slice(0, j), ...nouveau.jours];
  plan.cible = nouveau.cible;
}

// ---------- Compte rendu avant le départ ----------

/** Choisit `n` éléments répartis le long du trajet (triés par position). */
function repartis(liste, n) {
  if (liste.length <= n) return liste;
  return Array.from({ length: n }, (_, i) => liste[Math.floor(((i + 0.5) * liste.length) / n)]);
}

/**
 * Ce qu'il y a sur le trajet de chaque jour, en plus des étapes : eau potable, ravitaillement,
 * baignades à moins de 1,5 km de la route, et d'autres nuits possibles près de l'étape du soir.
 */
export function surLeTrajet(pack, plan) {
  const pris = new Set(plan.jours.flatMap((j) => [...j.etapes.map((e) => e.id), j.fin.id]));
  const voulues = Object.entries(NUITS)
    .filter(([cle]) => plan.params.nuits.includes(cle))
    .flatMap(([, n]) => n.types);
  return plan.jours.map((j) => {
    const coords = j.coords.length > 1 ? j.coords : [[j.debut.lon, j.debut.lat], [j.fin.lon, j.fin.lat]];
    const route = preparerRoute(coords);
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const [o, e, s, n] = [Math.min(...lons) - 0.03, Math.max(...lons) + 0.03, Math.min(...lats) - 0.03, Math.max(...lats) + 0.03];
    const proches = pack.lieux
      .filter((l) => !pris.has(l.id) && l.lon >= o && l.lon <= e && l.lat >= s && l.lat <= n)
      .map((l) => ({ l, sit: situer(route, l) }))
      .filter(({ sit }) => sit.ecart <= 1.5)
      .sort((a, b) => a.sit.s - b.sit.s)
      .map(({ l, sit }) => ({ ...resume(l), kmDepuisDepart: Math.round(sit.s), ecartKm: Math.round(sit.ecart * 10) / 10 }));
    const nuits =
      j.fin.genre === 'nuit'
        ? pack.lieux
            .filter((l) => l.categorie === 'dormir' && l.nom && l.id !== j.fin.id && distanceKm(j.fin, l) < 12)
            .sort((a, b) => (voulues.includes(b.type) - voulues.includes(a.type)) || distanceKm(j.fin, a) - distanceKm(j.fin, b))
            .slice(0, 3)
            .map((l) => ({ ...resume(l), distanceKm: Math.round(distanceKm(j.fin, l) * 10) / 10 }))
        : [];
    return {
      eau: repartis(proches.filter((l) => l.type === 'Eau potable'), 3),
      manger: repartis(proches.filter((l) => l.categorie === 'manger' && l.nom && /Épicerie|Boulangerie|ferme|Marché|Fromagerie|Supermarché/.test(l.type)), 4),
      baignade: repartis(proches.filter((l) => l.activite === 'baignade' && l.nom), 2),
      nuits,
    };
  });
}

/** Remplace l'étape du soir du jour `j` ; le lendemain part de là. */
export function changerNuit(pack, plan, j, lieu) {
  plan.jours[j].fin = { ...resume(lieu), genre: 'nuit' };
  recalculerJour(pack, plan.jours[j], conduiteMax(plan));
  if (plan.jours[j + 1]) {
    plan.jours[j + 1].debut = { nom: lieu.nom, lat: lieu.lat, lon: lieu.lon };
    recalculerJour(pack, plan.jours[j + 1], conduiteMax(plan));
  }
}

/** Retire les étapes décochées dans le compte rendu. */
export function garderEtapes(pack, plan, idsGardes) {
  for (const jour of plan.jours) {
    const avant = jour.etapes.length;
    jour.etapes = jour.etapes.filter((e) => idsGardes.has(e.id));
    if (jour.etapes.length !== avant) recalculerJour(pack, jour, conduiteMax(plan));
  }
}

/**
 * Stations-service le long de la journée `jour` (à moins de `ecartMaxKm` de la route), entre deux km
 * du trajet, qui vendent le carburant voulu (si on le sait). Les moins chères d'abord.
 */
export function stationsSurLaRoute(pack, jour, { carburant, deKm = 0, aKm = Infinity, ecartMaxKm = 2 } = {}) {
  if (!jour.coords?.length) return [];
  const route = preparerRoute(jour.coords);
  const dedans = rectangle(jour.coords, ecartMaxKm + 1);
  return pack.lieux
    .filter((l) => l.categorie === 'carburant' && dedans(l) && (!carburant || !l.carburants || l.carburants.includes(carburant)))
    .map((l) => ({ l, sit: situer(route, l) }))
    .filter(({ sit }) => sit.ecart <= ecartMaxKm && sit.s >= deKm && sit.s <= aKm)
    .map(({ l, sit }) => ({ ...resume(l), kmDansJour: Math.round(sit.s), ecartKm: Math.round(sit.ecart * 10) / 10 }))
    .sort((a, b) => (a.prix?.[carburant] ?? Infinity) - (b.prix?.[carburant] ?? Infinity) || a.ecartKm - b.ecartKm);
}

/** Pleins prévus : les stations ajoutées au parcours (plein complet), avec leur km dans la journée. */
export function pleinsPrevus(plan) {
  return plan.jours.flatMap((j, i) =>
    j.etapes.filter((e) => e.categorie === 'carburant').map((e) => ({ jour: i, km: kmDansLaJournee(j.profil ?? [], e), prevu: true })),
  );
}

const DEHORS = new Set(['viaferrata', 'escalade', 'canoe', 'baignade', 'randonnee']);
const A_L_ABRI = /musée|grotte|aven|château|abbaye|église|cathédrale|chapelle|monastère/i;
const VUE = /point de vue|sommet|belvédère|panorama|\bcol\b/i;

/**
 * Effet de la météo (`risques` de terrain/src/meteo.js) sur l'intérêt d'un lieu ce jour-là.
 * -Infinity : à éviter (orage ou vent fort pour la via ferrata, l'escalade, le canoë, la rando).
 */
export function ajustementMeteo(l, r) {
  if (!r) return 0;
  if (r.orage && ['viaferrata', 'escalade', 'canoe', 'randonnee'].includes(l.activite)) return -Infinity;
  if (r.vent && ['viaferrata', 'escalade'].includes(l.activite)) return -Infinity;
  const t = texteLieu(l);
  let effet = 0;
  if (r.pluie || r.orage) {
    if (DEHORS.has(l.activite) || VUE.test(t)) effet -= 2;
    if (A_L_ABRI.test(t)) effet += 1.5;
  }
  if (r.chaleur) {
    if (l.activite === 'baignade' || l.activite === 'canoe') effet += 1.5;
    if (l.activite === 'randonnee' && (l.niveauRang ?? 1) >= 2) effet -= 1;
  }
  if (r.vent && VUE.test(t)) effet -= 1;
  if (r.neige && (DEHORS.has(l.activite) || VUE.test(t))) effet -= 2;
  return effet;
}
