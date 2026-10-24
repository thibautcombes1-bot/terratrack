# Horizon

**Des voyages composés par IA selon tes goûts, sur un globe 3D, avec les réseaux radio mesh MeshCore et Meshtastic en direct.**

Tu dis d'où tu pars, combien de temps, comment tu voyages et ce qui te fait envie. Horizon compose un voyage jour par jour avec de **vrais lieux**, vérifie qu'ils existent, calcule le trajet, et regarde si chaque étape est **couverte par la radio mesh** : utile pour garder le contact sans réseau mobile.

- 🌍 **Globe 3D** sans clé : imagerie satellite et relief.
- 📡 **Nœuds MeshCore et Meshtastic en direct** : environ 30 000 MeshCore et 10 000 Meshtastic dans le monde, mis à jour toutes les 5 minutes.
- 🧭 **Étapes sûres** : 422 villages et sites labellisés (Plus Beaux Villages de France, Petites Cités de Caractère, Plus Beaux Détours, Grands Sites…). L'IA choisit dedans au lieu d'inventer.
- 🏰 **Visites réelles** : les lieux notables autour de chaque étape viennent de Wikipédia (description et photo). L'IA les choisit et explique pourquoi ils te correspondent.
- 📶 **Couverture mesh** de chaque lieu (bonne, faible ou aucune), avec le nœud le plus proche.
- ⛰️ **Points hauts radio** : le sommet ou belvédère accessible le plus haut près de chaque étape, avec le nombre de nœuds à moins de 40 km.
- 👍 **Goûts appris** : 👍, 👎 et ⇄ (remplacer) sont mémorisés, et les voyages suivants en tiennent compte.
- ⤓ **Export GPX** pour le T-Deck (carte SD, `/rr/voyages/`), OsmAnd ou Organic Maps.
- 🤖 **IA au choix** : Ollama en local (gratuit, privé) par défaut, ou Claude en ligne avec une clé.

## Démarrer

Il faut Node.js 20 ou plus récent. Pour l'IA locale, il faut aussi [Ollama](https://ollama.com) avec un modèle :

```bash
ollama pull qwen2.5
```

Puis :

```bash
npm install
npm run dev
```

Ouvre <http://localhost:5190>.

### Depuis l'iPhone (même Wi-Fi)

```bash
npm run reseau
```

Ouvre ensuite `http://<ip-du-mac>:5190` sur l'iPhone.

⚠️ Dans ce mode, toute personne sur ton Wi-Fi peut utiliser Horizon, et donc ta clé Claude si tu en as mis une.

## Réglages (`.env`, facultatif)

| Variable | Rôle |
| --- | --- |
| `ANTHROPIC_API_KEY` | Active Claude (en ligne, payant à l'usage). |
| `CLAUDE_MODELE` | Modèle Claude, `claude-opus-5-5` par défaut. |
| `OLLAMA_URL` | Adresse d'Ollama, `http://127.0.0.1:11434` par défaut. |
| `OLLAMA_MODELE` | Modèle local, `qwen2.5` par défaut. |
| `VITE_CESIUM_ION_TOKEN` | Jeton Cesium ion, facultatif. |
| `HORIZON_PORT` | Port, `5190` par défaut. |
| `HORIZON_DEBUG=1` | Affiche les réponses brutes de l'IA dans le terminal. |

Les clés restent côté serveur et n'arrivent jamais dans la page.

## Comment ça marche

1. **Départ** géocodé (Photon, avec Nominatim en secours).
2. **Nœuds mesh** chargés, puis **secteurs à relais** repérés autour du départ.
3. **L'IA choisit les étapes**, de préférence parmi les villages et sites labellisés à portée (avec leur distance, leur direction et leur couverture mesh). Une étape introuvable ou trop loin est remplacée automatiquement.
4. **Lieux réels** autour de chaque étape : articles Wikipédia géolocalisés, classés par envie. L'altitude des sommets vient d'Open-Meteo.
5. **L'IA choisit les visites** dans ces listes, puis écrit le carnet : pourquoi, nuit, budget, astuce, conseils.
6. **Couverture mesh**, **points hauts** et **tracé routier** (OSRM de FOSSGIS) sont ajoutés.

Avec l'IA locale, compte une à deux minutes. Un petit modèle comme qwen2.5 7B fait parfois des textes approximatifs, mais les lieux sont toujours réels. Claude écrit de meilleurs carnets.

Les étapes labellisées se régénèrent avec :

```bash
node outils/construire-etapes.mjs
```

## Structure

```
server/            API servie par Vite (/api/*)
  api.js           routes
  voyage.js        génération d'un voyage (consignes à l'IA, vérifications)
  ia.js            Ollama et Claude
  mesh.js          nœuds MeshCore et Meshtastic
  lieux.js         géocodage, lieux Wikipédia, altitudes
  etapes.js        étapes labellisées à portée
  trace.js         itinéraire routier
  donnees/         étapes labellisées (Wikidata, CC0)
commun/            calculs partagés page/serveur (distances, couverture mesh)
src/               la page (globe, formulaire, carnet, nœuds, GPX)
outils/            scripts de construction des données
```

## Sources et licences

- Imagerie : Esri World Imagery. Relief : Re:Earth / Mapterhorn (CC BY 4.0).
- Nœuds : [meshmap.net](https://meshmap.net) (Meshtastic) et [map.meshcore.io](https://map.meshcore.io) (MeshCore).
- Lieux : Wikipédia (CC BY-SA), Wikidata (CC0), géocodage Photon et Nominatim (© contributeurs OpenStreetMap, ODbL).
- Itinéraires : OSRM de FOSSGIS (routing.openstreetmap.de). Altitudes : Open-Meteo.
- Inspiré de [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) (MIT).

Merci de respecter les conditions d'usage de ces services publics : Horizon met tout en cache et espace ses requêtes.

Code sous licence MIT.
