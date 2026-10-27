import { memoire } from './outils.js';

const MESSAGES = {
  guidage: 'Calculer le guidage avec FOSSGIS / OSRM ?\n\nVotre position précise, la destination et les éventuels points de passage seront transmis à ce service pour calculer les consignes. Une connexion est nécessaire.\n\nVotre accord est mémorisé et peut être retiré dans Réglages → Services en ligne. La politique de confidentialité est accessible dans Réglages.',
  services: 'Autoriser les prévisions météo et les prix en ligne ?\n\nLes zones approximatives du voyage seront transmises à Open-Meteo et les identifiants des stations au service français des prix des carburants. Ces services reçoivent aussi les informations techniques de la connexion, dont l’adresse IP.\n\nSans accord, le pack et les données déjà disponibles sur le téléphone restent utilisables. Accord retirable dans Réglages → Services en ligne.',
};
export const serviceAutorise = (service) => memoire.lire('accordsServicesV1', {})[service] === true;
export function definirAccordService(service, accord) {
  if (!Object.hasOwn(MESSAGES, service)) throw new Error('Service inconnu');
  memoire.ecrire('accordsServicesV1', { ...memoire.lire('accordsServicesV1', {}), [service]: accord === true });
}
export function demanderAccordService(service, confirmer = (texte) => window.confirm(texte)) {
  if (!Object.hasOwn(MESSAGES, service)) throw new Error('Service inconnu');
  if (serviceAutorise(service)) return true;
  const accord = confirmer(MESSAGES[service]) === true;
  definirAccordService(service, accord);
  return accord;
}
