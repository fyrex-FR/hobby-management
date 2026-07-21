# Plan : mise en vente eBay depuis CardVaults

Document de suivi pour reprendre le travail dans une nouvelle session, sans
dépendre de l'historique de conversation. Mis à jour à chaque étape.

## Décisions actées (ne pas rediscuter sans raison)

- **Multi-compte** : chaque utilisateur de l'app connecte **son propre**
  compte eBay. Les annonces sont publiées au nom de l'utilisateur connecté,
  jamais d'un compte partagé.
- **Marketplace** : `EBAY_FR` fixe pour l'instant (pas de sélecteur par user
  en v1).
- **Prix fixe uniquement** en v1 (pas d'enchères).
- **Scopes déjà accordés** sur le keyset eBay de l'app, aucune demande
  d'approbation supplémentaire nécessaire : `sell.inventory`,
  `sell.account`, `sell.fulfillment`, `commerce.identity.readonly`.
- Le compte de test réel (xavandr_61) a déjà vendu sur eBay dans le passé →
  ses business policies (paiement/retour/livraison) existent probablement
  déjà, à confirmer au moment de PR2.

## État actuel (fait)

### PR1 — OAuth vendeur multi-compte ✅ (mergé, testé en conditions réelles)

- `backend/add_ebay_seller_tokens_migration.sql` — table `ebay_seller_tokens`
  (1 ligne par `user_id`), RLS activé sans policy (accès service-only).
- `backend/services/ebay_token_crypto.py` — chiffrement Fernet des tokens
  (`EBAY_TOKEN_ENCRYPTION_KEY`).
- `backend/services/ebay_tokens_store.py` — CRUD Supabase REST pour la table.
- `backend/services/ebay_oauth.py` — cœur du flux OAuth :
  - `build_authorize_url(user_id)` → URL de consentement eBay.
  - `sign_state` / `verify_state` — state HMAC signé (stateless, lie la
    redirection à l'utilisateur, expire à 10 min).
  - `exchange_code(code)` → tokens.
  - `get_valid_access_token(user_id)` → **fonction clé à réutiliser dans
    PR2/PR3/PR4** : renvoie un access token valide pour appeler les APIs de
    vente au nom de l'utilisateur, en le rafraîchissant automatiquement si
    besoin. Renvoie `None` si l'utilisateur n'est pas connecté ou si le
    refresh échoue (token révoqué → l'utilisateur doit se reconnecter).
  - `SELL_MARKETPLACE_ID = "EBAY_FR"` — constante à réutiliser.
- `backend/routers/ebay_account.py` — `POST /ebay/account/login`,
  `GET /ebay/account/callback`, `GET /ebay/account/status`,
  `DELETE /ebay/account`.
- Variables d'env posées dans Coolify : `EBAY_RUNAME`,
  `EBAY_TOKEN_ENCRYPTION_KEY` (+ `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET`
  déjà existants, réutilisés).
- `frontend/public/privacy.html` — page de politique de confidentialité
  (exigée par eBay pour le RuName), servie à
  `https://collection.cardvaults.app/privacy.html`.

### Centre de contrôle eBay ✅ (mergé)

- `frontend/src/components/views/EbayView.tsx` — vue dédiée (nav « eBay »,
  à côté de Grading/Studio) : statut de connexion, connect/disconnect,
  stats (cartes avec `ebay_url` renseigné, cartes « à vendre » sans
  `ebay_url`), liste des cartes déjà listées avec lien direct.
- Gère le retour du flux OAuth (`?ebay=connected|error` dans l'URL).
- **Ce que cette vue ne fait PAS encore** : elle ne lit aucune annonce réelle
  sur eBay. `ebay_url` n'est rempli que si l'utilisateur le colle à la main,
  ou (à partir de PR3) automatiquement à la publication. Les annonces créées
  manuellement sur eBay.com ne remontent pas — ce sera le rôle de PR4 (sync).

## Reste à faire

### PR2 — Business policies + endpoint de preview

But : préparer tout ce qu'il faut pour publier, sans encore publier.

- **Nouveau service** `backend/services/ebay_selling.py` :
  - `async def get_business_policies(user_id) -> dict` — appelle l'**Account
    API** eBay (`GET /sell/account/v1/payment_policy`,
    `/sell/account/v1/return_policy`, `/sell/account/v1/fulfillment_policy`,
    avec `marketplace_id=EBAY_FR` en param), via
    `get_valid_access_token(user_id)` pour l'auth. Retourne les IDs des
    policies existantes (une par type, priorité à la policy marquée
    default/marketplace EBAY_FR). Si aucune policy trouvée → message clair
    « configure tes options de vente sur eBay » avec lien vers
    `https://www.ebay.fr/sh/settings/policies` (ou équivalent business
    policies).
  - `async def suggest_category(title: str) -> str | None` — **Taxonomy
    API** (`GET /commerce/taxonomy/v1/category_tree/{tree_id}/
    get_category_suggestions?q=...`) pour résoudre une catégorie eBay à
    partir d'un texte (ex. « basketball card »). `tree_id` pour EBAY_FR à
    récupérer via `get_default_category_tree_id` une fois, log/cache la
    valeur trouvée (elle ne change pas).
  - `def build_listing_title(card: Card) -> str` — génère un titre ≤ **80
    caractères** (contrainte dure eBay) à partir des attributs de la carte
    (player, year, set, parallel, numbered...). Tronquer proprement si trop
    long, jamais couper au milieu d'un mot si possible.
- **Nouveau router** `backend/routers/ebay_selling.py` :
  - `GET /ebay/selling/preview/{card_id}` (auth) → renvoie titre généré,
    catégorie suggérée, policies trouvées (ou message si manquantes), prix
    actuel de la carte (`card.price`), marketplace. Ne modifie rien côté
    eBay.
- **Frontend** : pas de nouvelle UI obligatoire pour ce PR (peut être testé
  via l'endpoint direct) ; si temps, un aperçu simple dans `EbayView.tsx`
  ou `CardDetail.tsx` avant PR3.

### PR3 — Publication réelle (le bouton "Publier")

- Dans `ebay_selling.py`, enchaîner les 3 appels **Inventory API** (auth via
  `get_valid_access_token`) :
  1. `PUT /sell/inventory/v1/inventory_item/{sku}` — `sku` = `card.id`,
     `image_urls` = `[card.image_front_url, card.image_back_url]` (déjà des
     URLs publiques R2, directement utilisables), `condition`
     (NEW/USED selon `grading_company` présent ou non — eBay a des valeurs
     de condition spécifiques aux trading cards, à vérifier dans la doc
     Inventory API au moment de coder), `product.title`, `product.aspects`
     (player, year, set...).
  2. `POST /sell/inventory/v1/offer` — `sku`, `marketplaceId: EBAY_FR`,
     `format: FIXED_PRICE`, `pricingSummary.price` = `card.price`,
     `categoryId` (résolu en PR2), `listingPolicies` (les 3 policy IDs de
     PR2), `quantity: 1`.
  3. `POST /sell/inventory/v1/offer/{offerId}/publish` → renvoie
     `listingId`.
  - Stocker sur la carte : `ebay_url` (construit à partir du `listingId` :
    `https://www.ebay.fr/itm/{listingId}`), et idéalement une nouvelle
    colonne `ebay_offer_id` / `ebay_listing_id` (migration à ajouter) pour
    permettre `withdraw`/`update` plus tard sans reparser l'URL.
  - `DELETE /sell/inventory/v1/offer/{offerId}/withdraw` pour retirer une
    annonce → vide `ebay_url` (et `ebay_offer_id`), repasse la carte en
    `a_vendre` ou `collection`.
  - `PUT /sell/inventory/v1/offer/{offerId}` pour changer le prix sans
    republier.
- **Router** : `POST /ebay/selling/publish/{card_id}` (utilise le preview de
  PR2 en interne, ou prend un body avec titre/prix éventuellement édités par
  l'utilisateur), `POST /ebay/selling/withdraw/{card_id}`,
  `PATCH /ebay/selling/price/{card_id}`.
- **Frontend** : bouton **« Publier sur eBay »** dans `CardDetail.tsx`
  (à côté du bouton Vinted existant), avec une modale de preview (titre
  éditable, prix prérempli depuis la médiane des ventes déjà implémentée,
  aperçu photos) → publie → toast + lien vers l'annonce.
- ⚠️ Recommandé : tester d'abord avec **une carte à faible valeur** en
  conditions réelles (l'app publiera une vraie annonce sur eBay.fr, avec de
  vrais frais eBay si vente).

### PR4 — Sync automatique du statut vendu

- Endpoint/cron léger : `GET /sell/fulfillment/v1/order` (Fulfillment API,
  auth par utilisateur connecté) à l'ouverture de `EbayView` ou 1×/jour.
  Pour chaque commande trouvée correspondant à un `sku` connu (= un
  `card.id`), passer la carte en statut `vendu`.
- Alternative plus tard (hors v1) : eBay Notification API (push) au lieu du
  polling.
- Permettrait aussi de faire remonter dans `EbayView` les annonces créées à
  la main sur eBay.com (pas seulement celles publiées depuis l'app) en
  cherchant les `getOffers`/`getInventoryItems` du compte et en proposant de
  les rattacher à une carte existante.

## Notes techniques transverses

- Toujours utiliser `services.ebay_oauth.get_valid_access_token(user_id)`
  pour authentifier les appels de vente — jamais le token client-credentials
  de `ebay_service.py` (celui-là est pour les données publiques/recherche
  uniquement, pas pour vendre).
- Header requis sur tous les appels Sell API :
  `X-EBAY-C-MARKETPLACE-ID: EBAY_FR`.
- Pas d'accès réseau eBay possible depuis le sandbox de développement actuel
  (policy réseau bloque `ebay.com`) → toute nouvelle logique d'appel API
  doit être validée par tests unitaires/mocks + `TestClient`, puis vérifiée
  en conditions réelles par l'utilisateur après déploiement (comme PR1).
- Suivre le même rythme de livraison que le reste du projet : petits PR
  vérifiés (typecheck + build minimum), commit, push, merge, redéploiement,
  test réel par l'utilisateur avant de passer à la PR suivante.
