import { calculerGuidage, suivreGuidage, distanceGuidage, symboleManoeuvre } from './navigation.js';
import { memoire } from './outils.js';
import { positionRecente } from './suivi.js';

const $ = (s) => document.querySelector(s);

export function creerNavigation({ carte, obtenirPosition, gpsActif, activerGps, natif, terrainNatif }) {
  const zone = document.createElement('section');
  zone.id = 'navigation'; zone.hidden = true; zone.setAttribute('aria-label', 'Guidage GPS');
  zone.innerHTML = `<div class="nav-consigne"><span id="nav-fleche" aria-hidden="true">↑</span><div><strong id="nav-distance">Guidage</strong><p id="nav-instruction" role="status">Recherche du GPS…</p></div></div>
    <div class="nav-outils"><button type="button" id="nav-voix" title="Annonces vocales" aria-label="Annonces vocales">♪</button><div class="nav-vues" role="group" aria-label="Vue de la carte"><button type="button" data-nav-vue="2d" aria-pressed="false">2D</button><button type="button" data-nav-vue="3d" aria-pressed="true">3D</button></div><button type="button" id="nav-centrer" title="Recentrer" aria-label="Recentrer sur ma position">⌖</button></div>
    <div class="nav-bas"><div class="nav-destination"><small>Destination</small><strong id="nav-cible"></strong></div><div class="nav-mesures"><div><strong id="nav-duree">—</strong><small>restantes</small></div><div><strong id="nav-reste">—</strong><small>distance</small></div><div><strong id="nav-arrivee">—</strong><small>arrivée</small></div></div><p id="nav-statut" role="status"></p><button type="button" id="nav-reessayer" hidden>Recalculer le trajet</button><button type="button" id="nav-fin">Terminer le guidage</button><div class="nav-credit">Guidage © OpenStreetMap · FOSSGIS / OSRM · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">Corriger la carte</a></div></div>`;
  document.body.append(zone);
  const mesurer = () => zone.style.setProperty('--nav-outils-haut', (zone.querySelector('.nav-consigne').getBoundingClientRect().bottom + 10) + 'px');
  new ResizeObserver(mesurer).observe(zone.querySelector('.nav-consigne'));
  let actif = false, cible = null, options = {}, trajet = null, dernier = null, requete = null, generation = 0;
  let suit = true, vue3d = true, charge = false, erreur = '', dernierCalcul = 0, horsRouteDepuis = 0, derniereAnnonce = '', sauvegarde = -Infinity;
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
    if (!voix || document.visibilityState !== 'visible') return;
    if (natif) terrainNatif.guidageParler({ texte }).catch(() => { $('#nav-statut').textContent = 'Annonces vocales indisponibles.'; });
    else if (window.speechSynthesis) {
      const parole = new SpeechSynthesisUtterance(texte); parole.lang = 'fr-FR';
      window.speechSynthesis.cancel(); window.speechSynthesis.speak(parole);
    }
  }
  async function garderEcran() {
    if (!actif || document.visibilityState !== 'visible') return;
    if (natif) return terrainNatif.guidageEcran({ actif: true }).catch(() => {});
    try { if (!verrou || verrou.released) verrou = await navigator.wakeLock?.request('screen'); } catch { /* Facultatif selon le navigateur. */ }
  }
  function conserver() {
    if (!trajet) return;
    try {
      localStorage.setItem('terratrack.terrain.navigation', JSON.stringify({ trajet, options, progression: dernier?.progression ?? 0 }));
      cacheDisponible = true;
    } catch { cacheDisponible = false; }
  }
  function lireCache() {
    try {
      const ancien = JSON.parse(localStorage.getItem('terratrack.terrain.navigation'));
      const t = ancien?.trajet;
      if (!t || Date.now() - t.cree > 86400000 || Date.now() < t.cree || !Array.isArray(t.coords) || t.coords.length < 2 || t.coords.length !== t.cumul?.length || !t.manoeuvres?.length) return;
      if (Math.abs(t.cible.lat - cible.lat) > 0.00001 || Math.abs(t.cible.lon - cible.lon) > 0.00001 || Boolean(ancien.options.eviterPeages) !== Boolean(options.eviterPeages)) return;
      trajet = t; dernier = { progression: ancien.progression || 0 };
    } catch { /* Un cache absent ou illisible ne devient jamais un trajet. */ }
  }
  function vue() {
    carte.modeNavigation(actif, vue3d);
    for (const b of zone.querySelectorAll('[data-nav-vue]')) b.setAttribute('aria-pressed', String((b.dataset.navVue === '3d') === vue3d));
    $('#nav-centrer').setAttribute('aria-pressed', String(suit));
  }
  async function calculer() {
    const position = obtenirPosition();
    if (!actif || charge || !gpsActif() || !positionRecente(position)) return;
    const id = generation;
    charge = true; erreur = ''; dernierCalcul = Date.now();
    requete = new AbortController();
    const controleur = requete;
    const attente = setTimeout(() => controleur.abort(), 20000);
    rendre();
    try {
      const nouveau = await calculerGuidage(position, cible, { signal: requete.signal, eviterPeages: options.eviterPeages, passages: options.passages?.(position, cible) ?? [] });
      if (!actif || id !== generation) return;
      trajet = nouveau; dernier = null; horsRouteDepuis = 0; derniereAnnonce = ''; sauvegarde = -Infinity;
      conserver(); carte.afficherGuidage(trajet.coords);
    } catch (e) {
      if (actif && id === generation) erreur = navigator.onLine === false ? 'Hors connexion. Reconnectez-vous pour calculer ce trajet.' : e.name === 'AbortError' ? 'Le calcul a pris trop de temps. Réessayez.' : e.message;
    } finally {
      clearTimeout(attente);
      if (id === generation) { charge = false; requete = null; rendre(); }
    }
  }
  function rendre() {
    if (!actif) return;
    const position = obtenirPosition();
    const signal = gpsActif() && positionRecente(position);
    let etat = trajet ? suivreGuidage(trajet, signal ? position : null, dernier) : null;
    $('#nav-reessayer').hidden = charge || !signal || (!erreur && etat?.genre !== 'hors-route');
    $('#nav-reessayer').disabled = charge;
    if (etat) {
      if (etat.genre === 'direct' || etat.genre === 'arrivee') {
        dernier = etat; horsRouteDepuis = 0;
        $('#nav-fleche').textContent = etat.genre === 'arrivee' ? '⚑' : symboleManoeuvre(etat.prochaine);
        $('#nav-distance').textContent = etat.genre === 'arrivee' ? 'Arrivée' : distanceGuidage(etat.distance);
        $('#nav-instruction').textContent = etat.texte;
        $('#nav-duree').textContent = Math.max(1, Math.round(etat.secondes / 60)) + ' min';
        $('#nav-reste').textContent = distanceGuidage(etat.reste);
        $('#nav-arrivee').textContent = new Date(Date.now() + etat.secondes * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        if (suit) carte.suivreNavigation(etat.coord, etat.cap, vue3d);
        const palier = etat.distance < 40 ? 'maintenant' : etat.distance < 250 ? 'proche' : 'loin';
        const cle = etat.genre === 'arrivee' ? 'arrivee' : etat.prochaine.debut + ':' + palier;
        if (cle !== derniereAnnonce) {
          annoncer((etat.genre !== 'arrivee' && etat.distance >= 40 ? 'Dans ' + distanceGuidage(etat.distance) + ', ' : '') + etat.texte);
          derniereAnnonce = cle;
        }
        if (Math.abs(etat.progression - sauvegarde) > 100) { conserver(); sauvegarde = etat.progression; }
      } else {
        taire();
        $('#nav-distance').textContent = etat.genre === 'gps' ? 'GPS' : 'Hors trajet';
        $('#nav-fleche').textContent = '⌖'; $('#nav-instruction').textContent = etat.texte;
        for (const id of ['nav-duree', 'nav-reste', 'nav-arrivee']) $('#' + id).textContent = '—';
        if (etat.genre === 'hors-route') {
          horsRouteDepuis ||= Date.now();
          if (!charge && !erreur && navigator.onLine !== false && Date.now() - horsRouteDepuis > 10000 && Date.now() - dernierCalcul > 30000) calculer();
        } else horsRouteDepuis = 0;
      }
    } else {
      $('#nav-fleche').textContent = '⌖'; $('#nav-distance').textContent = !signal ? 'GPS' : charge ? 'Calcul…' : 'Guidage';
      $('#nav-instruction').textContent = !signal ? 'En attente de votre position GPS' : charge ? 'Préparation des consignes' : 'Trajet indisponible';
      if (signal && !charge && !erreur) calculer();
    }
    $('#nav-statut').textContent = charge ? 'Calcul en ligne · position et destination envoyées à FOSSGIS / OSRM' : erreur || (!cacheDisponible ? 'Trajet non enregistré : stockage du téléphone plein.' : etat?.genre === 'hors-route' ? (navigator.onLine === false ? 'Hors ligne : reconnectez-vous pour recalculer.' : 'Recalcul du trajet disponible.') : navigator.onLine === false && trajet ? 'Consignes enregistrées · hors ligne' : 'Trajet et consignes conservés sur cet appareil');
  }
  function arreter() {
    if (!actif) return;
    actif = false; generation++; requete?.abort(); charge = false; taire();
    zone.hidden = true; document.body.classList.remove('en-navigation');
    carte.afficherGuidage([]); carte.modeNavigation(false);
    if (natif) terrainNatif.guidageEcran({ actif: false }).catch(() => {});
    verrou?.release().catch(() => {}); verrou = null;
  }
  async function demarrer(destination, parametres = {}) {
    arreter(); cible = { ...destination }; options = parametres; trajet = null; dernier = null; erreur = ''; sauvegarde = -Infinity;
    actif = true; suit = true; vue3d = true; horsRouteDepuis = 0; derniereAnnonce = ''; zone.hidden = false;
    document.body.classList.add('en-navigation'); $('#nav-cible').textContent = cible.nom || 'Destination'; mesurer();
    for (const id of ['nav-duree', 'nav-reste', 'nav-arrivee']) $('#' + id).textContent = '—';
    lireCache();
    await carte.pret;
    if (!actif) return;
    carte.afficherGuidage(trajet?.coords ?? []); vue(); mettreVoix(); garderEcran(); rendre();
    if (!gpsActif()) await activerGps();
    rendre();
  }
  $('#nav-fin').onclick = arreter;
  $('#nav-reessayer').onclick = () => { erreur = ''; calculer(); };
  $('#nav-centrer').onclick = () => { suit = true; vue(); rendre(); };
  $('#nav-voix').onclick = () => { voix = !voix; memoire.ecrire('navigationVoix', voix); mettreVoix(); taire(); derniereAnnonce = ''; if (voix) annoncer('Annonces vocales activées'); };
  zone.querySelectorAll('[data-nav-vue]').forEach((b) => b.onclick = () => { vue3d = b.dataset.navVue === '3d'; vue(); rendre(); });
  carte.carte.on('dragstart', () => { if (actif) { suit = false; vue(); } });
  window.addEventListener('offline', rendre); window.addEventListener('online', () => { if (actif && (!trajet || horsRouteDepuis)) { erreur = ''; calculer(); } rendre(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { garderEcran(); rendre(); } else taire(); });
  setInterval(() => { if (document.visibilityState === 'visible') rendre(); }, 1000);
  return { demarrer, arreter, actualiser: rendre, get actif() { return actif; } };
}
