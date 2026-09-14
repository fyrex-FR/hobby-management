export function formatVintedNumberedBadge(numbered: string | null | undefined): string {
  const value = (numbered ?? '').trim();
  if (!value) return '';
  return `NUMÉROTÉE ${value.includes('/') ? value : `/${value}`}`;
}

export async function addVintedNumberedBadge(dataUrl: string, numbered: string): Promise<string> {
  const label = formatVintedNumberedBadge(numbered);
  if (!label) return dataUrl;

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) return resolve(dataUrl);

      context.drawImage(image, 0, 0);
      const margin = Math.max(16, Math.round(canvas.width * 0.035));
      const fontSize = Math.max(24, Math.round(canvas.width * 0.055));
      const paddingX = Math.round(fontSize * 0.65);
      const paddingY = Math.round(fontSize * 0.45);
      context.font = `900 ${fontSize}px system-ui, sans-serif`;
      const badgeWidth = Math.ceil(context.measureText(label).width + paddingX * 2);
      const badgeHeight = Math.ceil(fontSize + paddingY * 2);
      const x = Math.max(margin, canvas.width - badgeWidth - margin);
      const y = margin;
      const radius = Math.round(badgeHeight * 0.24);

      context.fillStyle = 'rgba(9, 9, 11, 0.88)';
      context.beginPath();
      context.roundRect(x, y, badgeWidth, badgeHeight, radius);
      context.fill();
      context.fillStyle = '#f5c542';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(label, x + badgeWidth / 2, y + badgeHeight / 2 + fontSize * 0.03);

      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

export async function prepareVintedPhotos(
  photos: string[],
  numbered: string | null | undefined,
  annotate: (photo: string, value: string) => Promise<string> = addVintedNumberedBadge,
): Promise<string[]> {
  const value = (numbered ?? '').trim();
  if (!value || photos.length === 0) return photos;
  const firstPhoto = await annotate(photos[0], value);
  return [firstPhoto, ...photos.slice(1)];
}
