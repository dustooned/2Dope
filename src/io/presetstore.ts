import { readPreset, type Preset } from '../core/presets';

export interface PresetStore { list(): Promise<Preset[]>; put(preset: Preset, replace?: boolean): Promise<void>; remove(id: string): Promise<void> }
export class DevicePresetStore implements PresetStore {
  constructor(private database = '2dope-presets') {}
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => { const req = indexedDB.open(this.database, 1); req.onupgradeneeded = () => req.result.createObjectStore('presets', { keyPath: 'id' }); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); req.onblocked = () => reject(new Error('Close other preset-library tabs and try again.')); });
  }
  async list(): Promise<Preset[]> {
    const db = await this.open(); try { return await new Promise((resolve, reject) => { const req = db.transaction('presets').objectStore('presets').getAll(); req.onsuccess = () => { try { resolve(req.result.map(readPreset)); } catch (e) { reject(e); } }; req.onerror = () => reject(req.error); }); } finally { db.close(); }
  }
  async put(input: Preset, replace = false): Promise<void> {
    const preset = readPreset(input), db = await this.open();
    try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('presets', 'readwrite'), store = tx.objectStore('presets'), req = store.getAll();
      req.onsuccess = () => { try {
        const records = req.result.map(readPreset), old = records.find(p => p.id === preset.id);
        if (old && !replace) throw new Error('This preset exists. Choose Replace or save a copy.');
        if (replace && !old) throw new Error('This preset was removed. Save a new copy.');
        if (records.some(p => p.id !== preset.id && p.kind === preset.kind && p.name.toLocaleLowerCase() === preset.name.toLocaleLowerCase())) throw new Error('A preset with this name already exists.');
        if (!old && records.filter(p => p.kind === preset.kind).length >= 40) throw new Error('Keep at most 40 saved presets of each type.'); store.put(preset);
      } catch (e) { tx.abort(); reject(e); } };
      tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Preset storage is unavailable.'));
    }); } finally { db.close(); }
  }
  async remove(id: string): Promise<void> { const db = await this.open(); try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('presets', 'readwrite'); tx.objectStore('presets').delete(id); tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Preset storage is unavailable.')); }); } finally { db.close(); } }
}
