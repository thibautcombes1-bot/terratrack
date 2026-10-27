import { calculerItineraires, suivreGuidage, distanceGuidage, symboleManoeuvre } from './navigation.js';
import { h, memoire, duree } from './outils.js';
import { positionRecente } from './suivi.js';
import { demanderAccordService } from './confidentialite.js';

const $ = (s) => document.querySelector(s);

export function creerNavigation({ carte, obtenirPosition, gpsActif, activerGps, natif, terrainNatif, revoirPreparer }) {
  const zone = document.createElement('section');
  zone.id = 'navigation'; zone.hidden = true; zone.setAttribute('aria-label', 'Guidage GPS');
  zone.innerHTML = `<div class="nav-consigne"><span id="nav-fleche" aria-hidden="true">⇄</span><div><strong id="nav-distance">Votre itinéraire</strong><p id="nav-instruction" role="status">Choisir un trajet</p></div></div>
    <div class="nav-outils"><button type="button" id="nav-voix" title="Annonces vocales" aria-label="Annonces vocales">♪</button><div class="nav-vues" role="group" aria-label="Vue de la carte"><button type="button" data-nav-vue="2d" aria-pressed="false">2D</button><button type="button" data-nav-vue="3d" aria-pressed="true">3D</button></div><button type="button" id="nav-centrer" title="Recentrer" aria-label="Recentrer sur ma position">⌖</button></div>
    <div class="nav-bas"><div class="nav-destination"><small>Destination</small><strong id="nav-cible"></strong></div>
      <div id="nav-choix"><div class="nav-preferences"><label><input type="checkbox" id="nav-sans-peage" /> Éviter les péages</label><label id="nav-parcours-label"><input type="checkbox" id="nav-parcours" /> Passer par le parcours du voyage</label></div><fieldset id="nav-liste"><legend>Itinéraires disponibles</legend><div id="nav-itineraires"></div></fieldset></div>
      <div class="nav-mesures"><div><strong id="nav-duree">—</strong><small>restantes</small></div><div><strong id="nav-reste">—</strong><small>distance</small></div><div><strong id="nav-arrivee">—</strong><small>arrivée</small></div></div>
      <p id="nav-statut" role="status"></p><button type="button" id="nav-preparer" hidden>Revoir les conditions de Préparer</button>
      <button type="button" id="nav-confirmer" disabled>Démarrer le guidage</button><button type="button" id="nav-reprendre" hidden>Reprendre le trajet actuel</button>
      <div class="nav-actions"><button type="button" id="nav-changer" hidden>Itinéraires</button><button type="button" id="nav-reessayer" hidden>Actualiser</button><button type="button" id="nav-fin">Fermer</button></div>
      <div class="nav-credit">Guidage © OpenStreetMap · FOSSGIS / OSRM · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">Corriger la carte</a></div></div>`;
  document.body.append(zone);
  const mesurer = () => zone.style.setProperty('--nav-outils-haut', (zone.querySelector('.nav-consigne').getBoundingClientRect().bottom + 10) + 'px');
  new ResizeObserver(mesurer).observe(zone.querySelector('.nav-consigne'));
  let actif = false, mode = 'choix', cible = null, options = {}, trajet = null, dernier = null, requete = null, generation = 0;
  let candidats = [], selection = null, cache = null, charge = false, erreur = '', departCalcul = null;
  let suit = true, vue3d = true, derniereAnnonce = '', sauvegarde = -Infinity, dejaCalcule = false;
  let voix = memoire.lire('navigationVoix', true), verrou = null, cacheDisponible = true;

  function mettreVoix() {
    $('#nav-voix').setAttribute('aria-pressed', String(voix));
    $('#nav-voix').textContent = voix ? '♪' : '×';
    $('#nav-voix').title = voix ? 'Couper les annonces vocales' : 'Activer les annonces vocales';
    $('#nav-voix').setAttribute('aria-label', $('#nav-voix').title);
  }
  function taire() {
    if (natif) terrainNatif.guidageParler({ texte: '' }).catch(() => {});
    else window.speechSynthesis?.cancel();
  }
  function annoncer(texte) {
    if (!voix || mode !== 'guidage' || document.visibilityState !== 'visible') return;
    if (natif) terrainNatif.guidageParler({ texte }).catch(() => { $('#nav-statut').textContent = 'Annonces vocales indisponibles.'; });
    else if (window.speechSynthesis) {
      const parole = new SpeechSynthesisUtterance(texte); parole.lang = 'fr-FR';
      window.speechSynthesis.cancel(); window.speechSynthesis.speak(parole);
    }
  }
  async function garderEcran() {
    if (!memoire.lire('navigationEcran', true)) return;
    if (!actif || document.visibilityState !== 'visible') return;
    if (natif) return terrainNatif.guidageEcran({ actif: true }).catch(() => {});
    const id = generation;
    try {
      if (!verrou || verrou.released) {
        const nouveau = await navigator.wakeLock?.request('screen');
        if (!actif || id !== generation) await nouveau?.release();
        else verrou = nouveau;
      }
    } catch { /* Facultatif selon le navigateur. */ }
  }
  function conserver() {
    if (!trajet) return;
    try {
      localStorage.setItem('terratrack.terrain.navigation', JSON.stringify({ trajet, options: { eviterPeages: Boolean(options.eviterPeages) }, progression: dernier?.progression ?? 0 }));
      cacheDisponible = true;
    } catch { cacheDisponible = false; }
  }
  function lireCache() {
    try {
      const ancien = JSON.parse(localStorage.getItem('terratrack.terrain.navigation'));
      const t = ancien?.trajet;
      if (!t || Date.now() - t.cree > 86400000 || Date.now() < t.cree || !Array.isArray(t.coords) || t.coords.length < 2 || t.coords.length !== t.cumul?.length || !t.manoeuvres?.length) return null;
      if (Math.abs(t.cible.lat - cible.lat) > 0.00001 || Math.abs(t.cible.lon - cible.lon) > 0.00001) return null;
      return { trajet: t, progression: ancien.progression || 0, eviterPeages: Boolean(ancien.options?.eviterPeages), nom: 'Trajet enregistré' };
    } catch { return null; }
  }
  function vue() {
    carte.modeNavigation(actif, mode === 'guidage' && vue3d);
    for (const b of zone.querySelectorAll('[data-nav-vue]')) b.setAttribute('aria-pressed', String((b.dataset.navVue === '3d') === vue3d));
    $('#nav-centrer').setAttribute('aria-pressed', String(suit));
  }
  function annulerCalcul() {
    generation++; requete?.abort(); requete = null; charge = false;
  }
  function montrerTraces(cadrer = false) {
    carte.afficherChoixGuidage(candidats.map((c) => c.trajet), selection);
    if (cadrer && candidats.length) carte.cadrerChoixGuidage(candidats.map((c) => c.trajet), selection);
  }
  function rendreListe() {
    $('#nav-itineraires').innerHTML = candidats.map((c, i) => {
      const secondes = c.trajet.secondes ?? c.trajet.manoeuvres.reduce((s, m) => s + m.secondes, 0);
      const routes = c.trajet.routes ?? [...new Set(c.trajet.manoeuvres.map((m) => m.nom).filter(Boolean))].slice(0, 3);
      return `<label class="nav-option"><input type="radio" name="nav-itineraire" value="${i}" ${selection === i ? 'checked' : ''} /><span><strong>${h(c.nom)}</strong><span>${distanceGuidage(c.trajet.metres)} · ${duree(secondes / 60)}</span><small>${routes.length ? 'Via ' + h(routes.join(', ')) : 'Tracé disponible sur la carte'}</small></span></label>`;
    }).join('');
    montrerTraces();
  }
  function compatibles(liste) {
    const raisons = [];
    const valides = liste.filter((c) => {
      const problemes = options.verifierTrajet?.(c.trajet) ?? [];
      raisons.push(...problemes);
      return !problemes.length;
    });
    if (liste.length && !valides.length) erreur = 'Aucun itinéraire ne respecte les conditions de Préparer. ' + [...new Set(raisons)].join(' ');
    return valides;
  }
  function changerMode(nouveau) {
    mode = nouveau; zone.dataset.mode = mode;
    $('#nav-choix').hidden = mode !== 'choix';
    $('#nav-confirmer').hidden = mode !== 'choix';
    $('#nav-changer').hidden = mode !== 'guidage';
    $('#nav-reprendre').hidden = mode !== 'choix' || !trajet;
    zone.querySelector('.nav-mesures').hidden = mode !== 'guidage';
    zone.querySelector('.nav-outils').hidden = mode !== 'guidage';
    $('#nav-fin').textContent = mode === 'guidage' ? 'Terminer le guidage' : 'Fermer';
    $('#nav-reessayer').textContent = 'Actualiser';
    taire(); vue();
  }
  async function calculer() {
    const position = obtenirPosition();
    if (!actif || mode !== 'choix' || charge || !gpsActif() || !positionRecente(position)) return;
    const id = ++generation;
    dejaCalcule = true;
    if (!demanderAccordService('guidage')) {
      erreur = 'Calcul en ligne non autorisé. Votre choix est modifiable dans Réglages → Services en ligne.';
      rendre(); return;
    }
    charge = true; erreur = ''; departCalcul = position;
    const eviterPeages = $('#nav-sans-peage').checked;
    const avecParcours = $('#nav-parcours').checked;
    const controleur = new AbortController(); requete = controleur;
    const attente = setTimeout(() => controleur.abort(), 20000);
    rendre();
    try {
      const passages = avecParcours ? options.passages?.(position, cible) ?? [] : [];
      if (avecParcours && !passages.length) throw new Error('Le parcours du voyage ne rejoint pas ce départ et cette destination. Décochez cette option pour comparer les autres routes.');
      const nouveaux = await calculerItineraires(position, cible, { signal: controleur.signal, eviterPeages,
        passages });
      if (!actif || id !== generation) return;
      candidats = compatibles(nouveaux.map((t, i) => ({ trajet: t, progression: 0, eviterPeages,
        nom: avecParcours ? 'Parcours du voyage' + (i ? ' · variante ' + (i + 1) : '') : 'Itinéraire ' + (i + 1) })));
      selection = null; rendreListe(); montrerTraces(true);
    } catch (e) {
      if (actif && id === generation) erreur = navigator.onLine === false ? 'Hors connexion. Seul un trajet déjà enregistré peut être proposé.' : e.name === 'AbortError' ? 'Le calcul a pris trop de temps. Réessayez.' : e.message;
    } finally {
      clearTimeout(attente);
      if (id === generation) { charge = false; requete = null; rendre(); }
    }
  }
  function choisir(index) {
    if (!actif || mode !== 'choix' || !candidats[index]) return;
    selection = index; erreur = '';
    for (const r of zone.querySelectorAll('[name="nav-itineraire"]')) r.checked = Number(r.value) === index;
    montrerTraces(true); rendre();
  }
  function confirmer() {
    if (selection == null) return;
    const choisi = candidats[selection];
    if (!choisi || !gpsActif() || !positionRecente(obtenirPosition())) return;
    const problemes = options.verifierTrajet?.(choisi.trajet) ?? [];
    if (problemes.length) { erreur = 'Revoir Préparer : ' + problemes.join(' '); rendre(); return; }
    const etat = suivreGuidage(choisi.trajet, obtenirPosition(), { progression: choisi.progression });
    if (etat.genre === 'hors-route' || etat.genre === 'gps') {
      erreur = 'Votre position a changé ou ce trajet est trop éloigné. Actualisez les itinéraires.'; rendre(); return;
    }
    trajet = choisi.trajet; dernier = etat; options.eviterPeages = choisi.eviterPeages;
    derniereAnnonce = ''; sauvegarde = -Infinity; suit = true; vue3d = memoire.lire('navigationVue', '3d') === '3d';
    annulerCalcul(); changerMode('guidage'); carte.afficherChoixGuidage([], null); carte.afficherGuidage(trajet.coords);
    conserver(); garderEcran(); rendre();
  }
  function ouvrirChoix() {
    annulerCalcul(); selection = null; erreur = ''; dejaCalcule = false;
    candidats = trajet ? [{ trajet, progression: dernier?.progression ?? 0, eviterPeages: Boolean(options.eviterPeages), nom: 'Trajet actuel' }] : cache ? [cache] : [];
    if ($('#nav-sans-peage').checked) candidats = candidats.filter((c) => c.eviterPeages);
    if (positionRecente(obtenirPosition())) candidats = compatibles(candidats);
    changerMode('choix'); carte.afficherGuidage([]); rendreListe(); montrerTraces(true); rendre();
  }
  function rendre() {
    if (!actif) return;
    const position = obtenirPosition();
    const signal = gpsActif() && positionRecente(position);
    if (mode === 'choix') {
      $('#nav-preparer').hidden = !revoirPreparer || charge || (!erreur && candidats.length > 0);
      $('#nav-fleche').textContent = '⇄'; $('#nav-distance').textContent = 'Vers la prochaine étape';
      $('#nav-instruction').textContent = !signal ? 'En attente de votre position GPS' : charge ? 'Recherche des itinéraires…' : candidats.length + ' itinéraire' + (candidats.length > 1 ? 's disponibles' : ' disponible');
      $('#nav-confirmer').disabled = selection == null || !signal || charge;
      $('#nav-reessayer').hidden = charge || !signal;
      $('#nav-reprendre').disabled = !signal;
      $('#nav-statut').textContent = charge ? 'Calcul en ligne · position et destination envoyées à FOSSGIS / OSRM' : erreur || (navigator.onLine === false ? 'Hors ligne · trajets enregistrés uniquement' : selection == null ? 'Aucun itinéraire sélectionné' : 'Itinéraire sélectionné · prêt à démarrer');
      if (signal && !dejaCalcule && !charge) {
        if (navigator.onLine !== false) calculer();
        else { candidats = compatibles(cache ? [cache] : []); rendreListe(); dejaCalcule = true; }
      }
      return;
    }
    const etat = suivreGuidage(trajet, signal ? position : null, dernier);
    $('#nav-reessayer').hidden = true;
    if (etat.genre === 'direct' || etat.genre === 'arrivee') {
      dernier = etat;
      $('#nav-fleche').textContent = etat.genre === 'arrivee' ? '⚑' : symboleManoeuvre(etat.prochaine);
      $('#nav-distance').textContent = etat.genre === 'arrivee' ? 'Arrivée' : distanceGuidage(etat.distance);
      $('#nav-instruction').textContent = etat.texte;
      $('#nav-duree').textContent = Math.max(1, Math.round(etat.secondes / 60)) + ' min';
      $('#nav-reste').textContent = distanceGuidage(etat.reste);
      $('#nav-arrivee').textContent = new Date(Date.now() + etat.secondes * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      carte.suivreNavigation([position.lon, position.lat], etat.cap, vue3d, suit);
      const palier = etat.distance < 40 ? 'maintenant' : etat.distance < 250 ? 'proche' : 'loin';
      const cle = etat.genre === 'arrivee' ? 'arrivee' : etat.prochaine.debut + ':' + palier;
      if (cle !== derniereAnnonce) {
        annoncer((etat.genre !== 'arrivee' && etat.distance >= 40 ? 'Dans ' + distanceGuidage(etat.distance) + ', ' : '') + etat.texte);
        derniereAnnonce = cle;
      }
      if (Math.abs(etat.progression - sauvegarde) > 100) { conserver(); sauvegarde = etat.progression; }
    } else {
      if (['hors-route', 'rejoindre'].includes(etat.genre) && signal) carte.suivreNavigation([position.lon, position.lat], etat.cap ?? dernier?.cap ?? 0, vue3d, suit);
      else carte.positionNavigationInconnue();
      taire(); $('#nav-distance').textContent = etat.genre === 'gps' ? 'GPS' : etat.genre === 'rejoindre' ? distanceGuidage(etat.distance) : 'Hors trajet';
      $('#nav-fleche').textContent = '⌖'; $('#nav-instruction').textContent = etat.texte;
      for (const id of ['nav-duree', 'nav-reste', 'nav-arrivee']) $('#' + id).textContent = '—';
    }
    $('#nav-statut').textContent = !cacheDisponible ? 'Trajet non enregistré : stockage du téléphone plein.' : etat.genre === 'hors-route' ? 'Trajet conservé · changement d’itinéraire à votre choix' : navigator.onLine === false ? 'Consignes enregistrées · hors ligne' : 'Trajet et consignes conservés sur cet appareil';
  }
  function arreter() {
    if (!actif) return;
    actif = false; annulerCalcul(); taire();
    zone.hidden = true; document.body.classList.remove('en-navigation');
    carte.afficherChoixGuidage([], null); carte.afficherGuidage([]); carte.modeNavigation(false);
    if (natif) terrainNatif.guidageEcran({ actif: false }).catch(() => {});
    verrou?.release().catch(() => {}); verrou = null;
  }
  async function demarrer(destination, parametres = {}) {
    arreter(); const id = ++generation;
    cible = { ...destination }; options = { ...parametres }; trajet = null; dernier = null; erreur = ''; sauvegarde = -Infinity;
    actif = true; suit = true; vue3d = memoire.lire('navigationVue', '3d') === '3d'; voix = memoire.lire('navigationVoix', true); zone.hidden = false; dejaCalcule = false; cacheDisponible = true;
    $('#nav-sans-peage').checked = Boolean(options.eviterPeages); $('#nav-parcours').checked = false;
    $('#nav-parcours-label').hidden = typeof options.passages !== 'function' || options.parcoursDisponible === false;
    zone.querySelector('.nav-preferences').hidden = Boolean(options.conditionsPreparees);
    document.body.classList.add('en-navigation'); $('#nav-cible').textContent = cible.nom || 'Destination'; mesurer();
    cache = lireCache();
    await carte.pret;
    if (!actif || id !== generation) return;
    mettreVoix(); ouvrirChoix();
    if (!gpsActif()) await activerGps();
    rendre();
  }
  $('#nav-fin').onclick = arreter;
  $('#nav-preparer').onclick = () => { arreter(); revoirPreparer?.(); };
  $('#nav-confirmer').onclick = confirmer;
  $('#nav-changer').onclick = ouvrirChoix;
  $('#nav-reprendre').onclick = () => {
    if (!trajet) return;
    const etat = suivreGuidage(trajet, obtenirPosition(), dernier);
    if (!gpsActif() || !['direct', 'arrivee', 'rejoindre'].includes(etat.genre)) { erreur = 'Le trajet actuel ne rejoint pas votre position. Choisissez un nouvel itinéraire.'; rendre(); return; }
    annulerCalcul(); changerMode('guidage'); carte.afficherChoixGuidage([], null); carte.afficherGuidage(trajet.coords); garderEcran(); rendre();
  };
  $('#nav-reessayer').onclick = () => { if (mode === 'guidage') ouvrirChoix(); else calculer(); };
  $('#nav-itineraires').onchange = (ev) => choisir(Number(ev.target.value));
  for (const id of ['nav-sans-peage', 'nav-parcours']) $('#' + id).onchange = ouvrirChoix;
  $('#nav-centrer').onclick = () => { suit = true; vue(); rendre(); };
  $('#nav-voix').onclick = () => { voix = !voix; memoire.ecrire('navigationVoix', voix); mettreVoix(); taire(); derniereAnnonce = ''; if (voix) annoncer('Annonces vocales activées'); };
  zone.querySelectorAll('[data-nav-vue]').forEach((b) => b.onclick = () => { vue3d = b.dataset.navVue === '3d'; memoire.ecrire('navigationVue', b.dataset.navVue); vue(); rendre(); });
  carte.surChoixGuidage(choisir);
  carte.carte.on('dragstart', () => { if (actif && mode === 'guidage') { suit = false; vue(); } });
  window.addEventListener('offline', rendre);
  window.addEventListener('resize', () => { if (actif && mode === 'choix') requestAnimationFrame(() => montrerTraces(true)); });
  window.addEventListener('online', () => { if (actif && mode === 'choix' && !candidats.length) calculer(); rendre(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (mode === 'guidage') garderEcran(); rendre(); } else taire(); });
  setInterval(() => { if (document.visibilityState === 'visible') rendre(); }, 1000);
  return { demarrer, arreter, actualiser: rendre, get actif() { return actif; } };
}
