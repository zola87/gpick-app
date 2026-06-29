export const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export const MAX_PRODUCT_IMAGES = 10;

export const DEFAULT_GACHA_IMAGE =
  'https://cdn.phototourl.com/free/2026-03-25-d705f2ce-ec34-4ce9-9cc9-ffcee8b972b9.jpg';

export const cropImage = (base64: string, box: [number, number, number, number]): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(base64); return; }
      const [ymin, xmin, ymax, xmax] = box;
      const left   = (xmin / 1000) * img.width;
      const top    = (ymin / 1000) * img.height;
      const width  = ((xmax - xmin) / 1000) * img.width;
      const height = ((ymax - ymin) / 1000) * img.height;
      if (width <= 0 || height <= 0) { resolve(base64); return; }
      canvas.width  = width;
      canvas.height = height;
      ctx.drawImage(img, left, top, width, height, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
};
