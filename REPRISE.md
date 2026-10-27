# Reprendre TerraTrack avec un autre assistant (ChatGPT, Claude…)

Ce fichier sert à reprendre le projet sans rien perdre. Copie le bloc « À coller » dans
ChatGPT, puis donne-lui accès au dépôt (ou colle les fichiers qu'il demande).

---

## À coller dans ChatGPT

> Tu reprends **TerraTrack**, une appli iPhone de road trip **hors ligne** pour toute la
> France, open source (AGPL), dépôt public : https://github.com/thibautcombes1-bot/terratrack
> (dossier local `~/Developer/terratrack` sur mon Mac). Lis d'abord `REPRISE.md` à la racine :
> il décrit l'architecture, les commandes, les pièges connus et **la tâche en cours**.
>
> Comment travailler avec moi :
> - réponds en **français**, court et direct (j'ai un TDAH) ; tranche toi-même au lieu de me
>   proposer des menus ; dis clairement ce qui est testé et ce qui ne l'est pas ;
> - garde le style du code : **tout en français** (noms, commentaires), JavaScript moderne
>   sans framework, commentaires qui expliquent le *pourquoi* ;
> - avant de me dire « c'est fait » : `npm test` doit passer, et la construction
>   `npm run terrain:build` aussi ;
> - ne publie rien et n'envoie rien sans me le dire ; les commits vont sur GitHub (public).
>
> La vision : « voyager où on veut, sans se prendre la tête, avec seulement les outils
> vraiment utiles, et sans se ruiner ».
>
> Demande-moi sur quoi je veux avancer ; les idées en attente sont en bas de `REPRISE.md`.

---

## Ce qu'est TerraTrack aujourd'hui

Appli iPhone (Capacitor 8 + page web), **tout fonctionne sans réseau** grâce à un « pack »
embarqué (~1,5 Go) : carte, routes et lieux de toute la France métropolitaine et la Corse.

- **Onglets** : Carte (lieux à cocher, couche météo), Parcours (Préparer / Parcours / En route),
  Plus tard (favoris) ; Historique = icône ronde en bas à gauche de la carte.
- **Préparer** : D'où pars-tu ? → **Avec quoi ?** (voiture/van/moto, carburant, litres au départ,
  conso, prix payé, réservoir, budget) → Pour aller où ? (destination, boucle, surprends-moi,
  **⛽ Avec mon plein**) → durée (½ j à 1 semaine), rythme, péages, envies (randonnée, via ferrata,
  escalade, canoë, baignade, UNESCO, patrimoine, panoramas, nature, villages, **☀️ Beau temps**),
  niveau des activités, nuits (camping, gratuit, bivouac, gîte, « je me débrouille »…), guidage
  (Organic Maps par défaut, Waze, Plans).
- **Compte rendu** avant le départ : étapes justifiées, **3 itinéraires chiffrés** (rapide, sans
  péage, économe : km, temps, litres, carburant, péages, total), carburant (autonomie, plein
  conseillé à la station la moins chère, budget), nuits (gratuites en premier + toujours un vrai lit).
- **En route** : avancée du jour (km, étapes faites, arrivée estimée, avance/retard), bouton
  « 🧭 Organic Maps → prochaine étape », carburant restant, « J'ai fait le plein », 4 boutons
  (pause, découvrir, manger, dormir) + demande en français (IA d'Apple sur l'iPhone).
- **Suivi GPS en arrière-plan** automatique pendant un voyage validé (même appli fermée),
  passages vérifiés (étapes faites, notes), **imprévus** : hors du tracé > 3 km pendant 3 min, ou
  « route barrée » / « en retard » → la journée est recalculée depuis la position réelle.
- **Météo** Open-Meteo (16 jours, gardée hors ligne) : parcours adapté (orage → pas de via ferrata).
- **Prix des carburants** : open data de l'État (prix-carburants.gouv.fr) dans le pack, et prix
  du jour en ligne.
- **Mise à jour automatique** : un robot GitHub (`.github/workflows/pack-france.yml`) refait le
  pack chaque lundi ; l'appli télécharge en Wi-Fi seulement ce qui a changé.

## Où est quoi

| Chemin | Rôle |
| --- | --- |
| `terrain/src/main.js` | l'interface (gros fichier : onglets, Préparer, parcours, en route, carte…) |
| `terrain/src/parcours.js` | **le créateur d'itinéraire** (`planifier`) et les changements de plan |
| `server/itineraire.js` | outils de géométrie : `preparerRoute`, `situer`, `cleOrdre`, `selectionner`, `decouperJours`, `rectangle` |
| `commun/routeur.js` | routeur hors ligne : graphe binaire, A*, Dijkstra borné, composantes (Corse à part), critère « économe » |
| `commun/carburant.js` | consommation selon la route, bilan, niveau en route |
| `terrain/src/boutons.js` | les 4 boutons d'en route (+ carburant) |
| `terrain/src/meteo.js`, `carburant.js`, `pack.js`, `notes.js`, `souvenirs.js`, `carnet.js` | météo, prix, chargement du pack, notes GPS, photos, historique/favoris |
| `outils/pack/` | construction du pack (`preparer-brut.sh`, `construire-pack.mjs`, `activites.mjs`, `prix-carburants.mjs`, `contour.mjs`) |
| `ios/App/App/*.swift` | `PackPlugin` (lecture de la carte par morceaux, mises à jour), `TerrainPlugin` (partage KML, suivi GPS), `TerraTrackIA` (IA d'Apple) |
| `.github/workflows/pack-france.yml` | le robot hebdomadaire du pack |

## Commandes

```sh
npm test                                  # tests (node --test), doivent passer
npm run terrain                           # appli web de dev : http://localhost:5191 (?pack=lozere possible)
npm run terrain:build && npx cap sync ios # construit et copie dans le projet iOS
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'id=<UDID iPhone>' -derivedDataPath ios/DerivedData \
  DEVELOPMENT_TEAM=Q7KR9KRL6D -allowProvisioningUpdates build
xcrun devicectl list devices              # pour trouver l'UDID de l'iPhone
xcrun devicectl device install app --device <UDID> ios/DerivedData/Build/Products/Debug-iphoneos/App.app
```

Pack local (si besoin, ~10 min, 5 Go à télécharger) : voir `terrain/README.md`.

## Pièges déjà rencontrés (ne pas les refaire)

- `ios/App/App/SceneDelegate.swift` doit créer **`ViewController()`** (pas `CAPBridgeViewController()`),
  sinon les plugins locaux (IA, Pack, Terrain) ne sont jamais enregistrés (erreur UNIMPLEMENTED).
- `capacitor.config.json` : `loggingBehavior: "none"` (sinon chaque tuile de carte en base64 au journal).
- La carte (1,3 Go) n'est **jamais** chargée en mémoire : lue par morceaux (`SourceNative` dans `pack.js`).
- Le graphe est un **binaire** (`graphe.bin`, tableaux typés) ; la France = 2,8 M carrefours :
  pas de tableaux d'objets, pas de `Map` géantes ; filtrer d'abord par rectangle (`rectangle()`).
- Organic Maps : `om://route?sll=lat,lon&saddr=…&dll=lat,lon&daddr=…&type=vehicle` (les 5 paramètres
  sont obligatoires, dans cet ordre) ; sans position connue : `om://map?ll=lat,lon&n=nom`.
- Lecture des gros GeoJSON d'osmium : couper sur `\n` seulement (`outils/pack/lignes.mjs`), pas readline.
- Git : `gh auth setup-git` (sinon vieil identifiant) ; commits avec l'adresse noreply GitHub.
- Versions des fichiers du pack = `date-empreinte` : le pack livré avec l'appli et celui du robot
  doivent avoir le même format, sinon l'iPhone retélécharge tout.

## Le créateur d'itinéraire (`planifier` dans `terrain/src/parcours.js`)

Refait le 25 octobre 2026 (problème : « Avec mon plein » + une semaine + via ferrata ne proposait
que la via ferrata d'à côté). Méthode actuelle, **course d'orientation par insertion** :

1. **Budget de route** = `rythme.conduiteH × 50 km/h × jours`, au plus le plein en « Avec mon plein »
   (`kmMax` = km utiles × 0,82), au moins le trajet direct × 1,2 + 40 km (destination lointaine).
2. **Ancres** : départ → destination, ou départ → coin → départ (boucle, surprends-moi, plein).
   Le coin (`choisirCoin`) suit les envies (×3), la météo (« Beau temps ») et les favoris, à au plus
   budget/5 du départ : l'aller-retour direct ne prend que la moitié du budget.
3. **Candidats** : filtre strict par envies, niveau, déjà vus, météo ; joignables dans le budget
   (ellipse autour des ancres) ; valeur = intérêt + envie + notes + météo ; 400 meilleurs.
4. **`composerTournee`** : priorités d'abord (favoris, une étape par activité cochée), puis insertion
   au meilleur rapport valeur / km ajoutés, espacement 3 km, variété ; puis **2-opt** (`deuxOpt`).
5. `cle` = place dans la tournée → `decouperJours` (journées équilibrées) → **journées sur place
   réparties** s'il manque des étapes → nuits (gratuites en premier) → `recalculerJour` (vraies routes).

Tests de non-régression : `terrain/src/parcours.test.mjs` (avec le pack France). Essais rapides :
`node .cache/plein.mjs` (script local, non versionné : il charge le pack et appelle `planifier`).

Pistes d'amélioration : plusieurs coins pour les très longs voyages ; premier et dernier jour parfois
longs quand le coin est loin (alerte « plus de N h de route ») ; remplir les journées sur place avec
des idées proches (baignade, randonnée courte) même hors envies, en les proposant.

## Reprise du 25 octobre 2026 : parcours sans visite ni hébergement

- Corrigé : un voyage de plusieurs jours sans étape correspondante ni hébergement proche ne plante plus. La durée et les dates demandées sont conservées.
- Sans hébergement trouvé, le point de fin est marqué « Hébergement à trouver » et une alerte invite à choisir une nuit. Une visite n'est plus présentée comme un hébergement ; le compte rendu ne propose pas ce point comme un lieu où dormir.
- Une alerte générale explique l'absence d'étapes. Le choix explicite « Je me débrouille » conserve les nuits libres.
- Régression couverte dans `terrain/src/parcours-sans-lieux.test.mjs` : voyage vide, visite sans hébergement, choix ultérieur d'un hôtel, nuits libres.
- Vérifié : `npm test` passe avec 29 tests, aucun ignoré, dont les essais sur le pack France ; `npm run terrain:build` réussit. Pas de synchronisation ni d'installation iPhone dans cette reprise, pas de publication GitHub.

## Installation iPhone du 25 octobre 2026

- Application corrigée construite et signée en version 1.0 (build 2), sans modifier les réglages de version du projet : valeurs passées à la compilation.
- `npx --no-install cap sync ios` terminé ; compilation iPhone réussie dans `/private/tmp/terratrack-corrige-20261025-iphone` ; signature vérifiée avec `codesign --verify --deep --strict`.
- Pack France embarqué (carte, graphe et lieux). Le fichier JavaScript dans l’application signée a la même empreinte que celui de `terrain/dist`.
- Installation confirmée sur l’iPhone Air physique ; relecture des applications installées : TerraTrack 1.0, build 2 ; lancement confirmé avec `devicectl`.
- Installation effectuée en mise à jour, sans désinstaller l’application. Affichage de l’interface, données personnelles conservées et comportement en trajet non vérifiés visuellement pendant cette intervention.

## Évolutions du 25 octobre 2026 : Belles routes, Dynamic Island, Carte & WC (Build 3)

- **Points de passage Belles Routes & Organic Maps** :
  - Extraction automatique de points de passage (`📍 Passage X.Y · Belle route`) le long des tronçons de plus de 20 km dans `suivi.js` (`extrairePointsPassage`, `prochainPointGuidage`).
  - Injection ordonnée dans l'export KML partagé à Organic Maps pour verrouiller le tracé pittoresque.
  - Guidage par étape via le point de passage intermédiaire pour forcer Organic Maps sur les départementales et éviter l'autoroute.
  - 36 tests unitaires au vert (`npm test`).
- **Dynamic Island & Live Activity (iOS)** :
  - Composant natif `TrajetLiveActivity.swift` (SwiftUI / ActivityKit / WidgetKit) : affichage Dynamic Island (compacte et étendue) et bannière d'écran de verrouillage.
  - Méthodes natives `liveActivityDemarrer`, `liveActivityMettreAJour`, `liveActivityArreter` dans `TerrainPlugin.swift`.
  - Déclaration de `NSSupportsLiveActivities` et `NSSupportsLiveActivitiesFrequentUpdates` dans `Info.plist`.
  - Mises à jour en direct depuis `main.js` calées sur la position GPS réelle.
- **Onglet Carte épuré & Toilettes** :
  - Le tracé du voyage est masqué par défaut dans l'onglet Carte et activable/désactivable d'un tap via le filtre « Mon parcours ».
  - Ajout de la couche « Toilettes (WC) » sur la carte issue des données OpenStreetMap du pack.
- **Installation iPhone** :
  - Build 3 compilé, signé et installé sur l'iPhone Air physique via `devicectl`.

## Guidage intégré du 26 octobre 2026

- Navigation ouverte par « Démarrer le GPS 3D » ou depuis les actions d'un lieu. Carte MapLibre inclinée, bâtiments Protomaps extrudés, suivi du cap et du GPS, bascule 2D/3D, recentrage et sortie du mode de navigation.
- Manœuvres OSRM / FOSSGIS en français, distances et estimation d'arrivée. Le calcul initial et le recalcul demandent du réseau ; un trajet calculé est conservé localement au plus 24 heures. Les données nécessaires au calcul sont envoyées au service. Pas de moteur complet de manœuvres hors ligne ; profil automobile sans gabarit van.
- GPS ancien ou imprécis : consignes suspendues. Hors trajet confirmé : recalcul en ligne avec temporisation ; hors réseau, l'écran demande une reconnexion. Annonces actualisées au premier plan, via AVSpeechSynthesizer sur iPhone, et maintien de l'écran allumé pendant le guidage.
- Vérification : 50 tests passent ; construction terrain et compilation iPhone signée réussies. Essais visuels automatisés sur petit écran et ordinateur, GPS et réseau simulés, sans erreur dans l'application complète. La navigation et la voix en trajet réel restent à vérifier sur le téléphone.
- TerraTrack 1.0 (build 4) installée en mise à jour sur l'iPhone Air physique ; présence et numéro de build relus après installation. Le lancement automatique a été refusé parce que le téléphone était verrouillé ; l'affichage sur l'appareil n'a donc pas été vérifié.

## Choix des itinéraires du 26 octobre 2026

- Comparaison des variantes OSRM : tracés, distances, durées et routes traversées. Aucune présélection ; le guidage et la voix démarrent uniquement après choix puis confirmation.
- Options péages et parcours du voyage explicites. Les itinéraires indisponibles ou dupliqués ne deviennent pas des choix fictifs. Un trajet enregistré est proposé hors ligne sans reprise automatique.
- Le bouton Itinéraires permet de changer de route ; les sorties de trajet et retours du réseau n'imposent plus de nouveau tracé.
- L'application GPS préférée est respectée dans les boutons des lieux et de la prochaine étape. Dans la comparaison du voyage, un trajet seulement affiché n'est plus présenté comme déjà choisi.
- Vérification reprise le 27 octobre : 53 tests réussis, construction terrain et compilation iPhone 1.0 (build 5) signée. Essais visuels avec deux variantes réelles enregistrées : aucune présélection, confirmation obligatoire, reprise hors ligne explicite, aucun changement automatique hors trajet, affichage téléphone/ordinateur et respect de l'application GPS préférée.

## Organisation, départ réel et conditions strictes du 27 octobre 2026

- Préparer → Choisir → En route ; Réglages séparé regroupe les contrôles avancés, sans perdre véhicule, carburant, budget, nuitées, rythme, péages, niveau et choix GPS. Les champs déplacés restent associés au formulaire Préparer. Voix, vue 2D/3D et écran allumé sont mémorisés.
- Organic Maps retiré des options, boutons et liens ; ancienne préférence migrée vers TerraTrack. Export KML conservé de façon générique.
- Départ « Ma position » via une requête ponctuelle CoreLocation native, sans activer le suivi permanent ; nouvelle lecture au calcul du voyage. Refus, imprécision et délai dépassé restent des erreurs explicites.
- Comparaisons et validation filtrent les conditions de Préparer, sans modifier silencieusement durée, envies, nuits, péages, niveau ou budget. Aucune route compatible : retour explicite vers Préparer. Les estimations de budget et d'autonomie dépendent des données et modèles disponibles.
- Suivi natif par les positions GPS réelles, consignes suspendues après 15 s sans position ; marqueur actualisé même hors trajet ou après déplacement manuel de la carte. Un départ à proximité du réseau routier attend que le tracé soit rejoint sans inventer de progression.
- Essais sur navigateur avec positions de test : migration Organic, départ exact, réglages persistés, parcours compatible validé, demande impossible refusée et choix de variantes. Ces essais ne remplacent pas un trajet réel sur iPhone.
- Vérification finale : 61 tests réussis, construction web et compilation iPhone signée réussies. TerraTrack 1.0 (build 6) installée en mise à jour sur l'iPhone Air physique et lancement confirmé ; suivi en déplacement réel restant à essayer.

## Idées notées pour plus tard

- Version Android (Capacitor sait le faire) puis Android Auto ; TerraTrack sur CarPlay demande une
  autorisation d'Apple (appli publiée). Organic Maps marche déjà sur CarPlay et Android Auto.
- Activité en direct sur l'écran verrouillé / Dynamic Island (prochaine étape, km restants).
- Vérifier sur l'iPhone, en roulant : ouverture d'Organic Maps, envoi de la journée (KML), suivi
  en arrière-plan, mise à jour automatique du pack.
