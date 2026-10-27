# Sécurité de Cap Away

## Signaler discrètement

Utiliser [Report a vulnerability](https://github.com/thibautcombes1-bot/terratrack/security/advisories/new). Le signalement privé GitHub est activé. Ne publiez pas de jeton, certificat, profil de provisioning, trajet privé ou données de localisation dans une issue publique.

Décrivez la version, les étapes, l’impact et un exemple expurgé. Le projet ne promet pas de délai contractuel de réponse. La branche main et la V1 en préparation sont le périmètre de maintenance actif.

## Secrets et signature

- Secrets CI : GitHub Actions Secrets, avec des permissions minimales.
- Développement local : variables d’environnement, .env ignoré ou fichier .xcconfig local non versionné.
- Identités de signature : trousseau et compte Xcode du propriétaire ; ne pas les mettre dans Git.
- Jetons serveur : backend ou environnement serveur, jamais dans le JavaScript client.
- Données locales : ne pas joindre le conteneur d’appareil ou les journaux GPS à une pull request.

Si un secret a été publié, le révoquer et le remplacer d’abord. Retirer un fichier du dernier commit ne suffit pas à l’effacer de l’historique ; une réécriture d’historique doit être décidée séparément.

Le scan initial a inspecté les fichiers texte suivis par Git sans afficher leurs valeurs sensibles. Il ne remplace pas un examen spécialisé de l’application et de ses dépendances.
