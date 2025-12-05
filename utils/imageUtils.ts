
export const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
          const img = new Image();
          img.src = event.target?.result as string;
          img.onload = () => {
              const canvas = document.createElement('canvas');
              // Max width 800px is sufficient for mobile reference and thumbnails
              const maxWidth = 800;
              let width = img.width;
              let height = img.height;

              if (width > maxWidth) {
                  height = Math.round((height * maxWidth) / width);
                  width = maxWidth;
              }

              canvas.width = width;
              canvas.height = height;
              
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                  reject("Canvas context failed");
                  return;
              }
              
              ctx.drawImage(img, 0, 0, width, height);
              
              // Compress to JPEG at 0.6 quality (High compression)
              // This typically results in <100KB files, suitable for LocalStorage and Firestore
              const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
              resolve(compressedBase64);
          };
          img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
  });
};
