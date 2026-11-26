import type { CardStatus } from '../types';

/** Libellé et couleur de chaque statut, partagés par le badge et le menu de statut. */
export const STATUS_CONFIG: Record<CardStatus, { label: string; color: string }> = {
  draft:      { label: 'Brouillon',  color: 'var(--text-secondary)' },
  collection: { label: 'Collection', color: 'var(--text-secondary)' },
  a_vendre:   { label: 'À vendre',   color: 'var(--violet)' },
  reserve:    { label: 'Réservé',    color: 'var(--blue)' },
  vendu:      { label: 'Vendu',      color: 'var(--green)' },
};
