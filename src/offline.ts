/** Offline support: registers the service worker, tracks "ready offline", and holds the install prompt. */

type InstallPrompt = Event & { prompt(): Promise<unknown>; userChoice: Promise<{ outcome: string }> };

export type OfflineState = 'ready' | 'preparing' | 'unavailable';

let installEvent: InstallPrompt | null = null;
let state: OfflineState = 'unavailable';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export const offlineState = (): OfflineState => state;
export const canInstall = (): boolean => installEvent !== null;
export const isInstalled = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const updateListeners = new Set<() => void>();
/** Runs when a newer version has taken over from the one this page loaded (reload to finish updating). */
export function onUpdateReady(f: () => void): void {
  updateListeners.add(f);
}
export function onOfflineChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Show the browser's own install prompt (Chrome, Edge). Resolves true if the student accepted. */
export async function install(): Promise<boolean> {
  if (!installEvent) return false;
  await installEvent.prompt();
  const { outcome } = await installEvent.userChoice;
  installEvent = null;
  emit();
  return outcome === 'accepted';
}

export function registerOffline(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as InstallPrompt;
    emit();
  });
  window.addEventListener('appinstalled', () => { installEvent = null; emit(); });
  // Only in a built app, and only where browsers allow it (https or localhost).
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  state = 'preparing';
  // A new worker deletes the old cache, so this page's lazy pieces would be gone: ask for a reload.
  const hadWorker = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadWorker) updateListeners.forEach((f) => f());
  });
  navigator.serviceWorker
    .register(import.meta.env.BASE_URL + 'sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(() => { state = 'ready'; emit(); })
    .catch(() => { state = 'unavailable'; emit(); });
}
