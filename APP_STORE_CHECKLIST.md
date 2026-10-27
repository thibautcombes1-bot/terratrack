# Cap Away — checklist App Store Connect

État technique et vérifications : voir AUDIT_CAP_AWAY.md et RAPPORT_CAP_AWAY_V1.md. Cette liste prépare la soumission ; elle ne confirme ni une fiche privée App Store Connect existante, ni une approbation Apple.

## Identité et fiche existante

- [ ] Retrouver la fiche liée à **fr.terratrack.terrain**. Ne pas créer une nouvelle identité parce que le nom change.
- [ ] Nom public : **Cap Away** (vérifier sa disponibilité).
- [ ] Bundle ID principal inchangé ; extension inchangée.
- [ ] Version : **1.0** ; build préparé : **8**, à augmenter si ce numéro est déjà utilisé sur App Store Connect.
- [ ] Propriétaire, droits sur les contributions et distribution Apple confirmés ; licence du dépôt AGPL conservée.
- [ ] Compte développeur, contrats et informations d’entreprise/personne à jour. Le titulaire réalise lui-même les validations contractuelles.
- [ ] Copyright proposé : **2026 Thibaut Combes**, à confirmer par le propriétaire.

## Textes proposés — français

**Sous-titre** : Voyages et activités outdoor

**Texte promotionnel** : Préparez votre escapade, comparez jusqu’à trois voyages sur la carte et choisissez vos étapes avant de lancer le guidage intégré.

**Mots-clés** : roadtrip,voyage,outdoor,randonnée,van,découverte,nature,kayak,escalade,itinéraire

**Description** :

Cap Away accompagne vos voyages itinérants et vos envies de découverte.

Choisissez votre départ, une durée et les activités qui vous plaisent : patrimoine, villages, nature, randonnée, escalade ou canoë-kayak. Comparez jusqu’à trois voyages différents sur la carte, puis gardez les étapes qui vous conviennent.

• Départ depuis une commune ou votre position.
• Carte et préparation avec les données locales de France métropolitaine et de Corse.
• Choix des étapes, des nuits et du rythme du voyage.
• Estimations de conduite, de carburant et de budget.
• Guidage routier intégré avec carte 3D et consignes vocales.
• Favoris, souvenirs et historique conservés sur votre appareil.
• Réglages de confidentialité et de GPS accessibles.

Le calcul initial des consignes de guidage et les nouveaux calculs nécessitent une connexion ; les consignes d’une route déjà calculée peuvent être conservées pour une reprise hors réseau. La vue 3D utilise les bâtiments disponibles, sans modèle de relief. Le guidage est un profil automobile et ne vérifie pas les gabarits des vans.

Les activités sont des lieux à découvrir : vérifiez les accès, conditions, horaires, niveaux et topos sur place. Les données et estimations peuvent être incomplètes.

Cap Away est aussi un projet open source : le code peut être consulté et amélioré sur GitHub. Le nom et les logos identifient la version officielle.

- [ ] Relire les textes sans promettre un guidage entièrement hors ligne.
- [ ] Catégorie principale proposée : **Voyages** ; secondaire possible : **Navigation**, à confirmer selon le positionnement final.
- [ ] Répondre au questionnaire de classification d’âge actuel, à partir des fonctionnalités réellement présentes.
- [ ] Remplir les mentions nécessaires sur les contenus, l’IA locale optionnelle et les services externes.

## Visuels

- [ ] App Icon 1024 × 1024, opaque et sans coins arrondis incorporés : intégrée depuis la déclinaison A ; validation du propriétaire.
- [ ] Captures iPhone finales sur appareil ou simulateur de la version signée, cohérentes avec les fonctions disponibles.
- [ ] Captures iPad finales : l’app conserve le support iPad. Ne pas le supprimer uniquement pour éviter les captures.
- [ ] Au moins un format iPhone Dynamic Island moyen accepté : 1179 × 2556 ou 1206 × 2622.
- [ ] iPad 13 pouces : 2064 × 2752 ou 2048 × 2732.
- [ ] PNG/JPEG sans transparence ; vérifier les tailles acceptées à la date de soumission.
- [ ] Les captures navigateur du README sont des aperçus, pas des captures App Store finales.
- [ ] Voir docs/app-store/CAPTURES.md et docs/brand/README.md.

