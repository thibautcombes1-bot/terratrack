// Souvenirs des lieux : un commentaire et des photos, gardés sur l'appareil, sans réseau.
// Les commentaires vont dans la mémoire de l'appli ; les photos, réduites (1600 px, JPEG),
// dans IndexedDB. Une photo ajoutée pendant un passage vérifié par le GPS est marquée « sur place ».
import { memoire } from './outils.js';

const COTE_MAX = 1600;
const fiches = new Map(memoire.lire('souvenirs', []).map((s) => [s.id, s]));
const sauver = () => memoire.ecrire('souvenirs', [...fiches.values()]);

let base;
function ouvrirBase() {
  base ??= new Promise((ok, echec) => {
    const r = indexedDB.open('terratrack', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'cle', autoIncrement: true }).createIndex('lieu', 'lieu');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => echec(r.error);
  });
  // Que le système ne vide pas les photos pour faire de la place.
  navigator.storage?.persist?.().catch(() => {});
  return base;
}
async function requete(mode, action) {
  const db = await ouvrirBase();
  return new Promise((ok, echec) => {
    const r = action(db.transaction('photos', mode).objectStore('photos'));
    r.onsuccess = () => ok(r.result);
    r.onerror = () => echec(r.error);
  });
}

/** Réduit une photo de l'appareil (souvent 12 Mpx) à 1600 px de côté, en JPEG. */
async function reduire(fichier) {
  const image = await createImageBitmap(fichier);
  const echelle = Math.min(1, COTE_MAX / Math.max(image.width, image.height));
  const toile = document.createElement('canvas');
  toile.width = Math.round(image.width * echelle);
  toile.height = Math.round(image.height * echelle);
  toile.getContext('2d').drawImage(image, 0, 0, toile.width, toile.height);
  image.close?.();
  return new Promise((ok) => toile.toBlob(ok, 'image/jpeg', 0.82));
}

const fiche = (lieu) =>
  fiches.get(lieu.id) ?? { id: lieu.id, nom: lieu.nom || lieu.type, type: lieu.type, activite: lieu.activite, lat: lieu.lat, lon: lieu.lon, commentaire: '', photos: 0 };

export const souvenirDe = (id) => fiches.get(id);
export const tousLesSouvenirs = () => [...fiches.values()].filter((s) => s.commentaire || s.photos);

export function commenter(lieu, commentaire) {
  const f = { ...fiche(lieu), commentaire: commentaire.trim(), date: Date.now() };
  fiches.set(lieu.id, f);
  sauver();
}

export async function ajouterPhoto(lieu, fichier, surPlace) {
  const image = await reduire(fichier);
  await requete('readwrite', (s) => s.add({ lieu: lieu.id, image, date: Date.now(), surPlace }));
  const f = fiche(lieu);
  fiches.set(lieu.id, { ...f, photos: f.photos + 1, date: Date.now() });
  sauver();
}

export const photosDe = (id) => requete('readonly', (s) => s.index('lieu').getAll(id));

export async function retirerPhoto(lieu, cle) {
  await requete('readwrite', (s) => s.delete(cle));
  const f = fiche(lieu);
  fiches.set(lieu.id, { ...f, photos: Math.max(0, f.photos - 1) });
  sauver();
}
