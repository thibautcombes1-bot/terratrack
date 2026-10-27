import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerGraphe } from '../../commun/routeur.js';
import { comparerItineraires, choisirItineraire, verifierConditions } from './parcours.js';

const a={nom:'Départ',lat:44,lon:3}, b={nom:'Arrivée',lat:44,lon:3.1};
const vehicule={type:'voiture',conso:6.5,prix:2,litresDepart:40,reservoir:50,budget:null};
const creer=()=>({
 params:{depart:a,destination:b,mode:'destination',jours:1,date:'2026-10-27',heure:570,rythme:'normal',envies:['villages'],nuits:['camping'],conditionsStrictes:true,vehicule:{...vehicule}},
 jours:[{date:'2026-10-27',heureDepart:570,debut:{...a},fin:{...b,arriveeMin:650},etapes:[{...b,id:'village',type:'Village',nom:'Village choisi',visiteMin:30}],coords:[[3,44],[3.1,44]],metres:8000,conduiteMin:6,profil:[[0,0,3,44],[8,8,3.1,44]],peage:false}]
});
const pack=(peage=0)=>({lieux:[],communes:[a,b],graphe:chargerGraphe({
 sommets:[300000,4400000,310000,4400000],geometrie:[300000,4400000,310000,4400000],noms:['Route'],
 aretes:{a:[0],b:[1],m:[8000],v:[80],s:[0],p:[peage],n:[0],g:[0,2]}
})});

test('un voyage conforme conserve départ, arrivée, dates, envies et rythme',()=>{
 assert.deepEqual(verifierConditions(creer()),[]);
});
test('les durées, dates, péages et activités incompatibles sont refusés',()=>{
 for(const [modifier,motif] of [
  [p=>p.jours[0].conduiteMin=181.1,/conduite/],
  [p=>p.jours[0].date='2026-10-28',/dates/],
  [p=>{p.params.eviterPeages=true;p.jours[0].peage=true;},/péage/],
  [p=>p.params.envies=['viaferrata'],/étape/],
  [p=>{p.params.niveauMax=1;p.jours[0].etapes[0].activite='viaferrata';},/niveau/],
 ]){
  const p=creer();modifier(p);assert.ok(verifierConditions(p).some(x=>motif.test(x)));
 }
});
test('budget carburant et autonomie avec réserve ne sont jamais dépassés en silence',()=>{
 const p=creer();p.params.vehicule.budget=.1;assert.ok(verifierConditions(p).some(x=>x.includes('budget')));
 p.params.vehicule.budget=null;p.params.mode='plein';p.params.vehicule.litresDepart=.2;p.jours[0].fin={...a,arriveeMin:650};
 assert.ok(verifierConditions(p).some(x=>x.includes('carburant')));
});
test('un hébergement absent ne remplace pas le type de nuit choisi',()=>{
 const p=creer();p.params.jours=2;p.jours.push({...structuredClone(p.jours[0]),date:'2026-10-28'});
 p.jours[0].fin={...b,genre:'nuit',type:'Hôtel',arriveeMin:650};assert.ok(verifierConditions(p).some(x=>x.includes('hébergement')));
});
test('le beau temps non vérifiable demande de revoir les conditions',()=>{
 const p=creer();p.params.veutBeauTemps=true;assert.ok(verifierConditions(p).some(x=>x.includes('prévisions')));
 p.params.meteoCompatible=true;assert.deepEqual(verifierConditions(p),[]);
});
test('une seule route réelle ne devient pas trois variantes et les préférences restent intactes',()=>{
 const p=creer();p.params.eviterPeages=true;
 const liste=comparerItineraires(pack(),p);
 assert.equal(liste.length,1);assert.equal(liste[0].options.eviterPeages,true);
 choisirItineraire(pack(),p,{eviterPeages:false,economie:false});
 assert.equal(p.params.eviterPeages,true);
 assert.deepEqual(p.params.envies,['villages']);
});
test('sans route conforme : aucune proposition, aucun remplacement du plan',()=>{
 const p=creer();p.params.eviterPeages=true;
 const avant=structuredClone(p);
 assert.equal(comparerItineraires(pack(1),p).length,0);
 assert.throws(()=>choisirItineraire(pack(1),p,{eviterPeages:false,economie:false}),/Revoir/);
 assert.deepEqual(p,avant);
});