## Assistance et confidentialité

URLs prévues sur le site public du dépôt, à ouvrir et vérifier après déploiement :

- Assistance : https://thibautcombes1-bot.github.io/terratrack/assistance.html
- Confidentialité : https://thibautcombes1-bot.github.io/terratrack/confidentialite.html
- Présentation : https://thibautcombes1-bot.github.io/terratrack/

- [ ] Vérifier que les trois pages répondent publiquement en HTTPS et présentent Cap Away.
- [ ] Fournir les coordonnées de contact requises dans App Store Connect ; ne pas copier de coordonnées privées dans Git.
- [ ] Valider la politique avec le responsable de publication.
- [ ] Compléter App Privacy en tenant compte des transmissions OSRM, Open-Meteo, prix, GitHub et des politiques des prestataires.
- [ ] Ne pas cocher automatiquement « aucune donnée collectée » : les positions sont transmises après accord pour le guidage et les prévisions.
- [ ] Le manifeste déclare les positions précises/approximatives pour les fonctions de l’app, sans suivi publicitaire ni compte ; vérifier aussi les journaux des prestataires.
- [ ] Les photos, notes et journaux restent locaux hors partage demandé ; vérifier les exceptions de sauvegarde et de partage utilisateur.
- [ ] Vérifier les manifestes des dépendances dans l’archive et les motifs CA92.1 / C617.1 de l’app.

## Prix et disponibilité — décision produit

Le prix est choisi **dans App Store Connect**, avant soumission, et peut ensuite être modifié ou planifié selon les options Apple. La V1 ne contient **aucun paywall, abonnement, achat intégré ni ajout StoreKit**.

- [ ] Choisir le pays de base, les territoires, la disponibilité et le calendrier.
- [ ] Décider du lancement éventuellement gratuit pour une courte période.
- [ ] Envisager ensuite un petit prix d’achat unique de l’application ; aucun montant ni date n’est imposé par le code.
- [ ] Pour une distribution payante, le titulaire doit accepter le Paid Apps Agreement et compléter les données fiscales et bancaires dans App Store Connect.
- [ ] Le code reste accessible gratuitement sur GitHub ; la version App Store est la version officielle signée et maintenue.
- [ ] La marque reste distincte de la licence open source, voir TRADEMARK.md.
- [ ] Aucun changement de licence ni nouvel accord avec les contributeurs n’est fait automatiquement.

## Review et TestFlight

Notes proposées :

L’application n’a pas de compte. Tester Préparer → choisir une commune ou D’ici → comparer les voyages → vérifier les étapes → préparer le départ. Le guidage demande une position récente, une connexion et un accord explicite avant l’envoi des coordonnées à FOSSGIS/OSRM. La météo et les prix sont optionnels. Un refus conserve l’accès aux données locales. La localisation en arrière-plan sert au journal du voyage après activation. Les annonces de guidage sont actualisées au premier plan. L’IA Apple est optionnelle et dispose d’un repli par mots-clés. Le pack embarqué est volumineux ; laisser terminer l’installation. Les boutons d’assistance et de confidentialité sont dans Réglages.

- [ ] Ajouter les coordonnées privées pour App Review et les notes spécifiques à la build.
- [ ] Charger l’archive signée via Xcode/Transporter ; conserver le même Bundle ID.
- [ ] Vérifier traitement Apple, chiffrement/export, conformité et choix de la build.
- [ ] Créer le groupe TestFlight interne ; essayer lancement, reprise de données, permissions, GPS, voix et retour hors réseau.
- [ ] Pour des testeurs externes, compléter les informations et passer l’examen bêta si requis.
- [ ] Vérifier un vrai trajet et l’autonomie ; distinguer le journal GPS des consignes en arrière-plan.
- [ ] Corriger les anomalies P0/P1 avant la soumission App Store.
- [ ] Sélectionner la publication manuelle ou automatique souhaitée, puis vérifier la fiche publique après approbation. Une archive réussie n’est pas une publication.

## Sources vérifiées le 27 octobre 2026

- [SDK minimum Apple](https://developer.apple.com/news/upcoming-requirements/)
- [Captures acceptées](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
- [Prix de l’app et accord payant](https://developer.apple.com/help/app-store-connect/manage-app-pricing/set-a-price)
- [App Review](https://developer.apple.com/app-store/review/guidelines/)
