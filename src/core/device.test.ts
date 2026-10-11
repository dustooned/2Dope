import { describe, expect, it } from 'vitest';
import { profileFor, type DeviceInfo } from './device';

const desktop: DeviceInfo = { minSide: 1080, maxSide: 1920, coarse: false, touchPoints: 0, memoryGB: 8, cores: 12, ios: false, dpr: 1 };
const touchLaptop: DeviceInfo = { ...desktop, touchPoints: 10 };
const iphone: DeviceInfo = { minSide: 390, maxSide: 844, coarse: true, touchPoints: 5, ios: true, dpr: 3 };
const oldIphone: DeviceInfo = { minSide: 375, maxSide: 667, coarse: true, touchPoints: 5, ios: true, dpr: 2 };
const androidPhone: DeviceInfo = { minSide: 412, maxSide: 915, coarse: true, touchPoints: 5, memoryGB: 4, cores: 8, mobileHint: true, ios: false, dpr: 2.6 };
const ipadPro: DeviceInfo = { minSide: 1024, maxSide: 1366, coarse: true, touchPoints: 5, ios: true, dpr: 2 };
const oldIpad: DeviceInfo = { minSide: 768, maxSide: 1024, coarse: true, touchPoints: 5, ios: true, dpr: 2 };
const chromebook: DeviceInfo = { minSide: 768, maxSide: 1366, coarse: false, touchPoints: 0, memoryGB: 2, cores: 2, ios: false, dpr: 1 };

describe('device profile', () => {
  it('a strong desktop gets the full app with a big memory budget', () => {
    const p = profileFor(desktop);
    expect([p.form, p.tier, p.lite]).toEqual(['desktop', 'high', false]);
    expect(p.limits.budget).toBe(900 * 1024 * 1024);
  });

  it('a touchscreen laptop is still a desktop', () => {
    expect(profileFor(touchLaptop).form).toBe('desktop');
  });

  it('phones get Lite automatically; older iPhones the strictest limits', () => {
    for (const d of [iphone, androidPhone]) {
      const p = profileFor(d);
      expect([p.form, p.lite]).toEqual(['phone', true]);
      expect(p.limits.maxShort).toBe(1080);
    }
    const old = profileFor(oldIphone);
    expect([old.tier, old.limits.maxShort, old.limits.maxDpr]).toEqual(['low', 720, 1]);
  });

  it('an older iPad (1024×768 screen) is low tier and gets Lite; an iPad Pro does not', () => {
    const old = profileFor(oldIpad);
    expect([old.form, old.tier, old.lite]).toEqual(['tablet', 'low', true]);
    expect(old.reasons.join(' ')).toMatch(/older iPad/);
    const pro = profileFor(ipadPro);
    expect([pro.form, pro.tier, pro.lite]).toEqual(['tablet', 'normal', false]);
    expect(pro.limits.budget).toBe(200 * 1024 * 1024); // iOS tabs are killed early
  });

  it('a 2 GB laptop gets Lite', () => {
    const p = profileFor(chromebook);
    expect([p.tier, p.lite, p.limits.onionMax]).toEqual(['low', true, 2]);
  });

  it('the user can force Lite or Full either way', () => {
    expect(profileFor(desktop, 'lite').lite).toBe(true);
    expect(profileFor(desktop, 'lite').limits.maxShort).toBe(1080);
    expect(profileFor(oldIpad, 'full').lite).toBe(false);
    expect(profileFor(oldIpad, 'full').reasons).toEqual(['you chose Full']);
  });
});
