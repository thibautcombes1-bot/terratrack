// TerraTrack, appli de terrain : préparer, suivre le parcours, improviser en route — sans réseau.
import { BOUTONS, suggerer } from './boutons.js';
import { COULEURS, creerCarte } from './carte.js';
import { h, heure, duree, km, versMinutes, dateTexte, moisTexte, simplifier, memoire } from './outils.js';
import { chargerPack, etatMiseAJour, miseAJourPossible, verifierMiseAJour } from './pack.js';
import { comprendre, correspond, iaDisponible } from './ia.js';
import { MOTS, PRECISION_MAX_M, RAYON_M, effetDesNotes, noteDe, noter, passageValide, tousLesPassages, toutesLesNotes, verifierPassages } from './notes.js';
import { ajouterPhoto, commenter, photosDe, retirerPhoto, souvenirDe, tousLesSouvenirs } from './souvenirs.js';
import { archiver, basculerPlusTard, estPourPlusTard, lieuxPourPlusTard, oublierVoyage, retirerPlusTard, voyages } from './carnet.js';
import { distanceKm } from '../../commun/geo.js';
import { bilanCarburant, niveauA } from '../../commun/carburant.js';
import { preparerRoute as routeDe, situer } from '../../server/itineraire.js';
import { itineraireMulti } from '../../commun/routeur.js';
import { registerPlugin } from '@capacitor/core';
import { chargerMeteo, icone, meteoA, meteoJournee, risques, texteMeteo } from './meteo.js';
import { CARBURANTS, ecrireVehicule, euros, litresTexte, lireVehicule, prixMedian, prixStation, prixTexte, rafraichirPrix } from './carburant.js';
import {
  ENVIES,
  NUITS,
  RYTHMES,
  ajouterEtape,
  changerDestination,
  changerNuit,
  garderEtapes,
  surLeTrajet,
  choisirNuit,
  dormirIci,
  planifier,
  prolongerEtape,
  interet,
  plaitA,
  supprimerEtape,
  totaux,
  pleinsPrevus,
  stationsSurLaRoute,
} from './parcours.js';

// Le pack de la France ; « ?pack=lozere » ouvre un autre pack présent (essais sur le Mac).
const REGION = new URLSearchParams(location.search).get('pack') ?? 'france';
const $ = (s) => document.querySelector(s);

// ---------- Hors ligne ----------

const etat = $('#etat');
function afficherEtat(texte, ok = false) {
  etat.textContent = texte;
  etat.classList.toggle('ok', ok);
}
if (window.Capacitor?.isNativePlatform?.()) afficherEtat('Hors ligne ✓', true);
else if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', ({ data }) => {
    if (data.type === 'preparation') afficherEtat(`Préparation hors ligne ${Math.round((data.fait / data.total) * 100)} %`);
    if (data.type === 'pret') afficherEtat('Hors ligne ✓', true);
  });
  navigator.serviceWorker.register('./sw.js').then(async (inscription) => {
    await navigator.serviceWorker.ready;
    (navigator.serviceWorker.controller ?? inscription.active)?.postMessage('etat');
  });
  afficherEtat('Préparation hors ligne…');
} else afficherEtat('Développement (pas de hors ligne)');

// ---------- Démarrage ----------

const chargement = $('#chargement');
let pack;
try {
  pack = await chargerPack(REGION, (texte) => (chargement.firstElementChild.textContent = texte));
} catch (erreur) {
  chargement.firstElementChild.textContent = `Pack introuvable : ${erreur.message}`;
  throw erreur;
}
const carte = creerCarte($('#carte'), pack);
chargement.hidden = true;
const lieuParId = new Map(pack.lieux.map((l) => [l.id, l]));
const jourTexte = (version) => new Date(version).toLocaleDateString('fr-FR');
const ecrireLimites = (miseAJour = '') =>
  ($('#limites').textContent = `${pack.meta.nom} · données OSM du ${jourTexte(pack.meta.version)}${miseAJour} · horaires et accès à vérifier sur place · bivouac : seuls les lieux déclarés`);
ecrireLimites();

let plan = memoire.lire('plan', null);
// Lieux déjà visités : jamais reproposés, grisés sur la carte.
const dejaVus = new Map(memoire.lire('dejaVus', []).map((l) => [l.id, l]));
function marquerDejaVu(lieu) {
  dejaVus.set(lieu.id, { id: lieu.id, nom: lieu.nom, lat: lieu.lat, lon: lieu.lon, date: Date.now() });
  // Fait : il n'a plus rien à faire dans « Plus tard ».
  retirerPlusTard(lieu.id);
  memoire.ecrire('dejaVus', [...dejaVus.values()]);
  carte.afficherDejaVus([...dejaVus.values()]);
  rendreDejaVus();
}
function rendreDejaVus() {
  const zone = $('#deja-vus');
  zone.hidden = !dejaVus.size;
  zone.innerHTML = `✓ ${dejaVus.size} lieu(x) déjà visité(s), jamais reproposé(s). <button type="button" id="oublier-deja">Tout oublier</button>`;
}
let jourActif = 0;
let position = null;

// ---------- Tiroir et onglets ----------

const tiroir = $('#tiroir');
// Trois hauteurs : réduit (onglets seuls, la carte est libre), moyen, grand.
const hauteur = () => (tiroir.classList.contains('reduit') ? 0 : tiroir.classList.contains('grand') ? 2 : 1);
function regler(n) {
  tiroir.classList.toggle('reduit', n === 0);
  tiroir.classList.toggle('grand', n === 2);
  tiroir.classList.remove('compact');
}
let ongletCourant = 'parcours';
// Glisser la poignée ou les onglets : vers le bas pour libérer la carte, vers le haut pour lire.
let departY = null;
for (const zone of [$('#poignee'), document.querySelector('.onglets')]) {
  zone.addEventListener('touchstart', (ev) => (departY = ev.touches[0].clientY), { passive: true });
  zone.addEventListener('touchend', (ev) => {
    if (departY == null) return;
    const ecart = ev.changedTouches[0].clientY - departY;
    departY = null;
    if (Math.abs(ecart) > 30) regler(Math.max(0, Math.min(2, hauteur() + (ecart > 0 ? -1 : 1))));
  });
}
// Toucher la carte la libère : le tiroir descend.
carte.carte.on('dragstart', () => regler(0));
$('#poignee').addEventListener('click', () => {
  regler(hauteur() === 0 ? 1 : 0);
});
// Onglets : Carte (les lieux à cocher dessus), Parcours (Préparer, Parcours, En route), Plus tard ;
// et l'icône Historique sur la carte.
let vue = 'preparer';
function ouvrirOnglet(onglet, sousVue) {
  regler(1);
  // Sur la Carte, le tiroir reste bas : juste les cases à cocher.
  tiroir.classList.toggle('compact', onglet === 'carte');
  // Les vues de « Parcours » s'ouvrent aussi directement par leur nom.
  if (['preparer', 'route'].includes(onglet)) [onglet, sousVue] = ['parcours', onglet];
  if (sousVue) vue = sousVue;
  const nom = onglet === 'parcours' ? vue : onglet === 'carte' ? 'carte-vue' : onglet;
  ongletCourant = onglet;
  for (const b of document.querySelectorAll('[data-onglet]')) b.setAttribute('aria-selected', String(b.dataset.onglet === onglet));
  for (const b of document.querySelectorAll('[data-vue]')) b.setAttribute('aria-selected', String(b.dataset.vue === vue));
  $('#sous-onglets').hidden = onglet !== 'parcours';
  for (const id of PANNEAUX) $(`#${id}`).hidden = id !== nom;
  document.querySelector('.contenu').scrollTop = 0;
  // Les repères de la carte suivent l'onglet : favoris, ou suggestions d'en route.
  if (nom === 'route') {
    preparerRoute();
    carte.afficherSuggestions(dernieresSuggestions, dernierBouton ?? 'decouvrir');
  } else if (nom !== 'plus-tard') carte.afficherSuggestions([], 'decouvrir');
  if (nom === 'parcours') {
    carte.afficherParcours(plan, -1);
    majInfoPlusTard();
  }
  if (nom === 'preparer') majInfoPlusTard();
  if (nom === 'historique') rendreHistorique();
  if (nom === 'plus-tard') rendrePlusTard();
  if (nom === 'carte-vue') rendreCouches();
  else carte.afficherDecouverte([]);
}
const PANNEAUX = ['preparer', 'parcours', 'route', 'carte-vue', 'historique', 'plus-tard'];
const ongletOuvert = () => PANNEAUX.find((id) => !$(`#${id}`).hidden);
// Toucher une seconde fois : l'icône Historique ramène au parcours, « Carte » baisse le tiroir.
for (const b of document.querySelectorAll('[data-onglet]'))
  b.addEventListener('click', () => {
    const deja = b.getAttribute('aria-selected') === 'true';
    if (deja && b.dataset.onglet === 'historique') return ouvrirOnglet('parcours');
    if (deja && b.dataset.onglet === 'carte' && hauteur() !== 0) return regler(0);
    ouvrirOnglet(b.dataset.onglet);
  });
for (const b of document.querySelectorAll('[data-vue]')) b.addEventListener('click', () => ouvrirOnglet('parcours', b.dataset.vue));

// ---------- Préparer ----------

const form = $('#preparer');
const brouillon = memoire.lire('brouillon', {});
const GROUPES = {
  mode: { options: { destination: 'Une destination', boucle: 'Boucle et retour', surprise: 'Surprends-moi', plein: '⛽ Avec mon plein' }, unique: true, defaut: ['destination'] },
  jours: { options: [['0.5', '½ journée'], ['1', '1 jour'], ['2', 'Week-end'], ['3', '3 jours'], ['5', '5 jours'], ['7', 'Une semaine']], unique: true, defaut: ['2'] },
  rythme: { options: Object.fromEntries(Object.entries(RYTHMES).map(([k, r]) => [k, r.nom])), unique: true, defaut: ['normal'] },
  peages: { options: [['autorises', 'Péages autorisés'], ['eviter', 'Éviter les péages']], unique: true, defaut: ['autorises'] },
  envies: { options: ENVIES, unique: false, defaut: ['patrimoine', 'panoramas', 'nature'] },
  niveau: { options: [['tous', 'Tous niveaux'], ['1', 'Facile'], ['2', 'Jusqu’à moyen'], ['3', 'Jusqu’à difficile']], unique: true, defaut: ['tous'] },
  nuits: { options: Object.fromEntries(Object.entries(NUITS).map(([k, n]) => [k, n.nom])), unique: false, defaut: ['camping', 'gite'] },
  // Réglages gardés d'un voyage à l'autre (pas dans le brouillon) : véhicule et appli de guidage.
  carburant: { options: CARBURANTS, unique: true, defaut: [lireVehicule().carburant], reglage: true },
  guidage: { options: [['organic', 'Organic Maps'], ['waze', 'Waze'], ['plans', 'Plans']], unique: true, defaut: [memoire.lire('guidage', 'organic')], reglage: true },
};
for (const [nom, g] of Object.entries(GROUPES)) {
  const zone = form.querySelector(`[data-groupe="${nom}"]`);
  const choisis = brouillon[nom] != null && !g.reglage ? [].concat(brouillon[nom]).map(String) : g.defaut;
  // Les clés numériques d'un objet se rangent d'elles-mêmes : un tableau garde l'ordre voulu.
  zone.innerHTML = (Array.isArray(g.options) ? g.options : Object.entries(g.options))
    .map(([v, t]) => `<button type="button" class="puce" data-valeur="${v}" aria-pressed="${choisis.includes(v)}">${h(t)}</button>`)
    .join('');
  zone.addEventListener('click', (ev) => {
    const puce = ev.target.closest('.puce');
    if (!puce) return;
    if (g.unique) for (const p of zone.children) p.setAttribute('aria-pressed', String(p === puce));
    else puce.setAttribute('aria-pressed', String(puce.getAttribute('aria-pressed') !== 'true'));
    // « Je me débrouille » exclut les hébergements, et inversement.
    if (nom === 'nuits' && puce.getAttribute('aria-pressed') === 'true')
      for (const p of zone.children)
        if (p !== puce && (p.dataset.valeur === 'debrouille' || puce.dataset.valeur === 'debrouille')) p.setAttribute('aria-pressed', 'false');
    majMode();
    if (g.reglage) majReglages();
  });
}
const choix = (nom) => [...form.querySelectorAll(`[data-groupe="${nom}"] [aria-pressed="true"]`)].map((p) => p.dataset.valeur);

