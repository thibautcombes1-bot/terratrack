// Petites aides d'affichage.

/** Échappe un texte pour l'insérer dans du HTML. */
export function h(texte) {
  return String(texte ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/** « il y a 5 min », « il y a 3 h »… */
export function ilYa(date) {
  const s = Math.max(0, (Date.now() - date) / 1000);
  if (s < 90) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}

export const km = (x) => `${Math.round(x ?? 0).toLocaleString('fr-FR')} km`;

export function duree(heures) {
  const minutes = Math.round((heures ?? 0) * 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

export const nombre = (x) => Number(x ?? 0).toLocaleString('fr-FR');

/** Lecture / écriture locales qui ne cassent jamais la page (navigation privée…). */
export const memoire = {
  lire(cle, defaut) {
    try {
      const v = localStorage.getItem(`terratrack.${cle}`);
      return v == null ? defaut : JSON.parse(v);
    } catch {
      return defaut;
    }
  },
  ecrire(cle, valeur) {
    try {
      localStorage.setItem(`terratrack.${cle}`, JSON.stringify(valeur));
    } catch {}
  },
};
