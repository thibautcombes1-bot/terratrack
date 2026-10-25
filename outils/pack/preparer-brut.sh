#!/bin/sh
# Prépare les fichiers bruts du pack à partir d'un extrait OSM (Geofabrik), dans .brut/ :
#   zone.osm.pbf     la zone (lien vers l'extrait)
#   routes.opl       routes utiles en voiture, avec les coordonnées des nœuds
#   pois.geojsonseq  lieux des 4 boutons, lieux à découvrir et communes
# Exemple : sh outils/pack/preparer-brut.sh france.osm.pbf
set -e
cd "$(dirname "$0")/../../.brut"
SOURCE="${1:-france.osm.pbf}"

ln -sf "$SOURCE" zone.osm.pbf

# Pas de rues de quartier (residential, living_street) : à l'échelle de la France, le graphe
# resterait trop lourd pour le téléphone ; on rejoint les lieux à pied depuis la route la plus proche.
osmium tags-filter zone.osm.pbf \
  w/highway=motorway,motorway_link,trunk,trunk_link,primary,primary_link,secondary,secondary_link,tertiary,tertiary_link,unclassified \
  -o routes.osm.pbf --overwrite
osmium add-locations-to-ways routes.osm.pbf -f opl -o routes.opl --overwrite

osmium tags-filter zone.osm.pbf \
  nwr/amenity=drinking_water,shelter,toilets,marketplace,restaurant,cafe,place_of_worship \
  nwr/tourism=picnic_site,viewpoint,attraction,museum,camp_site,caravan_site,alpine_hut,wilderness_hut,guest_house,hotel,chalet,hostel \
  nwr/leisure=picnic_table,bathing_place \
  nwr/natural=spring,waterfall,cave_entrance,peak,arch \
  nwr/historic \
  nwr/shop=bakery,convenience,supermarket,general,farm,cheese,butcher,greengrocer,deli,wine \
  n/place=city,town,village,hamlet \
  -o pois.osm.pbf --overwrite
osmium export pois.osm.pbf -f geojsonseq -a type,id,timestamp --geometry-types=point,polygon -o pois.geojsonseq --overwrite

echo "Prêt : routes.opl ($(du -h routes.opl | cut -f1)), pois.geojsonseq ($(du -h pois.geojsonseq | cut -f1))"
