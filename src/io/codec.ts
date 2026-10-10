import { makeCanvas } from '../brush/raster';

/** True when no pixel of the canvas has any ink (so we can skip storing the plane). */
export function isBlank(canvas: HTMLCanvasElement): boolean {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) return true;
  const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
  const px = new Uint32Array(data.buffer, data.byteOffset, data.byteLength >> 2);
  for (let i = 0; i < px.length; i++) if (px[i] !== 0) return false;
  return true;
}

/**
 * Start encoding a canvas to PNG. `toBlob` snapshots the pixels at call time, so the returned
 * promise is safe to await even if the canvas changes right after (this is how "save a version
 * before a destructive edit" works without freezing the UI).
 */
export function encodePng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('could not encode the drawing as PNG'));
        return;
      }
      blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
    }, 'image/png');
  });
}

/** Decode PNG bytes onto a canvas of the project size. */
export async function decodePngInto(canvas: HTMLCanvasElement, bytes: Uint8Array): Promise<void> {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' }));
  try {
    const g = canvas.getContext('2d');
    if (!g) throw new Error('2D canvas unavailable');
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  } finally {
    bmp.close();
  }
}

export { makeCanvas };
