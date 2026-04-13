import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import type { AIIdentificationResult } from '../types';

interface IdentifyPayload {
  front_base64: string;
  back_base64: string;
}

async function fileToBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  // Strip the data: prefix — backend expects raw base64
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) throw new Error('Invalid data URL');
  return match[1];
}

export function useIdentify() {
  return useMutation({
    mutationFn: async ({ frontFile, backFile }: { frontFile: File; backFile: File }) => {
      const [front_base64, back_base64] = await Promise.all([
        fileToBase64(frontFile),
        fileToBase64(backFile),
      ]);
      const payload: IdentifyPayload = { front_base64, back_base64 };
      return apiFetch<AIIdentificationResult>('/identify', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
  });
}
