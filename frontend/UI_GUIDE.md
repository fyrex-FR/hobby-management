# Guide UI CardVaults

Référence visuelle : `src/components/views/CollectionView.tsx`, `src/components/shared/CollectionFilterBar.tsx` et `src/App.tsx` (shell). Le reste de l'app doit leur ressembler.

## Principes
- Sobre, dense, lisible. Thème sombre, un seul accent (or `--accent`), utilisé pour l'action principale, l'état actif et les prix. Pas de dégradés décoratifs, de halos (`blur-2xl`), de glassmorphism ni d'ombres colorées.
- La hiérarchie vient de la taille et de la graisse du texte, pas des majuscules espacées. Pas de `font-black`, pas de `uppercase tracking-widest` (tolérés seulement pour de très courts libellés de section en `text-[11px] font-medium uppercase tracking-wider`).
- Animations discrètes : pas de `whileHover={{ y: -4 }}`, pas de `scale-110` au survol, pas d'apparitions en cascade. `active:scale-95` est inutile.

## Tokens (index.css)
- Surfaces : `--bg-primary` (fond page) < `--bg-secondary` (sidebar, en-têtes de tableau) < `--bg-card` (cartes, modales) < `--bg-elevated` (champs, boutons) < `--bg-hover`.
- Texte : `--text-primary`, `--text-secondary`, `--text-muted`. Jamais `text-white/40` et autres opacités arbitraires : utiliser les tokens.
- Sémantique : `--accent`, `--green` (succès, vendu), `--red` (erreur, suppression), `--blue` (info, réservé). Sur fond accent, le texte est `--on-accent`.
- Bordures : `--border` (par défaut), `--border-strong` (popover, contrôle survolé), `--border-accent`.

## Échelle
- Texte : 11px (métadonnées minimes) · 12px `text-xs` (secondaire) · 13px `text-[13px]` (corps, boutons, champs) · 14px `text-sm` (titres de panneau, noms) · 15px (titre de modale) · 20px `text-xl` (titre de page) · 24px `text-2xl` (chiffres clés). Rien sous 10px.
- Graisse : 400 / 500 `font-medium` / 600 `font-semibold`. 700+ interdit sauf le logo.
- Rayons : 6px `rounded-md` (pastilles), 10px `rounded-lg` (contrôles), 12px `rounded-xl` (cartes, panneaux), 16px `rounded-2xl` (modales uniquement). Jamais `rounded-3xl`, `rounded-[2rem]`, `rounded-[32px]`...
- Espacements : grilles `gap-3`/`gap-4`, panneaux `p-4`, page `space-y-6`.
- Chiffres (prix, compteurs) : classe `tabular`. Prix formatés `fr-FR` (« 1 234 € »).

## Classes
| Besoin | Classe |
|---|---|
| Bouton standard | `ui-btn` (+ `ui-btn-sm`, `ui-btn-lg`, `ui-btn-icon`) |
| Action principale | `ui-btn ui-btn-primary` (une seule par zone) |
| Bouton discret | `ui-btn ui-btn-ghost` |
| Suppression | `ui-btn ui-btn-danger` |
| Validation (vert) | `ui-btn ui-btn-success` |
| État actif d'un bouton | `data-active={true}` |
| Filtre / pastille cliquable | `ui-chip` + `data-active` |
| Onglets | `ui-segmented` (boutons enfants + `data-active`) |
| Champs | `ui-input`, `ui-select`, `ui-textarea` |
| Surface | `ui-card` |
| Menu déroulant | `popover-surface` + `ui-menu-item` / `ui-menu-label` (ou `<Popover>`) |

## Composants (`src/components/ui`)
`Page`, `PageHeader`, `Panel`, `StatTile`, `EmptyState`, `Spinner`, `Field`, `Notice`, `Badge`, `Modal`.
- Toute modale passe par `<Modal title subtitle icon size footer onClose dismissible>` : centrée sur desktop, feuille en bas sur mobile, Échap et fond pour fermer, pied collé en bas avec les actions (secondaire à gauche de la principale).
- Toute vue commence par `<Page>` + `<PageHeader>`. Sur mobile, le titre de page est masqué (il est déjà dans la barre du haut).
- Les `alert()` / `confirm()` existants peuvent rester (hors périmètre), mais les messages inline passent par `<Notice>`.

## Responsive
- Mobile d'abord : pas de scroll horizontal de page, cibles tactiles ≥ 36px. Une barre d'onglets fixe occupe le bas de l'écran (3.5rem + safe area) : rien d'important ne doit y être caché (le conteneur de vue a déjà le padding).
- Les tableaux larges deviennent des listes sur mobile, ou défilent dans leur propre conteneur `overflow-x-auto`.
