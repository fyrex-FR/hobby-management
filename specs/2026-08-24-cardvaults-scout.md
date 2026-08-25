# CardVaults Scout — extension Chrome

## Besoin

- Utilisateur : collectionneur connecté à CardVaults consultant une carte de sport sur Vinted ou eBay.
- Problème : estimer la valeur d'une annonce demande aujourd'hui de recopier les informations et de lancer plusieurs recherches eBay à la main.
- Attendu : un panneau latéral extrait l'annonce, identifie la carte, montre des comparables eBay et une estimation corrigeable.
- Attendu : l'utilisateur peut exclure les faux comparables puis ajouter la carte à sa Collection avec l'annonce source préremplie.
- Critères : Vinted et eBay sont couverts ; connexion unique ; aucune action d'achat, surveillance ou publication ; aucun mot de passe stocké dans l'extension.
- Critères : l'ajout conserve une copie durable de la photo dans R2, l'URL source et le prix affiché comme prix d'achat.
- Hors périmètre MVP : scan des pages de résultats, alertes, historique des scans, achat, suivi de prix et modification d'annonce.

## Clarifications validées

- MVP limité à analyser puis ajouter à la Collection.
- Connexion requise dès la première ouverture du panneau.
- CardVaults reste la source de vérité ; l'extension est une nouvelle surface du backend existant, pas une application autonome.

## Plan technique

- Étendre `extension/` existant en Manifest V3 avec service worker, Side Panel et content scripts séparés Vinted/eBay, sans casser le préremplissage Vinted actuel.
- Extraire uniquement titre, prix, URL et URL de l'image principale ; afficher une erreur explicite si la structure de page n'est plus reconnue.
- Ajouter une authentification par code court : création de session d'appairage, approbation dans le frontend CardVaults connecté, échange unique contre un jeton opaque.
- Stocker seulement le jeton dans `chrome.storage.local`; conserver son hash, son utilisateur, sa date d'expiration et sa révocation en base.
- Ajouter dans le frontend une page d'approbation et une section permettant de révoquer les extensions connectées.
- Autoriser l'origine Chrome précise via variable d'environnement ; aucune origine `chrome-extension://*` globale.
- Ajouter `POST /api/extension/analyze` : validation de l'URL source, récupération bornée de l'image côté backend, identification Gemini, puis ventes eBay terminées et annonces actives.
- Retourner critères modifiables, requête eBay, comparables normalisés, médiane et avertissements ; recalculer localement la médiane après exclusion manuelle.
- Ajouter `POST /api/extension/cards` : revalider le payload, copier l'image source dans R2, créer la carte avec `status=collection`, `purchase_price`, URL de marketplace et quantité 1.
- Ne pas ajouter de nouveau service : backend FastAPI, Supabase, R2 et intégration eBay existants sont réutilisés.
- Tests : extracteurs DOM sur fixtures Vinted/eBay, auth/appairage, validation SSRF/image, analyse, ajout/idempotence et non-régression du préremplissage Vinted ; build extension/frontend/backend.
- Déploiement : migration additive, variables d'origine/expiration, backend Coolify puis frontend Cloudflare ; extension chargée non empaquetée pour le MVP.
- Rollback : retirer les nouvelles routes/UI et revenir au commit précédent ; tables et jetons additifs peuvent rester, avec révocation globale des jetons Scout si nécessaire.
- Alternative écartée : réutiliser directement le JWT Supabase du navigateur, car son transfert et son renouvellement dans une extension coupleraient trop fortement l'extension à la session web.

## Tâches

