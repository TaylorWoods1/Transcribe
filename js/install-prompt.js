/**
 * Browser-only overlay teaching users how to install Tiger as a home-screen PWA.
 */
import { CONFIG } from '../config.js';
import { STORAGE_KEYS } from './lib/storage-keys.js';
import { escapeHtml } from './lib/utils.js';

/**
 * @param {boolean} isIOS
 * @returns {Array<{title: string, detail: string, icon: string}>}
 */
export function getInstallSteps(isIOS) {
  if (isIOS) {
    return [
      {
        icon: 'share',
        title: 'Tap Share',
        detail: 'In Safari, tap the Share button at the bottom of the screen.',
      },
      {
        icon: 'add',
        title: 'Add to Home Screen',
        detail: 'Scroll the menu and choose “Add to Home Screen”.',
      },
      {
        icon: 'home',
        title: 'Open Tiger from your Home Screen',
        detail: 'Launch the app from the new icon for Whisper and offline use.',
      },
    ];
  }

  return [
    {
      icon: 'menu',
      title: 'Open the browser menu',
      detail: 'Tap the menu (⋮) in Chrome or your browser toolbar.',
    },
    {
      icon: 'install',
      title: 'Install or add to Home Screen',
      detail: 'Choose “Install app” or “Add to Home screen”.',
    },
    {
      icon: 'home',
      title: 'Open Tiger from your Home Screen',
      detail: 'Use the installed app for the best recording experience.',
    },
  ];
}

/**
 * @param {{ isStandalone: boolean }} caps
 * @param {Storage} [storage]
 * @returns {boolean}
 */
export function shouldShowInstallPrompt(caps, storage = localStorage) {
  if (caps.isStandalone) return false;
  return storage.getItem(STORAGE_KEYS.INSTALL_PROMPT_DISMISSED) !== '1';
}

/**
 * @param {boolean} isIOS
 * @returns {string}
 */
export function renderInstallPromptHtml(isIOS) {
  const steps = getInstallSteps(isIOS);
  const platform = isIOS ? 'ios' : 'android';
  const stepsHtml = steps
    .map(
      (step, index) => `
      <li class="install-step" data-step="${index}" style="--step-index: ${index}">
        <span class="install-step-icon install-step-icon-${step.icon}" aria-hidden="true"></span>
        <div>
          <strong>${escapeHtml(step.title)}</strong>
          <p>${escapeHtml(step.detail)}</p>
        </div>
      </li>`
    )
    .join('');

  return `
    <div class="install-prompt" id="install-prompt" role="dialog" aria-modal="true" aria-labelledby="install-prompt-title">
      <button type="button" class="install-prompt-backdrop" aria-label="Close install guide"></button>
      <div class="install-prompt-card">
        <div class="install-demo install-demo-${platform}" aria-hidden="true">
          <div class="install-phone">
            <div class="install-phone-screen">
              <div class="install-phone-header">${escapeHtml(CONFIG.appName)}</div>
              <div class="install-phone-body">
                <span class="install-phone-pulse"></span>
              </div>
              ${
                isIOS
                  ? `<div class="install-phone-toolbar">
                      <span class="install-phone-tool"></span>
                      <span class="install-phone-tool install-phone-tool-share">
                        <span class="install-share-icon"></span>
                        <span class="install-pointer" aria-hidden="true"></span>
                      </span>
                      <span class="install-phone-tool"></span>
                    </div>`
                  : `<div class="install-phone-toolbar install-phone-toolbar-android">
                      <span class="install-android-menu">
                        <span class="install-pointer install-pointer-menu" aria-hidden="true"></span>
                      </span>
                    </div>`
              }
            </div>
          </div>
          <div class="install-step-dots">
            ${steps.map((_, i) => `<span class="install-step-dot" data-dot="${i}"></span>`).join('')}
          </div>
        </div>
        <h2 id="install-prompt-title">Install ${escapeHtml(CONFIG.appName)} on your device</h2>
        <p class="install-prompt-lead">
          Tiger works best as an installed app — especially for iPhone Whisper transcription and offline sessions.
        </p>
        <ol class="install-steps install-steps-${platform}">
          ${stepsHtml}
        </ol>
        <div class="install-prompt-actions">
          <button type="button" class="btn btn-primary" id="install-prompt-got-it">Got it</button>
          <button type="button" class="btn btn-secondary" id="install-prompt-dismiss">Don't show again</button>
        </div>
      </div>
    </div>`;
}

/**
 * @param {{ isIOS: boolean, isStandalone: boolean }} caps
 * @param {{ onDismiss?: (permanent: boolean) => void }} [options]
 * @returns {(() => void)|null} cleanup
 */
export function mountInstallPrompt(caps, options = {}) {
  if (!shouldShowInstallPrompt(caps)) return null;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderInstallPromptHtml(caps.isIOS);
  const root = wrapper.firstElementChild;
  if (!root) return null;

  document.body.appendChild(root);
  requestAnimationFrame(() => root.classList.add('visible'));

  const close = (permanent) => {
    root.classList.remove('visible');
    setTimeout(() => root.remove(), 280);
    if (permanent) {
      localStorage.setItem(STORAGE_KEYS.INSTALL_PROMPT_DISMISSED, '1');
    }
    options.onDismiss?.(permanent);
  };

  root.querySelector('#install-prompt-got-it')?.addEventListener('click', () => close(false));
  root.querySelector('#install-prompt-dismiss')?.addEventListener('click', () => close(true));
  root.querySelector('.install-prompt-backdrop')?.addEventListener('click', () => close(false));

  return () => close(false);
}
