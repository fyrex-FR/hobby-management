# Handoff debug : « Connexion au serveur impossible » sur la publication eBay

Document de transfert pour reprendre ce bug dans une nouvelle session/agent,
sans dépendre de l'historique de conversation. Contexte complet de la
fonctionnalité : voir `docs/ebay-selling-plan.md`.

## Le bug

Dans l'app (collection.cardvaults.app), sur une fiche carte → bouton
**« Publier »** → modale eBay → le **preview charge bien** (titre, catégorie,
prix affichés correctement) → clic sur **« Publier sur eBay »** → échec
systématique avec :

> Connexion au serveur impossible. Vérifie ta connexion et réessaie.

Ce message vient de `frontend/src/api/client.ts` (`apiFetch`), dans la
branche catch qui s'exécute quand `fetch()` **rejette avant même de recevoir
une réponse HTTP** (pas un 4xx/5xx propre — sinon ce serait
`API {status}: {texte}`). C'est un échec réseau générique côté navigateur
(observé au départ comme "Load failed", vocabulaire Safari/WebKit).

## Ce qui est confirmé (testé en conditions réelles par l'utilisateur)

- `GET /ebay/selling/preview/{card_id}` → **fonctionne**. Le titre, la
  catégorie suggérée (ex. « JCC : cartes à l'unité »), le prix s'affichent
  correctement dans la modale.
- `POST /ebay/selling/publish/{card_id}` → **échoue à chaque fois**, en
  **moins de 5 secondes** (confirmé explicitement par l'utilisateur : pas un
  timeout long, c'est quasi instantané).
- Le reste de l'app fonctionne normalement en parallèle (Collection, etc.) —
  ce n'est pas une panne générale du backend.
- Avant que l'utilisateur configure ses *business policies* sur eBay, le
  même clic sur « Publier » avait fonctionné **au moins une fois** et avait
  renvoyé une erreur 422 propre (« Configure d'abord tes options de vente
  sur eBay… ») — donc **le call POST vers cet endpoint a déjà abouti à une
  vraie réponse HTTP au moins une fois** avant que ce bug n'apparaisse (ou
  avant qu'on ne le remarque).
- Après configuration des policies sur eBay, le même clic échoue maintenant
  avec le message réseau générique, à chaque tentative.

## Pistes déjà explorées et éliminées

Deux hypothèses ont été testées **en modifiant le code, en déployant, et en
retestant** — dans les deux cas, **aucun changement de comportement** (même
message, même délai < 5 s) :

1. **Bug WebKit/Safari (`AbortController.signal` + `fetch()` avec un body)**
   — hypothèse : combiner un signal d'abandon et un corps JSON casse `fetch`
   sur Safari. Fix déployé : retrait de l'`AbortSignal` dans `apiFetch`
   (remplacé par un `Promise.race` qui n'annule jamais le fetch d'origine).
   **Aucun changement observé.** → à considérer comme éliminé, ou au moins
   pas la cause principale.
2. **Timeout d'un proxy intermédiaire** (Coolify/Cloudflare coupe la
   connexion si la chaîne d'appels eBay dans `publish_card` prend trop de
   temps) — fix déployé : parallélisation de `get_business_policies` (3
   appels), et parallélisation de `PUT inventory_item` +
   `GET offer?sku=` dans `publish_card`. **Aucun changement observé.**
   Cohérent avec le fait que l'échec est **instantané (< 5 s)** : bien trop
   rapide pour être un timeout sur une chaîne d'appels eBay qui, même
   optimisée, prendrait plusieurs secondes. Cette piste est donc peu
   probable dès le départ au vu du timing, mais le fix reste en place (sans
   effet négatif).

**Conclusion à ce stade** : comme deux changements de code réels et déployés
n'ont produit **aucune variation** du symptôme (ni dans le message, ni dans
le timing), l'hypothèse la plus probable devient que **le code déployé n'a
peut-être pas été correctement chargé côté client** (cache navigateur/CDN),
plutôt qu'un vrai problème dans la logique elle-même. Ce phénomène de cache
s'est **déjà produit une fois dans cette session** de travail plus tôt (les
changements visuels de la vue Collection n'apparaissaient pas tant qu'un
onglet privé Safari n'était pas utilisé pour forcer un rechargement sans
cache).

**⚠️ Dernière étape demandée mais pas encore confirmée par l'utilisateur** :
retester le même scénario dans un **onglet privé/incognito Safari** (ou
après un vidage complet du cache) pour éliminer/confirmer cette piste. C'est
la toute première chose à faire en reprenant ce debug.

## Ce qui n'a PAS encore été vérifié (pistes à explorer ensuite)

Par ordre de priorité suggéré :