// Véhicule : litres au départ, consommation, prix payé, réservoir. Gardés sur le téléphone.
const CHAMPS_VEHICULE = ['litresDepart', 'conso', 'prix', 'reservoir', 'budget'];
for (const nom of CHAMPS_VEHICULE) form.elements[nom].value = lireVehicule()[nom] ?? '';
function majReglages() {
  const v = lireVehicule();
  v.carburant = choix('carburant')[0] ?? v.carburant;
  for (const nom of CHAMPS_VEHICULE) {
    const x = Number.parseFloat(String(form.elements[nom].value).replace(',', '.'));
    v[nom] = Number.isFinite(x) && x > 0 ? x : nom === 'prix' || nom === 'budget' ? null : v[nom];
  }
  if (v.litresDepart > v.reservoir) {
    v.reservoir = v.litresDepart;
    form.elements.reservoir.value = v.reservoir;
  }
  ecrireVehicule(v);
  memoire.ecrire('guidage', choix('guidage')[0] ?? 'organic');
  if (plan) rendreParcours();
  majPortee();
}
form.addEventListener('input', (ev) => {
  if (CHAMPS_VEHICULE.includes(ev.target.name)) majReglages();
});
/** Le véhicule pour les calculs : sans prix saisi, le prix médian du carburant dans le pack. */
function vehiculeCalcul() {
  const v = lireVehicule();
  return { ...v, prix: v.prix ?? prixMedian(pack.lieux, v.carburant), prixEstime: !v.prix };
}
function majMode() {
  const mode = choix('mode')[0];
  $('#champ-destination').hidden = mode === 'surprise' || mode === 'plein';
  $('#champ-destination').firstChild.textContent = mode === 'boucle' ? 'Autour de quel endroit ?' : 'Où vas-tu ?';
  majPortee();
}

/**
 * Mode « Avec mon plein » : les km possibles sans entamer la réserve (~5 % de plus qu'au calcul
 * moyen, pour la route réelle), et le rayon d'une boucle aller-retour avec ses détours.
 */
function porteePlein() {
  const v = vehiculeCalcul();
  const reserveL = Math.max(v.reservoir * 0.1, (v.reserveKm * v.conso) / 100);
  const kmUtiles = Math.max(0, ((Math.min(v.litresDepart, v.reservoir) - reserveL) / v.conso) * 100) / 1.05;
  return { kmUtiles, rayon: kmUtiles / 2.6, v };
}
function majPortee() {
  const info = $('#info-plein');
  const enPlein = choix('mode')[0] === 'plein';
  info.hidden = !enPlein;
  if (!enPlein) return carte.afficherPortee(null);
  const { kmUtiles, rayon, v } = porteePlein();
  info.textContent = `⛽ Avec ${litresTexte(v.litresDepart)} de ${CARBURANTS[v.carburant].toLowerCase()} (${String(v.conso).replace('.', ',')} L/100) : ~${Math.round(kmUtiles)} km sans entamer la réserve. Je te propose une boucle avec retour, jusqu’à ~${Math.round(rayon)} km de ton départ (le cercle sur la carte), selon les jours choisis.`;
  if (choisiesLieux.depart) {
    carte.afficherPortee(choisiesLieux.depart, rayon);
    carte.cadrer(
      [
        [choisiesLieux.depart.lon - rayon / 75, choisiesLieux.depart.lat - rayon / 111],
        [choisiesLieux.depart.lon + rayon / 75, choisiesLieux.depart.lat + rayon / 111],
      ],
      30,
    );
  }
}
/** Remet dans « Préparer » les réponses d'un voyage passé, pour le refaire à une nouvelle date. */
function remplirPreparer(p) {
  const valeurs = {
    mode: [p.mode],
    jours: [String(p.jours)],
    rythme: [p.rythme],
    peages: [p.eviterPeages ? 'eviter' : 'autorises'],
    envies: p.envies,
    nuits: p.nuits,
    niveau: [p.niveauMax ? String(p.niveauMax) : 'tous'],
  };
  for (const [nom, v] of Object.entries(valeurs))
    for (const puce of form.querySelectorAll(`[data-groupe="${nom}"] .puce`)) puce.setAttribute('aria-pressed', String(v.map(String).includes(puce.dataset.valeur)));
  choisiesLieux.depart = p.depart;
  choisiesLieux.destination = p.destination;
  form.elements.depart.value = p.depart?.nom ?? '';
  form.elements.destination.value = p.destination?.nom ?? '';
  form.elements.date.value = new Date().toISOString().slice(0, 10);
  majMode();
}

/** Recherche de communes du pack, sans réseau. */
const communes = [...pack.communes].sort(
  (a, b) => ['city', 'town', 'village', 'hamlet'].indexOf(a.type) - ['city', 'town', 'village', 'hamlet'].indexOf(b.type),
);
const choisiesLieux = { depart: brouillon.depart ?? null, destination: brouillon.destination ?? null };
function autocompletion(nom) {
  const champ = form.elements[nom];
  const liste = champ.nextElementSibling;
  champ.value = choisiesLieux[nom]?.nom ?? '';
  champ.addEventListener('input', () => {
    choisiesLieux[nom] = null;
    const q = simplifier(champ.value.trim());
    if (q.length < 2) return (liste.hidden = true);
    const trouves = communes.filter((c) => simplifier(c.nom).startsWith(q)).concat(communes.filter((c) => !simplifier(c.nom).startsWith(q) && simplifier(c.nom).includes(q))).slice(0, 8);
    liste.innerHTML = trouves.map((c, i) => `<li data-i="${i}">${h(c.nom)}</li>`).join('');
    liste.hidden = !trouves.length;
    liste.onclick = (ev) => {
      const c = trouves[ev.target.dataset.i];
      if (!c) return;
      choisiesLieux[nom] = c;
      champ.value = c.nom;
      liste.hidden = true;
      if (nom === 'depart') majPortee();
    };
  });
}
autocompletion('depart');
autocompletion('destination');
form.elements.date.value = brouillon.date ?? new Date().toISOString().slice(0, 10);
if (brouillon.heure) form.elements.heure.value = brouillon.heure;
majMode();

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const erreur = $('#erreur-preparer');
  const mode = choix('mode')[0];
  const p = {
    depart: choisiesLieux.depart,
    destination: mode === 'surprise' || mode === 'plein' ? null : choisiesLieux.destination,
    mode,
    jours: Number(choix('jours')[0]),
    date: form.elements.date.value,
    heure: versMinutes(form.elements.heure.value || '09:30'),
    rythme: choix('rythme')[0],
    envies: choix('envies'),
    nuits: choix('nuits'),
    eviterPeages: choix('peages')[0] === 'eviter',
    niveauMax: choix('niveau')[0] === 'tous' ? null : Number(choix('niveau')[0]),
    favoris: lieuxPourPlusTard().map((l) => l.id),
    exclus: [...dejaVus.keys(), ...effetDesNotes().ecartes],
    bonusParType: effetDesNotes().bonusParType,
  };
  memoire.ecrire('brouillon', { ...p, mode, jours: String(p.jours), heure: form.elements.heure.value, niveau: choix('niveau')[0] });
  if (!p.depart) return montrerErreur(erreur, 'Choisis ta commune de départ dans la liste.');
  if (mode === 'destination' && !p.destination) return montrerErreur(erreur, 'Choisis ta destination dans la liste.');
  erreur.hidden = true;
  // Un voyage fait (premier jour avant aujourd'hui) est rangé dans l'historique avant d'être remplacé ;
  // refaire le parcours le jour même, avant de partir, ne remplit pas l'historique.
  if (plan?.valide && plan.jours[0].date < new Date().toISOString().slice(0, 10)) archiver(plan);
  trace = [];
  memoire.ecrire('trace', trace);
  carte.afficherTrace(trace);
  const calculer = (extra = {}) => {
    if (mode !== 'plein') return planifier(pack, { ...p, ...extra });
    let rayon = porteePlein().rayon;
    let essai;
    for (let n = 0; n < 5; n++) {
      essai = planifier(pack, { ...p, ...extra, porteeMaxKm: rayon });
      if (!bilanCarburant(essai.jours, vehiculeCalcul(), []).alerte) break;
      rayon *= 0.75;
    }
    return essai;
  };
  try {
    plan = calculer();
  } catch (e) {
    return montrerErreur(erreur, e.message);
  }
  // Avec du réseau : la météo du trajet (16 jours au plus), puis le parcours refait en en tenant compte.
  const bouton = form.querySelector('button[type=submit]');
  bouton.disabled = true;
  bouton.textContent = 'Météo du trajet…';
  if (await chargerMeteo(pointsMeteo(plan)).catch(() => false) || plan.jours.some((j) => meteoA(j.fin.lat, j.fin.lon, j.date))) {
    try {
      plan = calculer({ meteo: (l, date) => risques(meteoJournee(l.lat, l.lon, date)) });
    } catch {
      // On garde le parcours sans météo.
    }
  }
  bouton.disabled = false;
  bouton.textContent = 'Proposer un parcours';
  carte.afficherPortee(null);
  jourActif = 0;
  enregistrer();
  ouvrirOnglet('parcours', 'parcours');
  carte.cadrer(plan.jours.flatMap((j) => j.coords));
});
function montrerErreur(zone, texte) {
  zone.textContent = texte;
  zone.hidden = false;
}

// ---------- Le parcours ----------

function enregistrer() {
  memoire.ecrire('plan', plan);
  rendreParcours();
  carte.afficherParcours(plan, -1);
}

function rendreParcours() {
  const zone = $('#parcours');
  if (!plan) {
    zone.innerHTML = '<p class="info">Aucun parcours pour l’instant : réponds aux questions de « Préparer ».</p>';
    return;
  }
  if (plan.valide === false) return rendreCompteRendu(zone);
  passeesAffichage = etapesFaites();
  const t = totaux(plan);
  zone.innerHTML = `
    <p class="info valide">✓ Parcours validé${plan.valideLe ? ` le ${new Date(plan.valideLe).toLocaleDateString('fr-FR')}` : ''} · <button type="button" class="lien" data-action="revoir">Revoir le compte rendu</button></p>
    <div class="totaux">
      <div><b>${km(t.metres)}</b>distance</div>
      <div><b>${duree(t.conduiteMin)}</b>de route</div>
      <div><b>${t.peage ? 'oui' : plan.params.eviterPeages ? 'évités' : 'aucun'}</b>péage</div>
      <div><b>+${duree(t.detourMin)}</b>de détours</div>
    </div>
    ${blocCarburant()}
    <p class="info">Ce qui te plaît : ${h(plan.params.envies.map((e) => ENVIES[e]).join(', ') || 'rien de coché')}</p>
    ${plan.favorisInclus ? `<p class="info">⭐ ${plan.favorisInclus} lieu(x) de ta liste « Plus tard » inclus.</p>` : ''}
    ${(plan.avertissements ?? []).map((a) => `<p class="alerte">⚠️ ${h(a)}</p>`).join('')}
    ${
      plan.alternatives?.length
        ? `<div class="jour"><div class="jour-tete"><strong>Pas assez de lieux pour ce que tu as coché</strong><small>D’autres idées, à toi de choisir :</small></div>${plan.alternatives
            .map(
              (a, i) => `
          <div class="etape">
            <div class="h">${a.genre === 'plus-loin' ? '↗' : '✦'}</div>
            <div>
              <div class="nom">${h(a.nom)}</div>
              <small class="pourquoi">${h(a.pourquoi)}</small>
              <small>${h(a.type ?? '')}</small>
              <div class="actions"><button data-action="alternative" data-i="${i}">+ Ajouter au jour ${a.jour + 1}</button>${boutonMenu(`alternative:${i}`, a, () => [allerA(a), pourMoi(a)])}</div>
            </div>
          </div>`,
            )
            .join('')}</div>`
        : ''
    }
    ${plan.jours.map(rendreJour).join('')}
    <div class="titre">Les plans changent ?</div>
    <label class="champ">Nouvelle destination
      <div class="recherche"><input id="nouvelle-destination" placeholder="Commune" /><ul class="propositions" hidden></ul></div>
    </label>
    <button type="button" class="secondaire" id="changer-destination">Recalculer à partir du jour ${jourActif + 1}</button>
    <div class="deux">
      <button type="button" class="secondaire" data-action="terminer">🏁 Voyage terminé</button>
      <button type="button" class="secondaire" data-action="nouveau">✎ Nouveau parcours</button>
    </div>`;
  brancherNouvelleDestination();
}