1. Ajouter la migration des appairages et jetons ; vérifier contraintes, expiration, hash et révocation.
2. Implémenter l'auth extension et la page CardVaults d'approbation/révocation ; tester échange unique et refus des jetons expirés.
3. Refondre `extension/` en Side Panel sans régression du préremplissage Vinted ; tester les extracteurs sur fixtures.
4. Implémenter l'analyse orchestrée et les protections de récupération d'image ; tester Vinted, eBay, erreur DOM et erreur eBay.
5. Construire l'interface des comparables, correction des critères et exclusion/recalcul ; vérifier prix, médiane et liens.
6. Implémenter l'ajout idempotent à la Collection avec copie R2 ; vérifier les champs source et empêcher les doublons au double-clic.
7. Exécuter tests/builds, relire le résultat contre ce besoin, documenter l'installation locale et préparer le déploiement.

## Convergence

- Fait : appairage à code court et jetons hashés/révocables ; panneau latéral Vinted/eBay ; extraction, analyse Gemini/eBay, correction de requête, exclusion des faux comparables et ajout idempotent avec copie R2.
- Fait : validation stricte des domaines annonce/image, téléchargement borné à 5 Mo, origine Chrome configurable, migration additive et conservation du préremplissage Vinted.
- Vérifié : 6 tests backend, 2 fixtures d'extraction, 4 tests frontend, compilation Python/JavaScript, lint ciblé et build frontend.
- Divergence : l'extension est livrée non empaquetée pour le MVP ; son origine exacte devra être ajoutée à `EXTENSION_ORIGIN` après chargement dans Chrome.
- Reste avant prod : appliquer la migration, configurer l'origine, tester l'appairage et une annonce réelle dans Chrome, puis déployer backend/frontend après validation humaine.

## Ajustement après test réel — recherche sans IA

### Constat

- Sur l'annonce eBay « 2023 2024 Hot Rookies Eli Junior Kroupi RC Panini Score 23/24 L1 Lorient Mint », Gemini produit « 2023-24 Panini Score Eli Junior Kroupi Base ».
- Le terme inventé `Base` et la perte de `Hot Rookies` / `#20` rendent la recherche trop restrictive : aucun vendu et une seule annonce active non pertinente, alors qu'eBay en affiche plusieurs.
- L'identification visuelle avant recherche ajoute donc coût et fragilité sans améliorer ce parcours.

### Plan révisé — validé le 2026-08-25

- Supprimer Gemini et le téléchargement d'image de `POST /api/extension/analyze` ; partir uniquement du titre extrait de l'annonce.
- Normaliser le titre de façon déterministe : retirer prix, emojis, état et mots commerciaux (`mint`, `hot`, etc.) uniquement lorsqu'ils ne désignent pas l'insert ; conserver joueur, marque, set/insert, numéro, saison et parallèle.
- Générer plusieurs requêtes du plus précis au plus large et élargir seulement si le premier passage ramène trop peu de résultats.
- Fusionner/dédoublonner les résultats eBay, puis classer leur pertinence par recouvrement de mots significatifs avec le titre source.
- Ne plus inventer de métadonnées pour l'ajout Collection : préremplir le joueur/titre brut et laisser les champs techniques vides/corrigeables.
- Ajouter ce cas Eli Junior Kroupi comme test de régression, avec tests de normalisation, élargissement, dédoublonnage et classement.
- Modifier le contrat de réponse et l'interface pour afficher la requête utilisée sans bloc « identification IA ».
- Alternative écartée : garder Gemini en option, car le coût et les faux détails subsisteraient alors dans le chemin principal.

### Convergence de l'ajustement

- Fait : Gemini et le téléchargement d'image ont été retirés du chemin d'analyse ; l'image reste téléchargée uniquement lors de l'ajout à la Collection.
- Fait : requêtes déterministes du titre, élargissement progressif, fusion, dédoublonnage et classement par proximité lexicale.
- Fait : le cas Kroupi conserve `Hot Rookies`, `#20`, `23/24` et n'invente jamais `Base`.
- Fait : le contrat ne renvoie plus d'identification IA ; l'ajout conserve le titre source dans le champ joueur, corrigeable ensuite dans CardVaults.
- Vérifié : 7 tests backend, 2 fixtures d'extraction, compilation Python/JavaScript et build frontend.
- Reste : vérification réelle après déploiement avec l'annonce Kroupi, car les résultats eBay dépendent de l'état courant de l'index et du fallback sold.

