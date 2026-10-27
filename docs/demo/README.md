# Démonstration Cap Away

[Voir ou télécharger la vidéo MP4](https://github.com/thibautcombes1-bot/terratrack/releases/download/terrain-v1.0-preview.7/terratrack-demo.mp4) · [Préversion du build 7](https://github.com/thibautcombes1-bot/terratrack/releases/tag/terrain-v1.0-preview.7)

- Durée : 24,52 secondes ; vidéo muette H.264, 1280 × 900, environ 1,7 Mo.
- Séquence : départ « D’ici », préparation, comparaison des trois voyages, choix, vérification des étapes et ouverture du guidage 3D.
- Capture de l’application web réelle dans Chrome, avec une position de test fixe à Lodève. Aucune position personnelle, aucun déplacement ni arrivée simulés.
- Fond cartographique issu du pack France local ; réponse de guidage obtenue en ligne auprès de FOSSGIS/OSRM.
- Le guidage, la voix et le suivi en déplacement réel sur iPhone restent à éprouver.

Cartographie © contributeurs [OpenStreetMap](https://www.openstreetmap.org/copyright) · [Protomaps](https://protomaps.com). Les fichiers du pack ne sont pas inclus dans Git.

Le MP4 et son fichier `SHA256SUMS` sont publiés comme pièces jointes de la préversion. `apercu.png` est une capture de cette même démonstration.

Empreinte SHA-256 du MP4 :

```text
827d45a0de7c9ed4ed0a83f6b9c78505a1f59cca16e00deaa82d745737cf3279
```

Pour reproduire la séquence, lancer `npm run terrain` avec le pack France local, choisir une position de test dans les outils du navigateur, un jour et l’envie Patrimoine, puis Clermont-l’Hérault comme destination. La vidéo est une présentation du logiciel, pas une validation de conduite réelle.
