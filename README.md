# Cap Away

Préparer un road trip, comparer jusqu’à trois voyages en couleurs et partir avec le guidage intégré. Application iPhone et web, open source sous AGPL-3.0-or-later.

![Symbole Cap Away](terrain/public/icone-180.png)

## V1

- Préparer : départ depuis sa position ou une commune, envies, durée et contraintes.
- Choisir : jusqu’à trois voyages distincts, sans choix imposé ; vérifier les étapes avant validation.
- En route : carte 3D et guidage GPS intégré. Le calcul initial des consignes demande une connexion et un accord explicite. Les données de carte et la préparation utilisent le pack local.
- Favoris et réglages séparés ; données personnelles conservées sur l’appareil.

Le suivi réel en déplacement, la voix et la reprise en arrière-plan doivent encore être validés sur iPhone. Le planificateur de bureau à la racine est une interface historique distincte ; l’application mobile est dans `terrain/`.

## Installer et contribuer

Node.js 20+, npm ; Xcode et signature Apple pour iOS.

```sh
npm ci
npm test
npm run terrain:build
npm run terrain
# Après configuration de Xcode et du pack :
npx cap sync ios
npx cap open ios
```

Le pack France volumineux est distribué séparément : voir [instructions et données](terrain/README.md). Ne modifiez pas les identifiants de stockage ni les Bundle IDs pour une mise à jour de l’application existante.

[Contribuer](CONTRIBUTING.md) · [Discussions](https://github.com/thibautcombes1-bot/terratrack/discussions/4) · [Tâches ouvertes](https://github.com/thibautcombes1-bot/terratrack/issues) · [Messages prêts à partager](docs/PARTAGER.md).

La [démonstration historique](https://github.com/thibautcombes1-bot/terratrack/releases/tag/terrain-v1.0-preview.7) précède le changement de nom ; elle montre une position de test fixe, pas une conduite réelle.

## Distribution et lancement

Cap Away reste open source et accessible gratuitement sur GitHub. La version App Store sera la version officielle, signée, maintenue et simple à installer. Le prix se décide dans App Store Connect : lancement éventuellement gratuit, puis petit achat unique envisagé. Aucun paywall, abonnement ou achat intégré ajouté à la V1.

[Préparation App Store](APP_STORE_CHECKLIST.md) · [État et validations](RAPPORT_CAP_AWAY_V1.md) · [Après V1](POST_V1_ROADMAP.md).

## Licence et marque

La [licence AGPL-3.0-or-later](LICENSE) reste inchangée. Le nom, les logos et l’identité Cap Away sont traités séparément dans [TRADEMARK.md](TRADEMARK.md). Les crédits des données et composants tiers restent applicables. [Sécurité](SECURITY.md) · [Code de conduite](CODE_OF_CONDUCT.md).
