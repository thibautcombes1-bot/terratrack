// Globe 3D sans clé : imagerie satellite Esri et relief Re:Earth / Mapterhorn (CC BY 4.0).
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

const IMAGERIE = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';
const RELIEF = 'https://terrain.reearth.land/cesium-mesh/ellipsoid';

export function creerGlobe(conteneur) {
  // Un jeton Cesium ion facultatif (VITE_CESIUM_ION_TOKEN) ; sans lui, rien ne passe par ion.
  Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';

  const viewer = new Cesium.Viewer(conteneur, {
    baseLayer: Cesium.ImageryLayer.fromProviderAsync(Cesium.ArcGisMapServerImageryProvider.fromUrl(IMAGERIE)),
    terrain: new Cesium.Terrain(Cesium.CesiumTerrainProvider.fromUrl(RELIEF)),
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
  });

  const scene = viewer.scene;
  scene.backgroundColor = Cesium.Color.fromCssColorString('#06090d');
  scene.globe.baseColor = Cesium.Color.fromCssColorString('#0b1118');
  scene.globe.showGroundAtmosphere = true;
  scene.fog.enabled = true;
  scene.screenSpaceCameraController.minimumZoomDistance = 300;
  viewer.creditDisplay.addStaticCredit(new Cesium.Credit('Relief Re:Earth / Mapterhorn (CC BY 4.0)'));

  // Vue de départ : le sud de la France, légèrement incliné.
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(3.2, 40.2, 1_300_000),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-58), roll: 0 },
  });
  return viewer;
}
