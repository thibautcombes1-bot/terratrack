import { defineConfig, loadEnv } from 'vite';
import cesium from 'vite-plugin-cesium';
import { apiHorizon } from './server/api.js';

export default defineConfig(({ mode }) => {
  // Les clés du .env restent côté serveur : seules les variables VITE_* arrivent dans la page.
  for (const [cle, valeur] of Object.entries(loadEnv(mode, process.cwd(), '')))
    process.env[cle] ??= valeur;

  // Par défaut, Horizon n'écoute que sur ce Mac. `npm run reseau` l'ouvre au Wi-Fi (iPhone).
  const reseau = {
    host: process.env.HORIZON_HOTE || '127.0.0.1',
    port: Number(process.env.HORIZON_PORT) || 5190,
  };
  return {
    plugins: [cesium(), apiHorizon()],
    server: reseau,
    preview: reseau,
    build: { target: 'es2022' },
  };
});