// ---------- Météo sur le parcours ----------

/** Points où demander la météo : départs, étapes, nuits, et la route tous les ~25 km. */
function pointsMeteo(p) {
  return p.jours.flatMap((j) => {
    const pas = Math.max(1, Math.round(j.coords.length / Math.max(1, j.metres / 25000)));
    return [j.debut, ...j.etapes, j.fin, ...j.coords.filter((_, i) => i % pas === 0).map(([lon, lat]) => ({ lat, lon }))];
  });
}
/** « ⛅ 22° · pluie 40 % » à l'heure d'arrivée, et un mot si ça change le programme. */
function meteoEtape(l, date, minute) {
  const m = meteoA(l.lat, l.lon, date, minute);
  if (!m) return '';
  const r = risques(m);
  const alerte = r.orage ? ' · ⚠️ orage' : r.vent ? ' · ⚠️ vent fort' : r.neige ? ' · ⚠️ neige' : r.chaleur ? ' · forte chaleur' : '';
  return `<small class="meteo">${h(texteMeteo(m))}${alerte}</small>`;
}

// ---------- Carburant : autonomie, coût, plein conseillé (la station la moins chère) ----------

let stationsConseillees = [];
const moyennePrix = (stations, carburant) => {
  const prix = stations.map((s) => s.prix?.[carburant]).filter(Boolean);
  return prix.length ? prix.reduce((a, b) => a + b, 0) / prix.length : 0;
};
/** Commune (village ou ville) la plus proche d'un point, pour dire « vers Millau ». */
function communeProche(p) {
  let meilleure = null;
  let dMin = 20;
  for (const c of pack.communes) {
    if (Math.abs(c.lat - p.lat) > 0.2 || Math.abs(c.lon - p.lon) > 0.3) continue;
    const d = distanceKm(c, p);
    if (d < dMin) [dMin, meilleure] = [d, c];
  }
  return meilleure?.nom;
}
function ligneStation(s, v, moyenne, attributs) {
  const p = s.prix?.[v.carburant];
  // Un plein ordinaire : environ les trois quarts du réservoir.
  const gain = p && moyenne ? (moyenne - p) * v.reservoir * 0.75 : 0;
  return `
    <div class="station">
      <b>${h(s.nom || 'Station')}</b>${s.h24 ? ' · 24/24' : ''}
      <small>${p ? `<span class="prix">${prixStation(s, v.carburant)}</span>${gain >= 1 ? ` · ~${euros(gain)} de moins qu’au prix moyen du coin` : ''}` : 'prix inconnu'} · km ${s.kmDansJour} du jour${s.ecartKm >= 0.3 ? `, à ${String(s.ecartKm).replace('.', ',')} km de la route` : ''}</small>
      <div class="actions"><button type="button" ${attributs}>+ Ajouter ce plein</button>${boutonGuidage(s)}</div>
    </div>`;
}
/** Budget carburant : le coût estimé du voyage face au budget fixé dans Préparer. */
function ligneBudget(v, estime, depense) {
  if (!v.budget) return '';
  const ecart = v.budget - estime;
  return ecart >= 0
    ? `<small class="marge-ok">💶 Budget ${euros(v.budget)} : estimé ~${euros(estime)}, il reste ~${euros(ecart)} de marge${depense ? ` (déjà payé ${euros(depense)})` : ''}.</small>`
    : `<p class="alerte">💶 Budget ${euros(v.budget)} : estimé ~${euros(estime)}, soit ~${euros(-ecart)} de plus. Fais le plein aux stations les moins chères, ou évite l’autoroute (péages et consommation).</p>`;
}
function blocCarburant() {
  if (!plan?.jours?.[0]?.profil) return '';
  const v = vehiculeCalcul();
  const b = bilanCarburant(plan.jours, v, [...pleinsPrevus(plan), ...(plan.pleins ?? [])]);
  stationsConseillees = [];
  let suite;
  if (b.alerte) {
    const jour = b.alerte.jour;
    // Les stations des 120 km avant la réserve, les moins chères d'abord.
    const stations = stationsSurLaRoute(pack, plan.jours[jour], { carburant: v.carburant, deKm: Math.max(0, b.alerte.km - 120), aKm: b.alerte.km + 5 });
    stationsConseillees = stations.slice(0, 3);
    const vers = communeProche(b.alerte);
    suite = `<p class="alerte">⚠️ Réserve atteinte le jour ${jour + 1}${vers ? ` vers ${h(vers)}` : ''} (km ${b.alerte.km}) : fais le plein avant.</p>${
      stationsConseillees.length
        ? stationsConseillees.map((s, k) => ligneStation(s, v, moyennePrix(stations, v.carburant), `data-action="plein-station" data-j="${jour}" data-i="${k}"`)).join('')
        : '<small>Aucune station connue sur ce morceau de route : fais le plein avant de partir.</small>'
    }`;
    // Prix du jour en ligne (si réseau) : on redessine une fois s'ils ont changé.
    const objets = [...stationsConseillees, ...stationsConseillees.map((s) => lieuParId.get(s.id)).filter(Boolean)];
    rafraichirPrix(objets).then((change) => change && ongletOuvert() === 'parcours' && rendreParcours());
  } else suite = `<small class="marge-ok">✓ Pas besoin de faire le plein : il restera ~${litresTexte(b.niveauFin)} à l’arrivée (~${Math.round(b.autonomieKm)} km).</small>`;
  const payes = (plan.pleins ?? []).filter((p) => p.litres && p.prix);
  const depense = payes.reduce((t, p) => t + p.litres * p.prix, 0);
  return `
    <div class="encadre">
      <div class="nom">⛽ Carburant · ${h(CARBURANTS[v.carburant])}</div>
      <small>Au départ ${litresTexte(v.litresDepart)} · ${String(v.conso).replace('.', ',')} L/100 km → ~${Math.round(b.autonomieDepartKm)} km d’autonomie</small>
      <small>Le voyage : ${Math.round(b.km)} km → ~${litresTexte(b.litres)} selon la route (autoroute +20 %, lacets +15 %) · ~${euros(b.cout)} à ${prixTexte(v.prix)}${v.prixEstime ? ' (prix moyen, mets le tien dans Préparer)' : ''}</small>
      ${payes.length ? `<small>Payé en route : ${euros(depense)} (${payes.length} plein${payes.length > 1 ? 's' : ''})</small>` : ''}
      ${ligneBudget(v, b.cout, depense)}
      ${suite}
    </div>`;
}

// ---------- Compte rendu à valider avant le départ ----------

let compteRendu = [];
const caseACocher = (attributs, coche, contenu) =>
  `<label class="coche"><input type="checkbox" ${attributs} ${coche ? 'checked' : ''} /><span>${contenu}</span></label>`;

function rendreCompteRendu(zone) {
  compteRendu = surLeTrajet(pack, plan);
  const t = totaux(plan);
  const ligneExtra = (l, j, icone) =>
    caseACocher(
      `data-cr="extra" data-j="${j}" data-id="${h(l.id)}"`,
      false,
      `${icone} <b>${h(l.nom || l.type)}</b> <small>${h(l.nom ? l.type : '')} · au km ${l.kmDepuisDepart}${l.ecartKm >= 0.3 ? `, à ${l.ecartKm} km de la route` : ''}${l.horaires ? ` · ${h(l.horaires)}` : ''}</small>`,
    );
  zone.innerHTML = `
    <h3 class="titre-cr">Compte rendu avant le départ</h3>
    <p class="info">Relis tout : décoche ce que tu ne veux pas, coche ce qui t’intéresse en plus, choisis tes nuits, puis valide.</p>
    <div class="totaux">
      <div><b>${km(t.metres)}</b>distance</div>
      <div><b>${duree(t.conduiteMin)}</b>de route</div>
      <div><b>${t.peage ? 'oui' : plan.params.eviterPeages ? 'évités' : 'aucun'}</b>péage</div>
      <div><b>+${duree(t.detourMin)}</b>de détours</div>
    </div>
    ${blocCarburant()}
    <p class="info">Ce qui te plaît : ${h(plan.params.envies.map((e) => ENVIES[e]).join(', ') || 'rien de coché')}</p>
    ${plan.favorisInclus ? `<p class="info">⭐ ${plan.favorisInclus} lieu(x) de ta liste « Plus tard » inclus.</p>` : ''}
    ${plan.params.mode === 'plein' ? '<p class="info">⛽ Boucle choisie pour ton plein : retour au départ sans refaire le plein.</p>' : ''}
    ${(plan.avertissements ?? []).map((a) => `<p class="alerte">⚠️ ${h(a)}</p>`).join('')}
    ${plan.jours
      .map((j, i) => {
        const c = compteRendu[i];
        const nuits = j.fin.genre === 'nuit' ? [j.fin, ...c.nuits] : [];
        return `
      <article class="jour">
        <div class="jour-tete">
          <strong>Jour ${i + 1} · ${dateTexte(j.date)}</strong>
          <small>${h(j.debut.nom)} → ${h(j.fin.nom)} · ${km(j.metres)} · ${duree(j.conduiteMin)} de route${j.peage ? ' · péage' : ''} · arrivée ${heure(j.fin.arriveeMin)} (coucher ${heure(j.coucherMin)})</small>
        </div>
        <div class="bloc-cr">
          <div class="titre">Étapes proposées</div>
          ${j.etapes.length ? j.etapes.map((e) => caseACocher(`data-cr="etape" data-id="${h(e.id)}"`, true, `<b>${heure(e.arriveeMin)} · ${h(e.nom)}</b><small class="pourquoi">${h(e.pourquoi ?? '')}</small><small>${h(e.type)} · visite ${duree(e.visiteMin)}${e.detourMin >= 1 ? ` · détour +${duree(e.detourMin)}` : ''}</small>${meteoEtape(e, j.date, e.arriveeMin)}`)).join('') : '<p class="info">Aucune étape ce jour-là.</p>'}
          ${
            nuits.length
              ? `<div class="titre">Où dormir le soir</div>${nuits
                  .map(
                    (l, k) =>
                      `<label class="coche"><input type="radio" name="nuit-${i}" data-cr="nuit" data-j="${i}" data-id="${h(l.id)}" ${k === 0 ? 'checked' : ''} /><span><b>${h(l.nom)}</b> <small>${h(l.type ?? '')}${k === 0 ? ' · proposé' : ` · à ${l.distanceKm} km`}</small></span></label>`,
                  )
                  .join('')}`
              : ''
          }
          ${c.eau.length || c.manger.length || c.baignade.length ? '<div class="titre">Aussi sur le trajet (à ajouter si tu veux)</div>' : ''}
          ${c.eau.map((l) => ligneExtra(l, i, '💧')).join('')}
          ${c.manger.map((l) => ligneExtra(l, i, '🥖')).join('')}
          ${c.baignade.map((l) => ligneExtra(l, i, '🏊')).join('')}
        </div>
        ${j.alertes.map((a) => `<p class="alerte">⚠️ ${h(a)}</p>`).join('')}
      </article>`;
      })
      .join('')}
    ${
      plan.alternatives?.length
        ? `<article class="jour"><div class="jour-tete"><strong>Autres idées</strong><small>Pas assez de lieux pour ce que tu as coché : à ajouter si tu veux.</small></div><div class="bloc-cr">${plan.alternatives
            .map((a, k) => caseACocher(`data-cr="alternative" data-i="${k}"`, false, `<b>${h(a.nom)}</b> <small>jour ${a.jour + 1}</small><small class="pourquoi">${h(a.pourquoi)}</small>`))
            .join('')}</div></article>`
        : ''
    }
    <button type="button" class="principal" data-action="valider">✓ Valider le parcours</button>
    <button type="button" class="secondaire large" data-action="modifier-choix">✎ Modifier mes choix</button>`;
}

