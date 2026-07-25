# Export CSV Whatnot (« Quick Add »)

Permet de lister des cartes sur Whatnot en masse : on sélectionne des cartes
dans la Collection, on génère un CSV, et on l'importe dans l'outil
« Quick Add » de Whatnot. Contrairement à eBay, il n'y a **pas d'API publique
Whatnot** — l'import par fichier est la voie officielle, donc l'app produit le
fichier et l'utilisateur l'importe.

## Source du format

Le format vient du **modèle officiel** fourni par Whatnot
(`FR_Whatnot_quick_add_CSV_format.xlsx`, version FR) : 21 colonnes dans un
ordre fixe, avec des **listes de valeurs fermées** (data validations) pour
Catégorie, Sous-catégorie, Type, Profil de livraison, Matières dangereuses et
État. Une valeur hors liste fait rejeter la ligne à l'import — d'où des
constantes typées dans le code plutôt que du texte libre.

> La page d'aide Whatnot (help.whatnot.com) renvoie un **403 aux requêtes
> automatisées** : le format n'a donc pas pu être recoupé avec la doc en ligne,
> il est dérivé du modèle xlsx lui-même (qui fait foi pour les colonnes et les
> valeurs autorisées).

### ⚠️ Espaces insécables

Les libellés de **profil de livraison** du modèle contiennent des espaces
**insécables** (U+00A0) avant les unités — `3`+U+00A0+`oz`, pas `3 oz`. Une
espace ordinaire ne correspond à aucune valeur de la liste. Le code les écrit
avec des échappements explicites ` ` (`WHATNOT_SHIPPING_PROFILES`), et
`WHATNOT_DEFAULTS` **référence les constantes** au lieu de retaper les
libellés, pour qu'une édition future ne réintroduise pas une espace normale
invisible à l'œil.

## Colonnes générées

| Colonne | Source |
|---|---|
| Catégorie | `Cartes de Sport` (fixe) |
| Sous-catégorie | choisie dans la modale (défaut : `Cartes à l'unité basketball`) |
| Titre | construit depuis les attributs (année, marque, set, joueur, insert, parallèle, n°, tirage, RC, gradation), 100 car. max |
| Description | attributs structurés + notes d'état + mention d'emballage |
| Quantité | `card.quantity` (min. 1) |
| Type | choisi (défaut : `Buy it Now`) |
| Prix | `card.price` |
| Profil de livraison | choisi (défaut : `Sports à l'unité (3 oz, 85 g)`) |
| Offres Acceptées | `TRUE` si coché, sinon vide |
| Matières dangereuses | `Not Hazmat` (fixe) |
| État | `Graded` si la carte est gradée, sinon l'état choisi |
| Coût par article | `card.purchase_price` si l'option est cochée |
| SKU | `card.id` |
| Image URL 1–8 | `image_front_url`, `image_back_url` |

Les images utilisent les **URL publiques R2 telles quelles** — surtout pas le
proxy same-origin `/cdn/` de `cdnImg`, que les serveurs de Whatnot ne
pourraient pas résoudre.

## Où c'est dans l'app

- `frontend/src/lib/whatnotExport.ts` — constantes du format, construction du
  titre/description, génération et téléchargement du CSV (BOM UTF-8 pour les
  accents dans Excel, échappement des virgules/guillemets/retours ligne).
- `frontend/src/components/shared/WhatnotExportModal.tsx` — modale : réglages
  (sous-catégorie, type, profil de livraison, état des cartes non gradées,
  offres, coût), aperçu des cartes, exclusion des non-exportables.
- `frontend/src/components/views/CollectionView.tsx` — bouton **Whatnot** dans
  la barre d'actions groupées (mode sélection multiple), à côté de « Publier »
  (eBay).

## Cartes exclues

Une carte n'est pas exportée si elle n'a **pas de prix** ou **pas de photo
recto** (Whatnot exige un prix et des URL d'images publiques). Elles restent
affichées en grisé dans la modale avec le motif, plutôt que d'être silencieusement
ignorées.

## Vérification

Le CSV généré a été validé **programmatiquement contre le modèle xlsx** :
en-têtes identiques et dans l'ordre, 21 champs par ligne, et chaque valeur
(catégorie, sous-catégorie ↔ catégorie, type, profil de livraison, hazmat,
état ↔ sous-catégorie) présente dans la liste autorisée correspondante — y
compris les espaces insécables. Cas couverts : carte gradée → `Graded`,
quantité > 1, prix d'achat, description multi-ligne avec guillemets et
virgules (échappement CSV), carte sans prix / sans photo → exclue.

**Pas encore testé par un import réel sur Whatnot** — à confirmer au premier
usage (notamment la colonne « Offres Acceptées », dont le format `TRUE`/vide
n'a pas pu être recoupé avec la doc, et la limite de longueur du titre).
