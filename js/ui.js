/**
 * UI rendering helpers and toast notifications.
 */
import { formatTimestamp } from './diarize.js';
import { NOTE_SECTIONS } from './notes.js';
import { getDisclaimer } from './insights.js';
import {
  escapeHtml,
  formatDate,
  formatDuration,
  sanitizeColor,
} from './lib/utils.js';
import { STORAGE_KEYS } from './lib/storage-keys.js';

export { escapeHtml, formatDate, formatDuration };

let toastContainer = null;

export function initUi() {
  toastContainer = document.getElementById('toast-container');
}

export function showToast(message, type = 'info', duration = 3200) {
  if (!toastContainer) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  toastContainer.appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  setTimeout(() => {
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

export function renderEncounterList(encounters, handlers = {}) {
  const { onOpen, onDelete, onNew } = handlers;
  const root = document.getElementById('home-list');
  if (!root) return;

  if (!encounters.length) {
    root.innerHTML = `
      <div class="empty-state card">
        <div class="empty-icon" aria-hidden="true">🎙</div>
        <h2>No encounters yet</h2>
        <p>Start a new session to record and transcribe a conversation.</p>
        <button class="btn btn-primary" id="btn-new-empty" type="button">New session</button>
      </div>`;
    root.querySelector('#btn-new-empty')?.addEventListener('click', () => onNew?.());
    return;
  }

  root.innerHTML = `
    <ul class="encounter-list" role="list">
      ${encounters
        .map(
          (enc) => `
        <li class="encounter-card" data-id="${enc.id}">
          <button class="encounter-open" type="button" data-id="${enc.id}" aria-label="Open ${escapeHtml(enc.title)}">
            <span class="encounter-title">${escapeHtml(enc.title)}</span>
            <span class="encounter-meta">${formatDate(enc.updatedAt)} · ${formatDuration(enc.durationMs || 0)} · ${(enc.segments || []).length} seg.</span>
          </button>
          <button class="encounter-delete" type="button" data-id="${enc.id}" aria-label="Delete ${escapeHtml(enc.title)}">Delete encounter</button>
        </li>`
        )
        .join('')}
    </ul>`;

  root.querySelectorAll('.encounter-open').forEach((btn) => {
    btn.addEventListener('click', () => onOpen?.(btn.dataset.id));
  });
  root.querySelectorAll('.encounter-delete').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete?.(btn.dataset.id);
    });
  });
}

export function renderWaveform(level) {
  const bars = document.querySelectorAll('.waveform-bar');
  bars.forEach((bar, i) => {
    const offset = Math.abs(i - bars.length / 2) / (bars.length / 2);
    const h = Math.max(4, level * (1 - offset * 0.5) * 48 + Math.random() * level * 8);
    bar.style.height = `${h}px`;
  });
}

export function buildWaveformHtml() {
  return `<div class="waveform" aria-hidden="true">${Array.from({ length: 32 }, () => '<div class="waveform-bar"></div>').join('')}</div>`;
}

