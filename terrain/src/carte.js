// Carte hors ligne (MapLibre + carte Protomaps du pack) avec le parcours, les suggestions et la position.
import { layers, namedFlavor } from '@protomaps/basemaps';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';

export const COULEURS = {
  route: '#2f7d4a',
  pause: '#2d8fbf',
  decouvrir: '#b5651d',
  manger: '#c0392b',
  dormir: '#3b3f8f',
  carburant: '#212121',
};

const vide = { type: 'FeatureCollection', features: [] };
const point = (p, proprietes) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
  properties: proprietes,
});

export function creerCarte(conteneur, { pmtiles, meta }) {
  const protocole = new Protocol();
  maplibregl.addProtocol('pmtiles', protocole.tile);
  protocole.add(pmtiles);
  const base = new URL(import.meta.env.BASE_URL, location.href).href;
  maplibregl.setWorkerUrl(`${base}maplibre-gl-worker.mjs`);
  const [ouest, sud, est, nord] = meta.bbox;

  // Le parcours doit rester dans la partie visible, au-dessus du tiroir sur téléphone
  // (ou à sa droite sur grand écran), sans limiter les déplacements de la carte.
  function marges(marge = 24) {
    const zone = conteneur.getBoundingClientRect();
    const panneau = document.querySelector('#tiroir')?.getBoundingClientRect();
    const espace = { top: marge, right: marge, bottom: marge, left: marge };
    if (panneau) {
      if (panneau.width > zone.width * 0.8) espace.bottom = Math.max(marge, zone.bottom - panneau.top + 12);
      else espace.left = Math.max(marge, panneau.right - zone.left + 12);
    }
    // Garde assez de place même quand le panneau est presque entièrement déplié.
    espace.bottom = Math.min(espace.bottom, Math.max(marge, zone.height - espace.top - 80));
    espace.left = Math.min(espace.left, Math.max(marge, zone.width - espace.right - 80));
    return espace;
  }

  const carte = new maplibregl.Map({
    container: conteneur,
    style: {
      version: 8,
      glyphs: `${base}carte/fonts/{fontstack}/{range}.pbf`,
      sprite: `${base}carte/sprites/light`,
      sources: {
        protomaps: {
          type: 'vector',
          url: `pmtiles://${pmtiles.source.getKey()}`,
          attribution: '© contributeurs OpenStreetMap · Protomaps',
        },
      },
      layers: layers('protomaps', namedFlavor('light'), { lang: 'fr' }),
    },
    bounds: [ouest, sud, est, nord],
    fitBoundsOptions: { padding: marges(), retainPadding: false },
    dragPan: true,
    cooperativeGestures: false,
    dragRotate: false,
    touchPitch: false,
    attributionControl: { compact: true },
  });
  carte.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  const pret = new Promise((resolu) =>
    carte.on('load', () => {
      carte.addSource('parcours', { type: 'geojson', data: vide });
      carte.addSource('arrets', { type: 'geojson', data: vide });
      carte.addSource('suggestions', { type: 'geojson', data: vide });
      carte.addSource('position', { type: 'geojson', data: vide });
      carte.addSource('deja', { type: 'geojson', data: vide });
      carte.addSource('decouverte', { type: 'geojson', data: vide });
      carte.addSource('trace', { type: 'geojson', data: vide });
      carte.addSource('meteo', { type: 'geojson', data: vide });
      carte.addSource('portee', { type: 'geojson', data: vide });
      // Zone atteignable aller-retour avec le carburant (mode « Avec mon plein »).
      carte.addLayer({ id: 'portee-fond', type: 'fill', source: 'portee', paint: { 'fill-color': '#2f7d4a', 'fill-opacity': 0.08 } });
      carte.addLayer({ id: 'portee-bord', type: 'line', source: 'portee', paint: { 'line-color': '#2f7d4a', 'line-width': 2, 'line-dasharray': [3, 2] } });
      carte.addLayer({
        id: 'parcours-bord',
        type: 'line',
        source: 'parcours',
        paint: { 'line-color': '#ffffff', 'line-width': 8 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      carte.addLayer({
        id: 'parcours',
        type: 'line',
        source: 'parcours',
        paint: {
          'line-color': COULEURS.route,
          'line-width': 4.5,
          'line-opacity': ['case', ['get', 'actif'], 1, 0.45],
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      carte.addLayer({
        id: 'deja',
        type: 'symbol',
        source: 'deja',
        layout: { 'text-field': '✓', 'text-font': ['Noto Sans Medium'], 'text-size': 13, 'text-allow-overlap': true },
        paint: { 'text-color': '#8a8f86', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
      });
      // Le trajet déjà fait (positions enregistrées), en pointillés bleus.
      carte.addLayer({
        id: 'trace',
        type: 'line',
        source: 'trace',
        paint: { 'line-color': '#1a73e8', 'line-width': 3, 'line-dasharray': [2, 1.5] },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      // Lieux à découvrir cochés dans l'onglet Carte ; ceux gardés « pour plus tard » cerclés de noir.
      carte.addLayer({
        id: 'decouverte',
        type: 'circle',
        source: 'decouverte',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, ['case', ['get', 'favori'], 7, 5], 13, ['case', ['get', 'favori'], 11, 9]],
          'circle-color': ['get', 'couleur'],
          'circle-stroke-color': ['case', ['get', 'favori'], '#1d2a20', '#ffffff'],
          'circle-stroke-width': ['case', ['get', 'favori'], 2.5, 1.5],
        },
      });
      carte.addLayer({
        id: 'decouverte-noms',
        type: 'symbol',
        source: 'decouverte',
        minzoom: 11,
        layout: {
          'text-field': ['get', 'nom'],
          'text-font': ['Noto Sans Medium'],
          'text-size': 11,
          'text-offset': [0, 1],
          'text-anchor': 'top',
          'text-max-width': 9,
          'text-optional': true,
        },
        paint: { 'text-color': '#1d2a20', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
      });
      carte.addLayer({
        id: 'arrets',
        type: 'circle',
        source: 'arrets',
        paint: {
          'circle-radius': ['match', ['get', 'genre'], 'nuit', 9, 'depart', 7, 7.5],
          'circle-color': ['match', ['get', 'genre'], 'nuit', COULEURS.dormir, 'depart', '#222', '#ffffff'],
          'circle-stroke-color': COULEURS.route,
          'circle-stroke-width': 2.5,
        },
      });
      carte.addLayer({
        id: 'arrets-noms',
        type: 'symbol',
        source: 'arrets',
        layout: {
          'text-field': ['get', 'etiquette'],
          'text-font': ['Noto Sans Medium'],
          'text-size': 12,
          'text-offset': [0, 1.3],
          'text-anchor': 'top',
          'text-max-width': 10,
        },
        paint: { 'text-color': '#1d2a20', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
      });
      carte.addLayer({
        id: 'suggestions',
        type: 'circle',
        source: 'suggestions',
        paint: {
          'circle-radius': 11,
          'circle-color': ['get', 'couleur'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
      carte.addLayer({
        id: 'suggestions-rang',
        type: 'symbol',
        source: 'suggestions',
        layout: { 'text-field': ['get', 'rang'], 'text-font': ['Noto Sans Medium'], 'text-size': 12, 'text-allow-overlap': true },
        paint: { 'text-color': '#ffffff' },
      });
      carte.addLayer({
        id: 'meteo',
        type: 'symbol',
        source: 'meteo',
        layout: { 'text-field': ['get', 'texte'], 'text-font': ['Noto Sans Medium'], 'text-size': 14, 'text-allow-overlap': true },
        paint: { 'text-color': '#1d2a20', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
      });
      carte.addLayer({
        id: 'position',
        type: 'circle',
        source: 'position',
        paint: {
          'circle-radius': 8,
          'circle-color': '#1a73e8',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
        },
      });
      resolu();
    }),
  );

  const donnees = (source, data) => pret.then(() => carte.getSource(source).setData(data));

  return {
    carte,
    pret,
    /** Dessine le parcours ; le jour `actif` est mis en avant. */
    afficherParcours(plan, actif = -1) {
      if (!plan) {
        donnees('parcours', vide);
        donnees('arrets', vide);
        return;
      }
      donnees('parcours', {
        type: 'FeatureCollection',
        features: plan.jours.map((j, i) => ({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: j.coords },
          properties: { actif: actif < 0 || actif === i },
        })),
      });
      let numero = 0;
      const arrets = [point(plan.jours[0].debut, { genre: 'depart', etiquette: plan.jours[0].debut.nom })];
      plan.jours.forEach((j) => {
        for (const e of j.etapes) arrets.push(point(e, { genre: 'etape', etiquette: `${++numero}. ${e.nom}`, id: e.id }));
        arrets.push(point(j.fin, { genre: j.fin.genre === 'nuit' ? 'nuit' : 'fin', etiquette: j.fin.genre === 'nuit' ? `🌙 ${j.fin.nom}` : j.fin.nom }));
      });
      donnees('arrets', { type: 'FeatureCollection', features: arrets });
    },
    visibiliteParcours(visible) {
      const v = visible ? 'visible' : 'none';
      for (const id of ['parcours-bord', 'parcours', 'arrets', 'arrets-noms']) {
        if (carte.getLayer(id)) carte.setLayoutProperty(id, 'visibility', v);
      }
    },
    afficherSuggestions(liste, categorie) {
      donnees('suggestions', {
        type: 'FeatureCollection',
        features: liste.map((s, i) => point(s, { rang: String(i + 1), couleur: COULEURS[categorie], id: s.id })),
      });
    },
    afficherPosition(p) {
      donnees('position', p ? { type: 'FeatureCollection', features: [point(p, {})] } : vide);
    },
    suivrePosition(p) {
      carte.easeTo({ center: [p.lon, p.lat], zoom: Math.max(12, carte.getZoom()), padding: marges(36), duration: 700 });
    },
    cadrer(coords, marge = 60) {
      if (!coords.length) return;
      const bornes = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
      carte.fitBounds(bornes, { padding: marges(marge), retainPadding: false, maxZoom: 13, duration: 800 });
    },
    voler(p, zoom = 13) {
      carte.flyTo({ center: [p.lon, p.lat], zoom, duration: 900 });
    },
    /** Lieux déjà visités, grisés d'un ✓. */
    afficherDejaVus(lieux) {
      donnees('deja', { type: 'FeatureCollection', features: lieux.map((l) => point(l, {})) });
    },
    /** Toucher une étape du parcours sur la carte. */
    surClicEtape(rappel) {
      carte.on('click', 'arrets', (ev) => {
        const f = ev.features.find((x) => x.properties.genre === 'etape');
        if (f) rappel(f.properties.id);
      });
    },
    /** Cercle de la zone atteignable (rayon en km), ou rien. */
    afficherPortee(centre, rayonKm) {
      if (!centre || !rayonKm) return donnees('portee', vide);
      const kx = 111.32 * Math.cos((centre.lat * Math.PI) / 180);
      const tour = Array.from({ length: 65 }, (_, k) => {
        const a = (k / 64) * 2 * Math.PI;
        return [centre.lon + (rayonKm / kx) * Math.cos(a), centre.lat + (rayonKm / 110.57) * Math.sin(a)];
      });
      donnees('portee', { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [tour] }, properties: {} }] });
    },
    /** Prévisions sur la carte : « ⛅ 22° » à chaque point. */
    afficherMeteo(points) {
      donnees('meteo', { type: 'FeatureCollection', features: points.map((p) => point(p, { texte: p.texte })) });
    },
    afficherTrace(coords) {
      donnees('trace', coords.length > 1 ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} }] } : vide);
    },
    afficherDecouverte(liste) {
      donnees('decouverte', {
        type: 'FeatureCollection',
        features: liste.map((l) => point(l, { id: l.id, nom: l.nom ?? '', couleur: l.couleur, favori: Boolean(l.favori) })),
      });
    },
    /** Toucher un lieu à découvrir : une marge de 14 px, car les points sont petits sous le doigt. */
    surClicDecouverte(rappel) {
      carte.on('click', (ev) => {
        const { x, y } = ev.point;
        const zone = [[x - 14, y - 14], [x + 14, y + 14]];
        if (carte.queryRenderedFeatures(ev.point, { layers: ['arrets', 'suggestions'] }).length) return;
        const [f] = carte.queryRenderedFeatures(zone, { layers: ['decouverte'] });
        if (f) rappel(f.properties.id);
      });
    },
    /** Clic sur une suggestion : rappelle avec son identifiant. */
    surClicSuggestion(rappel) {
      carte.on('click', 'suggestions', (ev) => rappel(ev.features[0].properties.id));
    },
  };
}
