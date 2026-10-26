# TerraTrack sur téléphone

## Navigation intégrée

Le guidage 3D utilise la carte locale MapLibre/Protomaps et les étapes de navigation du service OSRM de FOSSGIS. Le calcul initial et les recalculs demandent une connexion ; les consignes d'un trajet calculé sont conservées localement pour le poursuivre hors réseau. Un seul trajet est conservé, pendant au plus 24 heures. Le profil est automobile, sans contrôle des gabarits.

L'écran de navigation affiche les manœuvres en français, la distance restante et l'arrivée estimée. Les commandes permettent de passer en 2D, couper la voix, reprendre le suivi après déplacement de la carte et terminer le guidage. Le GPS ancien ou imprécis suspend les consignes ; une sortie de route demande un recalcul. Sur iPhone, la voix et le maintien de l'écran allumé passent par le plugin natif Terrain. Les consignes sont mises à jour au premier plan.

Code : `terrain/src/navigation.js` (réponse OSRM et progression), `navigation-interface.js` (session et commandes), `navigation.css` et `carte.js`. Les tests ne contactent pas le serveur public ; ne pas utiliser ce service pour des tests automatisés en charge.

Application de terrain dans `terrain/`, embarquée sur iPhone avec Capacitor dans `ios/`.
Le planificateur web historique à la racine est une application distincte.

## Pack embarqué

Le pack couvre l’Hérault, la Lozère et les Cévennes dans le rectangle
`2.45,43.15,4.25,44.98`. Son identifiant technique `lozere` est conservé
pour les installations et les parcours existants. Carte PMTiles jusqu’au zoom 14,
graphe routier et lieux sont embarqués ; le calcul ne sollicite aucun serveur.
Les données OpenStreetMap proviennent de l’extrait Geofabrik Languedoc-Roussillon
du 23 octobre 2026, complété par les lieux Wikidata déjà présents dans le projet.

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