1. **Onglet privé / cache vidé** (voir ci-dessus) — élimine ou confirme le
   cache comme cause. Si le comportement change en privé → c'était le cache,
   les fixes déjà déployés sont probablement bons, revalider normalement.
   Si c'est identique en privé → le problème est réel, continuer ci-dessous.

2. **Logs backend Coolify** au moment exact d'une tentative de publication.
   Depuis PR #40, les 3 endpoints (`publish`, `withdraw`, `price`) attrapent
   désormais **toute exception inattendue** et la logguent via
   `logger.exception(...)` (module `ebay_selling`, voir
   `backend/routers/ebay_selling.py`) avant de renvoyer une 500 propre.
   → **Si les logs Coolify du service backend ne montrent RIEN au moment de
   l'échec**, ça veut dire que la requête n'a **jamais atteint le processus
   Python** — la cause serait alors en amont (proxy Coolify, Cloudflare, DNS,
   WAF/règle de sécurité bloquant spécifiquement ce chemin `/ebay/selling/
   publish/...`, ou un souci CORS empêchant même le preflight OPTIONS de
   passer).
   → **Si les logs montrent une requête reçue et un traceback Python**, le
   message d'erreur exact dans le log donnera la vraie cause immédiatement
   (bug de code cette fois, pas d'infra).
   → **Si les logs montrent une requête reçue et un succès (200) alors que
   le client a affiché une erreur réseau**, ça veut dire que la réponse a
   été perdue en chemin retour (proxy qui coupe après coup, ou souci
   d'infra asymétrique) — cas particulièrement intéressant vu le timing
   < 5 s (peu probable mais à ne pas exclure).

3. **Inspecter la requête réseau réelle** via les outils de développement
   Safari (Web Inspector distant depuis un Mac connecté à l'iPhone, ou
   équivalent) sur l'échec exact : ça montre précisément où ça casse (DNS,
   TLS, CORS preflight rejeté, connexion réinitialisée, etc.) — bien plus
   fiable que de déduire depuis les messages applicatifs. **Recommandé en
   priorité si accessible**, avant d'ajouter d'autres fixes à l'aveugle.

4. **Tester l'endpoint directement en `curl`** depuis un serveur ayant accès
   réseau réel à `collection-api.cardvaults.app` (contrairement à
   l'environnement de développement utilisé jusqu'ici, qui est bloqué sur
   la plupart des domaines externes). Attention : un `POST
   /api/ebay/selling/publish/{card_id}` réussi publie une **vraie annonce**
   sur eBay avec un `card_id` valide — pour un test sans risque, utiliser un
   `card_id` inexistant (doit renvoyer 404 rapidement) afin de vérifier au
   moins que l'endpoint est joignable et répond normalement en dehors du
   navigateur, ce qui isolerait un problème côté navigateur/CORS d'un
   problème d'infra pure.

## Diagnostic et résolution du 2026-07-21

Reprise par Jarvis depuis le workspace local avec accès réseau et accès
Coolify.

Faits établis :

- Le repo local a été mis à jour sur `main`, commit `3a6610e`.
- Le conteneur backend Coolify actif était
  `x134wf8gaskhyej4w8jebyus-111930572432`, image construite depuis
  `3a6610e5524e717fe00470c740929790c99debe4`.
- Le frontend actuellement servi par Cloudflare Pages charge le bundle
  `assets/index-DqUgd_TD.js`.
- L'HTML `https://collection.cardvaults.app/` est servi avec
  `cache-control: public, max-age=0, must-revalidate`.
- Le bundle JS est servi avec `cache-control: public, max-age=14400,
  must-revalidate`.
- Le bundle JS actuellement servi contient bien le fix `Promise.race` et le
  message `Connexion au serveur impossible`; Cloudflare ne sert donc pas une
  ancienne build globale au moment du test.
- Un `OPTIONS` CORS vers
  `https://collection-api.cardvaults.app/api/ebay/selling/publish/nonexistent-card-id`
  avec `Origin: https://collection.cardvaults.app` renvoie `200 OK`, avec
  `access-control-allow-origin: https://collection.cardvaults.app` et les
  headers/méthodes attendus.
- Un `POST` sans auth vers le même endpoint renvoie proprement `403 Not
  authenticated` et apparaît dans les logs Uvicorn, donc Cloudflare/Traefik
  routent bien ce chemin jusqu'au process Python.
- Un test `POST` authentifié avec un utilisateur Supabase temporaire, sur un
  `card_id` inexistant, renvoie proprement `404 {"detail":"Carte
  introuvable"}` et apparaît dans les logs Uvicorn. Le compte Supabase de
  test a ensuite été supprimé.
- Un curl depuis le conteneur backend vers `https://api.ebay.com/` répond
  rapidement (`404` racine eBay), donc le conteneur a une sortie réseau/TLS
  vers eBay.
- Les logs backend des dernières 24h ne montraient aucune tentative
  `POST /api/ebay/selling/publish/...` réelle, hors tests de diagnostic
  ci-dessus.
- Une tentative réelle de Xavier en onglet privé a ensuite produit :
  `OPTIONS /api/ebay/selling/publish/0cafdca5-4288-4f4b-ad4f-9c3805bd1a48`
  -> `200 OK`, puis
  `POST /api/ebay/selling/publish/0cafdca5-4288-4f4b-ad4f-9c3805bd1a48`
  -> `502 Bad Gateway`. La requête atteignait donc bien le process Python.
- Rejeu contrôlé côté conteneur pour la carte concernée (Jaylen Brown
  2024-25 Panini Mosaic Blue Prizm /149) : `get_card`, token eBay,
  business policies et catégorie OK, puis échec sur la première étape
  Inventory API.
- Erreur eBay exacte :
  `API_INVENTORY 25709 — Valeur non valide pour header Content-Language`,
  étape `Création de la fiche produit`.
- Après correction de `Content-Language`, le flux passe la création/mise à
  jour inventory/offer mais échoue à la publication avec :
  `API_INVENTORY 25002 — Item.Country n'existe pas ou est spécifié en tant
  que balise vide`, étape `Publication de l'annonce`.
- `GET /sell/inventory/v1/location` pour le compte vendeur renvoie
  `{"locations":[]}` : aucune inventory location eBay n'est configurée.
- Les logs Traefik contiennent beaucoup d'erreurs ACME/Let's Encrypt liées à
  des domaines proxifiés par Cloudflare, dont `collection-api.cardvaults.app`,
  mais l'API HTTPS répond correctement via Cloudflare. Ces erreurs sont à
  surveiller côté infra, mais elles n'expliquent pas à elles seules un échec
  spécifique du bouton publish alors que les curls vers le même endpoint
  passent.

Interprétation à ce stade :

- Le bug n'était pas un cache navigateur, ni un timeout, ni un blocage
  CORS/proxy avant Python.
- La cause réelle était un header eBay manquant/invalide pour les appels Sell
  Inventory sur `EBAY_FR`, puis l'absence de `merchantLocationKey`/inventory
  location pour publier l'offre. eBay exige un `Content-Language` cohérent
  avec le marketplace et un lieu vendeur contenant au minimum le pays.
- Correctif code : `backend/services/ebay_selling.py` ajoute
  `Content-Language: fr-FR` dans les headers eBay Sell.
- Correctif code : `publish_card` lit une inventory location eBay existante
  et envoie son `merchantLocationKey` dans l'offre. S'il n'y a aucune
  location, l'erreur renvoyée est désormais explicite.
- Correctif de robustesse : si la migration des colonnes `ebay_offer_id` /
  `ebay_listing_id` n'est pas encore appliquée en prod, `publish_card`
  retente un enregistrement minimal (`ebay_url`, `price`, `status`) pour ne
  pas transformer une publication eBay réussie en erreur applicative.
- Durcissement diagnostic : `backend/routers/ebay_selling.py` loggue
  maintenant aussi les `EbayApiError` (502 métier), pas seulement les
  exceptions inattendues.

Point de vigilance découvert pendant le diagnostic :

- La base Supabase prod ne contenait pas encore `cards.ebay_offer_id` et
  `cards.ebay_listing_id` au moment de la vérification. La migration
  `backend/add_ebay_offer_id_migration.sql` doit être appliquée avant un
  retest complet des fonctions de retrait/mise à jour prix. Le publish lui-même
  tolère désormais temporairement cette migration manquante en enregistrant
  au minimum l'URL eBay.
- Le compte vendeur de Xavier doit avoir une inventory location eBay. Au
  moment du diagnostic, l'interface eBay FR ne rendait pas ce réglage facile
  à trouver. CardVaults expose donc désormais un réglage par compte connecté
  dans l'onglet eBay : l'utilisateur renseigne ville + code postal, puis le
  backend crée une location WAREHOUSE `CardVaults` via l'API eBay avec le
  token OAuth du vendeur concerné. Cela respecte le multicompte : chaque
  compte eBay a sa propre inventory location.

Correction additionnelle après test réel du bouton `Enregistrer` :

- Le premier endpoint CardVaults de création du lieu appelait eBay avec
  `PUT /sell/inventory/v1/location/{merchantLocationKey}`. eBay répondait
  `400 Invalid request` et l'app affichait à nouveau le message générique
  `Connexion au serveur impossible`.
- Rejeu contrôlé depuis le conteneur backend avec le token du compte
  `xavandr_61` : eBay accepte la création avec
  `POST /sell/inventory/v1/location/{merchantLocationKey}` et un body de
  forme `{"name":"CardVaults","location":{"address":{...}}}`.
- Le lieu réel du compte Xavier a été créé avec succès :
  `merchantLocationKey=cardvaults-fr-93600`, ville `Aulnay-sous-Bois`,
  code postal `93600`, pays `FR`.
- `create_inventory_location` utilise maintenant `POST` et devient
  idempotent : si eBay répond `merchantLocationKey already exists`, le
  backend récupère la location existante et renvoie un succès applicatif.

Correction additionnelle après retest du bouton `Publier sur eBay` :

- Le setup du lieu d'expédition fonctionnait, mais le publish réel échouait
  encore avec le même message générique côté client car le backend renvoyait
  un `502` métier après refus eBay.
- Erreur eBay exacte dans les logs :
  `API_INVENTORY 25059 — Les informations sur l'état 3000 n'existent pas ou
  ne sont pas valides pour la catégorie 183454`, étape `Publication de
  l'annonce`.
- Vérification via Metadata API eBay pour `EBAY_FR`, catégorie `183454` :
  conditions exposées `2750 Gradée`, `3000 Occasion`, `4000 Non gradée`.
  Pour `4000 Non gradée`, le descriptor obligatoire est `40001 État de la
  carte`, valeur `400010 Near Mint or Better`.
- Correctif code : `DEFAULT_CONDITION` passe de `USED_EXCELLENT` à
  `USED_VERY_GOOD` (conditionId `4000`) et `publish_card` envoie désormais
  `conditionDescriptors=[{"name":"40001","values":["400010"]}]` sur
  l'inventory item.
- Après déploiement de ce correctif, l'étape condition passe, puis eBay
  refuse l'annonce car la catégorie suggérée était encore `183454` (JCC) et
  réclamait l'aspect obligatoire `Jeu`. Pour les cartes NBA Panini, la
  catégorie correcte remontée par Taxonomy avec une requête contextualisée
  est `261328 Cartes à l'unité` (sports cards). `suggest_category` préfixe
  désormais la requête par `sports trading card basketball`, et
  `build_aspects` envoie les aspects FR obligatoires/recommandés utiles :
  `Sport=Basket-ball`, `Type=Carte à collectionner sportive`,
  `Ligue=National Basketball Association (NBA)`, plus équipe/joueur/saison.
- Point eBay découvert ensuite : `PUT /offer/{offerId}` répond `204` mais ne
  modifie pas réellement `categoryId` sur une offer brouillon existante. Le
  backend supprime donc l'ancienne offer `UNPUBLISHED` et en crée une
  nouvelle quand la catégorie calculée diffère de celle de l'offer existante.

## Repères techniques utiles

- Backend déployé : `https://collection-api.cardvaults.app` (Coolify).
- Frontend déployé : `https://collection.cardvaults.app` (Cloudflare Pages).
- Endpoint en cause : `POST /api/ebay/selling/publish/{card_id}`
  (`backend/routers/ebay_selling.py`, fonction `publish_listing`).
- Logique métier : `backend/services/ebay_selling.py`
  (`publish_card`, `get_business_policies`, `suggest_category`).
- Appel côté front : `frontend/src/components/shared/EbayPublishModal.tsx`
  (fonction `publish()`), via `frontend/src/api/client.ts` (`apiFetch`).
- L'environnement de développement utilisé pour construire cette
  fonctionnalité (sessions précédentes) **n'a jamais eu d'accès réseau à
  eBay ni à la plupart des domaines externes** (bloqué par la policy réseau
  du sandbox) — tout le code a été validé par tests unitaires avec appels
  HTTP simulés (mocks), jamais contre le vrai eBay ni le vrai déploiement.
  Toute vérification en conditions réelles doit se faire sur l'infra réelle
  de l'utilisateur (Coolify/Cloudflare), qui elle a un accès réseau normal.
- OAuth (PR1) et le preview (PR2) sont **confirmés fonctionnels en
  conditions réelles** (compte eBay `xavandr_61` connecté avec succès,
  preview de carte chargé avec succès). Seule la publication effective
  (PR3) reste bloquée par ce bug.
- Rappel important : la publication est **idempotente/rejouable sans
  risque de doublon** côté logique (une offer existante pour le même `sku`
  est réutilisée plutôt que dupliquée) — donc retenter plusieurs fois côté
  eBay lui-même n'est pas dangereux, une fois que la requête arrive
  effectivement à destination.

## Historique des commits liés (branche `main`)

- `3ee2d41` — PR3, publication réelle (Inventory API).
- `ce11bdf` — parallélisation des policies + timeout client (AbortController,
  1ère version).
- `2fe3891` — retrait de l'AbortSignal (suspicion bug WebKit) + durcissement
  des endpoints (catch générique + logging).
- `08a9319` — parallélisation inventory_item + vérification offer existante.

Aucun de ces 3 derniers commits n'a changé le symptôme observé.
