// Service worker de TerraTrack : à la première visite (en Wi-Fi), tout est mis de côté
// (appli, carte, pack de la région). Ensuite tout est servi depuis le téléphone, même en mode avion.
const VERSION = '__VERSION__';
const FICHIERS = __FICHIERS__;

async function diffuser(message) {
  for (const client of await self.clients.matchAll({ includeUncontrolled: true })) client.postMessage(message);
}

self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      let fait = 0;
      for (const fichier of FICHIERS) {
        await cache.add(new Request(fichier, { cache: 'reload' }));
        fait++;
        diffuser({ type: 'preparation', fait, total: FICHIERS.length });
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    (async () => {
      for (const cle of await caches.keys()) if (cle !== VERSION) await caches.delete(cle);
      await self.clients.claim();
      diffuser({ type: 'pret' });
    })(),
  );
});

self.addEventListener('fetch', (evenement) => {
  if (evenement.request.method !== 'GET') return;
  evenement.respondWith(
    (async () => {
      // ignoreVary : sinon un script chargé en module (avec en-tête Origin) ne retrouve pas sa copie.
      const enCache = await caches.match(evenement.request, { ignoreSearch: true, ignoreVary: true });
      if (enCache) return enCache;
      try {
        return await fetch(evenement.request);
      } catch (erreur) {
        if (evenement.request.mode === 'navigate') return caches.match('./');
        throw erreur;
      }
    })(),
  );
});

self.addEventListener('message', async (evenement) => {
  if (evenement.data === 'etat') {
    const pret = (await caches.keys()).includes(VERSION);
    evenement.source.postMessage({ type: pret ? 'pret' : 'absent' });
  }
});
