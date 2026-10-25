// TerraTrack, appli de terrain : préparer, suivre le parcours, improviser en route — sans réseau.
import { BOUTONS, suggerer } from './boutons.js';
import { COULEURS, creerCarte } from './carte.js';
import { h, heure, duree, km, versMinutes, dateTexte, moisTexte, simplifier, memoire } from './outils.js';
import { chargerPack } from './pack.js';
import { comprendre, correspond, iaDisponible } from './ia.js';
import { MOTS, PRECISION_MAX_M, RAYON_M, effetDesNotes, noteDe, noter, passageValide, verifierPassages } from './notes.js';
import {
  ENVIES,
  NUITS,
  RYTHMES,
  ajouterEtape,
  changerDestination,
  choisirNuit,
  dormirIci,
  planifier,
  prolongerEtape,
  supprimerEtape,
  totaux,
} from './parcours.js';

const REGION = 'lozere';
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
$('#limites').textContent = `${pack.meta.nom} · données OSM du ${new Date(pack.meta.version).toLocaleDateString('fr-FR')} · horaires et accès à vérifier sur place · bivouac : seuls les lieux déclarés`;

let plan = memoire.lire('plan', null);
// Lieux déjà visités : jamais reproposés, grisés sur la carte.
const dejaVus = new Map(memoire.lire('dejaVus', []).map((l) => [l.id, l]));
function marquerDejaVu(lieu) {
  dejaVus.set(lieu.id, { id: lieu.id, nom: lieu.nom, lat: lieu.lat, lon: lieu.lon });
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
$('#poignee').addEventListener('click', () => {
  if (tiroir.classList.contains('reduit')) tiroir.classList.remove('reduit');
  else if (tiroir.classList.contains('grand')) tiroir.classList.replace('grand', 'reduit');
  else tiroir.classList.add('grand');
});
function ouvrirOnglet(nom) {
  for (const b of document.querySelectorAll('[data-onglet]')) b.setAttribute('aria-selected', String(b.dataset.onglet === nom));
  for (const id of ['preparer', 'parcours', 'route']) $(`#${id}`).hidden = id !== nom;
  if (nom === 'route') preparerRoute();
}
for (const b of document.querySelectorAll('[data-onglet]')) b.addEventListener('click', () => ouvrirOnglet(b.dataset.onglet));

// ---------- Préparer ----------

const form = $('#preparer');
const brouillon = memoire.lire('brouillon', {});
const GROUPES = {
  mode: { options: { destination: 'Une destination', boucle: 'Boucle et retour', surprise: 'Surprends-moi' }, unique: true, defaut: ['destination'] },
  jours: { options: [['0.5', '½ journée'], ['1', '1 jour'], ['2', 'Week-end'], ['3', '3 jours']], unique: true, defaut: ['2'] },
  rythme: { options: Object.fromEntries(Object.entries(RYTHMES).map(([k, r]) => [k, r.nom])), unique: true, defaut: ['normal'] },
  envies: { options: ENVIES, unique: false, defaut: ['patrimoine', 'panoramas', 'nature'] },
  nuits: { options: Object.fromEntries(Object.entries(NUITS).map(([k, n]) => [k, n.nom])), unique: false, defaut: ['camping', 'gite'] },
};
for (const [nom, g] of Object.entries(GROUPES)) {
  const zone = form.querySelector(`[data-groupe="${nom}"]`);
  const choisis = brouillon[nom] ? [].concat(brouillon[nom]).map(String) : g.defaut;
  // Les clés numériques d'un objet se rangent d'elles-mêmes : un tableau garde l'ordre voulu.
  zone.innerHTML = (Array.isArray(g.options) ? g.options : Object.entries(g.options))
    .map(([v, t]) => `<button type="button" class="puce" data-valeur="${v}" aria-pressed="${choisis.includes(v)}">${h(t)}</button>`)
    .join('');
  zone.addEventListener('click', (ev) => {
    const puce = ev.target.closest('.puce');
    if (!puce) return;
    if (g.unique) for (const p of zone.children) p.setAttribute('aria-pressed', String(p === puce));
    else puce.setAttribute('aria-pressed', String(puce.getAttribute('aria-pressed') !== 'true'));
    majMode();
  });
}
const choix = (nom) => [...form.querySelectorAll(`[data-groupe="${nom}"] [aria-pressed="true"]`)].map((p) => p.dataset.valeur);
function majMode() {
  const mode = choix('mode')[0];
  $('#champ-destination').hidden = mode === 'surprise';
  $('#champ-destination').firstChild.textContent = mode === 'boucle' ? 'Autour de quel endroit ?' : 'Où vas-tu ?';
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
    };
  });
}
autocompletion('depart');
autocompletion('destination');
form.elements.date.value = brouillon.date ?? new Date().toISOString().slice(0, 10);
if (brouillon.heure) form.elements.heure.value = brouillon.heure;
majMode();

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const erreur = $('#erreur-preparer');
  const mode = choix('mode')[0];
  const p = {
    depart: choisiesLieux.depart,
    destination: mode === 'surprise' ? null : choisiesLieux.destination,
    mode,
    jours: Number(choix('jours')[0]),
    date: form.elements.date.value,
    heure: versMinutes(form.elements.heure.value || '09:30'),
    rythme: choix('rythme')[0],
    envies: choix('envies'),
    nuits: choix('nuits'),
    exclus: [...dejaVus.keys(), ...effetDesNotes().ecartes],
    bonusParType: effetDesNotes().bonusParType,
  };
  memoire.ecrire('brouillon', { ...p, mode, jours: String(p.jours), heure: form.elements.heure.value });
  if (!p.depart) return montrerErreur(erreur, 'Choisis ta commune de départ dans la liste.');
  if (mode === 'destination' && !p.destination) return montrerErreur(erreur, 'Choisis ta destination dans la liste.');
  erreur.hidden = true;
  try {
    plan = planifier(pack, p);
  } catch (e) {
    return montrerErreur(erreur, e.message);
  }
  jourActif = 0;
  enregistrer();
  ouvrirOnglet('parcours');
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
  const t = totaux(plan);
  zone.innerHTML = `
    <div class="totaux">
      <div><b>${km(t.metres)}</b>distance</div>
      <div><b>${duree(t.conduiteMin)}</b>de route</div>
      <div><b>${t.peage ? 'oui' : 'aucun'}</b>péage</div>
      <div><b>+${duree(t.detourMin)}</b>de détours</div>
    </div>
    ${plan.jours.map(rendreJour).join('')}
    <div class="titre">Les plans changent ?</div>
    <label class="champ">Nouvelle destination
      <div class="recherche"><input id="nouvelle-destination" placeholder="Commune" /><ul class="propositions" hidden></ul></div>
    </label>
    <button type="button" class="secondaire" id="changer-destination">Recalculer à partir du jour ${jourActif + 1}</button>`;
  brancherNouvelleDestination();
}