## V2 après second test réel — fiabilité et nouvelle analyse

### Besoin

- Utiliser le marché eBay France et afficher la devise réellement renvoyée, sans suffixe euro codé en dur.
- Exclure l'annonce source des comparables, même lorsqu'eBay renvoie sa propre annonce dans les résultats.
- Remplacer la collecte actuelle des ventes terminées, trop incomplète, par une collecte fiable exécutée depuis le navigateur.
- Ajouter un bouton `Nouvelle analyse` qui efface l'annonce, la requête, les résultats, exclusions, erreurs et résumé précédents, puis relit la carte de l'onglet actif.
- L'appairage et la session CardVaults doivent être conservés pendant cette remise à zéro.

### Critères d'acceptation

- Après changement d'onglet vers une autre carte, `Nouvelle analyse` affiche cette nouvelle annonce et permet de la rechercher sans fermer le panneau.
- Aucun résultat comparable ne possède l'URL ou l'identifiant de l'annonce source.
- Chaque prix porte sa devise réelle ; aucune valeur USD n'est présentée comme EUR.
- Le cas Kroupi retourne plusieurs résultats pertinents lorsque ceux-ci sont visibles sur eBay France.

### Refonte du parcours et de l'interface

- Prendre l'extension modèle fournie par Xavier comme référence de densité, hiérarchie et fluidité, sans la copier aveuglément.
- À chaque navigation de l'onglet actif vers une nouvelle annonce Vinted/eBay, détecter le changement d'URL, vider l'ancien résultat, afficher immédiatement la nouvelle annonce puis lancer son analyse automatiquement.
- Annuler ou ignorer toute réponse devenue obsolète si l'utilisateur change encore de page pendant l'analyse.
- Garder un bouton `Relancer` discret pour les erreurs et un bouton `Nouvelle analyse` en secours ; aucun clic requis dans le parcours normal.
- Structurer le panneau en états nets : page non compatible, annonce détectée, analyse en cours, résultats, erreur récupérable.
- Refaire la hiérarchie visuelle : annonce compacte en tête, estimation et niveau de confiance visibles, ventes terminées avant annonces actives, prix/devise et actions sans ambiguïté.
- Masquer la requête technique par défaut derrière une action de modification afin de ne pas surcharger l'écran.

### Plan technique V2 — à valider

- `service-worker.js` : écouter les changements d'onglet/navigation compatibles et notifier le Side Panel.
- `sidepanel.js` : machine d'état simple, analyse automatique, annulation logique des requêtes obsolètes et remise à zéro complète hors session.
- `sidepanel.html/css` : refonte visuelle et états de chargement/erreur/résultats accessibles.
- `scout-ebay.js` et backend : marché France, devise propagée, identifiant eBay extrait et annonce source exclue.
- Collecter les ventes terminées dans le contexte navigateur eBay, puis les normaliser côté API avec les annonces actives.
- Tests : changement successif de deux annonces, réponse obsolète, reset, devise USD/EUR, exclusion source et cas Kroupi.
- Rollback : revenir à `1297ff2` et remettre le ZIP précédent ; aucune migration de base.
- Alternative écartée : rafraîchissement par bouton uniquement, car il recrée précisément la friction signalée pendant la navigation.

### Convergence V2

- Fait : détection automatique des changements d'annonce, analyse sans clic, réponses obsolètes ignorées et remise à zéro sans perdre la session.
- Fait : interface restructurée par états, requête technique repliée, prix formatés selon leur devise et annonce source exclue par identifiant/URL.
- Fait : annonces actives recherchées sur `EBAY_FR` et ventes terminées collectées depuis la page eBay France par l'extension.
- Vérifié : 5 tests backend, 2 fixtures d'extraction avec devise, compilation Python/JavaScript et build frontend.
- Divergence : aucun test DOM automatisé complet du Side Panel, faute de navigateur Chrome dans la suite locale actuelle.
- Reste : test réel dans Chrome du chargement automatique et de la collecte eBay sur le cas Kroupi avec le ZIP V2.

