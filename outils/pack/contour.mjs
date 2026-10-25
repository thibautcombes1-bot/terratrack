// Contour Geofabrik (.poly) → GeoJSON, pour découper la carte et écarter les pays voisins.
// Exemple : node outils/pack/contour.mjs .brut/france.poly .brut/france-metropole.geojson
import fs from 'node:fs';

const [source, sortie] = process.argv.slice(2);
const lignes = fs.readFileSync(source, 'utf8').split('\n').map((l) => l.trim());
// Format : nom, puis des anneaux (numéro, points « lon lat », END), puis END.
// Les trous commencent par « ! » ; la France métropolitaine n'a qu'un anneau, on garde le premier.
const anneau = [];
for (const ligne of lignes.slice(2)) {
  if (ligne === 'END') break;
  const [lon, lat] = ligne.split(/\s+/).map(Number);
  if (Number.isFinite(lon) && Number.isFinite(lat)) anneau.push([lon, lat]);
}
if (anneau.length < 3) throw new Error(`Contour vide : ${source}`);
fs.writeFileSync(sortie, JSON.stringify({ type: 'Polygon', coordinates: [anneau] }));
console.log(`${anneau.length} points → ${sortie}`);
