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

### PR2 — Business policies + endpoint de preview ✅ (mergé, PAS ENCORE testé en conditions réelles)

- `backend/services/ebay_selling.py` :
  - `get_business_policies(access_token)` — Account API (payment/return/
    fulfillment policy, `marketplace_id=EBAY_FR`), renvoie les 3 IDs +
    `configured: bool`.
  - `suggest_category(access_token, query)` — Taxonomy API, `category_tree_id`
    mis en cache mémoire (`_category_tree_cache`).
  - `build_listing_title(card: dict) -> str` — titre ≤ 80 caractères,
    troncature propre.
  - `build_preview(card, access_token)` — combine les trois en parallèle
    (`asyncio.gather`).
  - `get_card(card_id, user_id)` — lecture Supabase scopée au propriétaire.
- `backend/routers/ebay_selling.py` : `GET /ebay/selling/preview/{card_id}`
  → 404 si carte non trouvée/pas au user, `{"connected": false}` si eBay pas
  connecté, sinon le preview complet. Ne modifie rien.
- Testé unitairement (titres, parsing des réponses Account/Taxonomy API
  mockées, 4 chemins du router via TestClient) — **jamais appelé contre le
  vrai eBay** (pas d'accès réseau depuis le sandbox de dev). À valider au
  premier essai réel :
  - la vraie structure JSON renvoyée par Account API pour les policies du
    compte xavandr_61 (probable qu'il en ait déjà, à vérifier) ;
  - la qualité des suggestions de catégorie Taxonomy API sur des titres de
    cartes de sport (ex. « 2024-25 Panini Mosaic Jaylen Brown Seismic Blue
    #33 /149 ») — pas garanti que la 1ère suggestion soit la bonne catégorie
    « Sports Trading Cards », à vérifier et éventuellement filtrer/whitelister
    une catégorie fixe si la suggestion part n'importe où.
- Pas de nouvelle UI ajoutée (l'endpoint n'est pas encore appelé depuis le
  frontend) — PR3 branchera dessus via la modale de publication.

### PR3 — Publication réelle (le bouton "Publier") ✅ (mergé, PAS ENCORE testé en conditions réelles)

- `backend/add_ebay_offer_id_migration.sql` — colonnes `ebay_offer_id` /
  `ebay_listing_id` sur `cards`.
- `services/ebay_selling.py` :
  - `EbayApiError(step, status_code, body)` — porte le détail exact d'un
    échec, jamais avalé silencieusement.
  - `DEFAULT_CONDITION = "USED_VERY_GOOD"` + `conditionDescriptors`
    `40001=400010` — vérifié ensuite contre l'API Metadata eBay FR pour la
    catégorie `183454` : cela correspond à `4000 Non gradée` /
    `Near Mint or Better`. Le choix initial `USED_EXCELLENT` était converti
    en conditionId `3000` et rejeté au publish.
  - `build_listing_description(card, title)` / `build_aspects(card)` —
    description HTML + item specifics (Player/Athlete, Season, Manufacturer,
    Set, Parallel/Variety, Card Number, Autographed, Professional Grader,
    Grade, Certification Number), plus aspects FR nécessaires pour la
    catégorie cartes de sport eBay FR (`Sport`, `Type`, `Ligue`, etc.). Si
    eBay réclame d'autres champs obligatoires, ça remontera dans l'erreur
    `EbayApiError` de `createOffer`, pas silencieusement.
  - `publish_card(card, access_token, title, price, category_id, policies)` :
    `PUT inventory_item/{sku}` → cherche une offer existante pour ce sku
    (`GET offer?sku=`) et la met à jour (`PUT`) sinon en crée une (`POST`) →
    `POST offer/{id}/publish`. **`update_card_fields` n'est appelé qu'après
    le succès complet des 3 étapes** — un échec à n'importe quelle étape ne
    touche pas la carte, et un nouvel essai ne duplique pas l'offer (testé).
  - `withdraw_card(card, access_token)` — `POST offer/{id}/withdraw` (un 404
    -- offer déjà absente côté eBay -- est traité comme un succès), nettoie
    `ebay_url`/`ebay_offer_id`/`ebay_listing_id`.
  - `update_offer_price(card, access_token, new_price)` — `GET` l'offer
    existante (le `PUT` est un remplacement complet côté eBay), modifie
    `pricingSummary`, retire les champs en lecture seule (`offerId`,
    `listing`, `status`) avant de renvoyer, `PUT`.
- `routers/ebay_selling.py` :
  - `POST /ebay/selling/publish/{card_id}` — body optionnel
    `{title?, price?}` (édités par l'utilisateur dans la modale). Valide
    **avant tout appel eBay** : prix > 0, `image_front_url` présent, titre
    ≤ 80, policies `configured`, catégorie résolue. Renvoie `{"connected":
    false}` si le vendeur n'est pas connecté (même forme que
    `/ebay/account/status`), 422 avec message clair pour chaque validation
    manquante, 502 avec le détail eBay exact si `EbayApiError`.
  - `POST /ebay/selling/withdraw/{card_id}`, `PATCH /ebay/selling/price/{card_id}`
    (même traitement d'erreurs).
- **Frontend** :
  - `EbayPublishModal.tsx` — appelle le preview de PR2 au montage, affiche
    titre éditable (compteur /80), catégorie suggérée, prix éditable ;
    bloque le bouton Publier si les policies ne sont pas configurées (liste
    lesquelles) ; affiche le lien vers l'annonce après succès.
  - `CardDetail.tsx` — bouton **« PUBLIER »** (ouvre la modale) si pas
    d'`ebay_offer_id`, sinon **« VOIR SUR EBAY »** + bouton retirer
    (appelle withdraw, invalide la query `cards`).
  - **Fix connexe nécessaire** : `CollectionView.tsx` gardait un snapshot
    figé de `selectedCard` au moment du clic, jamais resynchronisé avec les
    données fraîches de la query `cards` — donc après une mutation (prix,
    statut, et maintenant publication eBay), la fiche ouverte n'affichait
    pas le nouvel état sans fermer/rouvrir. Corrigé par un `useEffect` qui
    re-pointe `selectedCard` vers l'entrée à jour de `cards` dès qu'elle
    change. Ce bug préexistant touchait déjà (silencieusement) le bouton de
    prix depuis la médiane des ventes eBay.

**⚠️ Premier test réel — checklist** :
1. Utiliser **une carte à faible valeur** (vraie annonce, vrais frais eBay
   en cas de vente).
2. Si `createOrReplaceInventoryItem` échoue sur le `condition` → ajuster
   `DEFAULT_CONDITION` (voir ci-dessus) selon le message d'erreur exact
   renvoyé (visible directement dans la modale de publication).
3. Si `createOffer` échoue côté aspects/catégorie → ajuster
   `build_aspects`/`suggest_category` selon le message d'erreur exact.
4. Vérifier que le lien `https://www.ebay.fr/itm/{listingId}` généré pointe
   bien vers l'annonce publiée.

### Image vendeur (3e photo automatique) ✅

- `backend/add_ebay_seller_settings_migration.sql` — table
  `ebay_seller_settings` (1 ligne par `user_id`, `extra_image_url`), même
  modèle RLS service-only que `ebay_seller_tokens`.
- `backend/services/ebay_settings_store.py` — CRUD Supabase REST, calqué sur
  `ebay_tokens_store.py`.
- `backend/routers/ebay_account.py` : `GET /ebay/account/settings`,
  `PUT /ebay/account/settings` (valide que l'URL est `https://...`).
- `backend/routers/ebay_selling.py` :
  - `GET /ebay/selling/preview/{card_id}` renvoie en plus
    `extra_image_url` (réglage de l'utilisateur, ou `null`).
  - `POST /ebay/selling/publish/{card_id}` accepte
    `include_extra_image: bool = True` ; si vrai et qu'une image est
    configurée, elle est passée à `publish_card` qui l'ajoute à
    `image_urls` en 3e position, après recto/verso.
- **Frontend** :
  - `useEbaySellerImage` / `useEbaySellerImageSave` dans
    `hooks/useEbayAccount.ts`.
  - `EbayView.tsx` — carte « Image d'annonce » : aperçu + Remplacer/Retirer
    si une image est configurée, sinon bouton d'ajout. Upload réutilise
    `POST /api/upload` (même flux que les photos recto/verso, avec
    `compressImage`), puis `PUT /ebay/account/settings`.
  - `EbayPublishModal.tsx` — checkbox « Ajouter mon image d'annonce (3e
    photo) », cochée par défaut, affichée uniquement si
    `preview.extra_image_url` est renseigné ; envoie `include_extra_image`
    au publish.

### Ajout auto aux annonces existantes (EPS/Trading API) ✅

Problème résolu : l'image vendeur (3e photo, ci-dessus) n'était ajoutée
qu'aux annonces **publiées depuis CardVaults** — eBay interdit de mélanger,
dans une même annonce, des photos hébergées eBay/EPS et des photos
hébergées ailleurs (notre CDN R2), donc impossible de référencer
`extra_image_url` directement sur une annonce créée à la main sur eBay
avant l'app.

- `backend/add_ebay_eps_image_migration.sql` — colonnes
  `ebay_seller_settings.eps_image_url` (URL EPS générée) et
  `eps_source_url` (URL R2 source, pour savoir quand régénérer).
- `backend/services/ebay_trading.py` — client minimal pour la Trading API
  (XML, `POST api.ebay.com/ws/api.dll`, token OAuth utilisateur transmis en
  header `X-EBAY-API-IAF-TOKEN`) :
  - `upload_image_to_eps` — `UploadSiteHostedPictures`, héberge
    `extra_image_url` dans EPS au nom du vendeur (EPS + EPS = autorisé sur
    une même annonce).
  - `get_active_item_ids` — `GetMyeBaySelling` paginé, jusqu'à 1000
    annonces (cap de sécurité).
  - `get_item_pictures` — `GetItem`, lit photos actuelles + variations +
    titre.
  - `revise_item_pictures` — `ReviseItem`, réécrit la liste complète des
    photos (pas d'ajout unitaire côté Trading API).
  - `eps_image_id` / `image_already_present` — détecte si l'image vendeur
    est déjà sur l'annonce (comparaison par identifiant EPS extrait de
    l'URL, robuste aux variantes de taille), pour rendre l'opération
    idempotente.
- `backend/routers/ebay_account.py` — `POST
  /ebay/account/apply-image-to-listings` (body `{offset, batch}`, `batch`
  borné à 25) : upload/réutilise l'image EPS, liste les annonces actives,
  traite un lot en parallèle (semaphore 4) — par annonce : déjà à jour
  (skip), à variations (erreur, non prise en charge), 24 photos déjà
  atteintes (erreur), sinon révision. Erreurs par-annonce capturées sans
  faire échouer le lot ; réponse `{done, next_offset, total, updated,
  skipped, errors, eps_image_url}`.
- **Frontend** : `useEbayApplyImageToListings` (hooks/useEbayAccount.ts,
  timeout 120 s) ; bouton « Ajouter à mes annonces existantes » dans
  `SellerImageCard` (EbayView.tsx) qui boucle sur l'endpoint jusqu'à
  `done`, affiche la progression (`n/total annonces`), puis un résumé
  (mises à jour / déjà présentes / échecs) avec la liste compacte des
  erreurs.
- Testé unitairement : parsing XML (succès + `Ack=Failure` avec
  `LongMessage`), pagination `GetMyeBaySelling` sur 2 pages,
  extraction/matching `eps_image_id`, contenu du XML `ReviseItem` ; + tests
  `TestClient` de l'endpoint (422 sans image, `connected:false`, lot avec
  updated/skipped/erreur variations, réutilisation vs régénération EPS
  selon `eps_source_url`) — **jamais appelé contre le vrai eBay**.
- **À vérifier au premier run réel** (voir aussi la note générale plus
  bas) : que la Trading API accepte bien le token OAuth (IAF token) délivré
  par le flux Sell API existant — l'app n'a jamais utilisé la Trading API
  jusqu'ici, uniquement les Sell APIs REST modernes ; le format exact des
  erreurs XML retournées en pratique (peut différer des exemples mockés) ;
  que les annonces à variations sont bien exclues proprement plutôt que de
  planter tout le lot ; que la taille des lots (20) reste sous la limite de
  temps d'un éventuel proxy/Cloudflare devant le backend.
- **Correctif post-premier-run réel** : sur l'annonce 336700702189, `ReviseItem`
  a échoué avec l'erreur Trading API classique « cet outil ne prend pas en
  charge la gestion des annonces en fonction de l'inventaire » (annonces
  créées via l'Inventory API, typiquement celles publiées par l'app elle-même
  via `publish_card` — sku = `card.id`), plus deux warnings (Gestionnaire des
  conditions de vente, Offre directe) concaténés à tort dans le message
  d'erreur. Corrigé : `ebay_trading._call` ne garde plus que les
  `SeverityCode=Error` dans le message (`EbayTradingApiError.error_codes`
  expose les codes) ; `is_inventory_based_error` détecte ce cas par code
  (`INVENTORY_BASED_ERROR_CODES`, codes partiellement supposés faute d'accès
  à la doc eBay depuis ce sandbox) et par repli texte français ; l'endpoint
  bascule alors sur `ebay_selling.add_image_to_inventory_item` (PATCH de
  `product.imageUrls` via l'Inventory API, avec l'URL R2 d'origine — pas
  l'URL EPS — pour rester homogène avec les autres photos de l'inventory
  item) quand un sku est disponible (`GetItem` renvoie maintenant
  `Item.SKU`), sinon remonte une erreur par-annonce explicite. La détection
  « déjà présente » couvre aussi le cas où `extra_image_url` (URL R2) est
  déjà dans les `PictureURL` de l'annonce.
- **Correctif post-premier-run réel #2** (PR #49) : sur les annonces créées
  via l'app (bascule Inventory API ci-dessus), le PUT de la fiche produit
  échouait parfois avec `errorId 25709 « Valeur non valide pour weight.value »`.
  Cause : `add_image_to_inventory_item` doit re-PUT la fiche entière pour
  ajouter une photo, en renvoyant tel quel le `packageWeightAndSize` renvoyé
  au GET — or eBay renvoie parfois un poids/dimensions à 0 ou vide au GET mais
  le refuse au PUT. Corrigé par `_sanitize_package_weight_and_size` qui retire
  les valeurs de poids/dimensions invalides (absentes, nulles ou ≤ 0) avant
  l'écriture, en conservant les valeurs valides.

### Règles de livraison prix → mode d'envoi ✅ (à tester en conditions réelles)

But : ne plus oublier de choisir le bon mode d'envoi (lettre suivie, colis
R1, R2…) à la publication. Le vendeur définit des tranches de prix, chacune
associée à une de ses politiques d'expédition eBay ; à la publication, la
fulfillment policy est pré-sélectionnée automatiquement selon le prix saisi
(toujours modifiable à la main).

- Décisions actées : tranches **configurables** par vendeur ; prix de
  référence = **prix saisi dans le modal** (recalcul en direct si on ajuste
  le prix depuis le median eBay).
- `backend/add_ebay_shipping_rules_migration.sql` — colonne
  `ebay_seller_settings.shipping_rules` (jsonb). **À PASSER dans Supabase.**
  Tableau ordonné `[{max_price, fulfillment_policy_id}, …]`, dernière tranche
  `max_price: null` = « et au-delà » ; une tranche couvre les prix
  `<= max_price` (et au-dessus de la précédente).
- `backend/routers/ebay_account.py` — `GET/PUT /ebay/account/shipping-rules`
  (endpoints dédiés, séparés de `/settings` pour ne pas écraser l'image
  vendeur). Validation : seuils strictement croissants, une seule tranche
  « et au-delà » et en dernier, 20 tranches max.
- `backend/routers/ebay_selling.py` — le preview renvoie désormais
  `shipping_rules` (pour la pré-sélection côté modal).
- **Frontend** :
  - `useEbayAccount.ts` — `useEbayShippingRules` / `useEbayShippingRulesSave`
    + helper pur `matchShippingRule(rules, price)` (1re tranche dont le seuil
    couvre le prix, sinon la tranche « et au-delà »).
  - `EbayView.tsx` — carte « Règles de livraison » (`ShippingRulesCard`) :
    éditeur de tranches (seuil € + select politique d'expédition + ajout/
    suppression), aperçu lisible des tranches, validation locale. N'apparaît
    que si des politiques d'expédition existent sur le compte.
  - `EbayPublishModal.tsx` — pré-sélection auto de la politique d'expédition
    via `matchShippingRule` tant que le vendeur ne l'a pas changée à la main
    (`fulfillmentAuto`) ; recalcul en direct au changement de prix ; indice
    « Livraison choisie automatiquement selon le prix ».
- **À vérifier au premier run réel** : que les `fulfillment_policy_id` des
  règles correspondent bien aux options du compte (le publish valide déjà
  l'id envoyé contre les options autorisées) ; le comportement aux bornes de
  tranches ; que la pré-sélection ne prime pas sur un choix manuel.

## Reste à faire

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