/** Applique les choix du compte rendu, recalcule, et marque le parcours comme validé. */
function validerCompteRendu() {
  const zone = $('#parcours');
  const gardes = new Set([...zone.querySelectorAll('[data-cr="etape"]:checked')].map((c) => c.dataset.id));
  garderEtapes(pack, plan, gardes);
  for (const radio of zone.querySelectorAll('[data-cr="nuit"]:checked')) {
    const j = Number(radio.dataset.j);
    if (radio.dataset.id === plan.jours[j].fin.id) continue;
    const lieu = compteRendu[j].nuits.find((l) => l.id === radio.dataset.id);
    if (lieu) changerNuit(pack, plan, j, lieu);
  }
  for (const c of zone.querySelectorAll('[data-cr="extra"]:checked')) {
    const j = Number(c.dataset.j);
    const r = compteRendu[j];
    const lieu = [...r.eau, ...r.manger, ...r.baignade].find((l) => l.id === c.dataset.id);
    if (lieu) ajouterEtape(pack, plan, j, lieu);
  }
  const alternatives = [...zone.querySelectorAll('[data-cr="alternative"]:checked')].map((c) => plan.alternatives[Number(c.dataset.i)]);
  for (const a of alternatives) ajouterEtape(pack, plan, a.jour, a);
  plan.alternatives = (plan.alternatives ?? []).filter((a) => !alternatives.includes(a));
  plan.valide = true;
  plan.valideLe = Date.now();
  enregistrer();
  afficherToast('Parcours validé. Bonne route !');
  document.querySelector('.contenu').scrollTop = 0;
}

let passeesAffichage = new Set();
function rendreJour(j, i) {
  const etapes = j.etapes
    .map(
      (e, k) => `
      <div class="etape">
        <div class="h">${heure(e.arriveeMin)}</div>
        <div>
          <div class="nom">${passeesAffichage.has(e.id) ? '✓ ' : ''}${h(e.nom)}</div>
          ${e.pourquoi ? `<small class="pourquoi">${h(e.pourquoi)}</small>` : ''}
          <small>${h(e.type)} · visite ${duree(e.visiteMin)}${e.detourMin >= 1 ? ` · détour +${duree(e.detourMin)}` : ' · sur la route'}</small>
          ${meteoEtape(e, j.date, e.arriveeMin)}
          ${texteNote(e.id)}${texteSouvenir(e.id)}
          <div class="actions">${boutonGuidage(e)}${boutonMenu(`etape:${i}:${k}`, e, () => menuEtape(i, k))}</div>
        </div>
      </div>`,
    )
    .join('');
  const fin = j.fin;
  const soir = fin.genre === 'nuit' ? '🌙 Nuit' : fin.genre === 'retour' ? '🏠 Retour' : '🏁 Arrivée';
  const marge =
    j.margeMin >= 0
      ? `<span class="marge-ok">${duree(j.margeMin)} avant la nuit (coucher ${heure(j.coucherMin)})</span>`
      : `après la nuit (coucher ${heure(j.coucherMin)})`;
  return `
    <article class="jour">
      <button class="jour-tete" data-action="voir-jour" data-j="${i}">
        <strong>Jour ${i + 1} · ${dateTexte(j.date)}</strong>
        <small>Départ ${heure(j.heureDepart)} de ${h(j.debut.nom)} · ${km(j.metres)} · ${duree(j.conduiteMin)} de route${j.peage ? ' · péage' : ''}${j.routes.length ? ` · ${h(j.routes.join(', '))}` : ''}</small>
      </button>
      ${etapes}
      <div class="actions jour-actions"><button type="button" data-action="kml" data-j="${i}">📤 Envoyer la journée à Organic Maps</button></div>
      <div class="etape nuit">
        <div class="h">${heure(fin.arriveeMin)}</div>
        <div>
          <div class="nom">${soir} : ${h(fin.nom)}</div>
          <small>${fin.type ? `${h(fin.type)} · ` : ''}${marge}</small>
          ${meteoEtape(fin, j.date, fin.arriveeMin)}
          ${infoDatee(fin)}
          <div class="actions">${boutonGuidage(fin)}${boutonMenu(`nuit:${i}`, fin, () => [allerA(fin), pourMoi(fin)])}</div>
        </div>
      </div>
      ${j.alertes.map((a) => `<p class="alerte">⚠️ ${h(a)}</p>`).join('')}
    </article>`;
}

/**
 * Guidage jusqu'au point par une appli de navigation. Organic Maps fonctionne hors ligne (cartes
 * téléchargées dans l'appli) ; son itinéraire part de la position connue, sinon il montre le point.
 */
const NOMS_GUIDAGE = { organic: 'Organic Maps', waze: 'Waze', plans: 'Plans' };
const guidagePrefere = () => memoire.lire('guidage', 'organic');
function guider(appli, { lat, lon, nom }) {
  const n = encodeURIComponent(nom || 'Étape');
  if (appli === 'organic') {
    location.href = position
      ? `om://route?sll=${position.lat},${position.lon}&saddr=${encodeURIComponent('Ma position')}&dll=${lat},${lon}&daddr=${n}&type=vehicle`
      : `om://map?ll=${lat},${lon}&n=${n}`;
    return;
  }
  window.open(appli === 'waze' ? `https://waze.com/ul?ll=${lat},${lon}&navigate=yes` : `https://maps.apple.com/?daddr=${lat},${lon}&q=${n}&dirflg=d`, '_blank');
}
const boutonGuidage = (l) => `<button type="button" data-guide="${l.lat},${l.lon}" data-nom="${h(l.nom ?? '')}">🧭 ${NOMS_GUIDAGE[guidagePrefere()]}</button>`;
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-guide]');
  if (!b) return;
  ev.stopPropagation();
  const [lat, lon] = b.dataset.guide.split(',');
  guider(guidagePrefere(), { lat, lon, nom: b.dataset.nom });
}, true);

/** L'information et sa date : vérifiée sur place, ou dernière mise à jour dans OpenStreetMap. */
function infoDatee(l) {
  const morceaux = [];
  if (l.horaires) morceaux.push(`Horaires : ${h(l.horaires)}`);
  if (l.tel) morceaux.push(`☎ ${h(l.tel)}`);
  if (l.date) morceaux.push(l.verifie ? `vérifié sur place en ${moisTexte(l.date)}` : `info OSM de ${moisTexte(l.date)}`);
  return morceaux.length ? `<small>${morceaux.join(' · ')}</small>` : '';
}

$('#parcours').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-action]');
  if (!b || !plan) return;
  const j = Number(b.dataset.j);
  switch (b.dataset.action) {
    case 'valider':
      return validerCompteRendu();
    case 'modifier-choix':
    case 'nouveau':
      return ouvrirOnglet('preparer');
    case 'terminer':
      if (confirm('Voyage terminé ? Je le range dans l’historique. Les étapes où le GPS a vérifié ton passage comptent comme déjà visitées.')) terminerVoyage();
      return;
    case 'revoir':
      plan.valide = false;
      memoire.ecrire('plan', plan);
      return rendreParcours();
    case 'voir-jour':
      jourActif = j;
      carte.afficherParcours(plan, j);
      carte.cadrer(plan.jours[j].coords);
      return;
    case 'plein-station': {
      const station = stationsConseillees[Number(b.dataset.i)];
      if (!station) return;
      ajouterEtape(pack, plan, j, station);
      afficherToast(`⛽ Plein prévu à ${station.nom || 'la station'} : l’autonomie est recalculée.`);
      break;
    }
    case 'kml':
      return envoyerJournee(j);
    case 'alternative': {
      const [a] = plan.alternatives.splice(Number(b.dataset.i), 1);
      ajouterEtape(pack, plan, a.jour, a);
      break;
    }
    default:
      return;
  }
  enregistrer();
});

function brancherNouvelleDestination() {
  const champ = $('#nouvelle-destination');
  const liste = champ.nextElementSibling;
  let choisie = null;
  champ.addEventListener('input', () => {
    choisie = null;
    const q = simplifier(champ.value.trim());
    const trouves = q.length < 2 ? [] : communes.filter((c) => simplifier(c.nom).startsWith(q)).slice(0, 8);
    liste.innerHTML = trouves.map((c, i) => `<li data-i="${i}">${h(c.nom)}</li>`).join('');
    liste.hidden = !trouves.length;
    liste.onclick = (ev) => {
      choisie = trouves[ev.target.dataset.i];
      champ.value = choisie?.nom ?? '';
      liste.hidden = true;
    };
  });
  $('#changer-destination').addEventListener('click', () => {
    if (!choisie) return alert('Choisis la nouvelle destination dans la liste.');
    try {
      changerDestination(pack, plan, jourActif, choisie, position ?? undefined);
    } catch (e) {
      return alert(e.message);
    }
    enregistrer();
    carte.cadrer(plan.jours.slice(jourActif).flatMap((j) => j.coords));
  });
}

// ---------- En route ----------

const avance = $('#avance');
const maintenant = $('#maintenant');

function preparerRoute() {
  const zone = $('#choix-jour');
  if (!plan) {
    zone.innerHTML = '<p class="info">Prépare d’abord un parcours.</p>';
    return;
  }
  if (plan.valide === false) {
    zone.innerHTML = '<p class="info">Valide d’abord ton parcours dans l’onglet « Parcours » (compte rendu avant le départ).</p>';
    return;
  }
  jourActif = Math.min(jourActif, plan.jours.length - 1);
  zone.innerHTML = plan.jours
    .map((_, i) => `<button type="button" class="puce" data-j="${i}" aria-pressed="${i === jourActif}">Jour ${i + 1}</button>`)
    .join('');
  placerSurLeTrajet();
}
$('#choix-jour').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-j]');
  if (!b) return;
  jourActif = Number(b.dataset.j);
  avance.value = 0;
  preparerRoute();
});

/** Position simulée : un point du tracé du jour, et l'heure prévue à cet endroit. */
function placerSurLeTrajet() {
  if (!plan) return;
  const j = plan.jours[jourActif];
  const fraction = Number(avance.value) / 100;
  const [lon, lat] = j.coords[Math.min(j.coords.length - 1, Math.round(fraction * (j.coords.length - 1)))];
  position = { lat, lon, nom: 'Ma position' };
  maintenant.value = versHeure(j.heureDepart + fraction * (j.fin.arriveeMin - j.heureDepart));
  $('#avance-texte').textContent = `${Math.round(fraction * 100)} %`;
  carte.afficherParcours(plan, jourActif);
  carte.afficherPosition(position);
  rendreAvancee();
  rendreCarburantRoute();
}
const versHeure = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
avance.addEventListener('input', placerSurLeTrajet);

// ---------- Position réelle et suivi du trajet ----------
// Sur iPhone, le suivi continue en arrière-plan pendant qu'Organic Maps (ou Waze) guide :
// les positions s'enregistrent (TerrainPlugin.swift) et l'appli les relit en revenant.
// Elles valident les passages (étapes faites, notes) et dessinent le trajet déjà fait.

const TerrainNatif = registerPlugin('Terrain');
const natif = window.Capacitor?.isNativePlatform?.() ?? false;
let trace = memoire.lire('trace', []);
let suiviDepuis = memoire.lire('suiviDepuis', 0);
let releve = null;
carte.pret.then(() => carte.afficherTrace(trace));

