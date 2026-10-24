// Le formulaire « Où allons-nous ? » : puces, possibilités, mesh, IA, brouillon mémorisé.
import { profil, oublier } from './gouts.js';
import { h, memoire } from './outils.js';

const DUREES = [
  [0.5, '½ journée'],
  [1, '1 jour'],
  [2, '2 jours'],
  [3, '3 jours'],
  [5, '5 jours'],
  [7, '1 semaine'],
  [14, '2 semaines'],
];
const TRANSPORTS = {
  voiture: '🚗 Voiture',
  moto: '🏍️ Moto',
  van: '🚐 Van',
  velo: '🚲 Vélo',
  pied: '🥾 À pied',
  train: '🚆 Train',
};
const ENVIES = {
  nature: '🌿 Nature',
  randonnee: '🥾 Randonnée',
  panoramas: '🔭 Panoramas',
  villages: '🏘️ Villages',
  patrimoine: '🏰 Patrimoine',
  musees: '🖼️ Musées',
  gastronomie: '🍷 Gastronomie & vin',
  baignade: '🏊 Baignade',
  aventure: '🧗 Aventure',
  insolite: '✨ Insolite',
  astronomie: '🌌 Astronomie',
  calme: '🍃 Calme',
  photo: '📷 Photo',
  routes: '🛣️ Routes panoramiques',
  local: '🧺 Produits locaux',
  soiree: '🎶 Soirées',
};

export function creerFormulaire(etat) {
  const form = document.getElementById('vue-formulaire');
  const brouillon = memoire.lire('formulaire', {
    jours: 2,
    transport: 'voiture',
    envies: ['nature', 'villages', 'patrimoine'],
  });
  let position = brouillon.position ?? null;

  // Puces
  const groupes = {
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
      sauver();
    });
  }
  const selection = (nom) =>
    [...form.querySelectorAll(`[data-groupe="${nom}"] .puce[aria-pressed="true"]`)].map((p) => p.dataset.valeur);
  const choisir = (nom, valeurs) => {
    for (const p of form.querySelectorAll(`[data-groupe="${nom}"] .puce`))
      p.setAttribute('aria-pressed', String(valeurs.map(String).includes(p.dataset.valeur)));
  };

  // IA disponibles
  const choixIA = form.elements.ia;
  if (etat?.ia) {
    choixIA.options[0].textContent = etat.ia.ollama.ok
      ? `IA locale — ${etat.ia.ollama.modele}`
      : 'IA locale (Ollama ne répond pas)';
    choixIA.options[1].textContent = etat.ia.claude.ok
      ? `Claude — ${etat.ia.claude.modele} (en ligne)`
      : 'Claude (ajoute ta clé dans .env)';
    choixIA.options[1].disabled = !etat.ia.claude.ok;
  }

  // Ma position
  document.getElementById('ma-position').addEventListener('click', () => {
    if (!navigator.geolocation) return alert("Ce navigateur ne donne pas la position.");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        position = { lat: coords.latitude, lon: coords.longitude };
        form.elements.depart.value = 'Ma position';
        try {
          const { nom } = await fetch(`/api/position?lat=${position.lat}&lon=${position.lon}`).then((r) => r.json());
          if (nom) form.elements.depart.value = nom;
        } catch {}
        sauver();
      },
      () => alert("Position refusée ou indisponible (sur iPhone, il faut une connexion sécurisée)."),
    );
  });
  form.elements.depart.addEventListener('input', () => (position = null));

  // Goûts appris
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

  function lire() {
    const e = form.elements;
    return {
      depart: { texte: e.depart.value.trim(), ...(position ?? {}) },
      position,
      jours: Number(selection('jours')[0] ?? 1),
      transport: selection('transport')[0] ?? 'voiture',
      envies: selection('envies'),
      texte: e.texte.value,
      budget: e.budget.value,
      niveau: e.niveau.value,
      compagnie: e.compagnie.value,
      hebergement: e.hebergement.value,
      quand: e.quand.value.trim(),
      retour: e.retour.checked,
      mesh: {
        reseaux: ['meshcore', 'meshtastic'].filter((r) => e[r].checked),
        couvert: e.couvert.checked,
        pointsHauts: e.pointsHauts.checked,
      },
      ia: e.ia.value,
    };
  }

  function sauver() {
    memoire.ecrire('formulaire', lire());
  }

  // Restauration du brouillon
  const e = form.elements;
  e.depart.value = brouillon.depart?.texte ?? '';
  e.texte.value = brouillon.texte ?? '';
  for (const champ of ['budget', 'niveau', 'compagnie', 'hebergement', 'quand'])
    if (brouillon[champ] != null) e[champ].value = brouillon[champ];
  if (brouillon.retour != null) e.retour.checked = brouillon.retour;
  if (brouillon.mesh) {
    e.meshcore.checked = brouillon.mesh.reseaux.includes('meshcore');
    e.meshtastic.checked = brouillon.mesh.reseaux.includes('meshtastic');
    e.couvert.checked = brouillon.mesh.couvert;
    e.pointsHauts.checked = brouillon.mesh.pointsHauts;
  }
  if (brouillon.ia && !choixIA.querySelector(`[value="${brouillon.ia}"]`)?.disabled) e.ia.value = brouillon.ia;
  choisir('jours', [brouillon.jours]);
  choisir('transport', [brouillon.transport]);
  choisir('envies', brouillon.envies ?? []);
  form.addEventListener('change', sauver);
  majGouts();

  return {
    /** La demande complète envoyée au serveur. */
    demande: () => ({ ...lire(), profil: profil() }),
    majGouts,
  };
}
