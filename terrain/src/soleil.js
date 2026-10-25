// Heure du coucher du soleil, calculée sans réseau (formules simplifiées de la NOAA).

const RAD = Math.PI / 180;

/**
 * Coucher du soleil pour une date (AAAA-MM-JJ) et un lieu, en minutes depuis minuit,
 * à l'heure légale du téléphone (heure d'été comprise).
 */
export function coucherSoleil(dateIso, { lat, lon }) {
  const [annee, mois, jour] = dateIso.split('-').map(Number);
  const rang = (Date.UTC(annee, mois - 1, jour) - Date.UTC(annee, 0, 0)) / 86_400_000;
  const gamma = ((2 * Math.PI) / 365) * (rang - 1 + 0.5);
  const equationTemps =
    229.18 *
    (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const declinaison =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const angle =
    Math.acos(Math.cos(90.833 * RAD) / (Math.cos(lat * RAD) * Math.cos(declinaison)) - Math.tan(lat * RAD) * Math.tan(declinaison)) / RAD;
  const coucherUtc = 720 - 4 * (lon - angle) - equationTemps;
  const decalage = -new Date(annee, mois - 1, jour, 18).getTimezoneOffset();
  return Math.round(coucherUtc + decalage);
}
