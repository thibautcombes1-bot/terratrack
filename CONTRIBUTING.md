# Contribuer à TerraTrack

Merci de donner un coup de main ! TerraTrack est un projet de road trips, avec une application iPhone et une application web de terrain. Le projet évolue et certaines fonctions demandent encore des essais sur un vrai téléphone et sur la route.

## Signaler un problème ou proposer une idée

Pour une question, un retour d’essai ou une idée à discuter, utilisez les [Discussions TerraTrack](https://github.com/thibautcombes1-bot/terratrack/discussions). Les bugs reproductibles et les tâches précises vont dans les [issues](https://github.com/thibautcombes1-bot/terratrack/issues) ; les modifications de code se proposent par pull request.

Ouvrez une issue sur GitHub. Pour un bug, indiquez les étapes pour le reproduire, le résultat attendu et obtenu, le téléphone ou navigateur utilisé, ainsi que la version du projet si vous la connaissez. Une capture peut aider : retirez les informations personnelles, positions précises et données privées avant de la joindre.

Les retours utiles comprennent les parcours incohérents, les lieux mal placés, l'accessibilité, les difficultés d'installation et les tests hors ligne. Les horaires, conditions d'accès, restrictions de circulation et niveaux d'activités doivent être vérifiés auprès de sources fiables : le pack peut être incomplet ou ancien.

## Installer et tester

Il faut Node.js 20 ou plus et npm. Depuis la racine du projet :

```sh
npm ci
npm test
npm run terrain:build
npm run terrain
```

L'application de terrain s'ouvre à l'adresse indiquée dans le terminal. Le pack de données France n'est pas dans le dépôt : sans lui, les fonctions de carte et de parcours hors ligne ne sont pas toutes utilisables, et certains tests dépendants du pack peuvent être ignorés. Les instructions de construction du pack et de l'application iPhone sont dans [terrain/README.md](terrain/README.md). Le planificateur web historique et l'application de terrain sont deux interfaces distinctes.

Pour iOS, Xcode, les outils Apple et une signature adaptée sont nécessaires. Une compilation réussie ne remplace pas un essai sur iPhone, notamment pour le GPS, le fonctionnement en arrière-plan et le mode avion.

## Proposer une modification

1. Ouvrez une issue pour une modification importante, afin de discuter du besoin.
2. Créez une branche depuis `main` et gardez les changements ciblés.
3. Ajoutez ou adaptez les tests pertinents, puis lancez `npm test` et `npm run terrain:build`.
4. Ouvrez une pull request en décrivant le changement, les tests effectués et ce qui reste à vérifier. Pour l'interface, une capture est bienvenue.

Le code, les commentaires et les textes du projet sont en français. Ne publiez jamais de clés, de données personnelles, de profils de signature ou de données GPS privées. Les gros packs et fichiers générés ne doivent pas être ajoutés au dépôt. Les contributions sont soumises à la licence [AGPL-3.0-or-later](LICENSE).
