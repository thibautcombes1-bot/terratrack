# TerraTrack

**Le copilote des voyageurs itinérants (road trip, van, moto, vélo) : open source, sobre, pensé pour fonctionner hors ligne.**

Première brique : des road trips composés pour toi. Quelques questions, et un itinéraire logique avec de vrais coins sympas, sur un globe 3D.

Tu réponds à quelques questions : d'où tu pars, où tu veux aller (une destination, un coin à explorer ou « surprends-moi »), combien de temps, comment tu voyages, ce qui te fait envie. TerraTrack **calcule** l'itinéraire :

- il trace la route réelle vers ta destination ;
- il cherche **tous les lieux intéressants dans un couloir le long de cette route** et autour du coin choisi, pour ne rater aucun coin sympa ;
- il les classe dans un **ordre logique, sans allers-retours** : le long de la route pour un aller simple. Pour une boucle, l'aller passe d'un côté, le coin se fait en tournant, et le retour passe de l'autre côté, sans jamais reprendre la même route ;
- il répartit les étapes sur tout le trajet, puis **équilibre les journées** (route + visites) ;
- l'IA note les lieux selon tes goûts, puis écrit le carnet de route : la route du jour, pourquoi chaque lieu, où dormir, le budget, une astuce.

Ce qu'il y a dedans :

- 🌍 **Globe 3D** sans clé : imagerie satellite et relief.
- 🏰 **Lieux réels, hors ligne** : une base des lieux de France qui valent un détour (châteaux, abbayes, cascades, gorges, belvédères, lacs, musées, monuments classés…), tirée de Wikidata et livrée avec l'appli. Elle est complétée par 422 villages et sites labellisés (Plus Beaux Villages de France, Petites Cités de Caractère, Plus Beaux Détours, Grands Sites…). Hors de France, TerraTrack interroge Wikipédia en direct.
- 👍 **Goûts appris** : 👍, 👎 et ⇄ sont mémorisés. Un lieu remplacé garde sa place dans l'ordre de passage, et le trajet est recalculé.
- ▶ **Survol** du road trip et ⤓ **export GPX**, pour OsmAnd, Organic Maps ou le T-Deck (`/rr/voyages/` sur la carte SD).
- 🤖 **IA au choix** : Ollama en local (gratuit, privé) par défaut, ou Claude en ligne avec une clé.
- 📡 **Option radio mesh**, éteinte par défaut : nœuds MeshCore et Meshtastic en direct, préférence pour les lieux couverts, points hauts radio.

## L'appli de terrain : iPhone, hors ligne, toute la France

Dans `terrain/`, le compagnon de route, qui marche **sans réseau** sur toute la France métropolitaine et la Corse :

