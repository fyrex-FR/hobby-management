# Tunnel Cloudflare nommé (URL fixe) pour openclaw-proxy

Le tunnel `trycloudflare` "quick" génère une URL différente à chaque
redémarrage → le backend CardVaults se coupe dès que la session tmux tombe.
Ce guide met en place un **tunnel nommé** avec une **URL fixe** sur le domaine
`cardvaults.app` (déjà géré par Cloudflare), et fait tourner le tout comme des
**services** qui survivent aux reboots.

Résultat visé : `https://ebay-proxy.cardvaults.app/fetch` (sous-domaine
modifiable).

## Prérequis

- `cloudflared` installé sur la machine openclaw.
- Accès au compte Cloudflare qui gère la zone `cardvaults.app`.
- Le service Node `openclaw-proxy` écoute en local (défaut `http://localhost:8899`).

## 1. Authentifier cloudflared sur le compte

```
cloudflared tunnel login
```

Ouvre l'URL affichée, choisis la zone **cardvaults.app**. Un certificat est
enregistré dans `~/.cloudflared/cert.pem`.

## 2. Créer le tunnel nommé

```
cloudflared tunnel create openclaw-proxy
```

Note l'**UUID** affiché et le fichier de credentials généré
(`~/.cloudflared/<UUID>.json`).

## 3. Router un sous-domaine fixe vers ce tunnel

```
cloudflared tunnel route dns openclaw-proxy ebay-proxy.cardvaults.app
```

(Crée un enregistrement DNS CNAME `ebay-proxy` → tunnel. Change le sous-domaine
si tu préfères.)

## 4. Fichier de config

Créer `~/.cloudflared/config.yml` :

```yaml
tunnel: openclaw-proxy
credentials-file: /root/.cloudflared/<UUID>.json

ingress:
  - hostname: ebay-proxy.cardvaults.app
    service: http://localhost:8899
  - service: http_status:404
```

(Adapter le chemin `credentials-file` et l'utilisateur si openclaw ne tourne
pas en root.)

## 5. Lancer le tunnel comme service (survit aux reboots)

```
cloudflared service install
systemctl enable --now cloudflared
```

Vérifier : `systemctl status cloudflared` doit être `active (running)`.

## 6. Rendre AUSSI le service Node permanent

Le tunnel fixe ne sert à rien si le service Node meurt au reboot (il est
actuellement dans tmux). Le passer en service, par ex. avec pm2 :

```
cd openclaw-proxy
pm2 start server.js --name openclaw-proxy --update-env
pm2 save
pm2 startup   # suivre la commande affichée pour l'activer au boot
```

(FETCH_TOKEN doit rester présent dans l'environnement du service — le stocker
dans le fichier de service / l'env pm2, pas seulement dans le shell tmux.)

## 7. Vérifier

```
curl -s https://ebay-proxy.cardvaults.app/health
```

Attendu : `{"ok":true}`.

## 8. Mettre à jour CardVaults (une fois pour toutes)

Dans Coolify (backend), remplacer la valeur par l'URL fixe :

- `OPENCLAW_FETCH_URL` = `https://ebay-proxy.cardvaults.app/fetch`
- `OPENCLAW_TOKEN` = inchangé (le `FETCH_TOKEN`)

Redéployer. Le quick tunnel trycloudflare peut être arrêté.
