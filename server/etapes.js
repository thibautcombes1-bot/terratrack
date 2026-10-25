// Villages et sites labellisés (Plus Beaux Villages, Petites Cités de Caractère, Plus Beaux
// Détours, Grands Sites…), livrés avec l'appli : régénérés par outils/construire-etapes.mjs.
import fs from 'node:fs';

export const { etapes: ETAPES } = JSON.parse(
  fs.readFileSync(new URL('./donnees/etapes.json', import.meta.url), 'utf8'),
);
