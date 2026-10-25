// Les questions du road trip, une par une : départ, où aller, durée, transport, envies,
// derniers détails (et option radio mesh). Le brouillon est mémorisé.
import { profil, oublier } from './gouts.js';
import { h, memoire } from './outils.js';

const MODES = {
  destination: '🎯 Une destination précise',
  coin: '🗺️ Un coin à explorer (région, site…)',
  surprise: '🎲 Surprends-moi',
};
const CIBLES = {
  destination: { titre: 'Destination', exemple: 'ex. Gordes, Biarritz, Annecy', retour: false },
  coin: { titre: 'Le coin à explorer', exemple: 'ex. Gorges du Tarn, Luberon, Vercors', retour: true },
  surprise: { retour: true },
};
// Durées reprises de Roadtrip AI (« 3 heures », « Week-end »…).
const DUREES = [
  [0.25, 'Quelques heures'],
  [0.5, '½ journée'],
  [1, '1 jour'],
  [2, 'Week-end'],
  [3, '3 jours'],
  [5, '5 jours'],
  [7, '1 semaine'],
  [14, '2 semaines'],
];
const TRANSPORTS = {
  voiture: '🚗 Voiture',
  moto: '🏍️ Moto',
  van: '🚐 Van, camping-car',
  velo: '🚲 Vélo',
  pied: '🥾 À pied',
  train: '🚆 Train',
};
const ENVIES = {
  routes: '🛣️ Routes panoramiques',
  villages: '🏘️ Villages',
  nature: '🌿 Nature',
  panoramas: '🔭 Panoramas',
  patrimoine: '🏰 Patrimoine',
  gastronomie: '🍷 Gastronomie & vin',
  baignade: '🏊 Baignade',
  randonnee: '🥾 Randonnée',
  insolite: '✨ Insolite',
  aventure: '🧗 Aventure',
  musees: '🖼️ Musées',
  astronomie: '🌌 Astronomie',
  calme: '🍃 Calme',
  photo: '📷 Photo',
  local: '🧺 Produits locaux',
  soiree: '🎶 Soirées',
};

