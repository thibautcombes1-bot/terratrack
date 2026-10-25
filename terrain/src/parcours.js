// Le parcours, calculé et recalculé entièrement hors ligne avec le pack de la région :
// lieux dans un couloir le long de la route, ordre sans allers-retours (server/itineraire.js),
// vrais temps de route (commun/routeur.js), nuits avant la tombée du jour.
import { distanceKm } from '../../commun/geo.js';
import { detours, itineraire, itineraireMulti } from '../../commun/routeur.js';
import { cleOrdre, decouperJours, preparerRoute, selectionner } from '../../server/itineraire.js';
import { ajouterJours } from './outils.js';
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
};
export const RYTHMES = {
  tranquille: { nom: 'Tranquille', etapes: 2, conduiteH: 2 },
  normal: { nom: 'Normal', etapes: 3, conduiteH: 3 },
  soutenu: { nom: 'Soutenu', etapes: 4, conduiteH: 4 },
};

const MOTIFS_ENVIES = {
  patrimoine: /château|ruines|archéolog|monument|église|chapelle|monastère|abbaye|pont ancien|tour|porte de ville|fort|manoir|aqueduc|musée|dolmen|menhir|histori/i,
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

/** Temps de visite conseillé (minutes). */
export function dureeVisite(l) {
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

const resume = (l) => ({ id: l.id, nom: l.nom, type: l.type, activite: l.activite, unesco: l.unesco, longueurKm: l.longueurKm, lat: l.lat, lon: l.lon, labels: l.labels, categorie: l.categorie, horaires: l.horaires, date: l.date, verifie: l.verifie, tel: l.tel, site: l.site });

/** « Surprends-moi » : le coin le plus riche en lieux remarquables à bonne distance. */
function choisirCoin(lieux, depart, porteeKm) {
  const remarquables = lieux.filter((l) => l.categorie === 'decouvrir' && l.nom && interet(l) >= 2.5);
  let meilleur = null;
  let meilleurScore = -Infinity;
  for (const l of remarquables) {
    const d = distanceKm(depart, l);
    if (d < porteeKm * 0.25 || d > porteeKm) continue;
    let score = (Math.random() - 0.5) * 2;
    for (const autre of remarquables) if (distanceKm(l, autre) < 15) score += interet(autre);
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleur = l;
    }
  }
  return meilleur && { nom: meilleur.nom, lat: meilleur.lat, lon: meilleur.lon };
}

/** Un endroit où dormir près de `pres`, du type souhaité, le plus vite atteint. */
export function choisirNuit(pack, pres, types, exclus = new Set()) {
  const voulus = Object.values(NUITS)
    .filter((_, i) => types.includes(Object.keys(NUITS)[i]))
    .flatMap((n) => n.types);
  const proches = (liste) =>
    liste
      .filter((l) => l.categorie === 'dormir' && l.nom && !exclus.has(l.id))
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
  const trajet = itineraireMulti(g, points);
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
    const direct = itineraire(g, points[k], points[k + 2]);
    e.detourMin = direct
      ? Math.max(0, (trajet.troncons[k].secondes + trajet.troncons[k + 1].secondes - direct.secondes) / 60)
      : 0;
  });
  minute += trajet.troncons.at(-1).secondes / 60;
  jour.fin.arriveeMin = minute;
  jour.coords = trajet.coords;
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
 * jours, date, heure (min), rythme, envies[], nuits[] }.
 */
export function planifier(pack, p) {
  const rythme = RYTHMES[p.rythme] ?? RYTHMES.normal;
  const nbJours = p.jours <= 1 ? 1 : Math.round(p.jours);
  const boucle = p.mode !== 'destination';
  const porteeKm = rythme.conduiteH * 45 * Math.max(1, nbJours) * (boucle ? 0.35 : 0.8);
  const cible =
    p.mode === 'destination' ? p.destination : p.mode === 'boucle' && p.destination ? p.destination : choisirCoin(pack.lieux, p.depart, porteeKm) ?? p.depart;

  const loin = distanceKm(p.depart, cible) > 1.5;
  const base = loin ? itineraire(pack.graphe, p.depart, cible) : null;
  if (loin && !base) throw new Error('Pas de route trouvée vers cette destination dans la région.');
  const route = preparerRoute(base ? base.coords : [[p.depart.lon, p.depart.lat]]);
  const rayonCoin = p.mode === 'destination' ? 6 : Math.min(25, Math.max(8, porteeKm * 0.3));
  // Corridor de liberté : plus il reste de temps de route par rapport au trajet direct, plus on s'écarte.
  const budgetKm = rythme.conduiteH * 45 * Math.max(1, nbJours) * Math.min(1, p.jours);
  const largeur = Math.min(25, Math.max(7, (budgetKm - (base?.metres ?? 0) / 1000) / (4 * Math.max(1, nbJours))));
  const ctx = { route, depart: p.depart, centre: cible, rayonCoin, largeur, boucle };
  const exclus = new Set(p.exclus ?? []);

  const candidats = [];
  for (const l of pack.lieux) {
    // Les baignades sont des « pauses » ; elles deviennent des étapes si on en a envie.
    const etapePossible = l.categorie === 'decouvrir' || (l.activite && p.envies.includes(l.activite));
    if (!etapePossible || !l.nom || exclus.has(l.id) || distanceKm(p.depart, l) < 1) continue;
    // Une activité qu'on n'a pas choisie ne remplit pas la journée à la place des visites.
    if (ACTIVITES.has(l.activite) && !p.envies.includes(l.activite)) continue;
    const position = cleOrdre(l, ctx);
    if (!position) continue;
    // L'envie compte, mais un lieu doit aussi être remarquable (labels, notoriété, type).
    // Tes notes vérifiées sur place favorisent (ou écartent) les lieux du même type.
    const qualite = interet(l) + (plaitA(l, p.envies) ? 1.5 : 0) + (p.bonusParType?.[l.activite ?? l.type] ?? 0);
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
  const maxParType = Math.max(2, Math.ceil(nbEtapes / 3));
  retenus = [...retenus]
    .sort((a, b) => b.score - a.score)
    .filter((c) => {
      const cle = c.activite ?? c.type;
      parType.set(cle, (parType.get(cle) ?? 0) + 1);
      return parType.get(cle) <= maxParType;
    });
  const choisis = selectionner(retenus, nbEtapes, 3);
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
      finJour = choisirNuit(pack, etapes.at(-1) ?? debut, p.nuits, nuitsPrises) ?? { ...resume(etapes.at(-1)), genre: 'nuit' };
      nuitsPrises.add(finJour.id);
    }
    const jour = {
      date: ajouterJours(p.date, i),
      heureDepart: i === 0 ? p.heure : 9 * 60,
      debut,
      etapes: etapes.map((e) => ({ ...resume(e), cle: e.cle, score: e.score, visiteMin: dureeVisite(e) })),
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
  return { params: p, cible: { nom: cible.nom, lat: cible.lat, lon: cible.lon }, jours, cree: Date.now() };
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
  jour.etapes.splice(meilleur, 0, { ...resume(lieu), visiteMin: lieu.categorie === 'decouvrir' ? dureeVisite(lieu) : lieu.categorie === 'manger' ? 45 : 20 });
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
    plan.jours.push({ date: ajouterJours(jour.date, 1), heureDepart: 9 * 60, debut: nuit, etapes: reste, fin: ancienneFin });
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
