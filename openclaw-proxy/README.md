# openclaw fetch proxy (ventes eBay)

Petit service HTTP à déployer sur le serveur **openclaw**. Il charge une URL
dans un vrai navigateur headless (Chromium/Playwright) et renvoie le HTML
rendu. Objectif : contourner le blocage anti-bot **403** d'eBay, qui rejette
les requêtes directes venant de l'IP datacenter du VPS CardVaults.

Le backend CardVaults (`backend/services/ebay_sold_scraper.py`) appelle ce
service quand les variables `OPENCLAW_FETCH_URL` et `OPENCLAW_TOKEN` sont
définies. Le **parsing du HTML reste côté CardVaults** — ce service ne fait que
récupérer et renvoyer la page.

## Contrat de l'API (ne pas modifier)

- `POST /fetch`
- Header d'auth : `X-Auth-Token: <FETCH_TOKEN>` → `401` si absent/incorrect
- Corps JSON : `{ "url": "<url à charger>" }` → `400` si `url` manquant
- Réponse `200` : `{ "status": <int, code HTTP amont>, "html": "<html rendu>", "final_url": "<url>" }`
- Échec de chargement : `502` `{ "error": "<message>" }`
- `GET /health` → `{ "ok": true }`

## Installation

```
cd openclaw-proxy
npm install
npx playwright install --with-deps chromium
```

## Configuration

Une seule variable obligatoire :

- `FETCH_TOKEN` : un secret aléatoire (ex. `openssl rand -hex 24`). Devra être
  recopié à l'identique dans la variable `OPENCLAW_TOKEN` du backend CardVaults.
- `PORT` (optionnel, défaut `8899`).

## Lancement

```
FETCH_TOKEN=<ton_secret> node server.js
```

(ou via un gestionnaire de process : pm2, systemd, Docker… selon la config
d'openclaw.)

## Exposition

Rendre l'endpoint joignable depuis le backend CardVaults (Coolify) :

- en HTTPS derrière le reverse proxy d'openclaw, **ou**
- en réseau interne / VPN (ex. Tailscale) si les deux serveurs y sont.

Puis, côté **Coolify (backend CardVaults)**, ajouter :

- `OPENCLAW_FETCH_URL` = URL complète de l'endpoint, ex. `https://openclaw.exemple.net/fetch`
- `OPENCLAW_TOKEN` = la même valeur que `FETCH_TOKEN`

## Test rapide

```
curl -s -X POST http://localhost:8899/fetch \
  -H "X-Auth-Token: $FETCH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.ebay.com/sch/i.html?_nkw=jordan+psa+10&LH_Sold=1&LH_Complete=1"}' \
  | head -c 400
```

Attendu : un JSON avec `"status": 200` et un `"html"` contenant des blocs
`s-item`. Si `status` vaut 403 ou que le HTML est une page d'erreur eBay, l'IP
d'openclaw est elle-même bloquée → il faudra une sortie résidentielle.