export function renderTranscript(segments, speakers, options = {}) {
  const { activeSegmentId, filter } = options;
  const speakerMap = Object.fromEntries((speakers || []).map((s) => [s.id, s]));
  const q = (filter || '').toLowerCase();
  const list = segments || [];
  const filtered = q ? list.filter((s) => s.text.toLowerCase().includes(q)) : list;

  if (!filtered.length) {
    return `<p class="muted">${list.length ? 'No matching segments.' : 'Transcript will appear here during recording.'}</p>`;
  }

  return `<div class="transcript-list" role="list">
    ${filtered
      .map((seg) => {
        const sp = speakerMap[seg.speakerId] || { name: 'Speaker', color: '#666' };
        const active = seg.id === activeSegmentId ? ' active' : '';
        return `
      <article class="transcript-segment card${active}" role="listitem" data-id="${seg.id}" data-start="${seg.startMs}">
        <div class="segment-header">
          <button class="segment-time" type="button" data-seek="${seg.startMs}" aria-label="Seek to ${formatTimestamp(seg.startMs)}">${formatTimestamp(seg.startMs)}</button>
          <select class="segment-speaker" data-id="${seg.id}" aria-label="Speaker for segment" style="--speaker-color:${sanitizeColor(sp.color)}">
            ${(speakers || []).map((s) => `<option value="${s.id}" ${s.id === seg.speakerId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
          </select>
          ${seg.confidence != null ? `<span class="confidence" title="Confidence">${Math.round(seg.confidence * 100)}%</span>` : ''}
        </div>
        <div class="segment-text" contenteditable="true" data-id="${seg.id}" spellcheck="true">${escapeHtml(seg.text)}</div>
      </article>`;
      })
      .join('')}
  </div>`;
}

export function bindTranscriptEvents(container, handlers = {}) {
  if (!container) return;
  const { onEdit, onSpeakerChange, onSeek } = handlers;
  container.querySelectorAll('.segment-text').forEach((el) => {
    el.addEventListener('blur', () => onEdit?.(el.dataset.id, el.textContent.trim()));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        el.blur();
      }
    });
  });
  container.querySelectorAll('.segment-speaker').forEach((sel) => {
    sel.addEventListener('change', () => onSpeakerChange?.(sel.dataset.id, sel.value));
  });
  container.querySelectorAll('[data-seek]').forEach((btn) => {
    btn.addEventListener('click', () => onSeek?.(Number(btn.dataset.seek)));
  });
}

export function renderNotes(notes = {}) {
  return NOTE_SECTIONS.map(
    (sec) => `
    <label class="note-field">
      <span class="note-label">${sec.label}</span>
      <span class="note-hint">${sec.hint}</span>
      <textarea data-key="${sec.key}" rows="${sec.key === 'freeform' ? 4 : 3}" placeholder="${sec.hint}">${escapeHtml(notes[sec.key] || '')}</textarea>
    </label>`
  ).join('');
}

export function bindNotesEvents(container, onChange) {
  if (!container || !onChange) return;
  container.querySelectorAll('textarea').forEach((ta) => {
    ta.addEventListener('input', () => onChange(ta.dataset.key, ta.value));
  });
}

export function renderActions(actions) {
  const items = (actions || [])
    .map(
      (a) => `
    <li class="action-item card ${a.done ? 'done' : ''}" data-id="${a.id}">
      <label class="action-check">
        <input type="checkbox" ${a.done ? 'checked' : ''} data-id="${a.id}" aria-label="Mark action done">
        <span class="action-text copy-contained">${escapeHtml(a.text)}</span>
      </label>
      <button class="btn-icon action-delete" type="button" data-id="${a.id}" aria-label="Delete action">✕</button>
    </li>`
    )
    .join('');

  return `
    <ul class="action-list" role="list">${items || '<li class="muted">No actions extracted yet.</li>'}</ul>
    <div class="action-add">
      <input type="text" id="action-input" placeholder="Add action item..." aria-label="New action item">
      <button class="btn btn-secondary" type="button" id="action-add-btn">Add</button>
    </div>`;
}

export function bindActionEvents(container, handlers = {}) {
  if (!container) return;
  const { onToggle, onDelete, onAdd } = handlers;
  container.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    cb.addEventListener('change', () => onToggle?.(cb.dataset.id));
  });
  container.querySelectorAll('.action-delete').forEach((btn) => {
    btn.addEventListener('click', () => onDelete?.(btn.dataset.id));
  });
  const input = container.querySelector('#action-input');
  const addBtn = container.querySelector('#action-add-btn');
  const submit = () => {
    const text = input?.value.trim();
    if (text) {
      onAdd?.(text);
      if (input) input.value = '';
    }
  };
  addBtn?.addEventListener('click', submit);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
}

export function renderInsights(insights) {
  const flags = (insights.considerations || [])
    .map((f) => `<div class="alert alert-danger" role="alert">${escapeHtml(f.message)}</div>`)
    .join('');

  const entities = (insights.entities || [])
    .map((e) => `<span class="chip chip-${e.type}">${escapeHtml(e.value)}</span>`)
    .join('');

  const questions = (insights.questions || [])
    .map((q) => `<li>${escapeHtml(q.text)}</li>`)
    .join('');

  return `
    <div class="disclaimer copy-contained" role="note">${escapeHtml(getDisclaimer())}</div>
    ${flags}
    <section class="insight-block card">
      <h3>Summary</h3>
      <p class="copy-contained">${escapeHtml(insights.summary || 'Generate notes or record more to see insights.')}</p>
    </section>
    ${entities ? `<section class="insight-block card"><h3>Entities</h3><div class="chips">${entities}</div></section>` : ''}
    ${questions ? `<section class="insight-block card"><h3>Questions asked</h3><ul class="copy-contained">${questions}</ul></section>` : ''}`;
}

export function formatLiveStatusText(status) {
  if (!status) return 'Listening…';
  if (typeof status === 'string') return status;
  const parts = [status.detail || ''];
  if (status.queueLength > 0) parts.push(`${status.queueLength} queued`);
  if (status.processingMs != null) parts.push(`${status.processingMs}ms`);
  if (status.chunksSkipped > 0) parts.push(`${status.chunksSkipped} skipped`);
  return parts.filter(Boolean).join(' · ');
}

export function renderLiveStatusBar(status) {
  const phase =
    typeof status === 'object' && status?.phase ? status.phase : status ? 'listening' : 'idle';
  const detail = formatLiveStatusText(status);
  const queue =
    typeof status === 'object' && status?.queueLength > 0
      ? `<span class="live-queue-badge" aria-label="${status.queueLength} chunks queued">${status.queueLength}</span>`
      : '';
  const spinner = phase === 'processing' || phase === 'loading' ? '<span class="live-spinner" aria-hidden="true"></span>' : '';

  return `
    <div class="live-capture-status live-capture-status-${phase}" id="live-capture-status" role="status" aria-live="polite">
      ${spinner}
      <span class="live-status-phase">${escapeHtml(phaseLabel(phase))}</span>
      <span class="live-status-detail">${escapeHtml(detail)}</span>
      ${queue}
    </div>`;
}

function phaseLabel(phase) {
  switch (phase) {
    case 'loading':
      return 'Loading';
    case 'processing':
      return 'Processing';
    case 'queued':
      return 'Queued';
    case 'paused':
      return 'Paused';
    case 'listening':
      return 'Listening';
    default:
      return 'Ready';
  }
}

export function renderLiveAssist(segments, speakers, options = {}) {
  return renderLiveTranscriptFeed(segments, speakers, { maxHeight: true, ...options });
}

export function renderLiveTranscriptFeed(segments, speakers, { partialId, statusText, status, activeSpeakerId } = {}) {
  const speakerMap = Object.fromEntries((speakers || []).map((s) => [s.id, s]));
  const list = segments || [];
  const active = speakers?.find((s) => s.id === activeSpeakerId);
  const liveStatus = status || statusText;

  const statusBar = renderLiveStatusBar(liveStatus);

  const speakerBar = active
    ? `<div class="live-active-speaker" style="--speaker-color:${sanitizeColor(active.color)}">
        <span class="live-pulse" aria-hidden="true"></span>
        <span>Speaking: <strong>${escapeHtml(active.name)}</strong></span>
      </div>`
    : '';

  if (!list.length) {
    return `
      <section class="live-capture" aria-label="Live transcript">
        ${speakerBar}
        ${statusBar}
        <p class="muted live-empty">Conversation will appear here as you speak.</p>
      </section>`;
  }

  const rows = list
    .map((seg) => {
      const sp = speakerMap[seg.speakerId] || { name: 'Speaker', color: '#666' };
      const isPartial = seg.isFinal === false || seg.id === partialId;
      const isProcessing = isPartial && /transcrib/i.test(seg.text || '');
      return `
      <div class="live-line ${isPartial ? 'live-line-partial' : ''} ${isProcessing ? 'live-line-processing' : ''}" data-id="${seg.id}">
        <span class="live-line-time">${formatTimestamp(seg.startMs || 0)}</span>
        <span class="live-line-speaker" style="color:${sanitizeColor(sp.color)}">${escapeHtml(sp.name)}</span>
        <span class="live-line-text copy-contained">${escapeHtml(seg.text)}</span>
      </div>`;
    })
    .join('');

  return `
    <section class="live-capture" aria-label="Live transcript">
      ${speakerBar}
      ${statusBar}
      <div class="live-transcript-feed" id="live-transcript-feed" aria-live="polite" aria-atomic="false">
        ${rows}
      </div>
    </section>`;
}

export function updateLiveTranscriptFeed(segments, speakers, options = {}) {
  const wrap = document.getElementById('live-capture-wrap');
  if (!wrap) return;
  wrap.innerHTML = renderLiveTranscriptFeed(segments, speakers, options);
  const feed = document.getElementById('live-transcript-feed');
  if (feed) feed.scrollTop = feed.scrollHeight;
}

export function renderLiveAssistSuggestions(assist, { loading = false, enabled = true } = {}) {
  if (!enabled) {
    return `
      <div class="assist-panel">
        <p class="muted">Live assist is off. Enable it in Settings.</p>
      </div>`;
  }

  const disclaimer = `<div class="assist-disclaimer copy-contained" role="note">${escapeHtml(getDisclaimer())}</div>`;

  if (loading) {
    return `
      <div class="assist-panel">
        ${disclaimer}
        <div class="assist-loading">
          <span class="live-spinner" aria-hidden="true"></span>
          <span>Updating AI suggestions…</span>
        </div>
      </div>`;
  }

  const flags = (assist?.considerations || [])
    .map(
      (f) =>
        `<div class="alert alert-danger assist-alert" role="alert">${escapeHtml(f.message || f.keyword)}</div>`
    )
    .join('');

  const questions = (assist?.questions || [])
    .map(
      (q) =>
        `<li class="assist-item assist-question">
          <span class="assist-item-text copy-contained">${escapeHtml(q.text)}</span>
          ${q.reason ? `<span class="assist-item-meta">${escapeHtml(q.reason)}</span>` : ''}
        </li>`
    )
    .join('');

  const responses = (assist?.responses || [])
    .map(
      (r) =>
        `<li class="assist-item assist-response assist-response-${r.type || 'clarify'}">
          <span class="assist-response-type">${escapeHtml(r.type || 'suggestion')}</span>
          <span class="assist-item-text copy-contained">${escapeHtml(r.text)}</span>
        </li>`
    )
    .join('');

  const differentials = (assist?.differentials || [])
    .map(
      (d) =>
        `<li class="assist-item assist-diff assist-diff-${d.urgency || 'routine'}">
          <span class="assist-diff-urgency">${escapeHtml(d.urgency || 'routine')}</span>
          <span class="assist-item-text copy-contained">${escapeHtml(d.text)}</span>
          ${d.reason ? `<span class="assist-item-meta">Triggered by: ${escapeHtml(d.reason)}</span>` : ''}
        </li>`
    )
    .join('');

  const hasContent = flags || questions || responses || differentials;
  const sourceLabel = assist?.source
    ? `<p class="assist-source muted">Source: ${escapeHtml(assist.source === 'mixed' ? 'rules + AI' : assist.source)}</p>`
    : '';

  if (!hasContent) {
    return `
      <div class="assist-panel">
        ${disclaimer}
        <p class="muted assist-empty">Suggestions will appear as the conversation builds — questions to ask, phrasing ideas, and differentials to consider.</p>
      </div>`;
  }

  return `
    <div class="assist-panel">
      ${disclaimer}
      ${flags}
      ${questions ? `<section class="assist-section card"><h3>Suggested questions</h3><ul class="assist-list">${questions}</ul></section>` : ''}
      ${responses ? `<section class="assist-section card"><h3>Response ideas</h3><ul class="assist-list">${responses}</ul></section>` : ''}
      ${differentials ? `<section class="assist-section card"><h3>Differentials to consider</h3><ul class="assist-list">${differentials}</ul></section>` : ''}
      ${sourceLabel}
    </div>`;
}

export function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  localStorage.setItem(STORAGE_KEYS.THEME, dark ? 'dark' : 'light');
}

export function loadTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.THEME);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(saved ? saved === 'dark' : prefersDark);
}