### Convergence V2.3 — session eBay obligatoire

- Constat : eBay redirige désormais les filtres Vendus/Terminés vers la connexion ; le proxy anonyme et le fetch de l'extension ne sont plus fiables.
- Fait : l'extension n'accède plus aux pages de recherche eBay et envoie seulement l'annonce/requête au backend.
- Fait : le backend collecte les ventes eBay France via le proxy Playwright existant, avec profil authentifié persistant privé sur Jarvis ; annonces actives via Browse `EBAY_FR`.
- Fait : parsing français et devise EUR vérifiés ; aucun cookie ou identifiant eBay n'est exposé à l'extension.
- Vérifié : recherche Kroupi connectée sans redirection, 18 ventes visibles dans eBay, 20 résultats EUR parsés ; 7 tests backend, syntaxe JS et manifeste valides.
- Exploitation : la session eBay pourra demander une reconnexion ; reprendre alors le navigateur temporaire limité au tailnet, puis le couper immédiatement.

## V3 — comparer la carte au bon sous-marché

### Constat

- Sur la Phoenix #256 de Wembanyama, les 40 ventes retenues mélangent la base brute (8,23 €), la PSA 9 (43,21 €), la Teal Lazer (33,44 €), la Blue Cracked Ice (39–62 €), la PSA 10 (205,76 €) et la Silver PSA 10 (380,65 €).
- La médiane composite qui en sort ne décrit aucune carte réelle, et il faut écarter les comparables un par un pour obtenir un prix exploitable.
- Le besoin n'est pas de mieux filtrer la recherche : les parallèles et les slabs doivent rester visibles, mais séparés, chacun ayant son propre marché.

### Besoin

- Étiqueter chaque comparable par variante (parallèle) et par note de gradation, puis le ranger dans une case `variante · note`.
- Détecter la case de l'annonce consultée et n'en calculer le prix qu'à partir de cette case.
- Garder les autres cases visibles mais repliées, avec leur nombre de ventes et leur fourchette, pour situer la carte dans sa série.
- Sortir du calcul les lots, réimpressions et autres numéros de carte, quel que soit leur prix.
- Permettre de corriger la variante ou la note détectée sans relancer de recherche eBay.
- Situer le prix demandé par rapport à la case : bonne affaire, prix correct, un peu cher, surpayé.

### Critères d'acceptation

- Sur le cas Wembanyama #256, la case `Base · Brut` regroupe les quatre ventes brutes et sert seule d'estimation ; `Silver · PSA 10` et le lot n'y entrent pas.
- Un `Gold Label` de slab n'est jamais lu comme un parallèle or, et un `Red Sox` jamais comme un parallèle rouge.
- Une numérotation Pokémon `276/217` n'est pas prise pour un tirage limité, contrairement à un `07/10`.
- Corriger la note dans le panneau redistribue les cases immédiatement, sans appel réseau.
- Une case exacte vide s'affiche quand même, avec zéro vente, plutôt que de disparaître.

### Plan technique — appliqué

