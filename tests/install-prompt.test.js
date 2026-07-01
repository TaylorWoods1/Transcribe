import { describe, it, expect } from 'vitest';
import {
  getInstallSteps,
  requiresPwaInstall,
} from '../js/install-prompt.js';

describe('install-prompt', () => {
  it('returns iOS-specific steps', () => {
    const steps = getInstallSteps(true);
    expect(steps[0].title).toBe('Tap Share');
    expect(steps[1].title).toContain('Home Screen');
  });

  it('returns Android steps for non-iOS', () => {
    const steps = getInstallSteps(false);
    expect(steps[0].title).toContain('menu');
  });

  it('does not require install when already standalone', () => {
    expect(requiresPwaInstall({ isStandalone: true, isIOS: true })).toBe(false);
  });

  it('requires install on iOS browser', () => {
    expect(requiresPwaInstall({ isStandalone: false, isIOS: true })).toBe(true);
  });

  it('requires install on Android browser', () => {
    expect(requiresPwaInstall({ isStandalone: false, platform: 'android' })).toBe(true);
  });

  it('does not require install on desktop browser', () => {
    expect(requiresPwaInstall({ isStandalone: false, isIOS: false, platform: 'desktop' })).toBe(
      false
    );
  });
});
