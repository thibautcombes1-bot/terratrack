// Météo (Open-Meteo, gratuit, sans clé) : prévisions heure par heure jusqu'à 16 jours, par cases
// d'environ 25 km. Récupérées quand il y a du réseau, gardées sur le téléphone pour le hors ligne.
import { memoire } from './outils.js';
import { serviceAutorise } from './confidentialite.js';

const SERVICE = 'https://api.open-meteo.com/v1/forecast';
const PAS = 0.25; // degrés : une case d'environ 25 km
const FRAICHEUR = 3 * 3600 * 1000;
const cases = new Map(Object.entries(memoire.lire('meteo', {})));
const cleDe = (lat, lon) => `${Math.round(lat / PAS) * PAS}:${Math.round(lon / PAS) * PAS}`;

/** Garde au plus 120 cases, les plus récentes (la mémoire du téléphone n'est pas infinie). */
function sauver() {
  const gardees = [...cases.entries()].sort((a, b) => b[1].recu - a[1].recu).slice(0, 120);
  cases.clear();
  for (const [cle, valeur] of gardees) cases.set(cle, valeur);
  memoire.ecrire('meteo', Object.fromEntries(cases));
}

/**
 * Récupère les prévisions des cases qui couvrent ces points (si réseau, et si elles ont plus de 3 h).
 * Renvoie true si de nouvelles prévisions sont arrivées.
 */
export async function chargerMeteo(points) {
  if (!serviceAutorise('services') || navigator.onLine === false) return false;
  const voulues = [...new Set(points.map((p) => cleDe(p.lat, p.lon)))].filter((cle) => !cases.has(cle) || Date.now() - cases.get(cle).recu > FRAICHEUR);
  if (!voulues.length) return false;
  let recues = false;
  for (let i = 0; i < voulues.length; i += 50) {
    const lot = voulues.slice(i, i + 50).map((cle) => cle.split(':').map(Number));
    const params = new URLSearchParams({
      latitude: lot.map(([lat]) => lat).join(','),
      longitude: lot.map(([, lon]) => lon).join(','),
      hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,wind_gusts_10m',
      timezone: 'Europe/Paris',
      forecast_days: '16',
      timeformat: 'unixtime',
    });
    const arret = new AbortController();
    const minuterie = setTimeout(() => arret.abort(), 8000);
    try {
      const reponse = await fetch(`${SERVICE}?${params}`, { signal: arret.signal });
      if (!reponse.ok) continue;
      const donnees = await reponse.json();
      [].concat(donnees).forEach((d, k) => {
        const hh = d.hourly;
        cases.set(`${lot[k][0]}:${lot[k][1]}`, {
          recu: Date.now(),
          debut: hh.time[0] * 1000,
          t: hh.temperature_2m,
          pp: hh.precipitation_probability,
          p: hh.precipitation,
          code: hh.weather_code,
          vent: hh.wind_gusts_10m,
        });
      });
      recues = true;
    } catch {
      // Pas de réseau ou service lent : on garde ce qu'on a.
    } finally {
      clearTimeout(minuterie);
    }
  }
  if (recues) sauver();
  return recues;
}

/** Prévision au point et à l'heure (date ISO du jour, minutes depuis minuit), ou null. */
export function meteoA(lat, lon, date, minute = 14 * 60) {
  const c = cases.get(cleDe(lat, lon));
  if (!c) return null;
  const quand = new Date(`${date}T00:00:00`).getTime() + Math.round(minute) * 60000;
  const i = Math.round((quand - c.debut) / 3600000);
  if (i < 0 || i >= c.t.length || c.t[i] == null) return null;
  return { temp: c.t[i], pluieProba: c.pp[i] ?? 0, pluie: c.p[i] ?? 0, code: c.code[i], rafales: c.vent[i] ?? 0 };
}

/** Le pire de la journée entre 10 h et 18 h (pour choisir les étapes avant de connaître l'heure). */
export function meteoJournee(lat, lon, date) {
  const heures = [10, 12, 14, 16, 18].map((h) => meteoA(lat, lon, date, h * 60)).filter(Boolean);
  if (!heures.length) return null;
  return {
    temp: Math.max(...heures.map((m) => m.temp)),
    pluieProba: Math.max(...heures.map((m) => m.pluieProba)),
    pluie: Math.max(...heures.map((m) => m.pluie)),
    code: Math.max(...heures.map((m) => m.code)),
    rafales: Math.max(...heures.map((m) => m.rafales)),
  };
}

/**
 * « Beau temps » : un coefficient pour un coin sur les jours du voyage (moyenne) :
 * grand soleil ×1,5, quelques nuages ×1,15, averses possibles ×0,8, pluie ×0,4, orage ×0,2.
 * null si l'on n'a pas les prévisions.
 */
export function coefficientBeauTemps(lat, lon, dates) {
  const jours = dates.map((d) => meteoJournee(lat, lon, d)).filter(Boolean);
  if (!jours.length) return null;
  const coef = (m) =>
    m.code >= 95 ? 0.2 : m.pluieProba >= 60 || m.pluie >= 1 ? 0.4 : m.pluieProba >= 30 ? 0.8 : m.code <= 1 ? 1.5 : m.code <= 3 ? 1.15 : 0.9;
  return jours.reduce((s, m) => s + coef(m), 0) / jours.length;
}

/** Ce qui compte pour le voyage. Codes météo WMO : 95-99 orage, 71-77 et 85-86 neige. */
export function risques(m) {
  if (!m) return {};
  return {
    orage: m.code >= 95,
    pluie: m.pluieProba >= 60 || m.pluie >= 1,
    neige: (m.code >= 71 && m.code <= 77) || m.code === 85 || m.code === 86,
    chaleur: m.temp >= 30,
    vent: m.rafales >= 60,
  };
}

export function icone(m) {
  if (!m) return '';
  if (m.code >= 95) return '⛈️';
  if ((m.code >= 71 && m.code <= 77) || m.code === 85 || m.code === 86) return '🌨️';
  if (m.code >= 51 || m.pluieProba >= 60) return '🌧️';
  if (m.code === 45 || m.code === 48) return '🌫️';
  if (m.code >= 2) return '⛅';
  return '☀️';
}

/** « ⛅ 22° · pluie 40 % · rafales 55 km/h » */
export function texteMeteo(m) {
  if (!m) return '';
  return [
    `${icone(m)} ${Math.round(m.temp)}°`,
    m.pluieProba >= 30 ? `pluie ${m.pluieProba} %` : '',
    m.rafales >= 50 ? `rafales ${Math.round(m.rafales)} km/h` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
