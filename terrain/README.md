# TerraTrack sur téléphone

## Navigation intégrée

Le parcours utilisateur est Préparer → Choisir → En route, avec les options avancées dans Réglages. « D’ici » demande une position GPS récente pour préparer le voyage. Choisir compare jusqu’à trois voyages complets, avec des arrêts différents et des tracés bleu, orange et violet simultanément visibles sur la carte. Aucune sélection automatique ; un ou deux voyages seulement si les conditions ne permettent pas davantage. Les variantes de route entre les mêmes étapes restent dans un panneau secondaire du voyage choisi. Le départ du guidage est explicite après vérification des étapes.

Le guidage 3D utilise la carte locale MapLibre/Protomaps et les étapes de navigation du service OSRM de FOSSGIS. Le calcul initial et les recalculs demandent une connexion ; les consignes d'un trajet calculé sont conservées localement pour le poursuivre hors réseau. Un seul trajet est conservé, pendant au plus 24 heures. Le profil est automobile, sans contrôle des gabarits.

Le choix d'itinéraire est explicite : variantes réellement disponibles, tracés, distances et durées ; aucune présélection ni départ automatique. Les options péage et parcours du voyage sont réglables avant le calcul. Un trajet enregistré est proposé hors ligne mais doit aussi être choisi puis confirmé. Le bouton Itinéraires permet de changer en cours de guidage ; une sortie de route ne provoque aucun remplacement automatique.

L'écran de navigation affiche les manœuvres en français, la distance restante et l'arrivée estimée. Les commandes permettent de passer en 2D, couper la voix, reprendre le suivi après déplacement de la carte et terminer le guidage. Le GPS ancien ou imprécis suspend les consignes. Sur iPhone, la voix et le maintien de l'écran allumé passent par le plugin natif Terrain. Les consignes sont mises à jour au premier plan.

Code : `terrain/src/navigation.js` (réponse OSRM et progression), `navigation-interface.js` (session et commandes), `navigation.css` et `carte.js`. Les tests ne contactent pas le serveur public ; ne pas utiliser ce service pour des tests automatisés en charge.

Application de terrain dans `terrain/`, embarquée sur iPhone avec Capacitor dans `ios/`.
Le planificateur web historique à la racine est une application distincte.

## Pack embarqué

Le pack par défaut couvre la France métropolitaine et la Corse, avec carte PMTiles,
graphe routier et lieux embarqués. La préparation des voyages utilise ce graphe sans serveur.
La date des données OpenStreetMap est indiquée dans `meta.json` et dans l’application.
L’ancien pack régional `lozere` reste accessible s’il est présent, avec `?pack=lozere`.

Le réseau routier reste un prototype : il ne remplace pas un moteur de navigation
prenant en compte toutes les restrictions de circulation et tous les gabarits.
Horaires, accès et disponibilités des lieux restent à vérifier sur place.

## Construire

```sh
npm run terrain:build
npx cap sync ios
```

Ouvrir ensuite `ios/App/App.xcodeproj` dans Xcode pour compiler sur simulateur
ou sur iPhone avec la signature de développement existante.

## Régénérer le pack

Le pack couvre la France métropolitaine et la Corse (`terrain/public/pack/france/`) :

- `carte.pmtiles` : carte Protomaps jusqu'au zoom 13, découpée sur le contour de la France (~1,3 Go) ;
- `graphe.bin` : réseau routier en binaire (autoroutes → routes non classées, sans rues de quartier) ;
- `lieux.json` : lieux des 4 boutons, lieux à découvrir, activités et communes.

Sur iPhone, la carte est lue par morceaux par le plugin natif « Pack » ; le calcul d'itinéraire
utilise A* et ne s'accroche qu'aux grandes composantes du réseau (continent, Corse).

```sh
cd .brut
curl -L -o france.osm.pbf https://download.geofabrik.de/europe/france-latest.osm.pbf
curl -L -o france.poly https://download.geofabrik.de/europe/france.poly   # puis en GeoJSON : france-metropole.geojson
pmtiles extract https://build.protomaps.com/AAAAMMJJ.pmtiles france.pmtiles --region=france-metropole.geojson --maxzoom=13
cd ..
sh outils/pack/preparer-brut.sh france.osm.pbf
node --max-old-space-size=12000 outils/pack/construire-pack.mjs france
npm test
```

L'ancien pack régional reste possible : `node outils/pack/construire-pack.mjs lozere`
(depuis `languedoc-roussillon.osm.pbf`), puis `?pack=lozere` dans l'adresse de l'appli web.

La date affichée provient de l’en-tête du fichier OSM, et non de sa date de téléchargement.
Le déplacement de la carte est libre ; les données hors du rectangle ne sont pas incluses.