- **Préparer** : départ, destination ou boucle, durée, rythme, péages, envies (randonnée, via ferrata, escalade, canoë, baignade, UNESCO, patrimoine…), niveau des activités, nuits (camping, camping gratuit, bivouac, « je me débrouille »…).
- **Parcours** : chaque étape dit pourquoi elle est là, un compte rendu est à valider avant le départ, et le guidage passe par Waze ou Plans.
- **En route** : quatre boutons (Une pause, À découvrir, Manger, Dormir) avec le détour et l'heure d'arrivée, et une demande en français comprise par l'IA de l'iPhone.
- **Carte** : les lieux à cocher (via ferrata, randonnées, eau potable…), leur fiche, et « Plus tard » pour le prochain road trip.
- **Carburant, sans se ruiner** : consommation selon la route, autonomie, plein conseillé à la station la moins chère (prix de [prix-carburants.gouv.fr](https://www.prix-carburants.gouv.fr), du jour quand il y a du réseau), budget, et « ⛽ Avec mon plein » : où aller et revenir sans refaire le plein.
- **Météo** ([Open-Meteo](https://open-meteo.com), 16 jours) : le parcours s'adapte (orage → pas de via ferrata, pluie → visites à l'abri, chaleur → baignade) ; couche Météo sur la carte.
- **Guidage** par [Organic Maps](https://organicmaps.app) (hors ligne), Waze ou Plans ; la journée s'envoie à Organic Maps, et TerraTrack suit l'avancée en arrière-plan (étapes faites, avance ou retard).
- **Historique**, photos et commentaires, notes vérifiées par le GPS.

Les données (carte, routes, plus de 600 000 lieux) viennent d'OpenStreetMap. Le robot [`pack-france`](.github/workflows/pack-france.yml) les refait chaque lundi, et l'appli télécharge toute seule ce qui a changé, en Wi-Fi. Compilation et pack : [terrain/README.md](terrain/README.md).

## Contribuer

Toute aide est bienvenue :

- **Signaler** un bug, un lieu mal placé ou une idée : onglet *Issues*.
- **Améliorer les données** : TerraTrack lit OpenStreetMap. Corriger un camping, une source ou une via ferrata sur [openstreetmap.org](https://www.openstreetmap.org) améliore l'appli pour tout le monde au pack suivant.
- **Proposer du code** : une *pull request*, avec `npm test` qui passe. Le code, les commentaires et les textes sont en français.

Pistes ouvertes : Android, d'autres pays, le partage des retours de terrain entre voyageurs.

## Démarrer (le planificateur sur ordinateur)

Il faut Node.js 20 ou plus récent. Pour l'IA locale, il faut aussi [Ollama](https://ollama.com) avec un modèle :

```bash
ollama pull qwen2.5
```

Puis :

```bash
npm install
npm run dev
```

Ouvre <http://localhost:5190>.

### Depuis l'iPhone (même Wi-Fi)

```bash
npm run reseau
```

Ouvre ensuite `http://<ip-du-mac>:5190` sur l'iPhone.

⚠️ Dans ce mode, toute personne sur ton Wi-Fi peut utiliser TerraTrack, et donc ta clé Claude si tu en as mis une.

## Réglages (`.env`, facultatif)

| Variable | Rôle |
| --- | --- |
| `ANTHROPIC_API_KEY` | Active Claude (en ligne, payant à l'usage). |
| `CLAUDE_MODELE` | Modèle Claude, `claude-opus-5-5` par défaut. |
| `OLLAMA_URL` | Adresse d'Ollama, `http://127.0.0.1:11434` par défaut. |
| `OLLAMA_MODELE` | Modèle local, `qwen2.5` par défaut. |
| `VITE_CESIUM_ION_TOKEN` | Jeton Cesium ion, facultatif. |
| `TERRATRACK_PORT` | Port, `5190` par défaut. |
| `TERRATRACK_DEBUG=1` | Affiche les réponses brutes de l'IA dans le terminal. |

Les clés restent côté serveur et n'arrivent jamais dans la page.

## Comment l'itinéraire est calculé

Le moteur se trouve dans `server/itineraire.js` (fonctions pures, testées) :

1. **Couloir** : la route départ → destination est échantillonnée tous les ~12 km. Autour de chaque point, on cherche les lieux de la base. Un lieu est gardé s'il est à moins de 12 km de la route en voiture (5 km à vélo, 2,5 km à pied), ou dans le coin à explorer.
2. **Clé d'ordre** : chaque lieu reçoit une position entre 0 et 1 sur le parcours.
   - Aller simple : la position le long de la route.
   - Boucle : de 0 à 0,3 pour l'aller (côté gauche de la route), de 0,3 à 0,7 pour le coin (en tournant dans le sens des aiguilles d'une montre), de 0,7 à 1 pour le retour (côté droit).
3. **Choix** : le parcours est découpé en autant de tronçons que de visites, et on garde le meilleur lieu de chaque tronçon. Ensuite, on complète avec les meilleurs restants, en gardant un espacement minimal.
4. **Journées** : la suite est coupée en journées consécutives qui minimisent la journée la plus chargée (temps de route + temps de visite). C'est de la programmation dynamique.
5. **Nuits** : un village labellisé tout près de la dernière visite, sinon la commune.
6. **Tracé** : itinéraire routier réel (OSRM de FOSSGIS), avec distance et durée par jour.

Le score d'un lieu combine ses labels, sa photo, tes envies, tes goûts appris, la note de l'IA et le détour qu'il demande. Un peu de hasard fait que « Autre version » propose autre chose.

Avec l'IA locale, compte une à deux minutes. Les lieux sont toujours réels. Un petit modèle comme qwen2.5 7B fait parfois des textes approximatifs, et Claude écrit de meilleurs carnets.

Les deux bases se régénèrent avec les commandes ci-dessous. La base des lieux prend une vingtaine de minutes, car elle interroge Wikidata carré par carré :

```bash
node outils/construire-etapes.mjs
node outils/construire-lieux.mjs
```

## Structure

```
server/            API servie par Vite (/api/*)
  itineraire.js    le moteur : couloir, ordre de passage, choix, journées
  voyage.js        génération d'un road trip (étapes, IA, carnet)
  ia.js            Ollama et Claude
  lieux.js         géocodage, lieux (base locale, Wikipédia hors de France)
  etapes.js        villages et sites labellisés
  trace.js         itinéraire routier
  mesh.js          option radio : nœuds MeshCore et Meshtastic
  api.js           routes
  donnees/         lieux de France et villages labellisés (Wikidata, CC0)
commun/            calculs partagés page/serveur (distances, couverture mesh)
src/               la page (questions, globe, carnet, GPX)
outils/            scripts de construction des données
```

Tests : `npm test`.

## Sources et licences

- Imagerie : Esri World Imagery. Relief : Re:Earth / Mapterhorn (CC BY 4.0).
- Lieux : Wikidata (CC0), Wikipédia (CC BY-SA), photos Wikimedia Commons, géocodage Photon et Nominatim (© contributeurs OpenStreetMap, ODbL).
- Itinéraires : OSRM de FOSSGIS (routing.openstreetmap.de). Altitudes : Open-Meteo.
- Option mesh : [meshmap.net](https://meshmap.net) (Meshtastic) et [map.meshcore.io](https://map.meshcore.io) (MeshCore).
- Inspiré de [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) (MIT) et de Roadtrip AI.

Merci de respecter les conditions d'usage de ces services publics : TerraTrack met tout en cache et espace ses requêtes.

## Feuille de route

TerraTrack avance par briques utilisables tout de suite :

1. **Sas d'intention et itinéraire** ✅ : questions, couloir, ordre sans allers-retours, journées équilibrées, carnet par IA, base de lieux hors ligne, export GPX.
2. **Étoiles et routes tranquilles** : notes vérifiées sur place ✅, option sans péages ✅ ; routes panoramiques à venir.
3. **Logistique de vie** ✅ : points d'eau, nuitées (campings, aires, bivouac), marchés et producteurs, tirés d'OpenStreetMap.
4. **Pack hors ligne** ✅ : appli iPhone avec carte, routes et lieux de toute la France, mis à jour chaque semaine.
5. **Sentinelles** : retours de terrain (source tarie, accès fermé…) partagés de proche en proche par radio MeshCore, sans Internet.

TerraTrack ne refait pas un GPS : pour le guidage virage par virage, il passe la main à OsmAnd ou Organic Maps, qui fonctionnent déjà hors ligne.

## Licence

Code sous licence **GNU AGPLv3** (voir `LICENSE`) : tu peux l'utiliser, le modifier et le partager. Si tu fais tourner une version modifiée sur un serveur, tu dois en publier le code.

© 2026 Thibaut Combes.
