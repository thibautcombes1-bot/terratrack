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
> Commence par la tâche en cours décrite dans `REPRISE.md` (refonte du créateur d'itinéraire).

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

## Tâche en cours : refondre le créateur d'itinéraire (`planifier` dans `terrain/src/parcours.js`)

**Le problème** (signalé par l'utilisateur) : « Avec mon plein » + une semaine + via ferrata depuis
Bédarieux ne proposait que la via ferrata des Balcons de l'Orb, à côté de chez lui. Cause : la
méthode actuelle choisit **un seul coin** puis garde les lieux d'un **couloir étroit** (≤ 25 km)
le long de l'aller-retour. Sur une semaine, ça donne très peu d'étapes (2 à 4), et des jours vides.
Des correctifs intermédiaires sont déjà faits (le coin suit les envies, la durée est tenue avec des
« journées sur place », « Avec mon plein » ne rétrécit plus sous 60 %), mais il faut **changer de
méthode**.

**La méthode à mettre en place : insertion façon « course d'orientation »** (orienteering).

1. **Budget de route** (km de route) = `rythme.conduiteH × 50 km/h × jours` (×0,5 pour une
   demi-journée) ; en « Avec mon plein », pas plus que les km utiles du plein.
2. **Candidats** : les lieux qui répondent aux envies (filtre strict, comme aujourd'hui), au bon
   niveau, pas déjà vus, à portée (`rectangle()` puis distance ≤ budget/2 du départ pour une boucle).
   Valeur = `interet(l)` (+1,5 si envie, + bonus des notes, + effet météo, favoris très hauts).
   Garder les ~400 meilleurs pour la vitesse.
3. **Tournée de départ** : départ → arrivée (destination), ou départ → *coin* → départ pour une
   boucle / surprends-moi / avec mon plein (le coin = `choisirCoin`, qui suit déjà les envies),
   ou départ → destination → départ pour « boucle autour de… ».
4. **Insertion** : tant que le budget tient et qu'on a moins de `jours × rythme.etapes` étapes,
   insérer le candidat au meilleur rapport `valeur / km ajoutés` (distance à vol d'oiseau × 1,3),
   à l'endroit de la tournée où il ajoute le moins ; espacement ≥ 3 km entre étapes.
   Les favoris (« Plus tard ») et une étape par activité cochée sont insérés en priorité.
5. **Démêler** la tournée (2-opt) pour supprimer les croisements et allers-retours.
6. Donner à chaque étape `cle` = sa place dans la tournée (0…1), puis garder la suite actuelle
   telle quelle : `decouperJours` (journées équilibrées), nuits (`choisirNuit`, gratuits en premier),
   `recalculerJour` (vraies routes), allègement si arrivée après la nuit, alternatives.
7. **Tests** à ajouter (`terrain/src/parcours.test.mjs`, pack France si présent) : une semaine
   « via ferrata » depuis Bédarieux doit enchaîner ≥ 6 via ferrata différentes sur 7 jours ; un
   week-end « patrimoine » Paris → Saint-Malo garde ≥ 4 étapes ; aucun jour > 1,5 × la conduite
   du rythme ; pas d'aller-retour (la `cle` des étapes croît dans l'ordre de passage).

Script d'essai prêt : `node .cache/plein.mjs 50 viaferrata 7` (si `.cache/plein.mjs` n'existe plus,
il charge `graphe.bin` + `lieux.json` et appelle `planifier` avec `mode: 'plein'`).

## Idées notées pour plus tard

- Version Android (Capacitor sait le faire) puis Android Auto ; TerraTrack sur CarPlay demande une
  autorisation d'Apple (appli publiée). Organic Maps marche déjà sur CarPlay et Android Auto.
- Activité en direct sur l'écran verrouillé / Dynamic Island (prochaine étape, km restants).
- Vérifier sur l'iPhone, en roulant : ouverture d'Organic Maps, envoi de la journée (KML), suivi
  en arrière-plan, mise à jour automatique du pack.
