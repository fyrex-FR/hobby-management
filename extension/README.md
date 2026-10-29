# CardVaults Scout — extension Chrome

## Installation

1. Ouvrir `chrome://extensions`
2. Activer `Mode développeur`
3. Cliquer `Charger l'extension non empaquetée`
4. Sélectionner le dossier `extension/`

## Scout Vinted / eBay

1. Cliquer l'icône CardVaults Scout pour ouvrir le panneau latéral.
2. Générer un code puis l'approuver dans CardVaults.
3. Ouvrir une annonce Vinted ou eBay : l'analyse démarre seule.
4. Lire l'estimation, déplier les autres cases si besoin, puis ajouter la carte à la Collection.

Le jeton d'extension est révocable dans CardVaults. Le MVP utilise une extension non empaquetée.

### Cases variante × note

Les comparables eBay mélangent la carte brute, ses parallèles et ses versions
gradées. Scout étiquette chaque résultat (`services/card_taxonomy.py`) et les
range par case `variante · note` :

- la case de la carte consultée est dépliée et sert seule au calcul du prix ;
- les autres cases restent visibles, repliées, avec leur fourchette de prix ;
- lots, réimpressions et autres numéros de carte tombent dans `Hors carte`.

Si la note détectée est fausse — titre muet, slab non annoncé — `Corriger la
variante ou la note` rebascule la comparaison instantanément, sans relancer de
recherche eBay.

Les caractéristiques de l'objet eBay (`Société de notation`, `Note`,
`Professionnel noté`, `Parallèle/Variété`) priment sur le titre, qui reste le
recours quand le vendeur ne les renseigne pas.

### Depuis une annonce Vinted

Vinted ne décrit pas les cartes : ses seuls champs structurés sont la marque,
l'état et la date d'ajout. Scout lit donc le titre du `h1` — jamais celui de
l'onglet, qui porte un suffixe `| Vinted` — et retombe sur la description quand
le titre ne dit ni la note ni le numéro de carte. Une annonce qui se déclare
non gradée le reste : la description mentionne souvent d'autres cartes du
vendeur.

Les comparables restent eBay : ventes terminées et annonces actives de la même
carte, rangées dans les mêmes cases.

## Ajout à la Collection

`Fiche à créer` reprend les caractéristiques de l'annonce — joueur, équipe,
saison, marque, set, numéro — plus la variante, le tirage et la gradation
déduits. Tout est éditable avant l'ajout ; un champ laissé vide reste vide dans
CardVaults plutôt que d'être deviné.

La gradation suit la case retenue : corriger la note dans `Carte analysée`
corrige aussi la fiche. Photo, prix d'achat et lien d'origine viennent de
l'annonce.

## Préremplissage Vinted existant

1. Dans l'app, ouvrir une fiche carte puis cliquer `Publier sur Vinted`
2. Un onglet `https://www.vinted.fr/items/new` s'ouvre
3. L'extension remplit automatiquement:
   - Titre
   - Description
   - Prix
4. Un bandeau vert confirme: `Carte pré-remplie ✓`
5. Un bandeau photos propose `Télécharger photos` (2 fichiers séparés front/back dans `Téléchargements`)

## Publier sur Vinted en chaîne (onglet du panneau)

L'onglet **Publier sur Vinted** du panneau publie les cartes une par une :

1. La file affiche les cartes « à vendre » sans annonce Vinted (avec photo),
   y compris celles sans prix : le prix se saisit dans le panneau (enregistré
   dans CardVaults via `PATCH /api/extension/cards/{id}/price`) et `Remplir`
   reste désactivé tant qu'il manque. Filtre `Sans prix`. Chaque carte a un
   lien `Ventes eBay` (ventes terminées, même recherche que la fiche carte). Depuis la Collection, `Vendre → Vinted` y envoie à la place la
   sélection en cours (bandeau « Sélection envoyée depuis CardVaults »).
2. `Remplir l'annonce sur Vinted` ouvre une page de création vierge dans
   l'onglet Vinted actif (ou un nouvel onglet) et la remplit : titre,
   description avec hashtags, prix, marque, état, photos recto/verso (pastille
   de numérotation sur le recto). Le texte vient de l'API
   (`GET /api/extension/vinted-queue`, `services/vinted_draft.py`) ; le
   brouillon passe par `chrome.storage.session`, plus par l'adresse de la page.
3. Après le clic sur « Ajouter » dans Vinted, l'annonce créée est associée à la
   carte automatiquement (`PATCH /cards/{id}/vinted-listing`), avec un bouton
   `Annuler` pendant quelques secondes, puis la carte suivante est proposée.
   L'association n'a lieu que dans l'onglet rempli, juste après le formulaire
   ou un clic « Ajouter » récent (`vinted-logic.js`) : une autre annonce
   consultée entre-temps n'est jamais associée par erreur.
4. Secours : `Associer une annonce à la main` associe l'annonce ouverte dans
   l'onglet actif, ou une adresse collée.
5. Organisation : la file se groupe par équipe (par défaut), joueur, set ou
   année, et se trie (ajout récent, prix, joueur). `Publier ce groupe` limite
   la file à une équipe, l'ordre affiché étant l'ordre de publication.
   `Remplir la suivante automatiquement` ouvre le formulaire de la carte
   suivante 1,5 s après chaque association (`Annuler` stoppe l'enchaînement).
   Ces réglages sont gardés (`chrome.storage.local`, clé `vinted_panel_prefs`).

Tests : `node extension/test-vinted-logic.mjs` (règles d'association, file,
URL) et `backend/tests/test_vinted_draft.py` (texte d'annonce, routes).
