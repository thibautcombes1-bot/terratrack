# Audit initial — TerraTrack vers Cap Away

Audit du 27 octobre 2026, avant changement du nom ou des identifiants.

## Architecture et inventaire

- Application iOS Capacitor 8.5.3 : interface JavaScript sans framework dans `terrain/`, carte MapLibre/Protomaps/PMTiles, routeur local dans `commun/routeur.js`. Vite 6.4.3 ; tests Node.
- Conteneur UIKit (`AppDelegate`, `SceneDelegate`, `CAPBridgeViewController`). Plugins Swift : Pack, Terrain, IA. FoundationModels optionnel à partir d’iOS 26, avec repli JavaScript par mots-clés.
- Extension SwiftUI/WidgetKit/ActivityKit pour le suivi, dans `TrajetLiveActivity`. Pas de réécriture SwiftUI de l’application principale.
- Targets : `App` et `TrajetLiveActivity`. Schemes : `App`, `CapApp-SPM`, `TrajetLiveActivity`. Noms de produit techniques conservables.
- Bundle ID principal : `fr.terratrack.terrain`. Extension : `fr.terratrack.terrain.TrajetLiveActivity`. Signing automatique ; équipe déjà configurée dans le projet, à conserver pour la version officielle.
- Version des configurations sources initiales : 0.1 (1). La dernière installation a été construite par surcharge en 1.0 (7). Aligner la prochaine version source sur 1.0 (8), application et extension.
- Xcode observé : 27.1 (27A9275), SDK iPhoneOS 27.1. Minimum cible : iOS 15 pour l’app, iOS 16.2 pour l’extension. Pas de target de tests Swift dédiée.
- `Info.plist` séparés pour app et extension ; permissions localisation, localisation en arrière-plan, photos et caméra. Launch screen storyboard et icône dans Assets.xcassets.
- Aucun fichier d’entitlements explicite, App Group, CloudKit, conteneur iCloud, Keychain Group personnalisé ou URL scheme personnalisé trouvé dans la configuration versionnée. Les entitlements générés par la signature seront contrôlés au build.
- `localStorage` : préfixes `terratrack.terrain.*` et `terratrack.*` (planificateur historique). IndexedDB `terratrack` pour les photos. UserDefaults `terratrack.suivi`. Fichiers de suivi et packs sous Application Support/`terratrack`.
- Session de téléchargement persistante : `fr.terratrack.terrain.pack`. Source des packs : dépôt GitHub `thibautcombes1-bot/terratrack`, release `pack-france`.
- Planificateur ordinateur historique dans `src/` et `server/`, distinct de l’app iOS. Les variables `TERRATRACK_*` font partie de ses conventions de configuration.
- Workflow existant : reconstruction hebdomadaire et publication du pack France. Pas de pipeline général de soumission App Store.
- Licence existante : GNU Affero General Public License v3, annoncée `AGPL-3.0-or-later` dans package.json. Aucune modification automatique de cette licence.
- Recherche de secrets à haute confiance : 112 fichiers texte versionnés inspectés, aucun candidat détecté et aucun certificat, profil de provisioning ou clé privée versionné trouvé. Aucun .env local trouvé dans les emplacements usuels. Cette recherche n’est pas une preuve d’absence de tout secret.

## Occurrences et compatibilité

| Classe | Exemples | Décision |
| --- | --- | --- |
| A — public | Display Name, titres web, en-tête, boutons GPS, messages, exports, prompts IA, documentation active | Cap Away ; CapAway dans les noms de fichiers exportés |
| B — technique sans état | noms des nouvelles couleurs/assets, nom npm, branding des documents | CapAway ou cap-away si utile ; ne pas renommer les targets uniquement pour la forme |
| C — persistant | Bundle IDs, clés de stockage, IndexedDB, UserDefaults, dossier Application Support, session URLSession, URL du dépôt et des packs, variables d’environnement existantes | Conserver, documenter et tester la reprise des données |

Le changement du Bundle ID créerait une autre identité d’application et risquerait de perdre la continuité d’installation et de distribution. Aucun motif technique n’impose ce changement.

## P0 initiaux — publication bloquée

- Absence de manifeste de confidentialité propre aux APIs natives utilisées (UserDefaults et métadonnées de fichiers).
- Informations de confidentialité et contact support insuffisamment accessibles dans l’app ; politique publique à préparer et vérifier.
- Statut App Store Connect, droits contractuels et métadonnées de distribution non vérifiés. Aucune soumission ni publication ne peut être déclarée réussie sans preuve Apple.
- Build Release/archive, signature et lancement de la version renommée à vérifier.
- Icône finale Cap Away à intégrer et contrôler ; le visuel détaillé fourni ne doit pas être réduit tel quel à toutes les petites tailles.

## P1 initiaux — à corriger avant publication

- Ancienne marque visible dans app, extension, permissions, navigation, exports et web.
- Versions/build sources désalignés de la version réellement installée.
- Présentation claire du partage de positions avec OSRM et de l’usage des services météo/prix avant de les contacter.
- Thème et surfaces à harmoniser, clair/sombre et contraste à vérifier.
- Documentation GitHub à recentrer sur Cap Away ; protéger la marque séparément du code sans modifier les droits AGPL existants.
- Vérifier les domaines/liens, le fonctionnement sans accord réseau et la reprise des données historiques.

## P2 — après V1

Voir POST_V1_ROADMAP.md. Le pack léger de développement, l’architecture, le moteur de manœuvres entièrement hors ligne et les raffinements graphiques ne doivent pas bloquer ce rebranding.

## Exigences consultées

- [Exigences SDK Apple](https://developer.apple.com/news/upcoming-requirements/) : depuis le 28 avril 2026, Xcode 26 / SDK iOS 26 ou ultérieur. La chaîne observée est plus récente ; la conformité finale dépend de l’archive et d’App Store Connect.
- [Manifeste des APIs à motif obligatoire](https://developer.apple.com/documentation/technotes/tn3183-adding-required-reason-api-entries-to-your-privacy-manifest).
- [Motifs d’accès aux métadonnées de fichiers](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype).
- [Guidelines Apple](https://developer.apple.com/app-store/review/guidelines/) : confidentialité accessible, permissions pertinentes et partage de données annoncé.
- [GNU FAQ](https://www.gnu.org/licenses/gpl-faq.html) : licence existante et droits des contributeurs à respecter ; la politique de marque est distincte. La voie contractuelle de distribution Apple reste à confirmer avec les titulaires des droits, sans changer automatiquement la licence.
