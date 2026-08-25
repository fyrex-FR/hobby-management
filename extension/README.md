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

## Préremplissage Vinted existant

1. Dans l'app, ouvrir une fiche carte puis cliquer `Publier sur Vinted`
2. Un onglet `https://www.vinted.fr/items/new` s'ouvre
3. L'extension remplit automatiquement:
   - Titre
   - Description
   - Prix
4. Un bandeau vert confirme: `Carte pré-remplie ✓`
5. Un bandeau photos propose `Télécharger photos` (2 fichiers séparés front/back dans `Téléchargements`)
