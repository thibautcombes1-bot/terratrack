// Horizon : assemble le globe, les nœuds mesh, le formulaire et le carnet.
import { creerCarnet } from './carnet.js';
import { creerFormulaire } from './formulaire.js';
import * as Cesium from 'cesium';
import { creerGlobe } from './globe.js';
import { telechargerGpx } from './gpx.js';
import { creerCoucheNoeuds, ficheNoeud } from './noeuds.js';
import { h, memoire } from './outils.js';

const viewer = creerGlobe('globe');
if (import.meta.env.DEV) window.horizon = { viewer, Cesium };
const couche = creerCoucheNoeuds(viewer);
const carnet = creerCarnet(viewer, couche);
const etat = await fetch('/api/etat')
  .then((r) => r.json())
  .catch(() => null);
const formulaire = creerFormulaire(etat);

const vues = {
  formulaire: document.getElementById('vue-formulaire'),
  progression: document.getElementById('vue-progression'),
  carnet: document.getElementById('vue-carnet'),
};
const montrer = (nom) => {
  for (const [cle, vue] of Object.entries(vues)) vue.hidden = cle !== nom;
};

// ---------- Génération ----------

const progression = document.getElementById('progression');
const erreur = document.getElementById('erreur');
let enCours = null;
let derniereDemande = null;

async function generer(demande) {
  derniereDemande = demande;
  enCours?.abort();
  enCours = new AbortController();
  progression.innerHTML = '';
  erreur.hidden = true;
  montrer('progression');
  try {
    const reponse = await fetch('/api/voyage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(demande),
      signal: enCours.signal,
    });
    // Le serveur envoie une ligne JSON par étape franchie, puis le voyage.
    const lecteur = reponse.body.pipeThrough(new TextDecoderStream()).getReader();
    let tampon = '';
    for (;;) {
      const { value, done } = await lecteur.read();
      if (done) break;
      tampon += value;
      let fin;
      while ((fin = tampon.indexOf('\n')) >= 0) {
        const ligne = tampon.slice(0, fin).trim();
        tampon = tampon.slice(fin + 1);
        if (ligne) traiter(JSON.parse(ligne));
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') afficherErreur(e.message);
  }
}

function traiter(message) {
  if (message.type === 'progres') {
    progression.insertAdjacentHTML('beforeend', `<li>${h(message.texte)}</li>`);
  } else if (message.type === 'resultat') {
    carnet.afficher(message.voyage);
    formulaire.majGouts();
    montrer('carnet');
  } else if (message.type === 'erreur') {
    afficherErreur(message.texte);
  }
}

function afficherErreur(texte) {
  erreur.textContent = texte;
  erreur.hidden = false;
  document.getElementById('annuler').textContent = '← Revenir au formulaire';
}

vues.formulaire.addEventListener('submit', (ev) => {
  ev.preventDefault();
  generer(formulaire.demande());
});

document.getElementById('annuler').addEventListener('click', (ev) => {
  enCours?.abort();
  ev.target.textContent = 'Annuler';
  montrer(carnet.voyage ? 'carnet' : 'formulaire');
});

document.getElementById('modifier').addEventListener('click', () => montrer('formulaire'));

document.getElementById('autre').addEventListener('click', () => {
  const precedent = carnet.voyage;
  generer({
    ...(derniereDemande ?? formulaire.demande()),
    eviter: precedent?.jours.map((j) => j.base.nom) ?? [],
  });
});

document.getElementById('gpx').addEventListener('click', () => {
  const nom = telechargerGpx(carnet.voyage);
  alert(`${nom} téléchargé.\n\nPour le T-Deck : copie-le sur la carte SD dans /rr/voyages/.\nSur iPhone : ouvre-le avec OsmAnd ou Organic Maps.`);
});

// ---------- Clics sur le globe ----------

const fiche = document.getElementById('fiche');
fiche.addEventListener('click', (ev) => {
  if (ev.target.classList.contains('fermer')) fiche.hidden = true;
});

const gestionnaire = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
gestionnaire.setInputAction(({ position }) => {
  const choisi = viewer.scene.pick(position);
  if (choisi?.id?.genre === 'noeud') {
    fiche.innerHTML = `<button class="fermer" type="button" aria-label="Fermer">×</button>${ficheNoeud(choisi.id.noeud)}`;
    fiche.hidden = false;
  } else if (choisi?.id instanceof Cesium.Entity) {
    carnet.surEntite(choisi.id.id);
  } else {
    fiche.hidden = true;
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// Sur téléphone, toucher l'en-tête replie ou déplie le tiroir.
document.getElementById('entete').addEventListener('click', () => {
  if (matchMedia('(max-width: 760px)').matches)
    document.getElementById('panneau').classList.toggle('replie');
});

// ---------- Au démarrage : reprendre le dernier voyage ----------

const dernier = memoire.lire('voyage', null);
if (dernier?.jours?.length) {
  carnet.afficher(dernier, { cadrer: false });
  montrer('carnet');
}
