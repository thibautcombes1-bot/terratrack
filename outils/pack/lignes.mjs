// Lecture ligne par ligne d'un gros fichier, en coupant seulement sur « \n » : readline coupe
// aussi sur « \r », qu'osmium laisse parfois tel quel dans les descriptions (GeoJSON brisé).
import fs from 'node:fs';

export async function* lignes(chemin) {
  let reste = '';
  for await (const morceau of fs.createReadStream(chemin, { encoding: 'utf8', highWaterMark: 1 << 20 })) {
    const parties = (reste + morceau).split('\n');
    reste = parties.pop();
    yield* parties;
  }
  if (reste) yield reste;
}
