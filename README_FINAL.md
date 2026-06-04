# Sprint Pro — Version finale gratuite

## Objectif
Cette version est pensée pour une bêta sérieuse avec des moyens gratuits.

## Publication recommandée

### Option 1 — Netlify
Le plus simple si les Functions sont disponibles.

Fichiers importants :
- `index.html`
- `netlify.toml`
- `package.json`
- `netlify/functions/import-ffa.js`

Publie tout le dossier sur Netlify.

### Option 2 — GitHub Pages + Cloudflare Worker
Recommandé si les crédits Netlify Functions sont épuisés.

1. Publie `index.html` sur GitHub Pages.
2. Déploie `cloudflare-worker/import-ffa-worker.js` sur Cloudflare Workers.
3. Dans `index.html`, cherche :

```js
window.SPRINT_PRO_FFA_ENDPOINT = window.SPRINT_PRO_FFA_ENDPOINT || '';
```

et remplace par :

```js
window.SPRINT_PRO_FFA_ENDPOINT = 'https://TON-WORKER.workers.dev/import-ffa';
```

L'import FFA utilisera alors Cloudflare au lieu de Netlify.

## Sauvegarde des données
Les données sont stockées localement dans le navigateur.  
L'app contient maintenant deux boutons :
- Exporter
- Importer

Utilise-les pour sauvegarder/restaurer les chronos et objectifs.

## Notes importantes
- L'import FFA nécessite une fonction serveur à cause des restrictions CORS.
- GitHub Pages seul ne suffit pas pour l'import FFA.
- La carte des pistes est prête pour Paris en bêta, mais les données doivent rester vérifiées régulièrement.
