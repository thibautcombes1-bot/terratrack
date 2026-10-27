# Messages prêts à partager

La diffusion en dehors de GitHub reste manuelle, suivant le choix du propriétaire. Les textes ci-dessous sont prêts à copier-coller ; aucun n’a été envoyé automatiquement.

## Liens et fichiers

- Projet : https://github.com/thibautcombes1-bot/terratrack
- Accueil : https://github.com/thibautcombes1-bot/terratrack/discussions/4
- Aide recherchée : https://github.com/thibautcombes1-bot/terratrack/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22help%20wanted%22
- Préversion et vidéo : https://github.com/thibautcombes1-bot/terratrack/releases/tag/terrain-v1.0-preview.7
- MP4 à joindre : https://github.com/thibautcombes1-bot/terratrack/releases/download/terrain-v1.0-preview.7/terratrack-demo.mp4
- Image d’aperçu : [demo/apercu.png](demo/apercu.png)

La vidéo dure environ 25 secondes, sans son. Elle montre l’application web à une position de test fixe. Le GPS n’y simule pas de déplacement. La carte et la préparation sont locales ; le calcul initial des consignes est en ligne. Le guidage réel sur iPhone reste à éprouver.

## LinkedIn ou groupe de développeurs — français

Je développe Cap Away, un compagnon de road trip open source pour iPhone et navigateur.

L’idée est simple : partir de l’endroit où l’on est, préciser ses envies, comparer jusqu’à trois voyages différents sur la carte, puis choisir ses étapes avant de lancer le guidage.

La carte et la préparation utilisent un pack France local. Le GPS intégré utilise OSRM pour calculer ses consignes en ligne, puis conserve le trajet sur l’appareil.

Je cherche de l’aide sur trois sujets concrets :
• l’accessibilité de l’interface ;
• un petit pack de démonstration pour faciliter les premières contributions ;
• des essais du GPS et de la reprise hors réseau sur un vrai iPhone.

Le projet est encore en développement. La démo utilise une position de test fixe et ne remplace pas un essai sur la route.

Démo : https://github.com/thibautcombes1-bot/terratrack/releases/tag/terrain-v1.0-preview.7
Code et tâches : https://github.com/thibautcombes1-bot/terratrack
Pour échanger : https://github.com/thibautcombes1-bot/terratrack/discussions/4

Les retours d’usage sont aussi bienvenus que les contributions de code.

## Communauté OpenStreetMap — français

Titre proposé : Cap Away, un projet open source de road trips basé sur OpenStreetMap — retours bienvenus

Bonjour,

Je développe Cap Away, une application de road trips pour iPhone et navigateur. Elle utilise des données OpenStreetMap pour la carte, les routes et les lieux, avec MapLibre, Protomaps/PMTiles et un graphe routier local.

On peut préparer un voyage depuis sa position, comparer jusqu’à trois compositions avec des étapes différentes, puis choisir le voyage à suivre. Le guidage intégré récupère ses manœuvres auprès du service OSRM de FOSSGIS ; ce calcul demande une connexion. Le graphe local ne fournit pas encore un moteur complet de manœuvres hors ligne et ne vérifie pas tous les gabarits ou restrictions.

Je cherche surtout des retours sur les limites des données et du routage, ainsi que de l’aide pour rendre le démarrage des contributeurs plus léger. Une tâche porte sur un petit pack de démonstration, avec données sourcées et attribution, ou données synthétiques clairement séparées des voyages réels.

Le code est sous AGPL-3.0-or-later. La démo montre une position de test fixe ; les essais de guidage réel sur iPhone restent à faire.

Projet : https://github.com/thibautcombes1-bot/terratrack
Démo : https://github.com/thibautcombes1-bot/terratrack/releases/tag/terrain-v1.0-preview.7
Discussion : https://github.com/thibautcombes1-bot/terratrack/discussions/4

Merci pour vos retours et vos conseils techniques.

## Communauté JavaScript, MapLibre ou iOS — anglais

Title: Cap Away: open-source road-trip planning with MapLibre and Capacitor — contributors welcome

I’m building Cap Away, an open-source road-trip companion for iPhone and the web.

The app can start from the current location, compose up to three distinct trips, display them together in different colours and let the traveller choose before starting navigation.

The stack is JavaScript without a UI framework, Capacitor, MapLibre, PMTiles and a local road graph. Turn-by-turn instructions are calculated online with FOSSGIS/OSRM; a calculated route is cached locally. This is not a fully offline turn-by-turn engine.

Three scoped contributions are open:
• keyboard and screen-reader accessibility;
• a small, reproducible development demo pack;
• real-device GPS and offline-resume testing on iPhone.

The current demo uses a fixed test location, with no simulated driving. Real-world navigation testing is still needed. Building for an iPhone requires Xcode and signing for your own device; there is no universally installable IPA.

Source and issues: https://github.com/thibautcombes1-bot/terratrack
Video: https://github.com/thibautcombes1-bot/terratrack/releases/tag/terrain-v1.0-preview.7
Discussion: https://github.com/thibautcombes1-bot/terratrack/discussions/4

AGPL-3.0-or-later. Code reviews, reproducible bug reports and small pull requests are welcome.

## Version courte — français

Cap Away : road trips open source pour iPhone et web. Jusqu’à trois voyages sur la carte, choix des étapes et GPS intégré. Carte/préparation locales ; calcul des consignes en ligne. Démo avec position de test, essais réels à poursuivre. Aide recherchée : accessibilité, petit pack de démo et GPS iPhone.
https://github.com/thibautcombes1-bot/terratrack

## Repères de diffusion

Joindre la vidéo à un message adapté au canal, avec le lien du dépôt. Décrire une contribution précise attendue. Indiquer les limites actuelles du GPS. Dans une communauté technique, vérifier la catégorie de présentation et les règles locales avant publication.
