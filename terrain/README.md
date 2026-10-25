# TerraTrack sur téléphone

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

Le constructeur `outils/pack/construire-pack.mjs` utilise osmium-tool et les fichiers
suivants dans `.brut/` :

- `languedoc-roussillon.osm.pbf` : extrait source avec son horodatage OSM ;
- `routes.opl` : routes du rectangle avec coordonnées des nœuds ;
- `pois.geojsonseq` : points et polygones des lieux et communes ;
- `lozere.pmtiles` : carte du même rectangle, extraite avec `pmtiles extract`.

```sh
node outils/pack/construire-pack.mjs
npm test
```

La date affichée provient de l’en-tête du fichier OSM, et non de sa date de téléchargement.
Le déplacement de la carte est libre ; les données hors du rectangle ne sont pas incluses.
