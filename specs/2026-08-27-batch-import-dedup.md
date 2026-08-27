# Sas d’import batch avec détection de doublons

## 1. Besoin

- Un utilisateur photographie un lot de cartes, avec recto et verso quand disponible.
- Les photos et l’identification entrent dans un sas persistant, sans créer de carte dans la collection.
- Chaque item est comparé à la collection par ses attributs normalisés ; l’image n’est qu’un signal secondaire.
- Le classement doit distinguer match très probable, doublon probable, nouvelle carte et identification insuffisante.
- La revue montre la nouvelle photo, les meilleurs candidats, le score et les raisons.
- L’utilisateur choisit ensuite : mettre de côté, créer, ajouter un exemplaire, ignorer ou revoir plus tard.
- Une carte ou une photo n’est jamais supprimée automatiquement.
- Deux exemplaires numérotés avec des numéros de série distincts ne sont jamais proposés comme doublons.
- Le traitement doit rester reprenable et fluide sur un lot important.
- Hors périmètre : reconnaissance biométrique d’image, suppression automatique et traitement parallèle non borné des appels Gemini.

## 2. Clarifications retenues

- Un verso manquant est accepté ; l’item sera pénalisé et pourra finir en « identification insuffisante ».
- Le numéro de série individuel (`23/99`) sera séparé du tirage (`/99`) dans un nouveau champ `serial_number`.
- Le sas est persistant en Supabase et les images sont stockées dans R2 sous un préfixe d’import ; cela permet de reprendre une revue après fermeture du navigateur.

## 3. Plan technique

1. Ajouter une migration additive `import_batches`, `import_items`, `cards.serial_number` et une RPC atomique d’incrément de quantité, avec RLS propriétaire et aucun delete automatique.
2. Étendre l’identification Gemini pour accepter un verso optionnel et retourner `serial_number`, sans modifier le contrat des champs existants.
3. Créer `backend/services/card_matching.py` : normalisation/fingerprint, exclusions fortes sur serial, score pondéré (verso/card number prioritaires), raisons et seuils conservateurs.
4. Ajouter `backend/routers/imports.py` : créer/lister/reprendre un batch, uploader un item vers R2, identifier+matcher, lire la revue et appliquer une action idempotente.
5. Limiter le traitement à un appel Gemini à la fois côté UI, avec reprise par item et erreurs isolées ; le backend recalcule toujours le matching depuis les cartes de l’utilisateur.
6. Refaire `BatchView` en sas (création et progression) et ajouter une revue dédiée : photo importée à gauche, trois matchs à droite, score, raisons et navigation clavier.
7. Les actions `shelve/ignore/review` ne touchent pas la collection ; `create` crée la carte depuis l’item ; `increment` augmente atomiquement `quantity` sur la cible choisie.
8. Déplacer la logique de doublon de `cardSimilarity.ts` vers le backend ; conserver seulement les helpers UI non métier encore utilisés par `ReviewView`.
9. Ajouter des tests unitaires du matching (exact, champs absents, serial distinct, parallel/insert, seuils) et des tests Vitest des transformations UI utiles.
10. Vérifier `python -m unittest`, `python -m compileall backend`, `npm test`, `npm run lint` et `npm run build`.
11. Déploiement : appliquer d’abord la migration Supabase, puis pousser `main`; vérifier Coolify, Cloudflare, `/api/health` et un batch réel non destructif.
12. Rollback : frontend/backend compatibles sans utiliser les nouvelles tables tant que la vue n’est pas ouverte ; revert du code possible, migration additive conservée.

Alternative écartée : sas uniquement en mémoire navigateur, car il perd le lot à la fermeture et rend les actions/reprises non fiables.

## 4. Tâches vérifiables

1. Schéma : migration rejouable et tables/policies/RPC présentes dans une base de test ou validées par inspection SQL.
2. Matching : cas exact classé high, cas ambigu medium, identité faible insufficient et serials différents exclus, tests verts.
3. API : un item peut être créé, identifié, relu et recevoir chaque action sans création implicite ni suppression.
4. Upload : recto requis, verso optionnel, objets R2 conservés après toutes les actions.
5. UI batch : progression, reprise, compteurs par classe et erreurs unitaires visibles sur un lot.
6. UI revue : meilleurs matchs, raisons, score et cinq actions accessibles sans revenir à la liste.
7. Convergence : relire l’implémentation contre ce document, consigner toute divergence et exécuter toute la vérification locale.

## 5. Implémentation

- Migration additive créée dans `backend/import_batches_migration.sql`.
- Matching explicable centralisé dans `backend/services/card_matching.py`, avec exclusion stricte des serials différents.
- API persistante créée dans `backend/routers/imports.py` : lots, analyse, reprise, retry et actions idempotentes.
- Gemini accepte désormais un verso optionnel et extrait séparément `serial_number` et `numbered`.
- `BatchView` ne crée plus de brouillons : il crée le sas, traite séquentiellement et ouvre la revue.
- `ImportReviewView` affiche les photos, trois candidats, scores/raisons/conflits et les cinq décisions.
- Tests unitaires du matching ajoutés dans `backend/tests/test_card_matching.py`.

## 6. Convergence

- Fait : sas persistant, photos conservées, front-only possible, matching déterministe, quatre classifications, revue explicable et actions sans suppression.
- Fait : l’action `increment` utilise une RPC atomique ; `create` ne se produit qu’après clic explicite.
- Fait : un item en erreur reste dans le sas et peut être relancé depuis ses images R2.
- Vérifications : 5 tests backend OK, 4 tests frontend existants OK, compile backend OK, build frontend OK, lint ciblé OK.
- Divergence : le lint global reste rouge sur 42 erreurs préexistantes hors fichiers touchés ; aucune n’est introduite par cette feature.
- Reste : appliquer la migration Supabase puis déployer après validation humaine distincte, et effectuer un test réel sur un petit lot.
