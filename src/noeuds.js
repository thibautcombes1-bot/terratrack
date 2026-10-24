// Couche des nœuds MeshCore et Meshtastic en direct, avec les puces de la barre du haut.
import * as Cesium from 'cesium';
import { h, ilYa, memoire, nombre } from './outils.js';

const RESEAUX = {
  meshcore: { nom: 'MeshCore', couleur: '#4fc3ff' },
  meshtastic: { nom: 'Meshtastic', couleur: '#67ea94' },
};
const RAFRAICHIR_MS = 5 * 60_000;

export function creerCoucheNoeuds(viewer) {
  const reglages = memoire.lire('couches', { meshcore: true, meshtastic: true, relais: false });
  const etat = Object.fromEntries(
    Object.keys(RESEAUX).map((r) => [r, { noeuds: [], date: 0, collection: null, erreur: null }]),
  );
  const barre = document.getElementById('barre');

  async function charger(reseau) {
    try {
      const reponse = await fetch(`/api/noeuds?reseau=${reseau}`);
      const donnees = await reponse.json();
      if (!reponse.ok) throw new Error(donnees.erreur);
      etat[reseau].noeuds = donnees.noeuds.map(([lat, lon, relais, vu, nom, type, id]) => ({
        lat,
        lon,
        relais: relais === 1,
        vu: vu * 1000,
        nom,
        type,
        id,
        reseau,
      }));
      etat[reseau].date = donnees.date;
      etat[reseau].erreur = null;
      dessiner(reseau);
    } catch (erreur) {
      etat[reseau].erreur = erreur.message;
    }
    majBarre();
  }

  function dessiner(reseau) {
    const e = etat[reseau];
    if (e.collection) viewer.scene.primitives.remove(e.collection);
    e.collection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    const couleur = Cesium.Color.fromCssColorString(RESEAUX[reseau].couleur);
    const contour = Cesium.Color.BLACK.withAlpha(0.55);
    // Petits de loin, plus gros de près ; les relais un peu plus gros que les autres.
    const echelle = new Cesium.NearFarScalar(1.5e4, 1.8, 2.5e6, 0.45);
    const maintenant = Date.now();
    for (const n of e.noeuds) {
      const age = maintenant - n.vu;
      e.collection.add({
        position: Cesium.Cartesian3.fromDegrees(n.lon, n.lat, 0),
        pixelSize: n.relais ? 6 : 4,
        color: couleur.withAlpha(age < 3_600_000 ? 0.95 : age < 86_400_000 ? 0.75 : 0.4),
        outlineColor: contour,
        outlineWidth: 1,
        scaleByDistance: echelle,
        id: { genre: 'noeud', noeud: n },
      });
    }
    appliquerVisibilite(reseau);
  }

  function appliquerVisibilite(reseau) {
    const c = etat[reseau].collection;
    if (!c) return;
    for (let i = 0; i < c.length; i++) {
      const point = c.get(i);
      point.show = reglages[reseau] && (!reglages.relais || point.id.noeud.relais);
    }
    viewer.scene.requestRender();
  }

  function basculer(cle) {
    reglages[cle] = !reglages[cle];
    memoire.ecrire('couches', reglages);
    for (const r of Object.keys(RESEAUX)) appliquerVisibilite(r);
    majBarre();
  }

  function majBarre() {
    const puces = Object.entries(RESEAUX).map(([r, info]) => {
      const e = etat[r];
      const titre = e.erreur
        ? `${info.nom} indisponible : ${e.erreur}`
        : e.date
          ? `${info.nom} : mis à jour ${ilYa(e.date)}`
          : 'chargement…';
      const compte = e.erreur ? '!' : e.date ? nombre(e.noeuds.length) : '…';
      return `<button class="puce-reseau" data-reseau="${r}" aria-pressed="${reglages[r]}" title="${h(titre)}"><span class="point"></span>${info.nom} ${compte}</button>`;
    });
    puces.push(
      `<button class="puce-reseau" data-reseau="relais" aria-pressed="${reglages.relais}" title="N'afficher que les relais (répéteurs, routeurs)"><span class="point"></span>Relais seulement</button>`,
    );
    barre.innerHTML = puces.join('');
  }

  barre.addEventListener('click', (ev) => {
    const bouton = ev.target.closest('[data-reseau]');
    if (bouton) basculer(bouton.dataset.reseau);
  });

  majBarre();
  const toutCharger = () => Promise.all(Object.keys(RESEAUX).map(charger));
  toutCharger();
  setInterval(toutCharger, RAFRAICHIR_MS);

  return {
    /** Nœuds chargés des réseaux demandés (pour recalculer une couverture). */
    noeuds: (reseaux) => reseaux.flatMap((r) => etat[r]?.noeuds ?? []),
  };
}

/** Contenu de la fiche d'un nœud cliqué. */
export function ficheNoeud(n) {
  return `
    <span class="etiquette">${h(RESEAUX[n.reseau].nom)} · ${h(n.type)}${n.relais ? ' · relais' : ''}</span>
    <strong>${h(n.nom)}</strong>
    <p>vu ${ilYa(n.vu)}<br>${n.lat.toFixed(4)}, ${n.lon.toFixed(4)}</p>`;
}
