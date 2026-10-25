// Chargement du pack d'une région : carte, réseau routier, lieux. Tout vient du téléphone
// (fichiers embarqués dans l'appli iOS, ou gardés par le service worker sur le web).
import { FileSource, PMTiles } from 'pmtiles';
import { chargerGraphe } from '../../commun/routeur.js';

const adresse = (chemin) => new URL(chemin, new URL(import.meta.env.BASE_URL, location.href)).href;

export async function chargerPack(region, signaler = () => {}) {
  const lire = async (fichier) => {
    const reponse = await fetch(adresse(`pack/${region}/${fichier}`));
    if (!reponse.ok) throw new Error(`Pack incomplet : ${fichier} (${reponse.status})`);
    return reponse;
  };
  signaler('Lecture du pack de la région…');
  const meta = await (await lire('meta.json')).json();
  const [donneesGraphe, donneesLieux, carte] = await Promise.all([
    lire('graphe.json').then((r) => r.json()),
    lire('lieux.json').then((r) => r.json()),
    lire('carte.pmtiles').then((r) => r.blob()),
  ]);
  signaler('Préparation du réseau routier…');
  return {
    meta,
    graphe: chargerGraphe(donneesGraphe),
    lieux: donneesLieux.lieux,
    communes: donneesLieux.communes,
    // La carte entière est lue en mémoire : pas de requêtes partielles, donc rien à demander au réseau.
    pmtiles: new PMTiles(new FileSource(new File([carte], 'carte.pmtiles'))),
  };
}
