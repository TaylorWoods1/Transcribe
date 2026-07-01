import { STORAGE_KEYS } from './lib/storage-keys.js';

const DISMISSED_KEY = STORAGE_KEYS.INSTALL_PROMPT_DISMISSED;
const SEEN_KEY = STORAGE_KEYS.INSTALL_PROMPT_SEEN;
const STEP_INTERVAL_MS = 2800;

function isStandaloneMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private browsing */
  }
}

function wasSeenThisSession() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function dismiss(permanent) {
  if (permanent) {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* private browsing */
    }
  }
  markSeen();
}

function getSteps(platform) {
  if (platform === 'ios') {
    return [
      {
        title: 'Tap Share',
        body: 'In Safari, tap the Share button at the bottom of the screen.',
        icon: 'share',
      },
      {
        title: 'Add to Home Screen',
        body: 'Scroll the menu and choose “Add to Home Screen”.',
        icon: 'add',
      },
      {
        title: 'Open from your icon',
        body: 'Launch Tiger from the home screen for the best experience.',
        icon: 'home',
      },
    ];
  }

  return [
    {
      title: 'Open the menu',
      body: 'Tap the browser menu (⋮) in Chrome or Edge.',
      icon: 'menu',
    },
    {
      title: 'Install app',
      body: 'Choose “Install app” or “Add to Home screen”.',
      icon: 'add',
    },
    {
      title: 'Open from your icon',
      body: 'Launch Tiger from your home screen or app drawer.',
      icon: 'home',
    },
  ];
}

function stepIconMarkup(icon) {
  if (icon === 'share') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10"/><path d="M8 7l4-4 4 4"/><rect x="5" y="11" width="14" height="10" rx="2"/></svg>';
  }
  if (icon === 'add') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>';
  }
  if (icon === 'menu') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5"/><path d="M6 10v9h12v-9"/></svg>';
}

function buildMarkup(platform) {
  const steps = getSteps(platform);
  const stepMarkup = steps
    .map(
      (step, index) => `
        <li class="install-step${index === 0 ? ' is-active' : ''}" data-step="${index}">
          <span class="install-step-icon">${stepIconMarkup(step.icon)}</span>
          <div>
            <strong>${step.title}</strong>
            <p>${step.body}</p>
          </div>
        </li>
      `
    )
    .join('');

  return `
    <div class="install-prompt-backdrop"></div>
    <div class="install-prompt-card" role="dialog" aria-modal="true" aria-labelledby="install-prompt-title">
      <button type="button" class="install-prompt-close" data-install-close aria-label="Close install guide">×</button>
      <div class="install-prompt-body">
        <div class="install-prompt-visual" aria-hidden="true">
          <div class="install-phone">
            <div class="install-phone-notch"></div>
            <div class="install-phone-screen">
              <div class="install-phone-app-icon"></div>
              <div class="install-phone-share-hint"></div>
            </div>
          </div>
          <div class="install-dots">
            <span class="install-dot is-active"></span>
            <span class="install-dot"></span>
            <span class="install-dot"></span>
          </div>
        </div>
        <div class="install-prompt-copy">
          <h2 id="install-prompt-title">Install Tiger on your device</h2>
          <p>Tiger works best as an installed app — especially for iPhone Whisper transcription and offline sessions.</p>
        </div>
        <ol class="install-steps">${stepMarkup}</ol>
      </div>
      <div class="install-prompt-actions">
        <button type="button" class="btn btn-primary" data-install-ok>Got it</button>
        <button type="button" class="btn btn-ghost" data-install-never>Don't show again</button>
      </div>
    </div>
  `;
}

function startStepHighlight(overlay) {
  const steps = [...overlay.querySelectorAll('.install-step')];
  const dots = [...overlay.querySelectorAll('.install-dot')];
  if (!steps.length) return () => {};

  let index = 0;
  const timer = window.setInterval(() => {
    index = (index + 1) % steps.length;
    steps.forEach((step, i) => step.classList.toggle('is-active', i === index));
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
  }, STEP_INTERVAL_MS);

  return () => window.clearInterval(timer);
}

export function getInstallSteps(isIOS) {
  return getSteps(isIOS ? 'ios' : 'android');
}

export function shouldShowInstallPrompt({ isStandalone }, localStorage, sessionStorage) {
  if (isStandalone) return false;
  try {
    if (localStorage.getItem(DISMISSED_KEY) === '1') return false;
    if (sessionStorage.getItem(SEEN_KEY) === '1') return false;
  } catch {
    return false;
  }
  return true;
}

function getInstallPlatform(capabilities) {
  if (capabilities.platform === 'ios' || capabilities.platform === 'android') {
    return capabilities.platform;
  }
  if (capabilities.isIOS) return 'ios';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

/**
 * @param {{ platform?: 'ios' | 'android' | 'desktop', isIOS?: boolean }} capabilities
 */
export function scheduleInstallPrompt(capabilities) {
  const platform = getInstallPlatform(capabilities);
  if (isStandaloneMode() || isDismissed() || wasSeenThisSession()) return;
  if (platform !== 'ios' && platform !== 'android') return;

  const mount = () => {
    if (document.getElementById('install-prompt')) return;

    const overlay = document.createElement('div');
    overlay.id = 'install-prompt';
    overlay.className = 'install-prompt-overlay';
    overlay.innerHTML = buildMarkup(platform);
    document.body.appendChild(overlay);
    document.body.classList.add('install-prompt-open');

    const stopHighlight = startStepHighlight(overlay);
    let closed = false;

    const close = (permanent) => {
      if (closed) return;
      closed = true;
      stopHighlight();
      dismiss(permanent);
      overlay.remove();
      document.body.classList.remove('install-prompt-open');
    };

    overlay.querySelector('[data-install-close]')?.addEventListener('click', () => close(false));
    overlay.querySelector('[data-install-ok]')?.addEventListener('click', () => close(false));
    overlay.querySelector('[data-install-never]')?.addEventListener('click', () => close(true));
    overlay.querySelector('.install-prompt-backdrop')?.addEventListener('click', () => close(false));
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(mount);
  });
}

export function resetInstallPromptForTests() {
  document.getElementById('install-prompt')?.remove();
  document.body.classList.remove('install-prompt-open');
  try {
    localStorage.removeItem(DISMISSED_KEY);
    sessionStorage.removeItem(SEEN_KEY);
  } catch {
    /* ignore */
  }
}