/** Des positions [date ms, lat, lon, précision m] : passages vérifiés, trace, position actuelle. */
function traiterPoints(points) {
  if (!points.length) return;
  const lats = points.map((p) => p[1]);
  const lons = points.map((p) => p[2]);
  const [s, n, o, e] = [Math.min(...lats) - 0.005, Math.max(...lats) + 0.005, Math.min(...lons) - 0.007, Math.max(...lons) + 0.007];
  // Les lieux de la zone, une fois pour toutes les positions.
  const candidats = pack.lieux.filter((l) => l.nom && l.lat >= s && l.lat <= n && l.lon >= o && l.lon <= e);
  const passes = [];
  for (const [, lat, lon, precision] of points) {
    const proches = candidats.filter((l) => Math.abs(l.lat - lat) < 0.004 && Math.abs(l.lon - lon) < 0.006);
    passes.push(...verifierPassages({ lat, lon }, precision, proches));
    const dernier = trace.at(-1);
    if (!dernier || distanceKm({ lon: dernier[0], lat: dernier[1] }, { lat, lon }) > 0.1) trace.push([Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]);
  }
  memoire.ecrire('trace', trace);
  carte.afficherTrace(trace);
  const [quand, lat, lon] = points.at(-1);
  position = { lat, lon, nom: 'Ma position' };
  const d = new Date(quand);
  maintenant.value = versHeure(d.getHours() * 60 + d.getMinutes());
  carte.afficherPosition(position);
  const etapes = new Set(plan?.jours.flatMap((x) => x.etapes.map((e) => e.id)) ?? []);
  for (const l of passes) afficherToast(etapes.has(l.id) ? `✓ Étape faite : ${l.nom}. Tu peux la noter.` : `📍 Passage vérifié : ${l.nom}. Tu peux le noter.`);
  rendreAvancee();
  rendreCarburantRoute();
}

async function releverSuivi() {
  if (document.visibilityState !== 'visible') return;
  const { points } = await TerrainNatif.suiviPoints({ depuis: suiviDepuis }).catch(() => ({ points: [] }));
  if (!points.length) return;
  suiviDepuis = points.at(-1)[0];
  memoire.ecrire('suiviDepuis', suiviDepuis);
  traiterPoints(points);
}
function majBoutonSuivi(actif) {
  $('#gps').textContent = actif ? '📍 Trajet suivi, même dans Organic Maps · arrêter' : natif ? '📍 Suivre mon trajet' : '📍 Ma position';
  clearInterval(releve);
  if (actif) {
    releve = setInterval(releverSuivi, 5000);
    releverSuivi();
  }
}
if (natif) TerrainNatif.suiviEtat().then(({ actif }) => majBoutonSuivi(actif)).catch(() => {});
document.addEventListener('visibilitychange', () => {
  if (natif && releve) releverSuivi();
});

let suivi = null;
$('#gps').addEventListener('click', async () => {
  if (natif) {
    const { actif } = await TerrainNatif.suiviEtat();
    if (actif) {
      if (!confirm('Arrêter le suivi du trajet ?')) return;
      await TerrainNatif.suiviArreter();
      return majBoutonSuivi(false);
    }
    await TerrainNatif.suiviDemarrer();
    afficherToast('Suivi lancé : tu peux passer sur Organic Maps, TerraTrack note ton avancée.');
    return majBoutonSuivi(true);
  }
  if (!navigator.geolocation) return alert('Position indisponible sur cet appareil.');
  if (suivi != null) navigator.geolocation.clearWatch(suivi);
  let premiere = true;
  suivi = navigator.geolocation.watchPosition(
    ({ coords, timestamp }) => {
      traiterPoints([[timestamp, coords.latitude, coords.longitude, coords.accuracy]]);
      if (premiere) carte.voler(position, 12);
      premiere = false;
    },
    () => alert('Position refusée ou indisponible.'),
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 },
  );
  $('#gps').textContent = '📍 Position GPS suivie';
});

/** Étapes passées de ce voyage (passage vérifié par le GPS depuis la préparation). */
const etapesFaites = () => new Set(plan ? tousLesPassages().filter((p) => p.date >= (plan.cree ?? 0)).map((p) => p.id) : []);

/** Où j'en suis : km faits, étapes faites, prochaine étape, arrivée estimée et écart au programme. */
function rendreAvancee() {
  const zone = $('#avancee');
  if (!plan || plan.valide === false || !position) return (zone.innerHTML = '');
  const j = plan.jours[jourActif];
  const route = routeDe(j.coords);
  const faitKm = Math.min(situer(route, position).s, route.longueur);
  const passees = etapesFaites();
  const avecKm = j.etapes.map((e) => ({ e, s: situer(route, e).s }));
  const faites = avecKm.filter(({ e, s }) => passees.has(e.id) || s < faitKm - 1);
  const restantes = avecKm.filter((x) => !faites.includes(x)).map((x) => x.e);
  const trajet = itineraireMulti(pack.graphe, [position, ...restantes, j.fin], { eviterPeages: Boolean(j.eviterPeages) });
  const minute = versMinutes(maintenant.value);
  const arrivee = minute + (trajet ? trajet.secondes / 60 : 0) + restantes.reduce((t, e) => t + (e.visiteMin ?? 0), 0);
  const ecart = Math.round(arrivee - j.fin.arriveeMin);
  const prochaine = restantes[0] ?? j.fin;
  const versProchaine = trajet?.troncons[0];
  zone.innerHTML = `
    <div class="encadre">
      <div class="nom">🚗 Jour ${jourActif + 1} : ${Math.round(faitKm)} / ${Math.round(route.longueur)} km · ✓ ${faites.length}/${j.etapes.length} étape(s)</div>
      <div class="jauge"><span style="width:${Math.round((faitKm / (route.longueur || 1)) * 100)}%"></span></div>
      <small>Prochaine : ${h(prochaine.nom)}${versProchaine ? ` dans ${km(versProchaine.metres)} (${duree(versProchaine.secondes / 60)})` : ''}</small>
      <small>Arrivée estimée à ${h(j.fin.nom)} : ${heure(arrivee)} ${
        ecart > 5 ? `<span class="retard">(+${duree(ecart)} sur le programme)</span>` : ecart < -5 ? `<span class="marge-ok">(${duree(-ecart)} d’avance)</span>` : '(à l’heure)'
      } · coucher ${heure(j.coucherMin)}</small>
    </div>`;
}

// ---------- Carburant en route : niveau, stations, « j'ai fait le plein » ----------

let kmPosition = 0;
function rendreCarburantRoute() {
  const zone = $('#carburant-route');
  if (!plan || plan.valide === false || !position || !plan.jours[jourActif].profil) return (zone.innerHTML = '');
  const v = vehiculeCalcul();
  const j = plan.jours[jourActif];
  kmPosition = Math.round(situer(routeDe(j.coords), position).s);
  const niveau = niveauA(plan.jours, v, [...pleinsPrevus(plan), ...(plan.pleins ?? [])], jourActif, kmPosition);
  const reserve = Math.max(v.reservoir * 0.1, (v.reserveKm * v.conso) / 100);
  zone.innerHTML = `
    <div class="encadre">
      <div class="nom">⛽ Il reste ~${litresTexte(niveau)} · ~${Math.max(0, Math.round(niveau / (v.conso / 100)))} km</div>
      <div class="jauge ${niveau < reserve ? 'basse' : ''}"><span style="width:${Math.round(Math.max(0, Math.min(1, niveau / v.reservoir)) * 100)}%"></span></div>
      <small>Estimation selon la route depuis le départ${(plan.pleins ?? []).length ? ' et tes pleins' : ''}${niveau < reserve ? ' : <b>fais le plein bientôt</b>' : ''}.</small>
      ${v.budget ? `<small>💶 Payé ${euros((plan.pleins ?? []).filter((p) => p.litres && p.prix).reduce((t, p) => t + p.litres * p.prix, 0))} sur ${euros(v.budget)} de budget</small>` : ''}
      <div class="actions"><button type="button" data-carburant="stations">⛽ Stations sur ma route</button><button type="button" data-carburant="plein">J’ai fait le plein</button></div>
    </div>`;
}
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-carburant]');
  if (!b || !plan) return;
  if (b.dataset.carburant === 'stations') return proposer('carburant', { carburant: vehiculeCalcul().carburant });
  const v = vehiculeCalcul();
  $('#plein-litres').value = '';
  $('#plein-prix').value = v.prixEstime ? '' : v.prix;
  $('#plein').showModal();
});
$('#plein').addEventListener('close', () => {
  if ($('#plein').returnValue !== 'valider') return;
  const nombre = (champ) => Number.parseFloat(String($(champ).value).replace(',', '.'));
  const litres = nombre('#plein-litres');
  const prix = nombre('#plein-prix');
  plan.pleins = [...(plan.pleins ?? []), { jour: jourActif, km: kmPosition, ...(litres > 0 ? { litres } : {}), ...(prix > 0 ? { prix } : {}), quand: Date.now() }];
  // Le dernier prix payé devient la référence pour la suite.
  if (prix > 0) ecrireVehicule({ ...lireVehicule(), prix });
  enregistrer();
  rendreCarburantRoute();
  afficherToast(litres > 0 ? `⛽ ${litres} L notés${prix > 0 ? ` (${euros(litres * prix)})` : ''}.` : '⛽ Plein complet noté.');
});

// ---------- La journée dans Organic Maps (fichier KML : étapes, nuit et tracé) ----------

const xml = (t) => String(t ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
async function envoyerJournee(j) {
  const jour = plan.jours[j];
  const pas = Math.max(1, Math.ceil(jour.coords.length / 1500));
  const ligne = jour.coords.filter((_, i) => i % pas === 0 || i === jour.coords.length - 1).map(([lon, lat]) => `${lon},${lat}`).join(' ');
  const point = (nom, description, l) =>
    `<Placemark><name>${xml(nom)}</name><description>${xml(description)}</description><Point><coordinates>${l.lon},${l.lat}</coordinates></Point></Placemark>`;
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(`TerraTrack · Jour ${j + 1} · ${dateTexte(jour.date)}`)}</name>
${point(`Départ : ${jour.debut.nom}`, `Départ ${heure(jour.heureDepart)}`, jour.debut)}
${jour.etapes.map((e, k) => point(`${k + 1}. ${e.nom}`, `${heure(e.arriveeMin)} · ${e.type ?? ''} · ${e.pourquoi ?? ''}`, e)).join('\n')}
${point(`${jour.fin.genre === 'nuit' ? 'Nuit' : 'Arrivée'} : ${jour.fin.nom}`, `Arrivée ${heure(jour.fin.arriveeMin)}`, jour.fin)}
<Placemark><name>Trajet du jour</name><LineString><coordinates>${ligne}</coordinates></LineString></Placemark>
</Document></kml>`;
  const nom = `TerraTrack-jour-${j + 1}.kml`;
  if (natif) {
    afficherToast('Choisis « Organic Maps » dans la liste : la journée y arrive en favoris, avec le tracé.');
    await TerrainNatif.partager({ nom, contenu: kml }).catch((e) => alert(e.message));
    return;
  }
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }));
  lien.download = nom;
  lien.click();
}

function afficherToast(texte) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = texte;
  document.body.append(t);
  setTimeout(() => t.remove(), 4000);
}

// ---------- Notes vérifiées sur place ----------

const etoilesTexte = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
function texteNote(id) {
  const n = noteDe(id);
  return n ? `<small class="note">Ta note : ${etoilesTexte(n.etoiles)}${n.mots.length ? ` · ${h(n.mots.join(', '))}` : ''} · ✓ vérifiée sur place</small>` : '';
}

const dialogue = $('#noter');
function ouvrirNotation(lieu) {
  const passage = passageValide(lieu.id);
  if (!passage)
    return alert(
      `Pour noter « ${lieu.nom || lieu.type} », il faut y être passé : TerraTrack le vérifie avec le GPS (à moins de ${RAYON_M} m, précision ${PRECISION_MAX_M} m). Active « 📍 Ma position » quand tu y es ; le passage reste valable 24 h.`,
    );
  let etoiles = noteDe(lieu.id)?.etoiles ?? 0;
  const mots = new Set(noteDe(lieu.id)?.mots ?? []);
  $('#noter-nom').textContent = lieu.nom || lieu.type;
  $('#noter-preuve').textContent = `✓ Passage vérifié à ${passage.metres} m, le ${new Date(passage.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`;
  const rendre = () => {
    $('#noter-etoiles').innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" class="${n <= etoiles ? 'allumee' : ''}">★</button>`).join('');
    $('#noter-mots').innerHTML = MOTS.map((m) => `<button type="button" class="puce" data-mot="${h(m)}" aria-pressed="${mots.has(m)}">${h(m)}</button>`).join('');
    $('#noter-valider').disabled = !etoiles;
  };
  $('#noter-etoiles').onclick = (ev) => {
    if (ev.target.dataset.n) etoiles = Number(ev.target.dataset.n);
    rendre();
  };
  $('#noter-mots').onclick = (ev) => {
    const m = ev.target.dataset.mot;
    if (!m) return;
    if (mots.has(m)) mots.delete(m);
    else mots.add(m);
    rendre();
  };
  dialogue.onclose = () => {
    if (dialogue.returnValue !== 'valider' || !etoiles) return;
    noter(lieu, etoiles, [...mots]);
    if (etoiles <= 2) marquerDejaVu(lieu);
    afficherToast(`Merci ! ${etoilesTexte(etoiles)} pour ${lieu.nom || lieu.type}.`);
    rendreParcours();
  };
  rendre();
  dialogue.showModal();
}

