// Petites aides d'affichage et de mémoire.

export function h(texte) {
  return String(texte ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/** 845 → « 14 h 05 » */
export function heure(minutes) {
  const m = Math.round(minutes);
  return `${Math.floor(m / 60) % 24} h ${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
}

/** 80 → « 1 h 20 », 45 → « 45 min » */
export function duree(minutes) {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

export const km = (metres) => `${Math.round(metres / 1000).toLocaleString('fr-FR')} km`;

/** « 09:30 » → 570 */
export const versMinutes = (texte) => {
  const [hh, mm] = texte.split(':').map(Number);
  return hh * 60 + (mm || 0);
};

export const dateTexte = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

export function ajouterJours(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** « 2024-05 » → « mai 2024 » */
export const moisTexte = (aaaamm) =>
  aaaamm ? new Date(`${aaaamm}-15T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '';

/** Comparaison sans accents ni majuscules, pour la recherche de communes. */
export const simplifier = (texte) =>
  texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export const memoire = {
  lire(cle, defaut) {
    try {
      const v = localStorage.getItem(`terratrack.terrain.${cle}`);
      return v == null ? defaut : JSON.parse(v);
    } catch {
      return defaut;
    }
  },
  ecrire(cle, valeur) {
    try {
      localStorage.setItem(`terratrack.terrain.${cle}`, JSON.stringify(valeur));
    } catch {}
  },
};
