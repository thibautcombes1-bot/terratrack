import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { memoire } from './outils.js';
import { serviceAutorise, definirAccordService, demanderAccordService } from './confidentialite.js';
import { chargerMeteo } from './meteo.js';
import { rafraichirPrix } from './carburant.js';

let stockage;
test.beforeEach(() => {
 stockage = new Map();
 globalThis.localStorage = { getItem: (k) => stockage.get(k) ?? null, setItem: (k,v) => stockage.set(k,String(v)) };
});
test('aucun accord réseau implicite après la mise à jour', () => {
 assert.equal(serviceAutorise('guidage'),false);
 assert.equal(serviceAutorise('services'),false);
});
test('un refus ne donne aucun accord et conserve les données du voyage', () => {
 memoire.ecrire('plan',{valide:true,nom:'Voyage conservé'});
 assert.equal(demanderAccordService('guidage',texte=>{assert.match(texte,/position précise/);return false;}),false);
 assert.equal(serviceAutorise('guidage'),false);
 assert.deepEqual(memoire.lire('plan'),{valide:true,nom:'Voyage conservé'});
});
test('un accord explicite est mémorisé et peut être retiré séparément', () => {
 assert.equal(demanderAccordService('guidage',()=>true),true);
 assert.equal(demanderAccordService('guidage',()=>{throw Error('Ne doit pas redemander');}),true);
 definirAccordService('services',true); definirAccordService('guidage',false);
 assert.equal(serviceAutorise('guidage'),false);
 assert.equal(serviceAutorise('services'),true);
});
test('sans accord, météo et prix ne transmettent aucune requête', async () => {
 const ancienFetch=globalThis.fetch;
 let requetes=0;globalThis.fetch=async()=>{requetes++;throw Error('Envoi interdit');};
 try {
  assert.equal(await chargerMeteo([{lat:44,lon:3}]),false);
  assert.equal(await rafraichirPrix([{idPrix:'station-demo'}]),false);
  assert.equal(requetes,0);
 } finally {globalThis.fetch=ancienFetch;}
});
test('Cap Away reprend les clés de stockage historiques au lieu de créer une nouvelle base', () => {
 stockage.set('terratrack.terrain.vehicule',JSON.stringify({type:'van',budget:50}));
 assert.deepEqual(memoire.lire('vehicule'),{type:'van',budget:50});
 memoire.ecrire('vehicule',{type:'moto'});
 assert.ok(stockage.has('terratrack.terrain.vehicule'));
 assert.equal(stockage.has('capaway.vehicule'),false);
 const natif=fs.readFileSync(new URL('../../ios/App/App/TerrainPlugin.swift',import.meta.url),'utf8');
 assert.match(natif,/forKey: "terratrack.suivi"/);
 const souvenirs=fs.readFileSync(new URL('./souvenirs.js',import.meta.url),'utf8');
 assert.match(souvenirs,/indexedDB.open\('terratrack', 1\)/);
});
test('identité iOS conservée, branding public et version app-extension alignés', () => {
 const config=JSON.parse(fs.readFileSync(new URL('../../capacitor.config.json',import.meta.url)));
 assert.equal(config.appId,'fr.terratrack.terrain');assert.equal(config.appName,'Cap Away');
 const projet=fs.readFileSync(new URL('../../ios/App/App.xcodeproj/project.pbxproj',import.meta.url),'utf8');
 assert.equal((projet.match(/CURRENT_PROJECT_VERSION = 8;/g)??[]).length,4);
 assert.equal((projet.match(/MARKETING_VERSION = 1.0;/g)??[]).length,4);
 assert.match(projet,/fr.terratrack.terrain.TrajetLiveActivity/);
 const manifeste=fs.readFileSync(new URL('../../ios/App/App/PrivacyInfo.xcprivacy',import.meta.url),'utf8');
 assert.match(manifeste,/CA92.1/);assert.match(manifeste,/C617.1/);
});