let dernieresSuggestions = [];
let dernierBouton = null;
let dernierResteMin = 0;
function proposer(bouton, options) {
  dernierBouton = bouton;
  const { suggestions, resteMin } = suggerer(pack, plan, { j: jourActif, position, minute: versMinutes(maintenant.value) }, dernierBouton, { ...options, dejaVus: new Set(dejaVus.keys()) });
  dernieresSuggestions = suggestions;
  dernierResteMin = resteMin;
  carte.afficherSuggestions(suggestions, dernierBouton);
  if (bouton === 'carburant') {
    const c = options?.carburant;
    rafraichirPrix([...suggestions, ...suggestions.map((x) => lieuParId.get(x.id)).filter(Boolean)]).then((change) => {
      if (!change || dernieresSuggestions !== suggestions) return;
      suggestions.sort((a, b) => (a.prix?.[c] ?? Infinity) - (b.prix?.[c] ?? Infinity) || a.detourMin - b.detourMin);
      carte.afficherSuggestions(suggestions, 'carburant');
      rendreSuggestions(suggestions, resteMin);
    });
  }
  rendreSuggestions(suggestions, resteMin);
  if (suggestions.length) carte.cadrer([[position.lon, position.lat], ...suggestions.map((s) => [s.lon, s.lat])], 70);
}

document.querySelector('.quatre').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-bouton]');
  if (!b || !plan || !position) return;
  $('#reponse-ia').textContent = '';
  proposer(b.dataset.bouton);
});

// Couche IA : la demande en français choisit le bouton et met en avant les lieux qui y répondent.
const reponseIA = $('#reponse-ia');
iaDisponible().then(({ disponible }) => {
  reponseIA.textContent = disponible ? 'IA de l’iPhone prête, sans réseau.' : 'Sans IA sur cet appareil : la demande est comprise par mots-clés.';
});
$('#form-demande').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const texte = $('#demande').value.trim();
  if (!texte || !plan || !position) return;
  reponseIA.textContent = 'Je réfléchis…';
  const j = plan.jours[jourActif];
  const demande = await comprendre(texte, `Jour ${jourActif + 1}, il est ${maintenant.value}, en route vers ${j.fin.nom}. Envies : ${plan.params.envies.join(', ')}.`);
  reponseIA.textContent = `${demande.reponse || `Je cherche : ${BOUTONS[demande.bouton].titre.toLowerCase()}${demande.motsCles.length ? ` (${demande.motsCles.join(', ')})` : ''}.`} — ${demande.source}`;
  proposer(demande.bouton, { correspond: (l) => correspond(l, demande), detourMaxMin: demande.detourMaxMin });
});

function rendreSuggestions(liste, resteMin) {
  const regle = BOUTONS[dernierBouton];
  const j = plan.jours[jourActif];
  const zone = $('#suggestions');
  if (!liste.length) {
    zone.innerHTML = `<p class="info">Rien qui corresponde près de ta route. ${h(regle.critere)}</p>`;
    return;
  }
  zone.innerHTML = `<p class="info">${h(regle.critere)} Il te reste ${duree(resteMin)} de route jusqu’à ${h(j.fin.nom)}.</p>${liste
    .map((s, i) => {
      const acces = `à ${duree(s.atteindreMin)}${s.detourMin >= 1 ? ` · détour +${duree(s.detourMin)}` : ' · sur ta route'}${s.marcheMetres ? ` · ${s.marcheMetres} m à pied` : ''}`;
      const effet =
        dernierBouton === 'dormir'
          ? s.margeNuit >= 0
            ? `<span class="marge-ok">Arrivée ${heure(s.arrivee)}, ${duree(s.margeNuit)} avant la nuit.</span>`
            : `⚠️ Arrivée ${heure(s.arrivee)}, après la nuit.`
          : `${dernierBouton === 'decouvrir' ? `Ajoute ${duree(s.detourMin)} de route + ${duree(s.arretMin)} de visite. ` : ''}${
              s.margeNuit >= 0
                ? `<span class="marge-ok">Tu arrives encore à ${h(j.fin.nom)} avant la nuit (${heure(s.arriveeFin)}).</span>`
                : `⚠️ Arrivée à ${h(j.fin.nom)} après la nuit (${heure(s.arriveeFin)}).`
            }`;
      return `
        <div class="suggestion" data-lieu-id="${h(s.id)}">
          <div class="rang" style="background:${COULEURS[dernierBouton]}">${i + 1}</div>
          <div>
            <div class="nom"><b>${h(s.nom || s.type)}</b>${badgeNiveau(s)}</div>
            <small class="info">${h(s.nom ? s.type : '')} ${acces}</small>
            ${dernierBouton === 'carburant' ? `<small class="info"><span class="prix">${prixStation(s, vehiculeCalcul().carburant) || 'prix inconnu'}</span>${s.h24 ? ' · 24/24' : ''}</small>` : ''}
            ${s.niveauTexte || s.details?.length ? `<small class="info">${h([s.niveauTexte, ...(s.details ?? [])].filter(Boolean).join(' · '))}</small>` : ''}
            ${infoDatee(s)}
            ${texteNote(s.id)}${texteSouvenir(s.id)}
            <div class="effet">${effet}</div>
            <div class="actions">
              <button data-i="${i}" data-action="${dernierBouton === 'dormir' ? 'dormir' : 'ajouter'}">${dernierBouton === 'dormir' ? '🌙 Dormir ici ce soir' : '+ Ajouter au parcours'}</button>
              ${boutonGuidage(s)}
              ${boutonMenu(`suggestion:${s.id}`, s, () => [allerA(s), pourMoi(s, { dejaVu: () => { marquerDejaVu(s); dernieresSuggestions = dernieresSuggestions.filter((x) => x !== s); rafraichir(); } })])}
            </div>
          </div>
        </div>`;
    })
    .join('')}`;
}

