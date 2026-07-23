import { cdnImg } from './cdn';

/**
 * Télécharge une image hébergée sur R2 en passant par le proxy /cdn/ (contournement CORS),
 * puis déclenche le téléchargement du fichier via une ancre a[download] temporaire.
 */
export async function downloadImage(url: string, filename: string): Promise<void> {
  const proxied = cdnImg(url) || url;
  const res = await fetch(proxied);
  if (!res.ok) throw new Error('Téléchargement impossible');
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
