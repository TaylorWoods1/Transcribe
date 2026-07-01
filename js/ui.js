/**
 * UI rendering helpers and toast notifications.
 */
import { formatTimestamp } from './diarize.js';
import { NOTE_SECTIONS } from './notes.js';
import { getDisclaimer } from './insights.js';

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

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
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
          <select class="segment-speaker" data-id="${seg.id}" aria-label="Speaker for segment" style="--speaker-color:${sp.color}">
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

export function renderLiveAssist(segments, speakers) {
  const recent = (segments || []).slice(-3);
  if (!recent.length) return '<p class="muted">Live assist activates during recording.</p>';
  const speakerMap = Object.fromEntries((speakers || []).map((s) => [s.id, s]));
  return recent
    .map((s) => {
      const sp = speakerMap[s.speakerId];
      return `<p class="copy-contained"><strong style="color:${sp?.color}">${escapeHtml(sp?.name || 'Speaker')}:</strong> ${escapeHtml(s.text)}</p>`;
    })
    .join('');
}

export function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  localStorage.setItem('lucy-theme', dark ? 'dark' : 'light');
}

export function loadTheme() {
  const saved = localStorage.getItem('lucy-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(saved ? saved === 'dark' : prefersDark);
}
