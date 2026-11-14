/** Plans a batch of picked images for My Assets from file metadata only (no bytes are opened here). */
export const PACK_LIMITS = {
  files: 50,
  bytes: 100 * 1024 * 1024,
  side: 8192,
  pixels: 40_000_000,
  archives: 200 * 1024 * 1024,
  name: 80,
} as const;

export interface PackFile { name: string; type: string; size: number }
export interface PackItem { index: number; name: string }
export interface PackSkip { index: number; file: string; reason: 'unsupported' }
export interface PackPlan { collection: string; items: PackItem[]; skipped: PackSkip[]; total: number }

export const PACK_ACCEPT = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';

export function isPackImage(name: string, type: string): boolean {
  if (/\.(png|jpe?g|webp)$/i.test(name)) return true;
  return !/\.[^.]+$/.test(name) && ['image/png', 'image/jpeg', 'image/webp'].includes(type);
}

export function packCollection(value: string): string { return value.trim().slice(0, PACK_LIMITS.name); }

/** The filename without its extension, trimmed to the card-name limit. */
export function packBaseName(file: string): string {
  return file.replace(/\.[^./\\]+$/, '').trim().slice(0, PACK_LIMITS.name).trim() || 'Image';
}

const key = (name: string) => name.normalize('NFKC').toLocaleLowerCase();

/** `name`, or `name (2)`, `name (3)`… so no two cards in the collection share a name. */
export function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(key(base))) return base;
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`, name = `${base.slice(0, PACK_LIMITS.name - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(key(name))) return name;
  }
}

/**
 * Throws, before anything is written, when the batch has more than 50 images or 100 MiB of them.
 * Unsupported files are listed as skipped. Names are unique within the collection, counting cards
 * already saved there.
 */
export function planPackImport(files: readonly PackFile[], collection: string, existing: readonly { name: string; collection?: string }[]): PackPlan {
  const target = packCollection(collection);
  const taken = new Set(existing.filter(c => (c.collection ?? '') === target).map(c => key(c.name)));
  const items: PackItem[] = [], skipped: PackSkip[] = [];
  let bytes = 0;
  files.forEach((f, index) => {
    if (!isPackImage(f.name, f.type)) { skipped.push({ index, file: f.name, reason: 'unsupported' }); return; }
    bytes += f.size;
    items.push({ index, name: '' });
  });
  if (!items.length) throw new Error('Choose PNG, JPG or WebP images to import.');
  if (items.length > PACK_LIMITS.files) throw new Error(`Choose up to ${PACK_LIMITS.files} images at a time. This selection has ${items.length}.`);
  if (bytes > PACK_LIMITS.bytes) throw new Error(`Choose up to 100 MB of images at a time. This selection is ${Math.ceil(bytes / 1024 / 1024)} MB.`);
  for (const item of items) { item.name = uniqueName(packBaseName(files[item.index]!.name), taken); taken.add(key(item.name)); }
  return { collection: target, items, skipped, total: files.length };
}

/** Fits an image inside the canvas at native pixels, scaling down only. */
export function packPlacement(w: number, h: number, canvasW: number, canvasH: number): { x: number; y: number; w: number; h: number } {
  const k = Math.min(1, canvasW / w, canvasH / h), dw = Math.max(1, Math.round(w * k)), dh = Math.max(1, Math.round(h * k));
  return { x: Math.round((canvasW - dw) / 2), y: Math.round((canvasH - dh) / 2), w: dw, h: dh };
}

export function packImageTooLarge(w: number, h: number): boolean {
  return w > PACK_LIMITS.side || h > PACK_LIMITS.side || w * h > PACK_LIMITS.pixels;
}

export interface PackOutcome { added: number; unreadable: number; tooLarge: number; unsupported: number; stop?: 'cancel' | 'storage' | 'budget' }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function packSummary(o: PackOutcome, total: number, collection: string): string {
  const parts = [`Added ${o.added} of ${plural(total, 'image')} to ${collection || 'Unfiled'}.`];
  if (o.unreadable) parts.push(`Skipped ${plural(o.unreadable, 'unreadable image')}.`);
  if (o.tooLarge) parts.push(`Skipped ${plural(o.tooLarge, 'image')} over 8192 px or 40 megapixels.`);
  if (o.unsupported) parts.push(`Skipped ${plural(o.unsupported, 'file')} that ${o.unsupported === 1 ? 'is' : 'are'} not PNG, JPG or WebP.`);
  if (o.stop === 'cancel') parts.push('Import cancelled; the cards already added stay.');
  if (o.stop === 'storage') parts.push(`Storage is full after ${plural(o.added, 'card')}.`);
  if (o.stop === 'budget') parts.push('Stopped at the 200 MB limit for one batch. Import the rest as another batch.');
  return parts.join(' ');
}
