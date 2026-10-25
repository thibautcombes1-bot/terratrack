// Le carnet de route : panneau jour par jour + visites numérotées, nuits, points hauts et tracé sur le globe.
import { couverture } from '../commun/couverture.js';
import * as Cesium from 'cesium';
import { avisSur, noter, rejetes } from './gouts.js';
import { duree, h, km, memoire } from './outils.js';

const NOMS = {
  nature: 'Nature',
  randonnee: 'Randonnée',
  panoramas: 'Panorama',
  villages: 'Village',
  patrimoine: 'Patrimoine',
  musees: 'Musée',
  gastronomie: 'Gastronomie',
  baignade: 'Baignade',
  aventure: 'Aventure',
  insolite: 'Insolite',
  astronomie: 'Astronomie',
};
const EMOJIS = {
  nature: '🌿',
  randonnee: '🥾',
  panoramas: '🔭',
  villages: '🏘️',
  patrimoine: '🏰',
  musees: '🖼️',
  gastronomie: '🍷',
  baignade: '🏊',
  aventure: '🧗',
  insolite: '✨',
  astronomie: '🌌',
};
const COULEURS = {
  ambre: Cesium.Color.fromCssColorString('#f0a63c'),
  haut: Cesium.Color.fromCssColorString('#b48cff'),
  bonne: Cesium.Color.fromCssColorString('#67ea94'),
  faible: Cesium.Color.fromCssColorString('#ffb547'),
  aucune: Cesium.Color.fromCssColorString('#ff6b6b'),
};

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export function creerCarnet(viewer, couche) {
  const zone = document.getElementById('carnet');
  const boutonSurvol = document.getElementById('survoler');
  const source = new Cesium.CustomDataSource('voyage');
  viewer.dataSources.add(source);
  let voyage = null;
  let tour = false;

  // ---------- Panneau ----------

  function badgeMesh(c) {
    if (!c) return '';
    const libelle = { bonne: 'mesh ok', faible: 'mesh faible', aucune: 'sans mesh' }[c.niveau];
    const titre = c.plusProche
      ? `${c.proches} nœud(s) à moins de 15 km. Le plus proche : ${c.plusProche.nom} (${c.plusProche.reseau}, ${c.plusProche.type}) à ${c.plusProche.distanceKm} km`
      : 'Aucun nœud à moins de 25 km';
    return `<span class="mesh" data-niveau="${c.niveau}" title="${h(titre)}">${libelle}</span>`;
  }

  function htmlVisite(v, i, k) {
    const avis = avisSur(v.nom);
    const vignette = v.image
      ? `<img class="vignette" src="${h(v.image)}" alt="" loading="lazy" />`
      : `<div class="vignette">${EMOJIS[v.categorie] ?? '📍'}</div>`;
    return `
      <div class="visite" data-jour="${i}" data-visite="${k}">
        ${vignette}
        <div>
          <div class="visite-nom">
            <button type="button" data-action="voir" data-cible="visite-${i}-${k}">${h(v.nom)}</button>
            <span class="etiquette">${h(NOMS[v.categorie] ?? 'À voir')}${v.detourKm >= 1 ? ` · détour ${Math.round(v.detourKm)} km` : ''}${v.labels?.length ? ' · ★' : ''}</span>
          </div>
          <p class="pourquoi">${h(v.pourquoi || v.description)}${v.labels?.length ? `<br><span class="etiquette">★ ${h(v.labels.join(' · '))}</span>` : ''}</p>
          <div class="actions-visite">
            <button type="button" data-action="aime" aria-pressed="${avis === 1}" title="J'aime : l'IA s'en souviendra">👍</button>
            <button type="button" data-action="aime-pas" title="Pas pour moi : remplacer et s'en souvenir">👎</button>
            <button type="button" data-action="remplacer" title="Proposer un autre lieu">⇄</button>
            ${v.lien ? `<a href="${h(v.lien)}" target="_blank" rel="noopener" title="Lire sur Wikipédia"><button type="button" tabindex="-1">W</button></a>` : ''}
            ${badgeMesh(v.couverture)}
          </div>
        </div>
      </div>`;
  }

  function htmlJour(j, i) {
    const ph = j.pointHaut;
    const dernier = i === voyage.jours.length - 1;
    const soir = j.base.retour
      ? 'retour à la maison'
      : dernier && voyage.mode === 'destination'
        ? `arrivée à ${j.base.nom}`
        : dernier && !voyage.retour
          ? `fin à ${j.base.nom}`
          : `nuit à ${j.base.nom}`;
    return `
      <article class="jour" data-jour="${i}">
        <button type="button" class="jour-tete" data-action="voir" data-cible="${j.base.retour ? `visite-${i}-0` : `base-${i}`}">
          <span class="numero">J${j.jour}</span>
          <span>
            <strong>${h(j.titre || j.base.nom)}</strong>
            <small>${km(j.distanceKm)} · ${duree(j.dureeH)} de route · ${h(soir)}</small>
          </span>
          ${badgeMesh(j.base.couverture)}
        </button>
        <div class="jour-corps">
          ${j.route ? `<div class="ligne-info"><span>🛣️</span><span>${h(j.route)}</span></div>` : ''}
          ${j.visites.map((v, k) => htmlVisite(v, i, k)).join('')}
          ${
            ph
              ? `<button type="button" class="point-haut" data-action="voir" data-cible="haut-${i}">📡 Point haut radio : <b>${h(ph.nom)}</b> · ${ph.ele} m${
                  ph.noeuds40 != null ? ` · ${ph.noeuds40} nœuds à moins de 40 km` : ''
                }</button>`
              : ''
          }
          ${j.nuit ? `<div class="ligne-info"><span>🌙</span><span>${h(j.nuit)}</span></div>` : ''}
          ${j.budget ? `<div class="ligne-info"><span>€</span><span>Environ ${j.budget} € par personne</span></div>` : ''}
          ${j.astuce ? `<div class="ligne-info"><span>💡</span><span>${h(j.astuce)}</span></div>` : ''}
        </div>
      </article>`;
  }

  function htmlCouverture(v) {
    if (!v.reseaux?.length) return '';
    const niveaux = v.jours.flatMap((j) => [j.base, ...j.visites]).map((x) => x.couverture?.niveau).filter(Boolean);
    const compte = (n) => niveaux.filter((x) => x === n).length;
    const [b, f, a] = ['bonne', 'faible', 'aucune'].map(compte);
    const total = niveaux.length || 1;
    return `
      <h3>Couverture mesh du voyage</h3>
      <div class="couverture-globale"><span style="width:${(b / total) * 100}%"></span><span style="width:${(f / total) * 100}%"></span><span style="width:${(a / total) * 100}%"></span></div>
      <div class="aide">${b} lieu(x) bien couvert(s), ${f} faiblement, ${a} sans nœud proche.</div>`;
  }

  function rendre() {
    const v = voyage;
    zone.innerHTML = `
      <h2>${h(v.titre)}</h2>
      <div class="stats">
        <span><b>${v.jours.length}</b> jour${v.jours.length > 1 ? 's' : ''}</span>
        <span><b>${km(v.trace.distanceKm)}</b>${v.trace.reel ? '' : ' (estimé)'}</span>
        <span><b>${duree(v.trace.dureeH)}</b> de trajet</span>
        <span>${h(v.modele)}</span>
      </div>
      <p class="resume">${h(v.resume)}</p>
      ${htmlCouverture(v)}
      ${v.avertissements.map((a) => `<div class="avertissement">${h(a)}</div>`).join('')}
      ${v.jours.map(htmlJour).join('')}
      ${v.conseils.length ? `<h3>Conseils</h3><ul class="conseils">${v.conseils.map((c) => `<li>${h(c)}</li>`).join('')}</ul>` : ''}
      <p class="credits">Lieux : Wikipédia · Étapes : Wikidata · Carte : Esri, OpenStreetMap · Mesh : meshmap.net, map.meshcore.io · Itinéraire : OSRM FOSSGIS · Textes : ${h(v.modele)}, à vérifier sur place.</p>`;
  }

  // ---------- Globe ----------

  const etiquette = (texte, options = {}) => ({
    text: texte,
    font: '600 13px system-ui, sans-serif',
    fillColor: Cesium.Color.WHITE,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 3,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    pixelOffset: new Cesium.Cartesian2(0, -14),
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    showBackground: true,
    backgroundColor: Cesium.Color.fromCssColorString('rgba(6,9,13,0.72)'),
    backgroundPadding: new Cesium.Cartesian2(7, 4),
    ...options,
  });
  const pastille = (couleur, taille, contour = Cesium.Color.BLACK) => ({
    pixelSize: taille,
    color: couleur,
    outlineColor: contour,
    outlineWidth: 2,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  });
  const position = (p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat);

  function dessiner() {
    const v = voyage;
    source.entities.removeAll();
    if (v.trace.coords.length > 1)
      source.entities.add({
        id: 'trace',
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(v.trace.coords.flat()),
          width: 4,
          material: COULEURS.ambre.withAlpha(0.9),
          clampToGround: true,
        },
      });
    source.entities.add({
      id: 'depart',
      position: position(v.depart),
      point: pastille(Cesium.Color.WHITE, 12),
      label: etiquette(`⌂ ${v.depart.nom}`),
    });
    let numero = 0;
    v.jours.forEach((j, i) => {
      if (j.base.couverture && !j.base.retour)
        source.entities.add({
          id: `zone-${i}`,
          position: position(j.base),
          ellipse: {
            semiMajorAxis: 15_000,
            semiMinorAxis: 15_000,
            material: COULEURS[j.base.couverture.niveau].withAlpha(0.12),
          },
        });
      if (!j.base.retour)
        source.entities.add({
          id: `base-${i}`,
          position: position(j.base),
          point: pastille(COULEURS.ambre, 15),
          label: etiquette(`J${j.jour} · ${j.base.nom}`),
        });
      j.visites.forEach((x, k) =>
        source.entities.add({
          id: `visite-${i}-${k}`,
          position: position(x),
          point: pastille(Cesium.Color.WHITE, 10, COULEURS.ambre),
          label: etiquette(`${++numero} · ${x.nom}`, {
            font: '500 12px system-ui, sans-serif',
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 150_000),
          }),
        }),
      );
      if (j.pointHaut)
        source.entities.add({
          id: `haut-${i}`,
          position: position(j.pointHaut),
          point: pastille(COULEURS.haut, 12),
          label: etiquette(`📡 ${j.pointHaut.nom} · ${j.pointHaut.ele} m`, {
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 250_000),
          }),
        });
    });
    viewer.scene.requestRender();
  }

  function cadrer() {
    const cibles = source.entities.values.filter((e) => !e.id.startsWith('zone'));
    return viewer.flyTo(cibles, {
      duration: 2.5,
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-60), 0),
    });
  }

  function voir(cible, recul = 6000) {
    const entite = source.entities.getById(cible);
    if (!entite) return Promise.resolve(false);
    surligner(cible);
    return viewer.flyTo(entite, {
      duration: 2.2,
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-32), cible.startsWith('base') ? 14_000 : recul),
    });
  }

  function surligner(cible) {
    for (const el of zone.querySelectorAll('.visite.active')) el.classList.remove('active');
    const [type, i, k] = cible.split('-');
    const el =
      type === 'visite'
        ? zone.querySelector(`.visite[data-jour="${i}"][data-visite="${k}"]`)
        : zone.querySelector(`.jour[data-jour="${i}"]`);
    if (type === 'visite') el?.classList.add('active');
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ---------- Actions ----------

  async function remplacer(i, k) {
    const j = voyage.jours[i];
    const utilises = new Set(voyage.jours.flatMap((x) => x.visites.map((v) => v.id)));
    const exclus = rejetes();
    const libres = j.candidats.filter((c) => !utilises.has(c.id) && !exclus.has(c.nom.toLowerCase()));
    const actuel = j.visites[k];
    const nouveau = libres.find((c) => c.categorie === actuel.categorie) ?? libres[0];
    if (!nouveau) {
      alert("Plus d'autre lieu à proposer autour de cette étape.");
      return;
    }
    const noeuds = couche.noeuds(voyage.reseaux ?? []);
    j.visites[k] = {
      ...nouveau,
      pourquoi: '',
      couverture: noeuds.length ? couverture(nouveau, noeuds) : null,
    };
    // Le remplaçant reprend sa place dans l'ordre de passage.
    j.visites.sort((a, b) => a.cle - b.cle);
    afficher(voyage, { cadrer: false });
    voir(`visite-${i}-${j.visites.indexOf(j.visites.find((v) => v.id === nouveau.id))}`);
    try {
      const reponse = await fetch('/api/trace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          depart: voyage.depart,
          fin: voyage.arrivee,
          transport: voyage.transport,
          jours: voyage.jours.map((x) => ({ jour: x.jour, base: x.base, visites: x.visites.map(({ lat, lon }) => ({ lat, lon })) })),
        }),
      });
      const { trace, jours } = await reponse.json();
      voyage.trace = trace;
      jours.forEach((x, n) => Object.assign(voyage.jours[n], x));
      afficher(voyage, { cadrer: false });
    } catch {}
  }

  zone.addEventListener('click', (ev) => {
    const bouton = ev.target.closest('[data-action]');
    if (!bouton) return;
    const carte = bouton.closest('.visite');
    const [i, k] = carte ? [Number(carte.dataset.jour), Number(carte.dataset.visite)] : [];
    const lieu = carte && voyage.jours[i].visites[k];
    switch (bouton.dataset.action) {
      case 'voir':
        voir(bouton.dataset.cible);
        break;
      case 'aime':
        bouton.setAttribute('aria-pressed', String(noter(lieu, 'aime') === 1));
        break;
      case 'aime-pas':
        noter(lieu, 'aimePas');
        remplacer(i, k);
        break;
      case 'remplacer':
        noter(lieu, 'remplace');
        remplacer(i, k);
        break;
    }
  });

  async function survoler() {
    if (tour) {
      tour = false;
      viewer.camera.cancelFlight();
      return;
    }
    tour = true;
    boutonSurvol.textContent = '■ Arrêter';
    for (const [i, j] of voyage.jours.entries()) {
      if (!j.base.retour) {
        if (!tour || !(await voir(`base-${i}`))) break;
        await pause(1200);
      }
      for (const k of j.visites.keys()) {
        if (!tour || !(await voir(`visite-${i}-${k}`, 2500))) break;
        await pause(1800);
      }
    }
    if (tour) await cadrer();
    tour = false;
    boutonSurvol.textContent = '▶ Survoler';
  }
  boutonSurvol.addEventListener('click', survoler);

  /** Affiche un voyage (et le garde pour la prochaine ouverture). */
  function afficher(v, { cadrer: recadrer = true } = {}) {
    voyage = v;
    memoire.ecrire('roadtrip', v);
    rendre();
    dessiner();
    if (recadrer) cadrer();
  }

  return {
    afficher,
    get voyage() {
      return voyage;
    },
    /** Clic sur une entité du globe. */
    surEntite(id) {
      if (/^(visite|base|haut)-/.test(id)) voir(id);
    },
    effacer() {
      source.entities.removeAll();
      viewer.scene.requestRender();
    },
  };
}
