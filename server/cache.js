// Cache mémoire + disque (.cache/) pour les sources lentes ou lourdes.
import fs from 'node:fs/promises';
import path from 'node:path';

const DOSSIER = path.resolve('.cache');
const memoire = new Map();
const enCours = new Map();

export const AGENT = 'Horizon/0.1 (projet open source, usage personnel)';

/**
 * Renvoie la valeur en cache si elle a moins de `dureeMs`, sinon appelle
 * `charger()`. En cas d'échec, l'ancienne valeur est servie si elle existe.
 * @returns {Promise<{valeur: any, date: number}>}
 */
export async function avecCache(cle, dureeMs, charger) {
  let entree = memoire.get(cle);
  if (!entree) {
    try {
      entree = JSON.parse(await fs.readFile(fichier(cle), 'utf8'));
      memoire.set(cle, entree);
    } catch {}
  }
  if (entree && Date.now() - entree.date < dureeMs) return entree;
  if (enCours.has(cle)) return enCours.get(cle);

  const promesse = (async () => {
    try {
      const nouvelle = { valeur: await charger(), date: Date.now() };
      memoire.set(cle, nouvelle);
      await fs.mkdir(DOSSIER, { recursive: true });
      await fs.writeFile(fichier(cle), JSON.stringify(nouvelle));
      return nouvelle;
    } catch (erreur) {
      if (entree) {
        console.warn(`[cache] ${cle} : ${erreur.message}, ancienne valeur servie`);
        return entree;
      }
      throw erreur;
    } finally {
      enCours.delete(cle);
    }
  })();
  enCours.set(cle, promesse);
  return promesse;
}

/** fetch JSON avec délai maximal et en-tête d'identification. */
export async function lireJson(url, options = {}) {
  const reponse = await fetch(url, {
    ...options,
    headers: { 'User-Agent': AGENT, Accept: 'application/json', ...options.headers },
    signal: AbortSignal.timeout(options.delaiMs ?? 60_000),
  });
  if (!reponse.ok) {
    const detail = (await reponse.text().catch(() => '')).slice(0, 200);
    throw new Error(`${new URL(url).host} a répondu ${reponse.status} ${detail}`.trim());
  }
  return reponse.json();
}

const fichier = (cle) => path.join(DOSSIER, `${cle.replace(/[^a-z0-9-]/gi, '_')}.json`);
