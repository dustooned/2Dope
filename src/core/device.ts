/**
 * One device profile decides what the app asks of the hardware. It drives both the phone layout
 * and the low-memory ("Lite") mode for weak tablets, so a student on an old iPad and someone on a
 * phone get the same lighter app: smaller pages, fewer drawings kept in memory, fewer onion skins,
 * a shorter undo list and a lower-resolution screen canvas. Nothing is taken away from a project:
 * a big project still opens in Lite, it just warns.
 *
 * Detection is a best guess from what browsers expose (screen size, pointer, memory and cores
 * where available, iPad model class from its screen). The user can always override it.
 */

export type Form = 'phone' | 'tablet' | 'desktop';
export type Tier = 'low' | 'normal' | 'high';
/** The user's choice: follow detection, or force one. */
export type DeviceMode = 'auto' | 'lite' | 'full';

/** What the browser tells us (plain data, so detection can be tested). */
export interface DeviceInfo {
  /** Screen sides in CSS px. */
  minSide: number;
  maxSide: number;
  /** A finger is the main pointer. */
  coarse: boolean;
  touchPoints: number;
  /** navigator.deviceMemory (GB, rounded down by the browser), when exposed. */
  memoryGB?: number;
  /** navigator.hardwareConcurrency, when exposed. */
  cores?: number;
  /** navigator.userAgentData.mobile, when exposed. */
  mobileHint?: boolean;
  /** iPhone / iPad (including iPads that report a Mac). */
  ios: boolean;
  dpr: number;
}

export interface Limits {
  /** Largest short side offered for a new page (720 = 1280×720 wide). */
  maxShort: number;
  /** Largest page area (px) for custom sizes. */
  maxPixels: number;
  /** Canvas memory the residency manager may keep live (bytes). */
  budget: number;
  /** Most onion skins per side. */
  onionMax: number;
  /** Undo steps kept. */
  undoDepth: number;
  /** Cap on the screen canvas's pixel ratio (1 = one canvas pixel per CSS px). */
  maxDpr: number;
}

export interface Profile {
  form: Form;
  tier: Tier;
  mode: DeviceMode;
  /** The lighter app is on. */
  lite: boolean;
  limits: Limits;
  /** Why, in plain words (shown in Settings). */
  reasons: string[];
}

const MB = 1024 * 1024;

export function detectForm(i: DeviceInfo): Form {
  // a finger as the MAIN pointer (a touchscreen laptop still has a trackpad, so it stays desktop)
  const finger = i.coarse || (i.ios && i.touchPoints > 1);
  if (i.mobileHint === true || (finger && i.minSide < 600)) return 'phone';
  if (finger) return 'tablet';
  return 'desktop';
}

export function detectTier(i: DeviceInfo, form: Form): { tier: Tier; why: string[] } {
  const why: string[] = [];
  if (i.memoryGB !== undefined && i.memoryGB <= 2) why.push(`${i.memoryGB} GB memory`);
  if (i.cores !== undefined && i.cores <= 2 && !i.ios) why.push(`${i.cores} processor cores`);
  // iOS hides memory: iPads with a 1024×768 screen (iPad 5th/6th gen, Air 2, mini 4/5) have 2–3 GB
  if (i.ios && form === 'tablet' && i.minSide <= 768) why.push('an older iPad screen size');
  if (i.ios && form === 'phone' && i.maxSide <= 667) why.push('an older iPhone screen size');
  if (why.length) return { tier: 'low', why };
  if (form === 'desktop' && (i.memoryGB ?? 0) >= 8 && (i.cores ?? 0) >= 8) return { tier: 'high', why: [] };
  return { tier: 'normal', why: [] };
}

/** What each profile may use. Lite on a low tier is the strictest. */
export function limitsFor(tier: Tier, lite: boolean, ios: boolean): Limits {
  if (lite && tier === 'low') return { maxShort: 720, maxPixels: 1280 * 720, budget: 120 * MB, onionMax: 2, undoDepth: 40, maxDpr: 1 };
  if (lite) return { maxShort: 1080, maxPixels: 1920 * 1080, budget: 200 * MB, onionMax: 3, undoDepth: 80, maxDpr: 2 };
  if (ios) return { maxShort: 1440, maxPixels: 4096 * 4096, budget: 200 * MB, onionMax: 5, undoDepth: 200, maxDpr: 3 };
  if (tier === 'high') return { maxShort: 1440, maxPixels: 4096 * 4096, budget: 900 * MB, onionMax: 5, undoDepth: 200, maxDpr: 3 };
  if (tier === 'low') return { maxShort: 1080, maxPixels: 4096 * 4096, budget: 300 * MB, onionMax: 5, undoDepth: 120, maxDpr: 2 };
  return { maxShort: 1440, maxPixels: 4096 * 4096, budget: 300 * MB, onionMax: 5, undoDepth: 200, maxDpr: 3 };
}

export function profileFor(i: DeviceInfo, mode: DeviceMode = 'auto'): Profile {
  const form = detectForm(i);
  const { tier, why } = detectTier(i, form);
  const auto = form === 'phone' || tier === 'low';
  const lite = mode === 'lite' || (mode === 'auto' && auto);
  const reasons: string[] = [];
  if (mode === 'lite') reasons.push('you chose Lite');
  else if (mode === 'full') reasons.push('you chose Full');
  else if (form === 'phone') reasons.push('this looks like a phone');
  if (mode === 'auto' && why.length) reasons.push(`this device has ${why.join(' and ')}`);
  if (mode === 'auto' && !auto) reasons.push(`detected a ${form}`);
  return { form, tier, mode, lite, limits: limitsFor(tier, lite, i.ios), reasons };
}

/** Read what this browser exposes. */
export function readDevice(): DeviceInfo {
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } };
  const w = screen.width || window.innerWidth;
  const h = screen.height || window.innerHeight;
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  return {
    minSide: Math.min(w, h),
    maxSide: Math.max(w, h),
    coarse: matchMedia?.('(pointer: coarse)').matches ?? false,
    touchPoints: nav.maxTouchPoints || 0,
    memoryGB: nav.deviceMemory,
    cores: nav.hardwareConcurrency || undefined,
    mobileHint: nav.userAgentData?.mobile,
    ios,
    dpr: window.devicePixelRatio || 1,
  };
}

const MODE_KEY = '2dope.device';

export function loadMode(): DeviceMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === 'lite' || v === 'full') return v;
  } catch {
    // storage unavailable
  }
  return 'auto';
}

export function saveMode(m: DeviceMode): void {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    // not persisted: fine
  }
}

/** This device's profile with the saved choice (read once at start). */
export function currentProfile(): Profile {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return profileFor({ minSide: 1080, maxSide: 1920, coarse: false, touchPoints: 0, ios: false, dpr: 1 }, 'auto');
  return profileFor(readDevice(), loadMode());
}
