// Le parcours, calculé et recalculé entièrement hors ligne avec le pack de la région :
// lieux dans un couloir le long de la route, ordre sans allers-retours (server/itineraire.js),
// vrais temps de route (commun/routeur.js), nuits avant la tombée du jour.
import { distanceKm } from '../../commun/geo.js';
import { detours, itineraire, itineraireMulti } from '../../commun/routeur.js';
import { decouperJours, preparerRoute, rectangle, situer } from '../../server/itineraire.js';
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
/** Dormir sans payer : camping et aire gratuits, bivouac, abri, cabane non gardée. */
export const GRATUITS = new Set(['Camping gratuit', 'Aire de camping-car gratuite', 'Bivouac', 'Abri (bivouac à vérifier)', 'Cabane']);
export const estGratuit = (l) => GRATUITS.has(l?.type);
/** Un vrai lit, pour les soirs où l'on en veut un : toujours au moins une option dans les propositions. */
export const CONFORT = new Set(['Hôtel', "Chambre d'hôte", 'Gîte', "Gîte d'étape"]);
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

// Calculs gardés par lieu : à l'échelle de la France, on les referait des centaines de milliers de fois.
const memoTexte = new WeakMap();
const memoInteret = new WeakMap();
const memoEnvies = new WeakMap();
const texteLieu = (l) => {
  let t = memoTexte.get(l);
  if (t === undefined) memoTexte.set(l, (t = `${l.type ?? ''} ${l.nom ?? ''} ${l.labels?.join(' ') ?? ''}`));
  return t;
};
/** Le lieu répond-il à cette envie ? (gardé par lieu et par envie) */
function repondA(l, e) {
  let parEnvie = memoEnvies.get(l);
  if (!parEnvie) memoEnvies.set(l, (parEnvie = {}));
  return (parEnvie[e] ??= l.activite === e || (e === 'unesco' && Boolean(l.unesco)) || Boolean(MOTIFS_ENVIES[e]?.test(texteLieu(l))));
}

/** Intérêt propre d'un lieu (type, labels, notoriété), indépendant de la personne. */
export function interet(l) {
  let v = memoInteret.get(l);
  if (v === undefined) memoInteret.set(l, (v = calculerInteret(l)));
  return v;
}
function calculerInteret(l) {
  let s = 0.5;
  for (const [motif, valeur] of INTERET) if (motif.test(texteLieu(l))) s = Math.max(s, valeur);
  if (l.unesco) s = Math.max(s, 4);
  if (l.activite === 'viaferrata') s = Math.max(s, 2.5);
  if (l.activite === 'canoe' || l.type === 'Grande randonnée') s = Math.max(s, 2);
  if (l.activite === 'escalade' || l.activite === 'randonnee') s = Math.max(s, 1.5);
  return s + Math.min(2, (l.notoriete ?? 0) / 8) + (l.classe ? 0.5 : 0);
}

export const plaitA = (l, envies) => envies.some((e) => repondA(l, e));