$('#suggestions').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-action]');
  if (!b) return;
  const s = dernieresSuggestions[Number(b.dataset.i)];
  if (b.dataset.action === 'dormir') dormirIci(pack, plan, jourActif, s);
  else ajouterEtape(pack, plan, jourActif, s);
  enregistrer();
  dernieresSuggestions = [];
  carte.afficherSuggestions([], dernierBouton);
  $('#suggestions').innerHTML = `<p class="info">✓ ${h(s.nom || s.type)} ajouté. Parcours recalculé.</p>`;
});
// Toucher un repère sur la carte : la fiche correspondante de l'onglet ouvert vient à l'écran.
carte.surClicSuggestion((id) => {
  if (hauteur() === 0) regler(1);
  document.querySelector(`#${ongletOuvert()} [data-lieu-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// ---------- Déjà visité, depuis la carte ----------

carte.surClicEtape((id) => {
  const j = plan?.jours.findIndex((x) => x.etapes.some((e) => e.id === id));
  if (j == null || j < 0) return;
  const k = plan.jours[j].etapes.findIndex((e) => e.id === id);
  const e = plan.jours[j].etapes[k];
  if (!confirm(`Tu connais déjà « ${e.nom} » ? Je le retire et je ne te le proposerai plus.`)) return;
  marquerDejaVu(e);
  supprimerEtape(pack, plan, j, k);
  enregistrer();
});
document.addEventListener('click', (ev) => {
  if (ev.target.id !== 'oublier-deja') return;
  dejaVus.clear();
  memoire.ecrire('dejaVus', []);
  carte.afficherDejaVus([]);
  rendreDejaVus();
});
carte.pret.then(() => carte.afficherDejaVus([...dejaVus.values()]));
rendreDejaVus();

// ---------- Actions communes à tous les lieux affichés ----------

/**
 * Un seul bouton « ⋯ » par lieu : il ouvre un menu rangé en groupes (Y aller, Le parcours, Pour moi),
 * au lieu d'aligner tous les boutons sur chaque fiche.
 */
const menus = new Map();
function boutonMenu(cle, l, groupes) {
  menus.set(cle, { l, groupes });
  return `<button type="button" class="menu" data-menu="${h(cle)}" aria-label="Plus d’actions">⋯</button>`;
}
const nomDe = (l) => l.nom || l.type;

const allerA = (l) => [
  'Y aller',
  [
    { texte: '🧭 Organic Maps', faire: () => guider('organic', l) },
    { texte: '🧭 Waze', faire: () => guider('waze', l) },
    { texte: '🗺️ Plans', faire: () => guider('plans', l) },
    { texte: '👁️ Voir sur la carte', faire: () => { regler(0); carte.voler(l, 14); } },
  ],
];
/** Ce qui ne regarde que moi : favori, souvenirs, note, déjà visité. */
const actionPlusTard = (l) => ({
  texte: estPourPlusTard(l.id) ? '⭐ Retirer de « Plus tard »' : '☆ Garder pour plus tard',
  faire: () => {
    const garde = basculerPlusTard(l);
    afficherToast(garde ? `⭐ ${nomDe(l)} gardé pour un prochain road trip.` : `${nomDe(l)} retiré de « Plus tard ».`);
    majInfoPlusTard();
    rafraichir();
  },
});
function pourMoi(l, { dejaVu, autres = [], sansPlusTard = false } = {}) {
  const photos = souvenirDe(l.id)?.photos;
  return [
    'Pour moi',
    [
      ...(sansPlusTard ? [] : [actionPlusTard(l)]),
      { texte: `📷 Photos et commentaire${photos ? ` (${photos})` : ''}`, faire: () => ouvrirSouvenirs(l) },
      { texte: '★ Noter (sur place)', faire: () => ouvrirNotation(l) },
      ...(dejaVu ? [{ texte: '✓ Déjà visité', faire: dejaVu }] : []),
      ...autres,
    ],
  ];
}
function menuEtape(j, k) {
  const e = plan.jours[j].etapes[k];
  const changer = (f) => () => {
    f();
    enregistrer();
  };
  return [
    allerA(e),
    [
      'Le parcours',
      [
        { texte: '⏱️ Rester 30 min de plus', faire: changer(() => prolongerEtape(pack, plan, j, k, 30)) },
        {
          texte: '🌙 Dormir près d’ici',
          faire: () => {
            const nuit = choisirNuit(pack, e, plan.params.nuits);
            if (!nuit) return alert('Aucun hébergement déclaré près de cette étape.');
            dormirIci(pack, plan, j, nuit);
            enregistrer();
          },
        },
        { texte: '✕ Retirer du parcours', faire: changer(() => supprimerEtape(pack, plan, j, k)) },
      ],
    ],
    pourMoi(e, { dejaVu: changer(() => { marquerDejaVu(e); supprimerEtape(pack, plan, j, k); }) }),
  ];
}

const dialogueMenu = $('#menu-lieu');
let actionsMenu = [];
/** Ouvre le menu d'un lieu ; `detail` (fiche) et `principal` (gros bouton) sont facultatifs. */
function ouvrirMenu(l, groupes, { detail = '', principal } = {}) {
  const liste = groupes().filter(([, actions]) => actions.length);
  actionsMenu = [...(principal ? [principal] : []), ...liste.flatMap(([, actions]) => actions)];
  let n = principal ? 1 : 0;
  $('#menu-nom').innerHTML = `${h(nomDe(l))}${badgeNiveau(l)}`;
  $('#menu-detail').innerHTML = detail;
  $('#menu-groupes').innerHTML =
    (principal ? `<button type="button" class="principal" data-a="0">${h(principal.texte)}</button>` : '') +
    liste
      .map(([titre, actions]) => `<div class="titre">${h(titre)}</div><div class="menu-liste">${actions.map((a) => `<button type="button" data-a="${n++}">${h(a.texte)}</button>`).join('')}</div>`)
      .join('');
  dialogueMenu.showModal();
}
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-menu]');
  const m = b && menus.get(b.dataset.menu);
  if (m) ouvrirMenu(m.l, m.groupes);
});
$('#menu-groupes').addEventListener('click', (ev) => {
  const a = actionsMenu[Number(ev.target.closest('[data-a]')?.dataset.a)];
  if (!a) return;
  dialogueMenu.close();
  a.faire();
});

function reproposer(l) {
  dejaVus.delete(l.id);
  memoire.ecrire('dejaVus', [...dejaVus.values()]);
  carte.afficherDejaVus([...dejaVus.values()]);
  rendreDejaVus();
  rafraichir();
}

/** Redessine l'onglet ouvert, après un changement (souvenir, déjà vu, favori). */
function rafraichir() {
  const onglet = ongletOuvert();
  if (onglet === 'parcours') rendreParcours();
  if (onglet === 'route' && dernieresSuggestions.length) rendreSuggestions(dernieresSuggestions, dernierResteMin);
  if (onglet === 'historique') rendreHistorique();
  if (onglet === 'plus-tard') rendrePlusTard();
  if (onglet === 'carte-vue') majDecouverte();
}

/** Ajoute le lieu au jour du parcours dont le tracé passe le plus près. */
function ajouterAuParcours(l) {
  if (!plan) return alert('Prépare d’abord un parcours dans « Préparer ».');
  let meilleur = 0;
  let ecart = Infinity;
  plan.jours.forEach((j, i) => {
    for (let k = 0; k < j.coords.length; k += 5) {
      const d = distanceKm({ lon: j.coords[k][0], lat: j.coords[k][1] }, l);
      if (d < ecart) [ecart, meilleur] = [d, i];
    }
  });
  if (ecart > 30 && !confirm(`${nomDe(l)} est à ${Math.round(ecart)} km de ton trajet (jour ${meilleur + 1}). L’ajouter quand même ?`)) return;
  ajouterEtape(pack, plan, meilleur, l);
  enregistrer();
  afficherToast(`✓ ${nomDe(l)} ajouté au jour ${meilleur + 1}, parcours recalculé.`);
}

const badgeNiveau = (l) => (l.niveau ? ` <span class="niveau n${l.niveauRang ?? 0}">${h(l.niveau)}</span>` : '');

function texteSouvenir(id) {
  const s = souvenirDe(id);
  if (!s || (!s.commentaire && !s.photos)) return '';
  const commentaire = s.commentaire.length > 90 ? `${s.commentaire.slice(0, 90)}…` : s.commentaire;
  return `<small class="souvenir">${[s.photos && `📷 ${s.photos} photo${s.photos > 1 ? 's' : ''}`, commentaire && `« ${h(commentaire)} »`].filter(Boolean).join(' · ')}</small>`;
}

/** Fiche d'un lieu : nom, niveau, détails, note, souvenirs, un bouton principal et le menu « ⋯ ». */
function ficheLieu(l, { extra = '', principal = '', groupes }) {
  return `
    <div class="fiche" data-lieu-id="${h(l.id)}">
      <div class="nom"><b>${h(nomDe(l))}</b>${badgeNiveau(l)}</div>
      <small class="info">${h([l.nom ? l.type : '', l.niveauTexte].filter(Boolean).join(' · '))}</small>
      ${l.details?.length ? `<small class="info">${h(l.details.join(' · '))}</small>` : ''}
      ${l.description ? `<small class="description">${h(l.description)}</small>` : ''}
      ${extra}
      ${texteNote(l.id)}${texteSouvenir(l.id)}
      <div class="actions">${principal}${boutonMenu(`fiche:${l.id}`, l, groupes)}</div>
    </div>`;
}

// ---------- Souvenirs : photos et commentaire sur un lieu ----------

const dialogueSouvenirs = $('#souvenirs');
let lieuSouvenir = null;
let adresses = [];
async function rendrePhotos() {
  const photos = await photosDe(lieuSouvenir.id);
  for (const a of adresses) URL.revokeObjectURL(a);
  adresses = photos.map((p) => URL.createObjectURL(p.image));
  $('#souv-photos').innerHTML = photos.length
    ? photos
        .map(
          (p, i) => `<figure><img src="${adresses[i]}" data-grande="${i}" alt="" />${p.surPlace ? '<span class="sur-place" title="Prise sur place, passage vérifié par le GPS">📍</span>' : ''}<button type="button" data-retirer="${p.cle}" aria-label="Retirer la photo">✕</button></figure>`,
        )
        .join('')
    : '<small class="info">Pas encore de photo.</small>';
}
function ouvrirSouvenirs(l) {
  lieuSouvenir = l;
  $('#souv-nom').textContent = nomDe(l);
  $('#souv-info').textContent = passageValide(l.id)
    ? '📍 Passage vérifié ici par le GPS : tes photos seront marquées « sur place ».'
    : 'Tes photos et ton commentaire restent sur ton téléphone.';
  $('#souv-commentaire').value = souvenirDe(l.id)?.commentaire ?? '';
  $('#souv-photos').innerHTML = '';
  rendrePhotos();
  dialogueSouvenirs.showModal();
}
$('#souv-fichier').addEventListener('change', async (ev) => {
  const fichiers = [...ev.target.files];
  ev.target.value = '';
  $('#souv-info').textContent = `Ajout de ${fichiers.length} photo(s)…`;
  for (const f of fichiers) {
    try {
      await ajouterPhoto(lieuSouvenir, f, Boolean(passageValide(lieuSouvenir.id)));
    } catch (e) {
      afficherToast(`Photo non ajoutée : ${e.message}`);
    }
  }
  $('#souv-info').textContent = `✓ ${fichiers.length} photo(s) ajoutée(s).`;
  rendrePhotos();
});
$('#souv-photos').addEventListener('click', async (ev) => {
  const cle = ev.target.dataset.retirer;
  if (cle) {
    if (!confirm('Retirer cette photo ?')) return;
    await retirerPhoto(lieuSouvenir, Number(cle));
    return rendrePhotos();
  }
  const i = ev.target.dataset.grande;
  if (i == null) return;
  $('#photo-image').src = adresses[Number(i)];
  $('#photo-grande').showModal();
});
// Le commentaire est gardé à la fermeture, quelle qu'elle soit.
dialogueSouvenirs.addEventListener('close', () => {
  const texte = $('#souv-commentaire').value;
  if (texte.trim() !== (souvenirDe(lieuSouvenir.id)?.commentaire ?? '')) commenter(lieuSouvenir, texte);
  rafraichir();
});

// ---------- Historique : voyages faits et lieux déjà faits ----------

/** Tout ce qui est « fait » : déjà visité, passage vérifié au GPS (lieux à découvrir), noté, ou avec souvenirs. */
function lieuxFaits() {
  const faits = new Map();
  const ajouter = (x, marque, quand) => {
    const base = lieuParId.get(x.id) ?? x;
    if (base.lat == null) return;
    const f = faits.get(x.id) ?? { ...base, marques: new Set(), fait: 0 };
    f.marques.add(marque);
    f.fait = Math.max(f.fait, quand ?? 0);
    faits.set(x.id, f);
  };
  for (const l of dejaVus.values()) ajouter(l, 'deja', l.date);
  for (const p of tousLesPassages()) if (lieuParId.get(p.id)?.categorie === 'decouvrir' || lieuParId.get(p.id)?.activite) ajouter(p, 'gps', p.date);
  for (const n of toutesLesNotes()) ajouter(n, 'note', n.date);
  for (const s of tousLesSouvenirs()) ajouter(s, 'souvenir', s.date);
  return [...faits.values()].sort((a, b) => b.fait - a.fait);
}

function rendreHistorique() {
  const liste = voyages();
  const faits = lieuxFaits();
  const quand = (t) => (t ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  $('#historique').innerHTML = `
    <div class="titre">Mes voyages (${liste.length})</div>
    ${
      liste.length
        ? liste
            .map((v) => {
              const etapes = v.jours.flatMap((j) => j.etapes);
              return `
      <div class="fiche">
        <div class="nom"><b>${h(v.jours[0].debut.nom)} → ${h(v.jours.at(-1).fin.nom)}</b></div>
        <small class="info">${h(dateTexte(v.jours[0].date))}${v.jours.length > 1 ? ` · ${v.jours.length} jours` : ''} · ${km(totaux(v).metres)} · ${etapes.length} étape(s)</small>
        ${etapes.length ? `<small class="info">${h(etapes.map((e) => e.nom).join(', '))}</small>` : ''}
        <div class="actions">
          <button type="button" data-voyage="voir" data-id="${v.id}">Voir sur la carte</button>
          <button type="button" data-voyage="refaire" data-id="${v.id}">↻ Refaire</button>
          <button type="button" data-voyage="oublier" data-id="${v.id}">✕ Effacer</button>
        </div>
      </div>`;
            })
            .join('')
        : '<p class="info">Aucun voyage terminé. À la fin d’un road trip, touche « 🏁 Voyage terminé » dans « Parcours ».</p>'
    }
    <div class="titre">Lieux déjà faits (${faits.length})</div>
    ${
      faits.length
        ? faits
            .map((l) =>
              ficheLieu(l, {
                extra: `<small class="info">${[
                  l.marques.has('deja') && '✓ déjà visité',
                  l.marques.has('gps') && '📍 passage vérifié',
                  l.fait && `le ${quand(l.fait)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}</small>`,
                groupes: () => [allerA(l), pourMoi(l, { autres: l.marques.has('deja') ? [{ texte: '↺ Me le reproposer', faire: () => reproposer(l) }] : [] })],
              }),
            )
            .join('')
        : '<p class="info">Les lieux marqués « Déjà visité », notés, avec des souvenirs ou passés au GPS apparaissent ici.</p>'
    }`;
}
$('#historique').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-voyage]');
  if (!b) return;
  const v = voyages().find((x) => String(x.id) === b.dataset.id);
  if (!v) return;
  if (b.dataset.voyage === 'voir') {
    carte.afficherParcours(v, -1);
    carte.cadrer(v.jours.flatMap((j) => j.coords));
    afficherToast('Voyage passé affiché. L’onglet « Parcours » remet le tien.');
  } else if (b.dataset.voyage === 'refaire') {
    remplirPreparer(v.params);
    ouvrirOnglet('preparer');
    afficherToast('Réponses reprises : choisis la date, puis « Proposer un parcours ».');
  } else if (confirm('Effacer ce voyage de l’historique ?')) {
    oublierVoyage(v.id);
    rendreHistorique();
  }
});

function terminerVoyage() {
  const passes = new Set(tousLesPassages().filter((p) => p.date >= (plan.cree ?? 0)).map((p) => p.id));
  for (const e of plan.jours.flatMap((j) => j.etapes)) if (passes.has(e.id)) marquerDejaVu(e);
  archiver(plan);
  plan = null;
  trace = [];
  memoire.ecrire('trace', trace);
  carte.afficherTrace(trace);
  if (natif) TerrainNatif.suiviArreter().then(() => TerrainNatif.suiviEffacer()).then(() => majBoutonSuivi(false)).catch(() => {});
  memoire.ecrire('plan', null);
  carte.afficherParcours(null);
  rendreParcours();
  ouvrirOnglet('historique');
  afficherToast('🏁 Voyage rangé dans l’historique.');
}

// ---------- Plus tard : lieux gardés pour un prochain road trip ----------

function majInfoPlusTard() {
  const n = lieuxPourPlusTard().length;
  const zone = $('#info-plus-tard');
  zone.hidden = !n;
  zone.textContent = `⭐ ${n} lieu(x) gardé(s) pour plus tard : ajoutés d’office au parcours s’ils sont près du trajet.`;
}

function rendrePlusTard() {
  const liste = lieuxPourPlusTard().map((l) => ({ ...(lieuParId.get(l.id) ?? l), ajoute: l.ajoute }));
  $('#plus-tard').innerHTML = liste.length
    ? `<p class="info">⭐ ${liste.length} lieu(x) gardé(s) pour un prochain road trip. Ceux qui tombent près de ton prochain trajet y sont ajoutés d’office ; « Surprends-moi » t’emmène vers leur coin.</p>
      <div class="deux">
        <button type="button" class="secondaire" id="pt-carte">Tout voir sur la carte</button>
        <button type="button" class="principal" id="pt-preparer">Préparer un road trip</button>
      </div>
      ${liste
        .map((l) =>
          ficheLieu(l, {
            extra: `<small class="info">gardé le ${new Date(l.ajoute).toLocaleDateString('fr-FR')}</small>`,
            principal: boutonGuidage(l),
            groupes: () => [
              allerA(l),
              ['Le parcours', plan ? [{ texte: '+ Ajouter à mon parcours', faire: () => ajouterAuParcours(l) }] : []],
              pourMoi(l, { dejaVu: () => { marquerDejaVu(l); rafraichir(); } }),
            ],
          }),
        )
        .join('')}`
    : '<p class="info">Rien de gardé pour l’instant. Touche « ☆ Plus tard » sur un lieu (dans « Parcours » ou « En route ») pour le garder pour un prochain road trip.</p>';
  carte.afficherSuggestions(liste, 'decouvrir');
}
$('#plus-tard').addEventListener('click', (ev) => {
  if (ev.target.id === 'pt-preparer') ouvrirOnglet('preparer');
  if (ev.target.id === 'pt-carte') {
    couchesCochees.add('plusTard');
    memoire.ecrire('couches', [...couchesCochees]);
    ouvrirOnglet('carte');
    carte.cadrer(lieuxPourPlusTard().map((l) => [l.lon, l.lat]), 70);
  }
});

// ---------- Carte : cocher les lieux à voir dessus, les découvrir, les garder pour plus tard ----------

const dansDecouvrir = (l) => l.nom && l.categorie === 'decouvrir' && !l.activite;
const COUCHES = {
  plusTard: { nom: 'Plus tard', couleur: '#ffd400', test: (l) => estPourPlusTard(l.id) },
  viaferrata: { nom: 'Via ferrata', couleur: '#c0392b', test: (l) => l.activite === 'viaferrata' },
  randonnee: { nom: 'Randonnée', couleur: '#2f7d4a', test: (l) => l.activite === 'randonnee' },
  escalade: { nom: 'Escalade', couleur: '#8e44ad', test: (l) => l.activite === 'escalade' },
  canoe: { nom: 'Canoë-kayak', couleur: '#1f6fb2', test: (l) => l.activite === 'canoe' },
  baignade: { nom: 'Baignade', couleur: '#22a6c7', test: (l) => l.activite === 'baignade' },
  unesco: { nom: 'UNESCO', couleur: '#b8860b', test: (l) => l.unesco },
  patrimoine: { nom: 'Patrimoine', couleur: '#8d6e63', test: (l) => dansDecouvrir(l) && plaitA(l, ['patrimoine']) },
  panoramas: { nom: 'Panoramas', couleur: '#e67e22', test: (l) => dansDecouvrir(l) && plaitA(l, ['panoramas']) },
  nature: { nom: 'Nature et grottes', couleur: '#7cb342', test: (l) => dansDecouvrir(l) && plaitA(l, ['nature']) },
  villages: { nom: 'Villages', couleur: '#d81b60', test: (l) => dansDecouvrir(l) && plaitA(l, ['villages']) },
  manger: { nom: 'Manger', couleur: '#455a64', test: (l) => l.nom && l.categorie === 'manger' },
  dormir: { nom: 'Dormir', couleur: '#3b3f8f', test: (l) => l.nom && l.categorie === 'dormir' },
  eau: { nom: 'Eau potable', couleur: '#00897b', test: (l) => l.type === 'Eau potable' },
  carburant: { nom: 'Carburant', couleur: '#212121', test: (l) => l.categorie === 'carburant' },
  // Pas des lieux : les prévisions sur une grille de la partie visible (à 14 h, le jour du parcours affiché).
  meteo: { nom: 'Météo', couleur: '#1a73e8', test: () => false },
};
// Les listes sont faites une fois ; « Plus tard » change, on la relit à chaque fois.
// Les listes ne sont faites qu'à la première case cochée (400 000 lieux en France) ; « Plus tard » change, on la relit.
const parCouche = {};
const listeCouche = (k) => (parCouche[k] ??= pack.lieux.filter(COUCHES[k].test));
const couchesCochees = new Set(memoire.lire('couches', ['plusTard']));
const POINTS_MAX = 400;

function rendreCouches() {
  $('#couches').innerHTML = Object.entries(COUCHES)
    .map(([k, c]) => `<button type="button" class="puce" data-couche="${k}" aria-pressed="${couchesCochees.has(k)}"><span class="point-couleur" style="background:${c.couleur}"></span>${h(c.nom)}</button>`)
    .join('');
  majDecouverte();
}

/** Les points des cases cochées, dans la partie visible de la carte (les plus remarquables d'abord). */
function majDecouverte() {
  if (ongletCourant !== 'carte') return;
  const bornes = carte.carte.getBounds();
  const vus = new Map();
  afficherCoucheMeteo();
  for (const k of Object.keys(COUCHES)) {
    if (!couchesCochees.has(k) || k === 'meteo') continue;
    const liste = k === 'plusTard' ? lieuxPourPlusTard().map((f) => lieuParId.get(f.id) ?? f) : listeCouche(k);
    for (const l of liste)
      if (!vus.has(l.id) && bornes.contains([l.lon, l.lat])) vus.set(l.id, { ...l, couleur: COUCHES[k].couleur, favori: estPourPlusTard(l.id) });
  }
  const tous = [...vus.values()].sort((a, b) => b.favori - a.favori || interet(b) - interet(a));
  const montres = tous.slice(0, POINTS_MAX);
  carte.afficherDecouverte(montres);
  $('#couches-compte').textContent = !couchesCochees.size
    ? 'Rien de coché.'
    : tous.length > montres.length
      ? `${montres.length} lieux affichés sur ${tous.length} ici, les plus remarquables : zoome pour voir les autres.`
      : `${tous.length} lieu(x) dans cette partie de la carte.`;
}
/** Météo sur la carte : une grille d'au plus 7 × 7 points sur la partie visible. */
async function afficherCoucheMeteo() {
  if (!couchesCochees.has('meteo') || ongletCourant !== 'carte') return carte.afficherMeteo([]);
  const b = carte.carte.getBounds();
  const pas = Math.max(0.25, Math.max(b.getNorth() - b.getSouth(), b.getEast() - b.getWest()) / 6);
  const points = [];
  for (let lat = Math.ceil(b.getSouth() / pas) * pas; lat <= b.getNorth(); lat += pas)
    for (let lon = Math.ceil(b.getWest() / pas) * pas; lon <= b.getEast(); lon += pas) points.push({ lat, lon });
  const date = plan?.jours[jourActif]?.date ?? new Date().toISOString().slice(0, 10);
  const dessiner = () =>
    carte.afficherMeteo(
      points
        .map((p) => ({ ...p, m: meteoA(p.lat, p.lon, date, 14 * 60) }))
        .filter((p) => p.m)
        .map((p) => ({ lat: p.lat, lon: p.lon, texte: `${icone(p.m)} ${Math.round(p.m.temp)}°` })),
    );
  dessiner();
  if (await chargerMeteo(points).catch(() => false)) dessiner();
}

$('#couches').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-couche]');
  if (!b) return;
  const k = b.dataset.couche;
  if (couchesCochees.has(k)) couchesCochees.delete(k);
  else couchesCochees.add(k);
  memoire.ecrire('couches', [...couchesCochees]);
  b.setAttribute('aria-pressed', String(couchesCochees.has(k)));
  majDecouverte();
});
carte.carte.on('moveend', majDecouverte);