/** @param {{ surTermine: (demande: object) => void }} rappels */
export function creerFormulaire(etat, { surTermine }) {
  const form = document.getElementById('vue-formulaire');
  const e = form.elements;
  const questions = [...form.querySelectorAll('.question')];
  const boutonSuivant = document.getElementById('suivant');
  const boutonPrecedent = document.getElementById('precedent');
  const erreur = document.getElementById('erreur-question');
  const brouillon = memoire.lire('brouillon', {
    mode: 'surprise',
    jours: 2,
    transport: 'voiture',
    envies: ['routes', 'villages', 'nature'],
  });
  let position = brouillon.position ?? null;
  let etape = 0;

  // ---------- Puces ----------
  const groupes = {
    mode: { options: Object.entries(MODES), unique: true },
    jours: { options: DUREES, unique: true },
    transport: { options: Object.entries(TRANSPORTS), unique: true },
    envies: { options: Object.entries(ENVIES), unique: false },
  };
  for (const [nom, g] of Object.entries(groupes)) {
    const conteneur = form.querySelector(`[data-groupe="${nom}"]`);
    conteneur.innerHTML = g.options
      .map(([valeur, libelle]) => `<button type="button" class="puce" data-valeur="${valeur}" aria-pressed="false">${h(libelle)}</button>`)
      .join('');
    conteneur.addEventListener('click', (ev) => {
      const puce = ev.target.closest('.puce');
      if (!puce) return;
      if (g.unique) for (const p of conteneur.children) p.setAttribute('aria-pressed', String(p === puce));
      else puce.setAttribute('aria-pressed', String(puce.getAttribute('aria-pressed') !== 'true'));
      if (nom === 'mode') majMode(true);
      sauver();
    });
  }
  const selection = (nom) =>
    [...form.querySelectorAll(`[data-groupe="${nom}"] .puce[aria-pressed="true"]`)].map((p) => p.dataset.valeur);
  const choisir = (nom, valeurs) => {
    for (const p of form.querySelectorAll(`[data-groupe="${nom}"] .puce`))
      p.setAttribute('aria-pressed', String(valeurs.map(String).includes(p.dataset.valeur)));
  };

  /** Affiche le champ destination / coin selon le choix, et règle le retour par défaut. */
  function majMode(changement) {
    const mode = selection('mode')[0] ?? 'surprise';
    const cible = CIBLES[mode];
    document.getElementById('champ-cible').hidden = mode === 'surprise';
    if (cible.titre) {
      document.getElementById('titre-cible').textContent = cible.titre;
      e.cible.placeholder = cible.exemple;
    }
    if (changement) e.retour.checked = cible.retour;
  }

  // ---------- IA disponibles ----------
  const choixIA = e.ia;
  if (etat?.ia) {
    choixIA.options[0].textContent = etat.ia.ollama.ok
      ? `IA locale — ${etat.ia.ollama.modele}`
      : 'IA locale (Ollama ne répond pas)';
    choixIA.options[1].textContent = etat.ia.claude.ok
      ? `Claude — ${etat.ia.claude.modele} (en ligne)`
      : 'Claude (ajoute ta clé dans .env)';
    choixIA.options[1].disabled = !etat.ia.claude.ok;
  }

  // ---------- Ma position ----------
  document.getElementById('ma-position').addEventListener('click', () => {
    if (!navigator.geolocation) return alert('Ce navigateur ne donne pas la position.');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        position = { lat: coords.latitude, lon: coords.longitude };
        e.depart.value = 'Ma position';
        try {
          const { nom } = await fetch(`/api/position?lat=${position.lat}&lon=${position.lon}`).then((r) => r.json());
          if (nom) e.depart.value = nom;
        } catch {}
        sauver();
      },
      () => alert('Position refusée ou indisponible (sur iPhone, il faut une connexion sécurisée).'),
    );
  });
  e.depart.addEventListener('input', () => (position = null));

  // ---------- Goûts appris ----------
  const gouts = document.getElementById('gouts');
  function majGouts() {
    const p = profil();
    const nom = (c) => ENVIES[c]?.replace(/^\S+ /, '') ?? c;
    const morceaux = [
      p.aime.length && `aime ${p.aime.map(nom).join(', ')}`,
      p.evite.length && `évite ${p.evite.map(nom).join(', ')}`,
      p.lieuxRejetes.length && `${p.lieuxRejetes.length} lieu(x) écarté(s)`,
    ].filter(Boolean);
    gouts.hidden = !morceaux.length;
    gouts.innerHTML = `L'IA retient : ${h(morceaux.join(' · '))}. <button type="button">Oublier</button>`;
  }
  gouts.addEventListener('click', (ev) => {
    if (ev.target.tagName === 'BUTTON') {
      oublier();
      majGouts();
    }
  });

  // ---------- Questions une par une ----------
  function montrer(i) {
    etape = Math.max(0, Math.min(questions.length - 1, i));
    questions.forEach((q, n) => (q.hidden = n !== etape));
    document.getElementById('avancement').innerHTML = questions
      .map((_, n) => `<span class="${n <= etape ? 'fait' : ''}"></span>`)
      .join('');
    boutonPrecedent.disabled = etape === 0;
    boutonSuivant.textContent = etape === questions.length - 1 ? 'Composer mon road trip ✦' : 'Suivant →';
    erreur.hidden = true;
    questions[etape].querySelector('input[type="text"]:not([hidden])')?.focus({ preventScroll: true });
  }

  /** Message d'erreur si la question en cours n'a pas de réponse valable. */
  function manque() {
    if (etape === 0 && !e.depart.value.trim()) return "Dis-moi d'où tu pars.";
    if (etape === 1) {
      const mode = selection('mode')[0];
      if (!mode) return 'Choisis une option.';
      if (mode !== 'surprise' && !e.cible.value.trim())
        return mode === 'destination' ? 'Où veux-tu arriver ?' : 'Quel coin veux-tu explorer ?';
    }
    return null;
  }

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const probleme = manque();
    if (probleme) {
      erreur.textContent = probleme;
      erreur.hidden = false;
      return;
    }
    if (etape < questions.length - 1) montrer(etape + 1);
    else surTermine({ ...lire(), profil: profil() });
  });
  boutonPrecedent.addEventListener('click', () => montrer(etape - 1));

  // ---------- Lecture et brouillon ----------
  function lire() {
    return {
      depart: { texte: e.depart.value.trim(), ...(position ?? {}) },
      position,
      mode: selection('mode')[0] ?? 'surprise',
      cible: e.cible.value.trim(),
      retour: e.retour.checked,
      jours: Number(selection('jours')[0] ?? 1),
      transport: selection('transport')[0] ?? 'voiture',
      envies: selection('envies'),
      texte: e.texte.value,
      budget: e.budget.value,
      niveau: e.niveau.value,
      compagnie: e.compagnie.value,
      hebergement: e.hebergement.value,
      quand: e.quand.value.trim(),
      mesh: {
        reseaux: ['meshcore', 'meshtastic'].filter((r) => e[r].checked),
        couvert: e.couvert.checked,
        pointsHauts: e.pointsHauts.checked,
      },
      ia: e.ia.value,
    };
  }

  function sauver() {
    memoire.ecrire('brouillon', lire());
  }

  e.depart.value = brouillon.depart?.texte ?? '';
  e.cible.value = brouillon.cible ?? '';
  e.texte.value = brouillon.texte ?? '';
  for (const champ of ['budget', 'niveau', 'compagnie', 'hebergement', 'quand'])
    if (brouillon[champ] != null) e[champ].value = brouillon[champ];
  if (brouillon.mesh) {
    e.meshcore.checked = brouillon.mesh.reseaux.includes('meshcore');
    e.meshtastic.checked = brouillon.mesh.reseaux.includes('meshtastic');
    e.couvert.checked = brouillon.mesh.couvert;
    e.pointsHauts.checked = brouillon.mesh.pointsHauts;
  }
  if (brouillon.ia && !choixIA.querySelector(`[value="${brouillon.ia}"]`)?.disabled) e.ia.value = brouillon.ia;
  choisir('mode', [brouillon.mode]);
  choisir('jours', [brouillon.jours]);
  choisir('transport', [brouillon.transport]);
  choisir('envies', brouillon.envies ?? []);
  majMode(brouillon.retour == null);
  if (brouillon.retour != null) e.retour.checked = brouillon.retour;
  form.addEventListener('change', sauver);
  form.addEventListener('input', sauver);
  majGouts();
  montrer(0);

  return {
    majGouts,
    /** Revient à une question (0 = départ). */
    revenir: (i = 0) => montrer(i),
  };
}