- Ajouter `services/card_taxonomy.py` : détection société/note/label, couleur et motif de parallèle, tirage numéroté, numéro de carte, lots et réimpressions ; aucune donnée inventée, l'absence de signal vaut « base brute ».
- Ajouter `match_level` et `annotate_comparables` dans `services/extension_helpers.py`, et faire porter à `/analyze` la classification de chaque résultat plus celle de l'annonce source.
- Accepter `condition` et `specifics` dans `AnalyzeRequest`, bornés côté serveur puisqu'ils viennent du DOM ; les caractéristiques structurées eBay priment sur le titre.
- Monter la collecte à 60 ventes et 50 annonces actives, et n'arrêter l'élargissement de requête qu'à 8 comparables, pour que les cases aient une base suffisante.
- Extraire dans `scout-ebay.js` l'état et le bloc `Caractéristiques de l'objet` ; dans `scout-vinted.js`, les lignes de détail et l'état.
- Regrouper et ordonner côté `sidepanel.js` : le backend ne bouge pas quand l'utilisateur corrige la note, seule la comparaison de clés est refaite localement.
- Alternative écartée : refiltrer la requête eBay pour ne ramener que la bonne variante, car les parallèles deviennent alors invisibles alors qu'ils servent à situer la carte.
- Alternative écartée : classer côté extension pour itérer sans déployer, car la normalisation de titre vivrait alors en double et perdrait sa couverture de tests.

### Convergence V3

- Fait : cases `variante · note`, case exacte dépliée et seule source du prix, autres cases repliées avec fourchette, `Hors carte` pour les lots, réimpressions et numéros différents.
- Fait : correction manuelle variante/société/note/label appliquée localement, verdict prix affiché dès deux ventes dans la case, écarts de chaque comparable calculés vs le prix affiché.
- Fait : caractéristiques eBay prioritaires sur le titre, `Gold Label` distingué du parallèle or, noms d'équipes colorés et noms de sets exclus des parallèles.
- Vérifié : 36 tests backend (23 de taxonomie, 13 d'aides extension), 2 fixtures d'extraction couvrant état et caractéristiques, compilation Python et syntaxe JS/manifeste.
- Divergence : les cases restent réparties par sous-marché sans mesure de repli quand une case n'a qu'une vente ; l'estimation s'élargit alors à la variante, en le disant.
- Reste : test réel dans Chrome sur la Phoenix #256 et sur une carte gradée, puis réglage du dictionnaire de parallèles sur les séries réellement rencontrées.

### Correctifs V3.1 — après premier test réel

- Constat : zéro annonce active alors que le marché en compte. La Browse API combine les mots-clés en ET, et le titre entier (`panini phoenix basketball 2023-24 victor wembanyama rc spurs #256`, neuf mots) ne correspond à aucune annonce.
- Constat : 120 ventes pour 60 réelles. Les URL eBay portent un suivi (`_trkparms`, `_skw`) qui change à chaque recherche, donc le dédoublonnage sur l'URL laissait passer chaque vente une fois par requête.
- Constat : corriger la note ne fait que redistribuer les résultats déjà en main ; la case corrigée reste quasi vide puisque la recherche d'origine ne visait pas ces cartes.
- Fait : `build_browse_queries` construit une échelle de requêtes courtes — mots les plus porteurs d'abord, vocabulaire de sport écarté, numéro sans `#` — et l'analyse raccourcit jusqu'à obtenir des résultats au lieu de conclure à un marché vide.
- Fait : `comparable_key` dédoublonne sur l'identifiant eBay extrait de l'URL ; les ventes terminées s'arrêtent dès huit comparables, donc une seule collecte au lieu de deux.
- Fait : `apply_refine` et `refine_keywords` ; le panneau propose `Relancer la recherche pour cette case` dès que la correction change de case, et les mots-clés corrigés partent dans les requêtes vendus et actives.
- Fait : la requête manuelle n'est renvoyée que si elle a réellement été modifiée, sinon celle du tour précédent écrasait l'élargissement automatique et les mots-clés de la correction.
- Fait : `searches` expose la requête et le nombre de résultats de chaque tentative, affichés sous `Modifier la recherche` — un zéro devient lisible au lieu d'être muet.
- Vérifié : 52 tests backend, 2 fixtures d'extraction, rendu headless du panneau couvrant correction et relance, compilation Python et syntaxe JS.
- Divergence : l'échelle de requêtes Browse n'a pas pu être validée contre l'API eBay faute d'identifiants en local ; le diagnostic `searches` sert précisément à trancher au premier essai réel.