/** Toucher un point : sa fiche, avec « Garder pour plus tard » en grand. */
carte.surClicDecouverte((id) => {
  const l = lieuParId.get(id) ?? lieuxPourPlusTard().find((f) => f.id === id);
  if (!l) return;
  const lignes = [
    [l.nom ? l.type : '', l.niveauTexte].filter(Boolean).join(' · '),
    l.details?.join(' · '),
    l.categorie === 'carburant' && (prixStation(l, vehiculeCalcul().carburant) || 'prix inconnu') + (l.h24 ? ' · 24/24' : ''),
  ].filter(Boolean);
  ouvrirMenu(
    l,
    () => [
      allerA(l),
      ['Le parcours', plan ? [{ texte: '+ Ajouter à mon parcours', faire: () => ajouterAuParcours(l) }] : []],
      pourMoi(l, { sansPlusTard: true, dejaVu: () => { marquerDejaVu(l); majDecouverte(); } }),
    ],
    {
      detail: `${lignes.map((t) => `<small class="info">${h(t)}</small>`).join('')}${l.description ? `<small class="description">${h(l.description)}</small>` : ''}${infoDatee(l)}${texteNote(l.id)}${texteSouvenir(l.id)}${dejaVus.has(l.id) ? '<small class="info">✓ déjà visité</small>' : ''}`,
      principal: actionPlusTard(l),
    },
  );
});

// ---------- Mises à jour du pack (iPhone) ----------
// Le robot GitHub refait le pack chaque semaine. L'appli regarde au plus toutes les 12 h,
// l'iPhone télécharge en arrière-plan (Wi-Fi) ce qui a changé, et la nouvelle version sert au lancement suivant.

const DOUZE_HEURES = 12 * 3600 * 1000;
let suiviMiseAJour = null;
async function suivreMiseAJour() {
  if (!miseAJourPossible) return;
  if (Date.now() - memoire.lire('verificationPack', 0) > DOUZE_HEURES) {
    memoire.ecrire('verificationPack', Date.now());
    await verifierMiseAJour(REGION).catch(() => null);
  }
  const etat = await etatMiseAJour().catch(() => null);
  if (!etat) return;
  if (etat.etat === 'telechargement') {
    const part = etat.total > 0 ? ` ${Math.round((etat.recu / etat.total) * 100)} %` : '';
    ecrireLimites(` · mise à jour en cours${part} (en Wi-Fi)`);
    clearTimeout(suiviMiseAJour);
    suiviMiseAJour = setTimeout(suivreMiseAJour, 15000);
  } else if (etat.etat === 'installee') {
    ecrireLimites(` · données du ${jourTexte(etat.version)} prêtes, au prochain lancement`);
    if (memoire.lire('miseAJourAnnoncee', '') !== etat.version) {
      memoire.ecrire('miseAJourAnnoncee', etat.version);
      afficherToast(`Nouvelles données du ${jourTexte(etat.version)} téléchargées : elles serviront au prochain lancement.`);
    }
  } else ecrireLimites();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') suivreMiseAJour();
});
suivreMiseAJour();

// ---------- Au démarrage : reprendre le dernier parcours ----------

rendreParcours();
majInfoPlusTard();
ouvrirOnglet('parcours', plan ? 'parcours' : 'preparer');
if (plan) {
  carte.pret.then(() => {
    carte.afficherParcours(plan, -1);
    carte.cadrer(plan.jours.flatMap((j) => j.coords));
  });
}
