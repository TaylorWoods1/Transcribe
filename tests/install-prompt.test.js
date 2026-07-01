import { describe, it, expect } from 'vitest';
import {
  getInstallSteps,
  shouldShowInstallPrompt,
} from '../js/install-prompt.js';
import { STORAGE_KEYS } from '../js/lib/storage-keys.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
  };
}

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

  it('hides when already installed', () => {
    const storage = createMemoryStorage();
    expect(shouldShowInstallPrompt({ isStandalone: true }, storage)).toBe(false);
  });

  it('hides when dismissed permanently', () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEYS.INSTALL_PROMPT_DISMISSED, '1');
    expect(shouldShowInstallPrompt({ isStandalone: false }, storage)).toBe(false);
  });

  it('shows in browser when not dismissed', () => {
    const storage = createMemoryStorage();
    expect(shouldShowInstallPrompt({ isStandalone: false }, storage)).toBe(true);
  });
});