/** Les envies du début auxquelles un lieu répond. */
export const enviesDe = (l, envies) => envies.filter((e) => repondA(l, e));

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
function choisirCoin(lieux, depart, porteeKm, favoris = new Set(), beauTemps = null, envies = []) {
  // Les lieux gardés « pour plus tard » attirent le voyage vers leur coin, et ce qui répond aux
  // envies cochées compte triple : une semaine « via ferrata » part là où il y en a.
  // Seulement ceux à portée, rangés dans une grille de ~15 km : on ne compare que les voisins.
  const voulu = (l) => envies.length > 0 && l.nom && plaitA(l, envies);
  const dLat = (porteeKm + 15) / 110.57;
  const dLon = (porteeKm + 15) / (111.32 * Math.cos((depart.lat * Math.PI) / 180));
  const remarquables = lieux.filter(
    (l) =>
      Math.abs(l.lat - depart.lat) <= dLat &&
      Math.abs(l.lon - depart.lon) <= dLon &&
      (l.categorie === 'decouvrir' || favoris.has(l.id) || l.activite) &&
      (favoris.has(l.id) || voulu(l) || (l.categorie === 'decouvrir' && l.nom && interet(l) >= 2.5)) &&
      distanceKm(depart, l) <= porteeKm + 15,
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
    let repond = 0;
    for (const autre of voisins(l)) {
      if (distanceKm(l, autre) >= 15) continue;
      score += favoris.has(autre.id) ? 6 : interet(autre) * (voulu(autre) ? 3 : 1);
      if (voulu(autre)) repond++;
    }
    // Un coin sans rien de ce qu'on aime ne vaut presque rien.
    if (envies.length && !repond) score *= 0.2;
    // « Beau temps » : là où il fera beau compte plus que tout le reste.
    if (beauTemps) score *= beauTemps(l) ?? 1;
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
  const options = { eviterPeages: Boolean(jour.eviterPeages), economie: Boolean(jour.economie) };
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
  if (jour.fin.aTrouver) jour.alertes.push('Aucun hébergement trouvé près de cette fin de journée : choisis un lieu où dormir.');
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
  // Budget de route (km) : selon les jours et le rythme ; en « Avec mon plein », pas plus que le plein.
  let budgetKm = Math.min(p.kmMax ?? Infinity, rythme.conduiteH * 50 * Math.max(0.5, Math.min(p.jours, nbJours)));
  // Jusqu'où va le coin d'une boucle : l'aller-retour direct n'en prend qu'environ la moitié,
  // il reste de quoi faire des détours (sinon une semaine se résume à quelques étapes).
  const porteeKm = Math.min(p.porteeMaxKm ?? Infinity, budgetKm / 5);
  const cible =
    p.mode === 'destination' ? p.destination : p.mode === 'boucle' && p.destination ? p.destination : choisirCoin(pack.lieux, p.depart, porteeKm, favoris, p.beauTemps, p.envies) ?? p.depart;
  if (distanceKm(p.depart, cible) > 1.5 && !itineraire(pack.graphe, p.depart, cible, { eviterPeages: Boolean(p.eviterPeages) }))
    throw new Error('Pas de route trouvée vers cette destination.');
  const exclus = new Set(p.exclus ?? []);
  // La tournée de départ : départ → arrivée, ou départ → coin → retour.
  const ancres = boucle ? [p.depart, cible, p.depart] : [p.depart, cible];
  const directKm = longueurTournee(ancres);
  // Une destination (ou un coin) lointaine : le trajet direct passe avant, plus de quoi faire des étapes.
  budgetKm = Math.max(budgetKm, directKm * 1.2 + 40);
  // Où chercher : l'ellipse des lieux joignables dans le budget (départ, coin, arrivée comme foyers).
  const margeKm = Math.max(10, (budgetKm - directKm) / (2 * KM_ROUTE));
  const dansZone = rectangle(ancres.map((a) => [a.lon, a.lat]), margeKm);
  const joignable = (l) => {
    const ajout = (Math.min(...ancres.slice(1).map((a, i) => distanceKm(ancres[i], l) + distanceKm(l, a) - distanceKm(ancres[i], a)))) * KM_ROUTE;
    return directKm + ajout <= budgetKm;
  };
  // Le jour (estimé) où l'on passera près d'un lieu, pour la météo : selon sa place entre départ et arrivée.
  const dateDe = (l) => {
    const a = distanceKm(p.depart, l);
    const b = distanceKm(l, boucle ? cible : p.destination ?? cible);
    const part = boucle ? Math.min(1, a / Math.max(1, distanceKm(p.depart, cible))) / 2 : a / Math.max(1, a + b);
    return ajouterJours(p.date, Math.min(nbJours - 1, Math.floor(part * nbJours)));
  };

  const candidats = [];
  const autres = [];
  const favorisAPortee = [];
  const ecartesMeteo = [];
  for (const l of pack.lieux) {
    if (!l.nom || (l.categorie !== 'decouvrir' && !l.activite && !favoris.has(l.id)) || !dansZone(l) || exclus.has(l.id) || distanceKm(p.depart, l) < 1) continue;
    // Un lieu gardé « pour plus tard » passe avant les envies et le niveau, s'il est joignable.
    if (favoris.has(l.id)) {
      if (joignable(l)) favorisAPortee.push({ ...l, favori: true, valeur: 20, score: 10, dureeH: dureeVisite(l) / 60 });
      continue;
    }
    // Les baignades sont des « pauses » ; elles deviennent des étapes si on en a envie.
    const etapePossible = l.categorie === 'decouvrir' || (l.activite && p.envies.includes(l.activite));
    if (!etapePossible) continue;
    // Une activité qu'on n'a pas choisie ne remplit pas la journée à la place des visites.
    if (ACTIVITES.has(l.activite) && !p.envies.includes(l.activite)) continue;
    if (!aMonNiveau(l, p.niveauMax) || !joignable(l)) continue;
    // Ce qui est coché est un filtre strict : seulement des lieux qui y répondent (les autres en idées).
    if (p.envies.length && !plaitA(l, p.envies)) {
      if (interet(l) >= 2.4) autres.push(l);
      continue;
    }
    // La météo prévue ce jour-là (si on l'a) : orage ou vent fort écartent via ferrata, escalade, canoë, rando.
    const risquesDuLieu = p.meteo?.(l, dateDe(l));
    // Avec « Beau temps », la pluie retire des points à toutes les étapes, même à l'abri.
    const effetMeteo = (p.meteo ? ajustementMeteo(l, risquesDuLieu) : 0) - (p.beauTemps && (risquesDuLieu?.pluie || risquesDuLieu?.orage) ? 1.5 : 0);
    if (effetMeteo === -Infinity) {
      ecartesMeteo.push(l);
      continue;
    }
    // L'envie compte, mais un lieu doit aussi être remarquable (labels, notoriété, type).
    // Tes notes vérifiées sur place favorisent (ou écartent) les lieux du même type.
    const valeur = interet(l) + (plaitA(l, p.envies) ? 1.5 : 0) + (p.bonusParType?.[l.activite ?? l.type] ?? 0) + effetMeteo + Math.random() * 0.3;
    if (valeur > 0) candidats.push({ ...l, valeur, score: valeur, dureeH: dureeVisite(l) / 60 });
  }
  const nbEtapes = p.jours < 1 ? 2 : nbJours * rythme.etapes;
  // Moins d'arrêts mais de qualité : les meilleurs d'abord (les 400 premiers suffisent).
  candidats.sort((a, b) => b.valeur - a.valeur);
  const meilleurs = candidats.slice(0, 400);
  // De la variété : pas plus d'un tiers du voyage avec le même type de lieu (sauf une seule envie).
  const maxParType = p.envies.length <= 1 ? Infinity : Math.max(2, Math.ceil(nbEtapes / 3));

  // Chaque activité cochée doit apparaître si elle est joignable : sa meilleure étape passe en priorité.
  const avertissements = [];
  const prioritaires = [...favorisAPortee];
  for (const envie of p.envies.filter((e) => ACTIVITES.has(e) || e === 'unesco')) {
    const repond = (c) => c.activite === envie || (envie === 'unesco' && c.unesco);
    const meilleur = meilleurs.find(repond);
    if (meilleur) prioritaires.push(meilleur);
    else
      avertissements.push(
        ecartesMeteo.some(repond)
          ? `⛈️ Orage ou vent fort prévus : ${ENVIES[envie].toLowerCase()} déconseillée sur ce trajet à ces dates.`
          : `Pas de ${ENVIES[envie].toLowerCase()} joignable avec ce trajet : essaie plus de jours ou une autre destination.`,
      );
  }
  const { tournee, choisis } = composerTournee(ancres, meilleurs, { budgetKm, nbEtapes, prioritaires, maxParType });
  if (!choisis.length) avertissements.push('Aucune étape ne correspond à tes choix sur ce trajet. Modifie tes envies ou ta destination.');
  // Place de chaque étape dans la tournée (0 au départ, 1 à l'arrivée) : l'ordre de passage.
  choisis.forEach((c) => (c.cle = tournee.indexOf(c) / Math.max(1, tournee.length - 1)));
  choisis.sort((a, b) => a.cle - b.cle);

  // Pas assez de lieux pour ce qui est coché : d'autres lieux remarquables tout près de la tournée,
  // proposés (pas imposés), une idée par portion du voyage.
  const alternatives = [];
  const route = preparerRoute(tournee.map((t) => [t.lon, t.lat]));
  if (p.envies.length && choisis.length < nbEtapes) {
    const pres = autres
      .map((l) => ({ l, sit: situer(route, l) }))
      .filter(({ sit }) => sit.ecart <= 15)
      .map(({ l, sit }) => ({ ...l, cle: route.longueur ? sit.s / route.longueur : 0, valeur: interet(l) - sit.ecart / 10 }));
    const idees = [];
    const portions = Math.max(2, nbJours);
    for (let k = 0; k < portions; k++) {
      const meilleure = pres.filter((l) => l.cle >= k / portions && l.cle < (k + 1) / portions).sort((a, b) => b.valeur - a.valeur)[0];
      if (meilleure) idees.push(meilleure);
    }
    for (const l of idees) {
      const raisons = justifier(l, []).replace(/^Lieu remarquable sur ta route( · )?/, '');
      alternatives.push({ ...resume(l), cle: l.cle, pourquoi: `Autre idée sur ton trajet${raisons ? ` · ${raisons}` : ''}`, genre: 'autre' });
    }
  }
  const fin = boucle ? p.depart : cible;
  const groupes = choisis.length ? decouperJours(choisis, nbJours, { depart: p.depart, fin, vitesse: 45 }) : [[]];
  // Moins d'étapes que de jours : on garde la durée demandée avec des journées sur place (même nuit,
  // temps libre), réparties entre les journées actives plutôt que toutes d'affilée.
  const manque = nbJours - groupes.length;
  if (manque > 0) {
    const actives = groupes.length;
    const repartis = [];
    groupes.forEach((g, i) => {
      repartis.push(g);
      const apres = Math.round(((i + 1) * manque) / actives) - Math.round((i * manque) / actives);
      if (i < actives - 1) for (let k = 0; k < apres; k++) repartis.push([]);
    });
    while (repartis.length < nbJours) repartis.splice(Math.max(1, repartis.length - 1), 0, []);
    groupes.splice(0, groupes.length, ...repartis);
  }

  const jours = [];
  const nuitsPrises = new Set();
  let debut = { nom: p.depart.nom, lat: p.depart.lat, lon: p.depart.lon };
  groupes.forEach((etapes, i) => {
    const dernier = i === groupes.length - 1;
    let finJour;
    if (dernier) finJour = { nom: fin.nom, lat: fin.lat, lon: fin.lon, genre: boucle ? 'retour' : 'arrivee' };
    // Journée sur place : on reste où l'on a dormi.
    else if (!etapes.length && i > 0) finJour = { ...jours.at(-1).fin, surPlace: true };
    else {
      const pres = etapes.at(-1) ?? debut;
      // Sans visite ni hébergement, garder un point de fin sans inventer un endroit où dormir.
      finJour = p.nuits.includes('debrouille')
        ? nuitLibre(pack, pres)
        : choisirNuit(pack, pres, p.nuits, nuitsPrises) ?? { nom: pres.nom, lat: pres.lat, lon: pres.lon, type: 'Hébergement à trouver', genre: 'nuit', aTrouver: true };
      if (finJour.id) nuitsPrises.add(finJour.id);
    }
    const jour = {
      date: ajouterJours(p.date, i),
      heureDepart: i === 0 ? p.heure : 9 * 60,
      eviterPeages: Boolean(p.eviterPeages),
      economie: Boolean(p.economie),
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
    plan.jours.push({ date: ajouterJours(jour.date, 1), heureDepart: 9 * 60, eviterPeages: jour.eviterPeages, economie: jour.economie, debut: nuit, etapes: reste, fin: ancienneFin });
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

/**
 * Imprévu (route barrée, déviation, retard) : la suite de la journée `j` recalculée depuis
 * `position` à l'heure réelle `minute`. Les étapes déjà faites sont gardées à part (`jour.faites`) ;
 * celles qui ne tiennent plus avant la nuit sont mises de côté et renvoyées.
 */
export function recalerJour(pack, plan, j, position, minute, faites = new Set()) {
  const jour = plan.jours[j];
  const route = preparerRoute(jour.coords);
  const ici = situer(route, position).s;
  // Restent : les étapes pas encore faites et pas déjà dépassées sur le tracé prévu.
  const restantes = jour.etapes.filter((e) => !faites.has(e.id) && (situer(route, e).s > ici - 1 || situer(route, position).ecart > 3));
  jour.faites = [...(jour.faites ?? []), ...jour.etapes.filter((e) => !restantes.includes(e)).map((e) => ({ id: e.id, nom: e.nom }))];
  jour.debut = { nom: 'Ma position', lat: position.lat, lon: position.lon };
  jour.heureDepart = minute;
  jour.etapes = restantes;
  recalculerJour(pack, jour, conduiteMax(plan));
  const misesDeCote = [];
  while (jour.margeMin < 0 && jour.etapes.length) {
    const moinsUtile = jour.etapes.reduce((a, b) => ((a.score ?? 1) / a.visiteMin <= (b.score ?? 1) / b.visiteMin ? a : b));
    jour.etapes.splice(jour.etapes.indexOf(moinsUtile), 1);
    misesDeCote.push(moinsUtile);
    recalculerJour(pack, jour, conduiteMax(plan));
  }
  // Rien n'est perdu : ce qui est mis de côté devient une idée pour le lendemain.
  plan.alternatives = [
    ...(plan.alternatives ?? []),
    ...misesDeCote.map((e) => ({ ...e, jour: Math.min(j + 1, plan.jours.length - 1), pourquoi: `Mis de côté le jour ${j + 1} (imprévu) · ${e.pourquoi ?? ''}`, genre: 'autre' })),
  ];
  return { misesDeCote };
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
    // Toujours des nuits gratuites dans les propositions (en premier), puis celles du type choisi.
    const gratuites = j.fin.genre === 'nuit' ? nuitsGratuites(pack, j.fin, { exclus: new Set([j.fin.id]) }) : [];
    const nuits =
      j.fin.genre === 'nuit'
        ? [
            ...gratuites,
            ...pack.lieux
              .filter((l) => l.categorie === 'dormir' && l.nom && l.id !== j.fin.id && !gratuites.some((g) => g.id === l.id) && distanceKm(j.fin, l) < 12)
              .sort((a, b) => (voulues.includes(b.type) - voulues.includes(a.type)) || distanceKm(j.fin, a) - distanceKm(j.fin, b))
              .slice(0, 3)
              .map((l) => ({ ...resume(l), distanceKm: Math.round(distanceKm(j.fin, l) * 10) / 10 })),
          ]
        : [];
    // Et au moins un hôtel, gîte ou chambre d'hôte, s'il y en a un à moins de 15 km.
    if (j.fin.genre === 'nuit' && !CONFORT.has(j.fin.type) && !nuits.some((l) => CONFORT.has(l.type))) {
      const lit = pack.lieux
        .filter((l) => l.categorie === 'dormir' && l.nom && CONFORT.has(l.type) && Math.abs(l.lat - j.fin.lat) < 0.15 && Math.abs(l.lon - j.fin.lon) < 0.2)
        .map((l) => ({ l, d: distanceKm(j.fin, l) }))
        .filter((x) => x.d < 15)
        .sort((a, b) => a.d - b.d)[0];
      if (lit) nuits.push({ ...resume(lit.l), distanceKm: Math.round(lit.d * 10) / 10 });
    }
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

/** Les lieux gratuits pour dormir les plus proches de `pres` (à moins de `rayonKm`). */
export function nuitsGratuites(pack, pres, { rayonKm = 15, exclus = new Set(), nombre = 2 } = {}) {
  return pack.lieux
    .filter((l) => l.categorie === 'dormir' && estGratuit(l) && !exclus.has(l.id) && Math.abs(l.lat - pres.lat) < rayonKm / 100 && Math.abs(l.lon - pres.lon) < rayonKm / 70)
    .map((l) => ({ l, d: distanceKm(pres, l) }))
    .filter((x) => x.d < rayonKm)
    .sort((a, b) => a.d - b.d)
    .slice(0, nombre)
    .map(({ l, d }) => ({ ...resume(l), distanceKm: Math.round(d * 10) / 10 }));
}

/** Trois façons de faire le même voyage (mêmes étapes, mêmes nuits). */
export const ITINERAIRES = [
  { cle: 'rapide', nom: 'Le plus rapide', options: { eviterPeages: false, economie: false } },
  { cle: 'sans-peage', nom: 'Sans péage', options: { eviterPeages: true, economie: false } },
  { cle: 'econome', nom: 'Économe en carburant', options: { eviterPeages: true, economie: true } },
];

/** Pour chaque façon : km, temps de route, km à péage, km « équivalents carburant ». */
export function comparerItineraires(pack, plan) {
  return ITINERAIRES.map(({ cle, nom, options }) => {
    let metres = 0;
    let secondes = 0;
    let metresPeage = 0;
    let equivalents = 0;
    for (const j of plan.jours) {
      const t = itineraireMulti(pack.graphe, [j.debut, ...j.etapes, j.fin], options);
      if (!t) return null;
      metres += t.metres;
      secondes += t.secondes;
      metresPeage += t.metresPeage;
      equivalents += profilConso(t.coords, t.vitesses).at(-1)?.[1] ?? 0;
    }
    return { cle, nom, options, metres, secondes, metresPeage, equivalents };
  }).filter(Boolean);
}

/** Refait tout le voyage avec la façon choisie. */
export function choisirItineraire(pack, plan, options) {
  plan.params.eviterPeages = options.eviterPeages;
  plan.params.economie = options.economie;
  for (const j of plan.jours) {
    j.eviterPeages = options.eviterPeages;
    j.economie = options.economie;
    recalculerJour(pack, j, conduiteMax(plan));
  }
}

// ---------- La tournée : course d'orientation ----------

/** Un km à vol d'oiseau fait environ 1,3 km de route. */
const KM_ROUTE = 1.3;
/** Longueur (km de route estimés) d'une suite de points. */
function longueurTournee(points) {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += distanceKm(points[i - 1], points[i]) * KM_ROUTE;
  return km;
}

/**
 * Course d'orientation : à partir des `ancres` (départ, coin ou destination, retour), on insère
 * un à un les lieux au meilleur rapport valeur / km ajoutés, là où ils allongent le moins la
 * tournée, tant que le budget de route tient. Les `prioritaires` (favoris, une étape par activité
 * cochée) passent d'abord. Puis on démêle la tournée (2-opt) : pas de croisements ni d'allers-retours.
 */
export function composerTournee(ancres, candidats, { budgetKm, nbEtapes, prioritaires = [], espacementKm = 3, maxParType = Infinity }) {
  const tournee = [...ancres];
  let longueur = longueurTournee(tournee);
  const choisis = [];
  const parType = new Map();
  const libre = (c) => choisis.every((x) => distanceKm(x, c) >= espacementKm) && (parType.get(c.activite ?? c.type) ?? 0) < maxParType;
  const insertion = (c) => {
    let mieux = { ajout: Infinity, i: -1 };
    for (let i = 1; i < tournee.length; i++) {
      const ajout = (distanceKm(tournee[i - 1], c) + distanceKm(c, tournee[i]) - distanceKm(tournee[i - 1], tournee[i])) * KM_ROUTE;
      if (ajout < mieux.ajout) mieux = { ajout, i };
    }
    return mieux;
  };
  const inserer = (c, { ajout, i }) => {
    tournee.splice(i, 0, c);
    longueur += ajout;
    choisis.push(c);
    parType.set(c.activite ?? c.type, (parType.get(c.activite ?? c.type) ?? 0) + 1);
  };
  // Les priorités ont un peu de souplesse sur le budget (+15 %).
  for (const c of prioritaires) {
    if (choisis.length >= nbEtapes || choisis.includes(c) || !libre(c)) continue;
    const ins = insertion(c);
    if (longueur + ins.ajout <= budgetKm * 1.15) inserer(c, ins);
  }
  const restants = new Set(candidats.filter((c) => !choisis.includes(c)));
  while (choisis.length < nbEtapes) {
    let meilleur = null;
    let place = null;
    let rapport = -Infinity;
    for (const c of restants) {
      if (!libre(c)) continue;
      const ins = insertion(c);
      if (longueur + ins.ajout > budgetKm) continue;
      // +3 km : un lieu sur la route ne vaut pas l'infini ; la valeur garde le dernier mot.
      const r = c.valeur / (ins.ajout + 3);
      if (r > rapport) [rapport, meilleur, place] = [r, c, ins];
    }
    if (!meilleur) break;
    inserer(meilleur, place);
    restants.delete(meilleur);
  }
  return { tournee: deuxOpt(tournee), choisis, longueur };
}

/** 2-opt : on retourne un morceau de la tournée tant que ça la raccourcit (départ et arrivée fixes). */
function deuxOpt(t) {
  for (let ameliore = true, tours = 0; ameliore && tours < 50; tours++) {
    ameliore = false;
    for (let i = 1; i < t.length - 2; i++)
      for (let j = i + 1; j < t.length - 1; j++) {
        const avant = distanceKm(t[i - 1], t[i]) + distanceKm(t[j], t[j + 1]);
        const apres = distanceKm(t[i - 1], t[j]) + distanceKm(t[i], t[j + 1]);
        if (apres < avant - 1e-6) {
          t.splice(i, j - i + 1, ...t.slice(i, j + 1).reverse());
          ameliore = true;
        }
      }
  }
  return t;
}
