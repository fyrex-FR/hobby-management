# Collection pricing Vinted / eBay

## Besoin
- Distinguer et persister un prix Vinted et un prix eBay pour chaque carte.
- Préremplir le prix eBay depuis le prix Vinted avec les taux eBay configurés, un gonflage propre à la carte et la règle d'arrondi.
- Les deux prix restent modifiables manuellement après le calcul automatique.
- Conserver les prix existants : le champ historique `price` devient le prix Vinted initial.
- Hors périmètre : automatiser une règle spéciale à partir de `200 €`.

## Décisions validées
- `vinted_price`, `ebay_price` et `price_inflation` sont persistés par carte.
- `price_inflation` est manuel, à `0 €` par défaut, sans déclenchement automatique.
- Les taux commission/transaction sont persistés par compte dans la configuration eBay.
- Aucun taux n'existait dans le code : leurs valeurs sont saisies dans l'app.
- Le calcul est une fonction pure isolée et testée, avec taux et gonflage injectés.
- Le seuil de `5 €` porte sur le montant après taux et gonflage, avant arrondi : `6,20 €` devient `7 €`.

## Ordre de calcul
1. Partir de `vinted_price`.
2. Ajouter commission et transaction configurées.
3. Ajouter `price_inflation`.
4. Sous `5 €`, arrondir au-dessus au `0,50 €`; sinon au `1 €`.
5. Proposer le résultat dans `ebay_price`, modifiable avant sauvegarde.

## Plan technique
- Migration additive des trois champs carte et des deux taux vendeur eBay.
- Reprise `vinted_price = price`, sans supprimer `price` pour préserver le rollback.
- Extension des contrats cartes/réglages et validation des taux entre 0 et 100.
- Édition des taux dans les réglages eBay et des trois prix dans la fiche carte.
- Utilitaire pur testé, sans formule dans les composants.
- Publication eBay sur `ebay_price`, avec repli sur `price` pendant la transition.
- Tests frontend, build TypeScript et compilation backend.
- Rollback : ancien code compatible grâce au maintien de `price`.

## Tâches
1. Migration et reprise des données.
2. Contrats backend et réglages eBay.
3. Fonction pure et tests.
4. UI de configuration des taux.
5. UI carte et recalcul explicite.
6. Publication eBay, vérifications et convergence.

## Convergence
- Fait : migration, persistance, reprise de `price`, configuration des taux, calcul testé, édition/recalcul carte et publication eBay.
- Divergence : aucune sur le besoin validé.
- Reste avant production : appliquer la migration puis déployer backend/frontend avec les contrôles prod prévus.
