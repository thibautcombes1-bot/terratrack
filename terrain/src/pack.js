// Chargement du pack : carte, réseau routier, lieux. Tout vient du téléphone
// (fichiers embarqués dans l'appli iOS, ou servis par le site sur le web).
import { Capacitor, registerPlugin } from '@capacitor/core';
import { PMTiles } from 'pmtiles';
import { chargerGraphe, lireGrapheBinaire } from '../../commun/routeur.js';

const adresse = (chemin) => new URL(chemin, new URL(import.meta.env.BASE_URL, location.href)).href;

// Plugin natif « Pack » (ios/App/App/TerraTrackIA.swift) : lit un morceau d'un fichier de l'appli.
const PackNatif = registerPlugin('Pack');

/**
 * La carte de la France (plus d'un gigaoctet) ne peut pas être chargée en mémoire :
 * sur iPhone, chaque tuile est lue à sa place dans le fichier par le plugin natif.
 */
class SourceNative {
  constructor(chemin) {
    this.chemin = chemin;
  }
  getKey() {
    return this.chemin;
  }
  async getBytes(debut, longueur) {
    const { donnees } = await PackNatif.lire({ chemin: this.chemin, debut, longueur });
    if (Uint8Array.fromBase64) return { data: Uint8Array.fromBase64(donnees).buffer };
    const binaire = atob(donnees);
    const octets = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    return { data: octets.buffer };
  }
}

export async function chargerPack(region, signaler = () => {}) {
  const lire = async (fichier) => {
    const reponse = await fetch(adresse(`pack/${region}/${fichier}`));
    if (!reponse.ok) throw new Error(`Pack incomplet : ${fichier} (${reponse.status})`);
    return reponse;
  };
  signaler('Lecture du pack…');
  const meta = await (await lire('meta.json')).json();
  const [tamponGraphe, donneesLieux] = await Promise.all([
    lire('graphe.bin').then((r) => r.arrayBuffer()),
    lire('lieux.json').then((r) => r.json()),
  ]);
  signaler('Préparation du réseau routier…');
  // Laisse l'écran afficher le message avant le calcul, qui bloque quelques secondes.
  await new Promise((ok) => setTimeout(ok, 30));
  const graphe = chargerGraphe(lireGrapheBinaire(tamponGraphe));
  // Sur le web, la carte est lue par morceaux (requêtes partielles) au fil des tuiles affichées.
  const chemin = `pack/${region}/carte.pmtiles`;
  return {
    meta,
    graphe,
    lieux: donneesLieux.lieux,
    communes: donneesLieux.communes,
    pmtiles: new PMTiles(Capacitor.isNativePlatform() ? new SourceNative(chemin) : adresse(chemin)),
  };
}
