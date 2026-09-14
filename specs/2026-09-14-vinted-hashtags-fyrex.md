# Hashtags Vinted Fyrex

## 1. Besoin

- Utilisateur : Xavier, vendeur Vinted `fyrex`.
- Problème : les descriptions générées par la Collection ne relient pas les annonces d'un même joueur, d'une même équipe ou d'une même série.
- Attendu : chaque publication Vinted ajoute automatiquement des hashtags cohérents et recherchables sous le préfixe `fyrex`.
- Critères : un tag joueur, équipe et série est ajouté quand la donnée existe ; aucun tag vide ou invalide ; le reste de la description ne change pas.
- Hors périmètre : automatiser la publication Vinted, modifier les annonces déjà en ligne, éditer le profil Vinted.

## 2. Clarification

- Portée recommandée : toutes les cartes, avec la même normalisation générique ; pour la NBA, les équipes utilisent leur nom court (`Los Angeles Lakers` → `#fyrex_lakers`).
- Alternative : limiter les hashtags au Basket. Si Xavier préfère cette option, il doit le préciser avant implémentation.

## 3. Plan technique

- Ajouter un helper frontend pur qui normalise en minuscules ASCII et retire espaces, ponctuation et caractères interdits.
- Générer au maximum trois tags uniques : `#fyrex_<prenomnom>`, `#fyrex_<equipe>`, `#fyrex_<serie>`.
- Ajouter une table légère des noms courts NBA ; repli générique sur le nom compact pour les autres équipes/sports.
- Injecter un bloc d'introduction et les tags en tête de `description`, comme sur l'exemple Vinted validé, dans le payload déjà transmis à l'extension.
- Ajouter des tests unitaires pour accents, apostrophes, équipes NBA, valeurs absentes et doublons.
- Aucun schéma, API, dépendance ou variable d'environnement.
- Déploiement : frontend Cloudflare Pages uniquement après validation humaine.
- Rollback : revert du commit frontend.
- Alternative écartée : hashtags configurables en base, trop lourd pour un seul compte vendeur.

## 4. Tâches

1. Créer et tester le générateur de hashtags ; OK si les cas nominaux et limites passent.
2. Brancher le générateur dans la description Vinted ; OK si le payload conserve le texte actuel et ajoute les tags à la fin.
3. Lancer tests, lint et build frontend ; OK si tout passe sans régression.

## 6. Convergence

- Fait : normalisation générique, noms courts des 30 équipes NBA, trois hashtags uniques et bloc de navigation placé avant la description existante.
- Divergence : aucune ; le plan a été précisé avant implémentation pour reprendre la présentation de la capture validée.
- Reste : validation locale puis déploiement séparé après accord explicite.
