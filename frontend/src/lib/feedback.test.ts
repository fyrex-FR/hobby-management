import { describe, expect, it } from 'vitest';
import { confirmDialog, promptDialog, toast, useFeedback } from './feedback';

describe('feedback', () => {
  it('résout confirmDialog avec le choix de l\'utilisateur', async () => {
    const p = confirmDialog({ title: 'Supprimer ?', danger: true });
    const d = useFeedback.getState().dialog;
    expect(d?.kind).toBe('confirm');
    if (d?.kind === 'confirm') {
      expect(d.confirmLabel).toBe('Supprimer');
      d.resolve(true);
    }
    await expect(p).resolves.toBe(true);
  });

  it('annule la boîte précédente quand une nouvelle s\'ouvre', async () => {
    const first = promptDialog({ title: 'Prix' });
    const second = confirmDialog({ title: 'Autre' });
    await expect(first).resolves.toBeNull();
    const d = useFeedback.getState().dialog;
    if (d?.kind === 'confirm') d.resolve(false);
    await expect(second).resolves.toBe(false);
  });

  it('garde au plus 4 toasts, avec un délai plus long quand il y a une action', () => {
    for (let i = 0; i < 6; i++) toast(`t${i}`);
    toast('Supprimée', { action: { label: 'Annuler', onClick: () => {} } });
    const { toasts } = useFeedback.getState();
    expect(toasts).toHaveLength(4);
    expect(toasts.at(-1)?.duration).toBe(6000);
  });
});
