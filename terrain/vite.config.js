// L'appli de terrain (téléphone, hors ligne). Chemins relatifs : la même compilation sert
// au web (avec service worker) et à l'appli iOS (Capacitor).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { CONFIDENTIALITE, ASSISTANCE, pageInformation } from './src/informations.js';

const racine = path.dirname(fileURLToPath(import.meta.url));

function fichiersPublics(dossier, base = '') {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((f) =>
    f.isDirectory() ? fichiersPublics(path.join(dossier, f.name), `${base}${f.name}/`) : [`${base}${f.name}`],
  );
}

/** Écrit sw.js avec la liste de tout ce qu'il faut garder hors ligne (appli + pack). */
function serviceWorker() {
  return {
    name: 'terratrack-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      for (const [nom, titre, contenu] of [['confidentialite.html', 'Confidentialité', CONFIDENTIALITE], ['assistance.html', 'Assistance', ASSISTANCE]])
        this.emitFile({ type: 'asset', fileName: nom, source: pageInformation(titre, contenu) });
      // La carte (plus d'un gigaoctet pour la France) n'est pas mise en cache d'avance : lue par morceaux.
      const publics = fichiersPublics(path.join(racine, 'public')).filter((f) => !f.endsWith('.pmtiles'));
      const fichiers = ['./', ...Object.keys(bundle), ...publics].map((f) =>
        f === './' ? f : `./${f.split('/').map(encodeURIComponent).join('/')}`,
      );
      const source = fs
        .readFileSync(path.join(racine, 'sw.js'), 'utf8')
        .replace('__VERSION__', `terratrack-${Date.now()}`)
        .replace('__FICHIERS__', JSON.stringify(fichiers));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

/** Le worker de MapLibre est copié à côté de l'appli : son adresse reste valable partout (web, iOS). */
function workerCarte() {
  return {
    name: 'terratrack-worker-carte',
    buildStart() {
      fs.copyFileSync(
        path.join(racine, '../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'),
        path.join(racine, 'public/maplibre-gl-worker.mjs'),
      );
    },
  };
}

const reseau = { host: process.env.TERRATRACK_HOTE || '127.0.0.1' };
export default defineConfig({
  root: racine,
  cacheDir: path.join(racine, '../.cache/vite-terrain'),
  base: './',
  plugins: [workerCarte(), serviceWorker()],
  server: { ...reseau, port: 5191, fs: { allow: [path.join(racine, '..')] } },
  preview: { ...reseau, port: 5192 },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
});