function rendreJour(j, i) {
  const etapes = j.etapes
    .map(
      (e, k) => `
      <div class="etape">
        <div class="h">${heure(e.arriveeMin)}</div>
        <div>
          <div class="nom">${h(e.nom)}</div>
          <small>${h(e.type)} · visite ${duree(e.visiteMin)}${e.detourMin >= 1 ? ` · détour +${duree(e.detourMin)}` : ' · sur la route'}</small>
          ${texteNote(e.id)}
          <div class="actions">
            <button data-action="supprimer" data-j="${i}" data-k="${k}">✕ Retirer</button>
            <button data-action="prolonger" data-j="${i}" data-k="${k}">+30 min</button>
            <button data-action="nuit-ici" data-j="${i}" data-k="${k}">🌙 Dormir près d’ici</button>
            <button data-action="deja-vu" data-j="${i}" data-k="${k}">✓ Déjà visité</button>
            <button data-action="noter" data-j="${i}" data-k="${k}">★ Noter</button>
          </div>
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
      <div class="etape nuit">
        <div class="h">${heure(fin.arriveeMin)}</div>
        <div>
          <div class="nom">${soir} : ${h(fin.nom)}</div>
          <small>${fin.type ? `${h(fin.type)} · ` : ''}${marge}</small>
          ${infoDatee(fin)}
        </div>
      </div>
      ${j.alertes.map((a) => `<p class="alerte">⚠️ ${h(a)}</p>`).join('')}
    </article>`;
}

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
  const k = Number(b.dataset.k);
  switch (b.dataset.action) {
    case 'voir-jour':
      jourActif = j;
      carte.afficherParcours(plan, j);
      carte.cadrer(plan.jours[j].coords);
      return;
    case 'supprimer':
      supprimerEtape(pack, plan, j, k);
      break;
    case 'prolonger':
      prolongerEtape(pack, plan, j, k, 30);
      break;
    case 'noter':
      return ouvrirNotation(plan.jours[j].etapes[k]);
    case 'deja-vu':
      marquerDejaVu(plan.jours[j].etapes[k]);
      supprimerEtape(pack, plan, j, k);
      break;
    case 'nuit-ici': {
      const e = plan.jours[j].etapes[k];
      const nuit = choisirNuit(pack, e, plan.params.nuits);
      if (!nuit) return alert('Aucun hébergement déclaré près de cette étape.');
      dormirIci(pack, plan, j, nuit);
      break;
    }
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
}
const versHeure = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
avance.addEventListener('input', placerSurLeTrajet);

// Vraie position GPS : suivie en continu, elle valide aussi les passages pour pouvoir noter.
let suivi = null;
$('#gps').addEventListener('click', () => {
  if (!navigator.geolocation) return alert('Position indisponible sur cet appareil.');
  if (suivi != null) navigator.geolocation.clearWatch(suivi);
  let premiere = true;
  suivi = navigator.geolocation.watchPosition(
    ({ coords }) => {
      position = { lat: coords.latitude, lon: coords.longitude, nom: 'Ma position' };
      const d = new Date();
      maintenant.value = versHeure(d.getHours() * 60 + d.getMinutes());
      carte.afficherPosition(position);
      if (premiere) carte.voler(position, 12);
      premiere = false;
      const proches = pack.lieux.filter((l) => l.nom && Math.abs(l.lat - position.lat) < 0.004 && Math.abs(l.lon - position.lon) < 0.006);
      for (const l of verifierPassages(position, coords.accuracy, proches)) afficherToast(`📍 Passage vérifié : ${l.nom}. Tu peux le noter.`);
    },
    () => alert('Position refusée ou indisponible.'),
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 },
  );
  $('#gps').textContent = '📍 Position GPS suivie';
});

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
function proposer(bouton, options) {
  dernierBouton = bouton;
  const { suggestions, resteMin } = suggerer(pack, plan, { j: jourActif, position, minute: versMinutes(maintenant.value) }, dernierBouton, { ...options, dejaVus: new Set(dejaVus.keys()) });
  dernieresSuggestions = suggestions;
  carte.afficherSuggestions(suggestions, dernierBouton);
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
        <div class="suggestion">
          <div class="rang" style="background:${COULEURS[dernierBouton]}">${i + 1}</div>
          <div>
            <div class="nom"><b>${h(s.nom || s.type)}</b></div>
            <small class="info">${h(s.nom ? s.type : '')} ${acces}</small>
            ${infoDatee(s)}
            ${texteNote(s.id)}
            <div class="effet">${effet}</div>
            <div class="actions">
              <button data-i="${i}" data-action="voir">Voir</button>
              <button data-i="${i}" data-action="deja-vu">✓ Déjà vu</button>
              <button data-i="${i}" data-action="noter">★ Noter</button>
              <button data-i="${i}" data-action="${dernierBouton === 'dormir' ? 'dormir' : 'ajouter'}">${dernierBouton === 'dormir' ? '🌙 Dormir ici ce soir' : 'Ajouter au parcours'}</button>
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
  if (b.dataset.action === 'voir') return carte.voler(s, 14);
  if (b.dataset.action === 'noter') return ouvrirNotation(s);
  if (b.dataset.action === 'deja-vu') {
    marquerDejaVu(s);
    b.closest('.suggestion').remove();
    return;
  }
  if (b.dataset.action === 'dormir') dormirIci(pack, plan, jourActif, s);
  else ajouterEtape(pack, plan, jourActif, s);
  enregistrer();
  dernieresSuggestions = [];
  carte.afficherSuggestions([], dernierBouton);
  $('#suggestions').innerHTML = `<p class="info">✓ ${h(s.nom || s.type)} ajouté. Parcours recalculé.</p>`;
});
carte.surClicSuggestion((id) => {
  const i = dernieresSuggestions.findIndex((s) => s.id === id);
  document.querySelectorAll('#suggestions .suggestion')[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

// ---------- Au démarrage : reprendre le dernier parcours ----------

rendreParcours();
if (plan) {
  carte.pret.then(() => {
    carte.afficherParcours(plan, -1);
    carte.cadrer(plan.jours.flatMap((j) => j.coords));
  });
  ouvrirOnglet('parcours');
}
