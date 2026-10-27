# Assets Cap Away

Le visuel détaillé fourni par le propriétaire est conservé dans **cap-away-reference.png**, sans modification artistique. Une déclinaison du A pour les petites tailles a été préparée avec le workflow intégré imagegen, à partir de cette référence, puis exportée techniquement aux tailles iOS/web.

## Livrés

- cap-away-reference.png : original détaillé, 1254 × 1254, pour référence de marque et grandes présentations.
- ../../terrain/public/brand/cap-away-appicon.png : A simplifié 1024 × 1024, fond forêt plein et opaque, sans coins arrondis préintégrés.
- AppIcon.appiconset/AppIcon-512@2x.png : même icône iOS 1024 × 1024.
- CapAwayMark.imageset/mark.png : même signe pour le lancement natif.
- icone-180.png et icone-1024.png : icônes web.
- Palette centralisée dans terrain/src/marque.css : vert, forêt, vert clair, crème, fond et accent ; interfaces clair/sombre.

## Sources et exports utiles à fournir ou valider

| Fichier | Format conseillé | Usage |
| --- | --- | --- |
| cap-away-logo-complet.svg | vectoriel éditable ; PNG 3000 px de large si besoin | grandes présentations |
| cap-away-a-detaille.svg | vectoriel ou PNG 2048 × 2048 | symbole illustré |
| cap-away-a-simplifie.svg | vectoriel ; PNG 1024 × 1024 | master du signe retenu |
| cap-away-logo-clair.svg | vectoriel ou PNG transparent 2048 px | fonds sombres |
| cap-away-logo-sombre.svg | vectoriel ou PNG transparent 2048 px | fonds clairs |
| cap-away-monochrome.svg | une couleur, vectoriel ; PNG 1024 × 1024 | usages monochromes |
| cap-away-appicon-1024.png | 1024 × 1024 opaque, sans marge blanche ni coins arrondis | validation finale App Store |

Ces exports vectoriels et variantes de marque ne sont pas inventés comme des fichiers prétendument fournis. Leur absence ne bloque pas techniquement V1 si le propriétaire valide le PNG App Icon livré. Les captures App Store ont leur propre liste dans ../app-store/CAPTURES.md.

## Prompt de la déclinaison simplifiée

Outil utilisé : image_gen intégré ; référence : visuel du propriétaire. Demande : conserver la silhouette du grand A/montagne et le mouvement vert inférieur, simplifier pour lecture à 40 px ; une marque crème/verte sur fond forêt opaque plein ; retirer texte, personnages, paysages détaillés, véhicules, topographie, ombres et coins arrondis. Le visuel détaillé reste séparé. La sortie a été exportée en 1024 × 1024 sans alpha.

Les nouveaux éléments de marque sont distincts du code AGPL, voir ../../TRADEMARK.md. Les attributions et licences des éléments tiers restent applicables.
