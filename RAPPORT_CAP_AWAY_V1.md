# Cap Away — validation V1 du 27 octobre 2026

## Build et tests

- 72 tests automatisés réussis, aucun échec ni test ignoré.
- Compilation web de terrain et synchronisation Capacitor réussies.
- Archive iOS Release 1.0 (8) réussie avec Xcode 27.1.
- Export App Store signé réussi après connexion du compte Apple ; export final également réussi : /private/tmp/CapAway-final-1.0-8-export/App.ipa.
- Installation de la mise à jour sur iPhone réussie ; lancement empêché par le verrouillage de l’appareil, sans conclusion sur le fonctionnement GPS réel.
- Pages assistance/confidentialité : GitHub Pages activé, déploiement initial en cours à la dernière vérification.
- Contrôle navigateur mobile 390 × 844 : clair/sombre, réglages et politique accessibles, aucun débordement horizontal ni erreur JavaScript. Ce contrôle ne valide pas la conduite réelle.

## Prêt TestFlight / App Store

**TestFlight : archive et signature préparées ; réception Apple et essais réels encore à confirmer.**
**App Store : non, pas encore prêt à publier.** Captures finales, App Privacy, informations légales, prix et examen Apple à finaliser dans App Store Connect. Aucun envoi ni examen Apple n’est déduit d’un export local.

## Identité et continuité

Nom visible Cap Away, identité technique CapAway là où nécessaire. Bundle ID principal **fr.terratrack.terrain**, extension **fr.terratrack.terrain.TrajetLiveActivity**, équipe et version de mise à jour conservés. Préfixes localStorage, IndexedDB terratrack, UserDefaults terratrack.suivi, répertoire natif, session de téléchargement et URL GitHub historiques restent intentionnellement inchangés. Leur conservation est couverte par les tests ; la reprise des données sur un appareil existant demande aussi un essai utilisateur.

## P0 / P1 / P2

- P0 résolus : archive, signature App Store et cohérence app/extension.
- Avant diffusion aux testeurs : confirmer installation/lancement et comportement GPS, voix, pause/reprise et mode avion sur iPhone. Le calcul initial du guidage requiert une connexion.
- Avant App Store : valider les déclarations de confidentialité, captures des appareils supportés, droits de distribution et marque, métadonnées et prix. Ne pas changer la licence AGPL sans droits appropriés.
- P1 traités : icône opaque, lancement natif, palette clair/sombre, confidentialité accessible, accords séparés pour le guidage et météo/prix, manifeste de confidentialité.
- P2 : voir POST_V1_ROADMAP.md ; aucune réécriture d’architecture engagée.

## Assets exacts

- terrain/public/brand/cap-away-appicon.png : 1024 × 1024 opaque.
- ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png : icône iOS 1024 × 1024.
- ios/App/App/Assets.xcassets/CapAwayMark.imageset/mark.png : lancement natif.
- docs/brand/cap-away-reference.png : référence détaillée originale 1254 × 1254.
- docs/brand/README.md : inventaire, prompt de déclinaison imagegen et variantes vectorielles optionnelles restant à fournir.
- docs/app-store/CAPTURES.md : captures finales à produire ; les contrôles navigateur ne les remplacent pas.

## GitHub et lancement

README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, TRADEMARK, checklist App Store et feuille de route préparés. Licence AGPL existante inchangée et copie embarquée. Le dépôt et ses URL restent accessibles ; aucun message externe n’est envoyé. Les messages à partager soi-même sont dans docs/PARTAGER.md. Les issues d’accueil sont des appels à contributions, pas des retours spontanés de tiers.

Le prix se règle dans App Store Connect : gratuité initiale possible puis petit achat unique envisagé. Aucun paywall, abonnement, achat intégré ni StoreKit ajouté. GitHub reste gratuit ; la version App Store sera la version officielle signée et maintenue. Nom et logos sont distincts de la licence du code.

## Étapes manuelles App Store Connect

Suivre APP_STORE_CHECKLIST.md : choisir la build reçue, compléter captures, assistance/confidentialité, App Privacy, âge/contenu, droits et prix ; tester via TestFlight avant soumission. Apple décide de la validation et de la disponibilité effective.

**Prochaine priorité unique : valider la V1 sur un vrai iPhone avant diffusion TestFlight.**
