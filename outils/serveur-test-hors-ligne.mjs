// Sert terrain/dist pour tester le hors ligne : après une visite de /__couper, toutes les
// requêtes échouent comme en mode avion (seul le service worker peut encore répondre).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '../terrain/dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.pbf': 'application/x-protobuf', '.pmtiles': 'application/octet-stream', '.webmanifest': 'application/manifest+json' };
let coupe = false;

http
  .createServer((req, res) => {
    const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (chemin === '/__couper') {
      coupe = true;
      res.end('réseau coupé');
      return;
    }
    if (chemin === '/__retablir') {
      coupe = false;
      res.end('réseau rétabli');
      return;
    }
    if (coupe) return req.socket.destroy();
    const fichier = path.join(racine, chemin.endsWith('/') ? `${chemin}index.html` : chemin);
    if (!fichier.startsWith(racine) || !fs.existsSync(fichier)) {
      res.statusCode = 404;
      return res.end();
    }
    res.setHeader('Content-Type', TYPES[path.extname(fichier)] ?? 'application/octet-stream');
    res.setHeader('Vary', 'Origin');
    fs.createReadStream(fichier).pipe(res);
  })
  .listen(Number(process.env.PORT) || 5192, '127.0.0.1');
