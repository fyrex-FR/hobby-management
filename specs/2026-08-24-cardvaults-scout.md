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
