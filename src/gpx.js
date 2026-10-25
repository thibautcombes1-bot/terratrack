// Export GPX : visites, nuits et points hauts en points de passage, tracé en piste.
// Se copie sur la carte SD du T-Deck (/rr/voyages/) ou s'ouvre dans OsmAnd, Organic Maps…
import { h } from './outils.js';

export function telechargerGpx(voyage) {
  const point = (p, nom, description, type) =>
    `  <wpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><name>${h(nom)}</name>${
      description ? `<desc>${h(description)}</desc>` : ''
    }<type>${type}</type></wpt>`;

  const points = [point(voyage.depart, 'Départ', voyage.depart.nom, 'depart')];
  for (const j of voyage.jours) {
    for (const v of j.visites) points.push(point(v, `J${j.jour} ${v.nom}`, v.pourquoi || v.description, 'visite'));
    if (!j.base.retour) points.push(point(j.base, `J${j.jour} ${j.base.nom}`, [j.titre, j.nuit].filter(Boolean).join(' — '), 'etape'));
    if (j.pointHaut)
      points.push(
        point(j.pointHaut, `J${j.jour} Point haut ${j.pointHaut.nom}`, `${j.pointHaut.ele} m, point haut radio`, 'point-haut'),
      );
  }
  const piste = voyage.trace.coords
    .map(([lon, lat]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"/>`)
    .join('\n');

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TerraTrack" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${h(voyage.titre)}</name><desc>${h(voyage.resume)}</desc><time>${new Date().toISOString()}</time></metadata>
${points.join('\n')}
  <trk><name>${h(voyage.titre)}</name><trkseg>
${piste}
  </trkseg></trk>
</gpx>
`;
  const nom = `terratrack-${voyage.titre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40)}.gpx`;
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
  lien.download = nom;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(lien.href), 5000);
  return nom;
}
