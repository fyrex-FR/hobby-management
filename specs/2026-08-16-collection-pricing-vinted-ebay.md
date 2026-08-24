# Prix Vinted/eBay et collections multi-sport

## Besoin
- Persister un prix Vinted et un prix eBay modifiables pour chaque carte.
- Préremplir le prix eBay pour conserver le prix Vinted net après 9 % de commission et 0,35 € de frais fixes.
- Gérer Basket, Foot, Baseball, Football US, Hockey et Autre.
- Détecter le sport par IA, permettre sa correction, puis filtrer et regrouper la Collection par sport.
- Classer les cartes existantes en Basket.
- Hors périmètre : catégories eBay propres à chaque sport et vues partagées.

## Décisions validées
- Formule : `ebay_price = (vinted_price + 0,35) / 0,91`.
- Le résultat est arrondi au-dessus au pas de 0,50 € sous 5 €, sinon à l'euro supérieur.
- Le sport est une valeur contrôlée, détectée par l'IA et modifiable manuellement.
- Les cartes existantes reçoivent `Basket` lors de la migration.

## Plan technique
- Migration additive `sport`, contrainte sur les six valeurs et reprise Basket.
- Validation du sport dans les contrats cartes et normalisation de la réponse IA avec repli Basket.
- Ajout du sport aux flux création, lot, studio, revue et fiche carte.
- Ajout du filtre et du regroupement Sport dans la Collection.
- Remplacement des taux eBay configurables par la formule fixe validée ; conservation des anciennes colonnes pour compatibilité.
- Tests du calcul, build TypeScript, compilation backend et rollback compatible grâce aux champs historiques conservés.
- Alternative écartée : déduire le sport à l'affichage depuis l'équipe, car ce serait fragile et non corrigeable.

## Tâches
1. Ajouter la migration et la validation backend du sport.
2. Étendre l'identification IA et tous les flux de création/édition.
3. Ajouter filtre et regroupement Sport à la Collection.
4. Aligner le calcul eBay et son interface sur la formule fixe.
5. Exécuter tests, build et convergence.

## Convergence
- Fait : migration additive, validation/repli IA, édition manuelle, flux création/revue/lot/studio, filtre et regroupement.
- Fait : formule eBay fixe testée et ancienne configuration masquée ; la publication utilise déjà `ebay_price` avec repli historique.
- Divergence : les anciennes colonnes de taux et de gonflage restent en base/API pour garantir la compatibilité, mais ne pilotent plus le calcul.
- Vérifications : tests Vitest et build frontend passent ; compilation Python et `git diff --check` passent.
- Reste avant production : revue, commit/push, application de la migration, puis déploiement backend/frontend après validation explicite.
