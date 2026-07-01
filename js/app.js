/**
 * Tiger — main app orchestration and routing.
 */
import { CONFIG } from '../config.js';
import {
  createEmptyEncounter,
  saveEncounter,
  getEncounter,
  deleteEncounter,
  listEncounters,
  searchEncounters,
  clearAllData,
} from './db.js';
import { AudioRecorder, AudioPlayer } from './audio.js';
import { LiveTranscriber, isLiveTranscriptionSupported } from './transcribe-live.js';
import { ChunkedLiveTranscriber, createLiveStatus } from './transcribe-chunked.js';
import { VoiceActivityDetector } from './vad.js';
import {
  transcribeBlob,
  transcribeFile,
  downloadWhisperModel,
  subscribeWhisperStatus,
  getWhisperStatus,
  updateWhisperStatusPanel,
  renderWhisperStatusHtml,
  isWhisperReady,
  warmWhisperPipeline,
  isWhisperCached,
} from './transcribe-whisper.js';
import { DiarizationTracker } from './diarize.js';
import { extractActions, toggleAction, deleteAction, addAction } from './actions.js';
import { generateSoapNote, generateSummary, extractActionsWithAi, getAiSettings, saveAiSettings, hasAiConfigured, generateLiveAssistWithAi } from './ai.js';
import { analyzeEncounter } from './insights.js';
import { analyzeLiveAssist, mergeAssistSuggestions, createEmptyAssist } from './assist.js';
import {
  clearCoiReloadAttempts,
  getCoiReloadAttempts,
  recordCoiReloadAttempt,
  reloadForCrossOriginIsolation,
  shouldAutoReloadForCoi,
  syncCrossOriginIsolation,
} from './lib/coi-reload.js';
import { getRuntimeCapabilities, renderRuntimeCapabilitiesHtml, getLiveCaptureTiming } from './runtime.js';
import { enforcePwaInstall } from './install-prompt.js';
import {
  STORAGE_KEYS,
  migrateStorageKeys,
  readJsonStorage,
  writeJsonStorage,
} from './lib/storage-keys.js';
import { nextSpeaker, sanitizeColor } from './lib/utils.js';
import { exportEncounter } from './export.js';
import {
  initUi,
  showToast,
  renderEncounterList,
  renderWaveform,
  buildWaveformHtml,
  renderTranscript,
  bindTranscriptEvents,
  renderNotes,
  bindNotesEvents,
  renderActions,
  bindActionEvents,
  renderInsights,
  renderLiveAssist,
  updateLiveTranscriptFeed,
  renderLiveAssistSuggestions,
  loadTheme,
  formatDuration,
  escapeHtml,
} from './ui.js';

import { getAppSettings, saveAppSettings } from './lib/app-settings.js';

/** @type {object|null} */
let currentEncounter = null;
let recorder = null;
let liveTranscriber = null;
let chunkedTranscriber = null;
let vad = null;
let diarizer = null;
let player = null;
let recording = false;
let paused = false;
let timerInterval = null;
let activeSegmentId = null;
let transcriptFilter = '';
let liveStatus = null;
let liveUiTimer = null;
let liveAssistSuggestions = createEmptyAssist();
let liveAssistAiTimer = null;
let liveAssistAiLoading = false;
let liveAssistSegmentFingerprint = '';
let useChunkedLive = false;
/** View to return to from settings (home | session) */
let returnView = 'home';
let whisperStatusUnsubscribe = null;
let whisperWarmPromise = null;

function scheduleWhisperWarm() {
  const settings = getAppSettings();
  if (!settings.enhancedTranscription) return null;
  if (!isWhisperCached() && !isWhisperReady()) return null;
  if (isWhisperReady()) return Promise.resolve();
  if (whisperWarmPromise) return whisperWarmPromise;
  whisperWarmPromise = warmWhisperPipeline()
    .catch(() => {})
    .finally(() => {
      whisperWarmPromise = null;
    });
  return whisperWarmPromise;
}

function getActiveView() {
  const active = document.querySelector('.view.active');
  return active?.id?.replace('view-', '') || 'home';
}

function navigate(view, { skipReturn = false } = {}) {
  const from = getActiveView();
  if (from === 'settings' && view !== 'settings' && whisperStatusUnsubscribe) {
    whisperStatusUnsubscribe();
    whisperStatusUnsubscribe = null;
  }
  if (!skipReturn && view === 'settings' && from !== 'settings') {
    returnView = from;
  }

  document.querySelectorAll('.view').forEach((v) => {
    v.classList.remove('active');
    v.setAttribute('aria-hidden', 'true');
  });
  const next = document.getElementById(`view-${view}`);
  next?.classList.add('active');
  next?.setAttribute('aria-hidden', 'false');

  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.nav === view);
  });

  const backBtn = document.getElementById('btn-back');
  const settingsBtn = document.getElementById('btn-settings');
  const onHome = view === 'home';
  if (backBtn) {
    backBtn.classList.toggle('is-visible', !onHome);
    backBtn.hidden = onHome;
    backBtn.setAttribute('aria-hidden', onHome ? 'true' : 'false');
    backBtn.disabled = onHome;
  }
  if (settingsBtn) {
    settingsBtn.hidden = view === 'settings';
    settingsBtn.setAttribute('aria-hidden', view === 'settings' ? 'true' : 'false');
  }

  document.getElementById('header-title').textContent =
    view === 'home' ? CONFIG.appName : view === 'settings' ? 'Settings' : currentEncounter?.title || 'Session';
}

function handleBack() {
  if (recording) {
    if (!confirm('Recording in progress. Stop and go back?')) return;
    stopRecording().then(() => handleBack());
    return;
  }

  const current = getActiveView();
  if (current === 'settings') {
    if (returnView === 'session' && currentEncounter) {
      navigate('session', { skipReturn: true });
      renderSession();
    } else {
      navigate('home', { skipReturn: true });
      refreshHome();
    }
    return;
  }

  if (current === 'session') {
    navigate('home', { skipReturn: true });
    refreshHome();
  }
}

async function refreshHome(query = '') {
  const encounters = query ? await searchEncounters(query) : await listEncounters();
  renderEncounterList(encounters, {
    onOpen: openEncounter,
    onDelete: async (id) => {
      if (!confirm('Delete this encounter? This cannot be undone.')) return;
      try {
        await deleteEncounter(id);
        if (currentEncounter?.id === id) currentEncounter = null;
        showToast('Encounter deleted', 'info');
        await refreshHome(document.getElementById('search-input')?.value || '');
      } catch (err) {
        console.error(err);
        showToast(err.message || 'Could not delete encounter', 'error');
      }
    },
    onNew: startNewSession,
  });
}

async function startNewSession() {
  try {
    const settings = getAppSettings();
    currentEncounter = createEmptyEncounter({
      timezone: settings.timezone,
      speakers: settings.speakers?.length ? settings.speakers : CONFIG.defaultSpeakers,
      settings: {
        language: settings.language,
        enhancedTranscription: settings.enhancedTranscription,
      },
    });
    await saveEncounter(currentEncounter);
    await showSession(currentEncounter);
    refreshHome(document.getElementById('search-input')?.value || '').catch(() => {});
    showToast('New session ready', 'success', 2000);
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Could not start session', 'error');
  }
}

function resetSessionTabs() {
  const firstTab = 'record';
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const selected = btn.dataset.tab === firstTab;
    btn.classList.toggle('active', selected);
    btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    btn.setAttribute('tabindex', selected ? '0' : '-1');
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    const active = panel.id === `panel-${firstTab}`;
    panel.classList.toggle('active', active);
    panel.setAttribute('aria-hidden', active ? 'false' : 'true');
  });
}

async function showSession(encounter) {
  currentEncounter = encounter;
  transcriptFilter = '';
  activeSegmentId = null;
  recording = false;
  paused = false;
  diarizer = null;

  const searchEl = document.getElementById('session-search');
  if (searchEl) searchEl.value = '';

  if (player) player.destroy();
  player = currentEncounter.audioBlob ? new AudioPlayer() : null;
  if (player) {
    player.load(currentEncounter.audioBlob);
    player.onTimeUpdate = highlightActiveSegment;
  }

  resetSessionTabs();
  liveAssistSuggestions = createEmptyAssist();
  liveAssistSegmentFingerprint = '';
  renderSession();
  navigate('session');
  scheduleWhisperWarm();
  document.getElementById('main')?.scrollIntoView({ behavior: 'instant', block: 'start' });
  window.scrollTo(0, 0);
}

async function openEncounter(id) {
  try {
    const encounter = await getEncounter(id);
    if (!encounter) {
      showToast('Encounter not found', 'error');
      navigate('home', { skipReturn: true });
      return refreshHome();
    }
    await showSession(encounter);
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Could not open session', 'error');
  }
}

function highlightActiveSegment(ms) {
  const seg = (currentEncounter.segments || []).find(
    (s) => ms >= s.startMs && ms <= (s.endMs || s.startMs + 2000)
  );
  if (seg && seg.id !== activeSegmentId) {
    activeSegmentId = seg.id;
    renderTranscriptPanel();
  }
}

function renderSession() {
  if (!currentEncounter) return;
  try {
    document.getElementById('header-title').textContent = currentEncounter.title;
    document.getElementById('session-title-input').value = currentEncounter.title;
    renderRecordPanel();
    renderTranscriptPanel();
    renderNotesPanel();
    renderActionsPanel();
    renderInsightsPanel();
    renderLiveAssistPanel();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Could not render session', 'error');
    throw err;
  }
}

function renderRecordPanel() {
  const el = document.getElementById('panel-record');
  const status = recording ? (paused ? 'Paused' : 'Recording') : currentEncounter.audioBlob ? 'Recorded' : 'Ready';
  el.innerHTML = `
    <div class="record-panel">
      ${buildWaveformHtml()}
      <div class="record-status" aria-live="polite">
        <span class="status-dot ${recording && !paused ? 'live' : ''}"></span>
        <span id="record-timer">${formatDuration(currentEncounter.durationMs || 0)}</span>
        <span class="status-label">${status}</span>
      </div>
      <div class="record-controls">
        ${!recording ? `<button class="btn btn-record" id="btn-record" type="button" aria-label="Start recording">● Record</button>` : ''}
        ${recording && !paused ? `<button class="btn btn-secondary" id="btn-pause" type="button">Pause</button>` : ''}
        ${recording && paused ? `<button class="btn btn-secondary" id="btn-resume" type="button">Resume</button>` : ''}
        ${recording ? `<button class="btn btn-danger" id="btn-stop" type="button">Stop</button>` : ''}
      </div>
      <p class="live-mode-label">${escapeHtml(getLiveModeLabel())}</p>
      <div id="live-capture-wrap">${recording ? renderLiveAssist(diarizer?.getLiveSegments() || [], currentEncounter.speakers || [], { status: liveStatus, activeSpeakerId: diarizer?.activeSpeakerId, partialId: diarizer?._partialId }) : ''}</div>
      <div class="playback-controls" ${currentEncounter.audioBlob && !recording ? '' : 'hidden'}>
        <button class="btn btn-secondary" id="btn-play" type="button">Play</button>
        <button class="btn btn-secondary" id="btn-enhance" type="button">${currentEncounter.settings?.enhancedTranscription ? 'Re-run enhanced transcription' : 'Enhanced transcription'}</button>
        <label class="file-import">
          <input type="file" id="import-audio" accept="audio/*" hidden>
          <span class="btn btn-secondary">Import audio</span>
        </label>
      </div>
      <div id="enhance-progress" class="muted" hidden></div>
      <div class="speaker-switch" role="group" aria-label="Active speaker">
        ${(currentEncounter.speakers || [])
          .map(
            (s) =>
              `<button class="speaker-btn ${diarizer?.activeSpeakerId === s.id ? 'active' : ''}" type="button" data-speaker="${s.id}" style="--speaker-color:${s.color}">${escapeHtml(s.name)}</button>`
          )
          .join('')}
        <span class="hint">Tap to switch speaker (shortcut: S)</span>
      </div>
    </div>`;

  el.querySelector('#btn-record')?.addEventListener('click', startRecording);
  el.querySelector('#btn-pause')?.addEventListener('click', pauseRecording);
  el.querySelector('#btn-resume')?.addEventListener('click', resumeRecording);
  el.querySelector('#btn-stop')?.addEventListener('click', stopRecording);
  el.querySelector('#btn-play')?.addEventListener('click', togglePlayback);
  el.querySelector('#btn-enhance')?.addEventListener('click', runEnhancedTranscription);
  el.querySelector('#import-audio')?.addEventListener('change', handleImportAudio);
  el.querySelectorAll('[data-speaker]').forEach((btn) => {
    btn.addEventListener('click', () => {
      diarizer?.setActiveSpeaker(btn.dataset.speaker, { manual: true });
      scheduleLiveUIUpdate();
      renderRecordPanel();
    });
  });
  if (recording) scheduleLiveUIUpdate();
}

function renderTranscriptPanel() {
  const el = document.getElementById('panel-transcript');
  const segments =
    recording && diarizer ? diarizer.getLiveSegments() : currentEncounter.segments || [];
  el.innerHTML = renderTranscript(segments, currentEncounter.speakers || [], {
    activeSegmentId,
    filter: transcriptFilter,
  });
  bindTranscriptEvents(el, {
    onEdit: async (id, text) => {
      const seg = currentEncounter.segments.find((s) => s.id === id);
      if (seg) seg.text = text;
      await persist();
    },
    onSpeakerChange: async (id, speakerId) => {
      const seg = currentEncounter.segments.find((s) => s.id === id);
      if (seg) seg.speakerId = speakerId;
      await persist();
      renderTranscriptPanel();
    },
    onSeek: (ms) => {
      if (player) {
        player.seek(ms);
        player.play();
      }
    },
  });
}

function renderNotesPanel() {
  const el = document.getElementById('panel-notes');
  el.innerHTML = `
    <div class="panel-actions">
      <button class="btn btn-primary" id="btn-gen-notes" type="button">Generate SOAP notes</button>
      <button class="btn btn-secondary" id="btn-ai-summary" type="button">AI summary</button>
    </div>
    <div id="notes-fields">${renderNotes(currentEncounter.notes || {})}</div>`;
  bindNotesEvents(el.querySelector('#notes-fields'), async (key, value) => {
    currentEncounter.notes[key] = value;
    await persist();
  });
  el.querySelector('#btn-gen-notes')?.addEventListener('click', generateNotes);
  el.querySelector('#btn-ai-summary')?.addEventListener('click', generateAiSummary);
}

function renderActionsPanel() {
  const el = document.getElementById('panel-actions');
  el.innerHTML = `
    <div class="panel-actions">
      <button class="btn btn-primary" id="btn-extract-actions" type="button">Extract actions</button>
    </div>
    <div id="actions-list">${renderActions(currentEncounter.actions || [])}</div>`;
  bindActionEvents(el.querySelector('#actions-list'), {
    onToggle: async (id) => {
      currentEncounter.actions = toggleAction(currentEncounter.actions, id);
      await persist();
      renderActionsPanel();
    },
    onDelete: async (id) => {
      currentEncounter.actions = deleteAction(currentEncounter.actions, id);
      await persist();
      renderActionsPanel();
    },
    onAdd: async (text) => {
      currentEncounter.actions = addAction(currentEncounter.actions, text);
      await persist();
      renderActionsPanel();
    },
  });
  el.querySelector('#btn-extract-actions')?.addEventListener('click', extractEncounterActions);
}

function renderInsightsPanel() {
  const el = document.getElementById('panel-insights');
  currentEncounter.insights = analyzeEncounter(currentEncounter);
  el.innerHTML = renderInsights(currentEncounter.insights);
}

function renderLiveAssistPanel() {
  const el = document.getElementById('panel-assist');
  const settings = getAppSettings();
  const segments =
    recording && diarizer ? diarizer.getLiveSegments() : currentEncounter?.segments || [];

  if (!settings.liveAssistEnabled) {
    el.innerHTML = renderLiveAssistSuggestions(null, { enabled: false });
    return;
  }

  if (
    settings.liveAssistEnabled &&
    (segments?.length || 0) >= CONFIG.liveAssistMinSegments &&
    !recording
  ) {
    liveAssistSuggestions = analyzeLiveAssist(segments, currentEncounter?.speakers || []);
  }

  el.innerHTML = renderLiveAssistSuggestions(liveAssistSuggestions, {
    loading: liveAssistAiLoading,
    enabled: true,
  });
}

function getAssistFingerprint(segments) {
  return (segments || [])
    .filter((s) => s.isFinal !== false && s.text?.trim())
    .map((s) => s.id + ':' + s.text.length)
    .join('|');
}

function refreshLiveAssist() {
  const settings = getAppSettings();
  if (!settings.liveAssistEnabled || !currentEncounter) {
    liveAssistSuggestions = createEmptyAssist();
    renderLiveAssistPanel();
    return;
  }

  const segments =
    recording && diarizer ? diarizer.getLiveSegments() : currentEncounter.segments || [];
  const fingerprint = getAssistFingerprint(segments);

  if (fingerprint !== liveAssistSegmentFingerprint) {
    liveAssistSegmentFingerprint = fingerprint;
    liveAssistSuggestions = analyzeLiveAssist(segments, currentEncounter.speakers || []);
    renderLiveAssistPanel();
    scheduleLiveAssistAi(segments);
  }
}

function scheduleLiveAssistAi(segments) {
  const settings = getAppSettings();
  if (!settings.liveAssistEnabled || !settings.liveAssistAi || !hasAiConfigured()) return;
  if ((segments || []).filter((s) => s.text?.trim()).length < CONFIG.liveAssistMinSegments) return;

  if (liveAssistAiTimer) clearTimeout(liveAssistAiTimer);
  liveAssistAiTimer = setTimeout(async () => {
    liveAssistAiTimer = null;
    if (!currentEncounter) return;
    const latest =
      recording && diarizer ? diarizer.getLiveSegments() : currentEncounter.segments || [];
    liveAssistAiLoading = true;
    renderLiveAssistPanel();
    try {
      const ai = await generateLiveAssistWithAi({
        segments: latest,
        speakers: currentEncounter.speakers,
      });
      if (ai) {
        const rules = analyzeLiveAssist(latest, currentEncounter.speakers);
        liveAssistSuggestions = mergeAssistSuggestions(rules, ai);
      }
    } catch {
      /* keep rule-based suggestions */
    } finally {
      liveAssistAiLoading = false;
      renderLiveAssistPanel();
    }
  }, CONFIG.liveAssistAiDebounceMs);
}

async function persist() {
  currentEncounter.updatedAt = Date.now();
  await saveEncounter(currentEncounter);
}

async function startRecording() {
  try {
    const settings = getAppSettings();
    useChunkedLive = !isLiveTranscriptionSupported() && settings.enhancedTranscription;
    const timing = getLiveCaptureTiming(getRuntimeCapabilities());
    const chunkMs = useChunkedLive ? timing.chunkIntervalMs : 1000;

    if (useChunkedLive) {
      liveStatus = createLiveStatus({ phase: 'loading', detail: 'Preparing Whisper…' });
      const recordBtn = document.getElementById('btn-record');
      if (recordBtn) {
        recordBtn.disabled = true;
        recordBtn.textContent = 'Preparing…';
      }
      try {
        await warmWhisperPipeline((p) => {
          liveStatus = createLiveStatus({
            phase: 'loading',
            detail:
              p.progress != null ? `Loading model ${Math.round(p.progress)}%` : 'Preparing Whisper…',
          });
        });
      } catch (e) {
        if (recordBtn) {
          recordBtn.disabled = false;
          recordBtn.textContent = '● Record';
        }
        showToast(e.message || 'Download Whisper in Settings first', 'error');
        liveStatus = null;
        return;
      }
    }

    vad = new VoiceActivityDetector({ threshold: CONFIG.speechEnergyThreshold });
    recorder = new AudioRecorder({
      chunkIntervalMs: chunkMs,
      speechThreshold: CONFIG.speechEnergyThreshold,
      onWaveform: renderWaveform,
      onEnergy: onLiveSpeechActivity,
      onChunk: (blob, meta) => {
        if (!useChunkedLive || !chunkedTranscriber || paused) return;
        const startMs = Math.max(0, (recorder?.getElapsedMs() || 0) - chunkMs);
        chunkedTranscriber.enqueueChunk(blob, startMs, { hadSpeech: meta?.hadSpeech !== false });
      },
      onError: (e) => showToast(e.message, 'error'),
    });
    await recorder.start();
    diarizer = new DiarizationTracker({
      speakers: currentEncounter.speakers,
      activeSpeakerId: currentEncounter.speakers[0]?.id,
    });
    liveAssistSegmentFingerprint = '';
    liveAssistSuggestions = createEmptyAssist();
    liveStatus = createLiveStatus({ phase: 'listening', detail: 'Listening…' });

    if (isLiveTranscriptionSupported()) {
      liveTranscriber = new LiveTranscriber({
        language: currentEncounter.settings.language,
        onPartial: ({ text, endMs }) => {
          diarizer.onPartial({ text, endMs });
          syncSegments({ live: true });
          scheduleLiveUIUpdate();
        },
        onFinal: async ({ text, endMs, confidence }) => {
          diarizer.onFinal({ text, endMs, confidence });
          syncSegments({ live: false });
          await persistFinalSegments();
          scheduleLiveUIUpdate();
          renderTranscriptPanel();
        },
        onError: (e) => showToast(e.message, 'error'),
      });
      liveTranscriber.start();
      liveStatus = createLiveStatus({ phase: 'listening', detail: 'Live speech recognition active' });
    } else if (useChunkedLive) {
      chunkedTranscriber = new ChunkedLiveTranscriber({
        language: currentEncounter.settings.language,
        onSegments: async (segs) => {
          diarizer.setProcessing({ active: false });
          diarizer.addChunkSegments(segs, diarizer.activeSpeakerId);
          syncSegments({ live: true });
          await persistFinalSegments();
          scheduleLiveUIUpdate();
          renderTranscriptPanel();
        },
        onStatus: (status) => {
          liveStatus = status;
          if (status.phase === 'processing') {
            diarizer.setProcessing({ active: true, message: 'Transcribing…' });
          } else if (status.phase !== 'queued') {
            diarizer.setProcessing({ active: false });
          }
          scheduleLiveUIUpdate();
        },
        onError: (e) => showToast(e.message || 'Live chunk failed', 'error'),
      });
      chunkedTranscriber.start();
    }

    recording = true;
    paused = false;
    timerInterval = setInterval(updateTimer, 500);
    renderRecordPanel();
    scheduleLiveUIUpdate();
    showToast('Recording started', 'success');
  } catch (e) {
    liveStatus = null;
    showToast(e.message || 'Microphone permission denied', 'error');
  }
}

function pauseRecording() {
  recorder?.pause();
  liveTranscriber?.pause();
  chunkedTranscriber?.pause();
  paused = true;
  liveStatus = createLiveStatus({ phase: 'paused', detail: 'Paused' });
  renderRecordPanel();
}

function resumeRecording() {
  recorder?.resume();
  liveTranscriber?.resume();
  chunkedTranscriber?.resume();
  paused = false;
  liveStatus = createLiveStatus({
    phase: 'listening',
    detail: isLiveTranscriptionSupported()
      ? 'Live speech recognition active'
      : useChunkedLive
        ? 'Live Whisper active'
        : 'Listening…',
  });
  renderRecordPanel();
}

async function stopRecording() {
  clearInterval(timerInterval);
  if (liveUiTimer) {
    clearTimeout(liveUiTimer);
    liveUiTimer = null;
  }
  liveTranscriber?.stop();
  liveTranscriber = null;
  chunkedTranscriber?.stop();
  chunkedTranscriber = null;
  vad = null;
  const result = await recorder?.stop();
  recording = false;
  paused = false;
  liveStatus = null;
  liveAssistSegmentFingerprint = '';
  if (liveAssistAiTimer) {
    clearTimeout(liveAssistAiTimer);
    liveAssistAiTimer = null;
  }
  liveAssistAiLoading = false;
  if (result?.blob) currentEncounter.audioBlob = result.blob;
  if (result?.durationMs) currentEncounter.durationMs = result.durationMs;
  syncSegments({ live: false });
  if (player) player.destroy();
  if (currentEncounter.audioBlob) {
    player = new AudioPlayer();
    player.load(currentEncounter.audioBlob);
    player.onTimeUpdate = highlightActiveSegment;
  }
  currentEncounter.insights = analyzeEncounter(currentEncounter);
  await persist();
  renderSession();
  refreshLiveAssist();
  showToast('Recording saved', 'success');

  const settings = getAppSettings();
  const hasLiveSegments = (diarizer?.getSegments()?.length || 0) > 0;
  if (settings.enhancedTranscription && currentEncounter.audioBlob && !hasLiveSegments) {
    runEnhancedTranscription();
  }
}

function scheduleLiveUIUpdate() {
  if (liveUiTimer) return;
  liveUiTimer = setTimeout(() => {
    liveUiTimer = null;
    if (!recording || !diarizer) return;
    updateLiveTranscriptFeed(diarizer.getLiveSegments(), currentEncounter.speakers, {
      partialId: diarizer._partialId,
      status: liveStatus,
      activeSpeakerId: diarizer.activeSpeakerId,
    });
    refreshLiveAssist();
  }, CONFIG.liveUiThrottleMs);
}

function onLiveSpeechActivity(level) {
  if (!vad || !diarizer || !recording || paused) return;
  const elapsed = recorder?.getElapsedMs() || 0;
  const wasSpeaking = vad.speaking;
  vad.tick(level);
  if (!wasSpeaking && vad.speaking) diarizer.onSpeechStart(elapsed);
  if (wasSpeaking && !vad.speaking) {
    diarizer.onSpeechEnd(elapsed);
    if (useChunkedLive && recorder) recorder.flushChunk();
  }
}

function getLiveModeLabel() {
  if (isLiveTranscriptionSupported()) return 'Live speech recognition (browser)';
  if (useChunkedLive && isWhisperReady()) {
    return `Live Whisper · ~${CONFIG.liveChunkIntervalMs / 1000}s chunks + speech-end flush`;
  }
  if (useChunkedLive) return 'Live Whisper — model preloads when you tap Record';
  return 'Audio only — enable Whisper in Settings for live captions on iPhone';
}

function syncSegments({ live = false } = {}) {
  if (!diarizer) return;
  currentEncounter.segments = live ? diarizer.getLiveSegments() : diarizer.getSegments();
}

async function persistFinalSegments() {
  if (!diarizer) return;
  currentEncounter.segments = diarizer.getSegments();
  await persist();
}

function updateTimer() {
  const ms = recorder?.getElapsedMs() || currentEncounter.durationMs || 0;
  const el = document.getElementById('record-timer');
  if (el) el.textContent = formatDuration(ms);
}

function togglePlayback() {
  if (!player) return;
  if (player.audio.paused) player.play();
  else player.pause();
}

async function runEnhancedTranscription() {
  if (!currentEncounter.audioBlob) {
    showToast('No audio to transcribe', 'error');
    return;
  }
  const progressEl = document.getElementById('enhance-progress');
  if (progressEl) {
    progressEl.hidden = false;
    progressEl.textContent = 'Preparing Whisper model…';
  }
  try {
    const segments = await transcribeBlob(currentEncounter.audioBlob, {
      language: currentEncounter.settings.language,
      onProgress: (p) => {
        if (!progressEl) return;
        if (p.status === 'loading' || p.status === 'progress') {
          progressEl.textContent =
            p.progress != null ? `Loading model: ${Math.round(p.progress)}%` : 'Loading Whisper model…';
        } else if (getWhisperStatus().state === 'transcribing') {
          progressEl.textContent = 'Transcribing audio… keep the app open';
        }
      },
    });
    if (!diarizer) {
      diarizer = new DiarizationTracker({ speakers: currentEncounter.speakers });
    }
    diarizer.segments = [];
    diarizer.mergeWhisperSegments(segments, currentEncounter.speakers[0]?.id);
    syncSegments();
    currentEncounter.settings.enhancedTranscription = true;
    await persist();
    renderTranscriptPanel();
    if (progressEl) progressEl.textContent = 'Enhanced transcription complete.';
    showToast('Enhanced transcription complete', 'success');
  } catch (e) {
    if (progressEl) progressEl.textContent = '';
    showToast(e.message || 'Enhanced transcription failed', 'error');
  }
}

async function handleImportAudio(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  currentEncounter.audioBlob = file;
  currentEncounter.durationMs = 0;
  if (player) player.destroy();
  player = new AudioPlayer();
  player.load(file);
  player.onTimeUpdate = highlightActiveSegment;
  await persist();
  renderRecordPanel();
  showToast('Audio imported', 'success');
  if (getAppSettings().enhancedTranscription) runEnhancedTranscription();
  else {
    try {
      const segments = await transcribeFile(file, { language: currentEncounter.settings.language });
      diarizer = new DiarizationTracker({ speakers: currentEncounter.speakers });
      diarizer.mergeWhisperSegments(segments);
      syncSegments();
      await persist();
      renderTranscriptPanel();
    } catch {
      showToast('Import audio saved. Enable enhanced transcription to transcribe.', 'info');
    }
  }
}

async function generateNotes() {
  try {
    const notes = await generateSoapNote(currentEncounter);
    currentEncounter.notes = { ...currentEncounter.notes, ...notes };
    currentEncounter.insights = analyzeEncounter(currentEncounter);
    await persist();
    renderNotesPanel();
    renderInsightsPanel();
    showToast('Notes generated', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function generateAiSummary() {
  try {
    const result = await generateSummary(currentEncounter, hasAiConfigured() ? 'concise' : 'concise');
    currentEncounter.insights = {
      ...analyzeEncounter(currentEncounter),
      summary: result.summary || result.subjective || '',
    };
    await persist();
    renderInsightsPanel();
    showToast(hasAiConfigured() ? 'AI summary generated' : 'Extractive summary generated', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function extractEncounterActions() {
  let actions = extractActions(currentEncounter.segments, currentEncounter.actions);
  try {
    actions = await extractActionsWithAi(currentEncounter, actions);
  } catch {
    /* keep rule-based */
  }
  currentEncounter.actions = actions;
  await persist();
  renderActionsPanel();
  showToast(`Found ${actions.length} action items`, 'success');
}

function renderSettings() {
  if (whisperStatusUnsubscribe) {
    whisperStatusUnsubscribe();
    whisperStatusUnsubscribe = null;
  }

  const settings = getAppSettings();
  const ai = getAiSettings();
  const whisperStatus = getWhisperStatus();
  const el = document.getElementById('view-settings');
  el.innerHTML = `
    <div class="settings-page card">
    <form class="settings-form" id="settings-form">
      <fieldset>
        <legend>General</legend>
        <label>Timezone
          <input name="timezone" value="${escapeHtml(settings.timezone)}">
        </label>
        <label>Language (BCP 47)
          <input name="language" value="${escapeHtml(settings.language)}">
        </label>
        <label class="checkbox">
          <input type="checkbox" name="darkMode" ${document.documentElement.dataset.theme === 'dark' ? 'checked' : ''}>
          Dark mode
        </label>
      </fieldset>
      <fieldset>
        <legend>Live clinical assist</legend>
        <p class="muted">Real-time suggestions during recording: follow-up questions, response phrasing, and differentials to consider. Rule-based instantly; AI enhances when configured below.</p>
        <label class="checkbox">
          <input type="checkbox" name="liveAssistEnabled" ${settings.liveAssistEnabled !== false ? 'checked' : ''}>
          Show live assist suggestions
        </label>
        <label class="checkbox">
          <input type="checkbox" name="liveAssistAi" ${settings.liveAssistAi !== false ? 'checked' : ''}>
          Use AI for assist (when API key set)
        </label>
      </fieldset>
      <fieldset>
        <legend>Enhanced transcription (Whisper)</legend>
        <p class="muted">Runs fully on your device. Required for transcription on iPhone (live speech-to-text is not available in Safari).</p>
        <div id="whisper-status-wrap">${renderWhisperStatusHtml(whisperStatus)}</div>
        <div class="whisper-actions">
          <button class="btn btn-primary" type="button" id="btn-whisper-download">Download Whisper model</button>
        </div>
        <label class="checkbox">
          <input type="checkbox" name="enhancedTranscription" ${settings.enhancedTranscription ? 'checked' : ''}>
          Auto-transcribe after recording
        </label>
        <p class="muted">On iPhone, also enables <strong>live chunked transcription</strong> during recording (~2.5s slices, faster after pauses). Uses multi-thread WASM when cross-origin isolation is active.</p>
      </fieldset>
      ${renderRuntimeCapabilitiesHtml(getRuntimeCapabilities())}
      <fieldset>
        <legend>Speakers</legend>
        <div id="speakers-editor">
          ${settings.speakers
            .map(
              (s, i) => `
            <div class="speaker-row">
              <input name="speaker-name-${i}" value="${escapeHtml(s.name)}" aria-label="Speaker ${i + 1} name">
              <input type="color" name="speaker-color-${i}" value="${s.color}" aria-label="Speaker ${i + 1} color">
            </div>`
            )
            .join('')}
        </div>
      </fieldset>
      <fieldset>
        <legend>AI (optional)</legend>
        <p class="muted">Stored locally. Uses OpenAI-compatible API.</p>
        <label>API base URL
          <input name="baseUrl" value="${escapeHtml(ai.baseUrl || 'https://api.openai.com/v1')}" placeholder="https://api.openai.com/v1">
        </label>
        <label>API key
          <input name="apiKey" type="password" value="${escapeHtml(ai.apiKey || '')}" autocomplete="off">
        </label>
        <label>Model
          <input name="model" value="${escapeHtml(ai.model || 'gpt-4o-mini')}">
        </label>
      </fieldset>
      <fieldset>
        <legend>Data</legend>
        <button class="btn btn-secondary" type="button" id="btn-export-all">Export current encounter</button>
        <button class="btn btn-danger" type="button" id="btn-clear-data">Clear all data</button>
      </fieldset>
      <button class="btn btn-primary btn-block" type="submit">Save settings</button>
    </form>
    </div>`;

  el.querySelector('#settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const speakers = settings.speakers.map((s, i) => ({
      id: s.id,
      name: fd.get(`speaker-name-${i}`) || s.name,
      color: sanitizeColor(fd.get(`speaker-color-${i}`) || s.color, s.color),
    }));
    const appSettings = {
      timezone: String(fd.get('timezone') || settings.timezone),
      language: String(fd.get('language') || settings.language),
      enhancedTranscription: fd.get('enhancedTranscription') === 'on',
      liveAssistEnabled: fd.get('liveAssistEnabled') === 'on',
      liveAssistAi: fd.get('liveAssistAi') === 'on',
      speakers,
    };
    saveAppSettings(appSettings);
    if (appSettings.enhancedTranscription) scheduleWhisperWarm();
    saveAiSettings({
      baseUrl: fd.get('baseUrl'),
      apiKey: fd.get('apiKey'),
      model: fd.get('model'),
    });
    document.documentElement.dataset.theme = fd.get('darkMode') === 'on' ? 'dark' : 'light';
    localStorage.setItem(STORAGE_KEYS.THEME, document.documentElement.dataset.theme);
    showToast('Settings saved', 'success');
  });

  const persistToggle = (name, { onEnabled } = {}) => {
    el.querySelector(`[name="${name}"]`)?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      if (name === 'darkMode') {
        document.documentElement.dataset.theme = checked ? 'dark' : 'light';
        localStorage.setItem(STORAGE_KEYS.THEME, document.documentElement.dataset.theme);
        return;
      }
      saveAppSettings({ [name]: checked });
      if (checked) onEnabled?.();
    });
  };

  persistToggle('enhancedTranscription', { onEnabled: () => scheduleWhisperWarm() });
  persistToggle('liveAssistEnabled');
  persistToggle('liveAssistAi');
  persistToggle('darkMode');

  el.querySelector('#btn-clear-data')?.addEventListener('click', async () => {
    if (!confirm('Delete ALL encounters and data? This cannot be undone.')) return;
    await clearAllData();
    currentEncounter = null;
    showToast('All data cleared', 'info');
    navigate('home');
    refreshHome();
  });

  el.querySelector('#btn-export-all')?.addEventListener('click', () => {
    if (!currentEncounter) {
      showToast('Open a session first', 'error');
      return;
    }
    exportEncounter(currentEncounter, 'json');
  });

  const downloadBtn = el.querySelector('#btn-whisper-download');
  if (whisperStatus.state === 'active' || whisperStatus.state === 'cached') {
    downloadBtn.textContent = 'Re-download model';
  }
  downloadBtn?.addEventListener('click', async () => {
    downloadBtn.disabled = true;
    try {
      await downloadWhisperModel(() => updateWhisperStatusPanel());
      scheduleWhisperWarm();
      showToast('Whisper model ready', 'success');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Whisper download failed', 'error');
    } finally {
      updateWhisperStatusPanel();
      downloadBtn.disabled = ['downloading', 'transcribing'].includes(getWhisperStatus().state);
    }
  });

  whisperStatusUnsubscribe = subscribeWhisperStatus(() => updateWhisperStatusPanel());

  el.querySelector('#btn-coi-reload')?.addEventListener('click', async () => {
    const btn = el.querySelector('#btn-coi-reload');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Reloading…';
    }
    showToast('Clearing cache and reloading for multi-thread WASM…', 'info', 3500);
    const degradeCoep = getCoiReloadAttempts() >= 1;
    await reloadForCrossOriginIsolation({
      clearCaches: true,
      cacheBust: true,
      resetAttempts: true,
      degradeCoep,
    });
  });
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => {
        const selected = b === btn;
        b.classList.toggle('active', selected);
        b.setAttribute('aria-selected', selected ? 'true' : 'false');
        b.setAttribute('tabindex', selected ? '0' : '-1');
      });
      document.querySelectorAll('.tab-panel').forEach((p) => {
        const active = p.id === `panel-${tab}`;
        p.classList.toggle('active', active);
        p.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
    });
  });
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, [contenteditable]')) return;
    if (e.key === 'r' || e.key === 'R') {
      if (!recording) startRecording();
      else stopRecording();
    }
    if (e.key === 's' || e.key === 'S') {
      if (!diarizer || !currentEncounter?.speakers?.length) return;
      const next = nextSpeaker(currentEncounter.speakers, diarizer.activeSpeakerId);
      if (!next) return;
      diarizer.setActiveSpeaker(next.id, { manual: true });
      renderRecordPanel();
      scheduleLiveUIUpdate();
      showToast(`Speaker: ${next.name}`, 'info', 1500);
    }
  });
}

async function migrateDeployRelease() {
  const prevDeploy = localStorage.getItem(STORAGE_KEYS.DEPLOY_ID);
  const deployChanged = prevDeploy !== null && prevDeploy !== CONFIG.deployId;

  localStorage.setItem(STORAGE_KEYS.DEPLOY_ID, CONFIG.deployId);
  localStorage.setItem('tiger-app-version', CONFIG.version);

  const whisper = readJsonStorage(STORAGE_KEYS.WHISPER_STATUS);
  if (whisper.error || whisper.state === 'error') {
    writeJsonStorage(STORAGE_KEYS.WHISPER_STATUS, {
      ...whisper,
      state: whisper.downloadedAt ? 'cached' : 'not_downloaded',
      error: null,
    });
  }

  if (!deployChanged) return false;

  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  window.location.reload();
  return true;
}

async function waitForServiceWorkerControl(timeoutMs = 10000) {
  if (!('serviceWorker' in navigator)) return false;
  try {
    await navigator.serviceWorker.ready;
  } catch {
    return false;
  }
  if (navigator.serviceWorker.controller) return true;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      resolve(!!navigator.serviceWorker.controller);
    }, timeoutMs);

    const onChange = () => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      resolve(true);
    };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
  });
}

async function ensureCrossOriginIsolation() {
  if (!('serviceWorker' in navigator)) return true;

  if (window.crossOriginIsolated) {
    clearCoiReloadAttempts();
    return true;
  }

  if (!navigator.serviceWorker.controller) return true;

  const state = syncCrossOriginIsolation();
  if (state !== 'reload' || !shouldAutoReloadForCoi()) return true;

  recordCoiReloadAttempt();
  await reloadForCrossOriginIsolation({
    clearCaches: true,
    cacheBust: true,
    degradeCoep: getCoiReloadAttempts() > 1,
  });
  return false;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const swUrl = `./sw.js?v=${encodeURIComponent(CONFIG.deployId)}`;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs
      .filter((reg) => {
        const script = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
        return script && !script.includes(`v=${encodeURIComponent(CONFIG.deployId)}`);
      })
      .map((reg) => reg.unregister())
  );

  const hadController = !!navigator.serviceWorker.controller;
  const reg = await navigator.serviceWorker.register(swUrl);
  reg.update();
  if (reg.waiting) {
    reg.waiting.postMessage({ type: 'skipWaiting' });
  }
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'activated' && hadController) {
        window.location.reload();
      }
    });
  });
}

async function init() {
  migrateStorageKeys();
  if (await migrateDeployRelease()) return;
  await registerServiceWorker();
  await waitForServiceWorkerControl();
  if (!(await ensureCrossOriginIsolation())) return;
  loadTheme();

  if (enforcePwaInstall(getRuntimeCapabilities())) return;

  initUi();
  navigate('home');
  setupTabs();
  setupKeyboardShortcuts();

  document.getElementById('main')?.addEventListener('click', (e) => {
    const newBtn = e.target.closest('#btn-new, #btn-new-empty');
    if (newBtn) {
      e.preventDefault();
      startNewSession();
    }
  });
  document.getElementById('btn-back')?.addEventListener('click', handleBack);
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    renderSettings();
    navigate('settings');
  });
  const searchInput = document.getElementById('search-input');
  searchInput?.addEventListener('input', (e) => refreshHome(e.target.value));
  document.getElementById('session-search')?.addEventListener('input', (e) => {
    transcriptFilter = e.target.value;
    renderTranscriptPanel();
  });
  document.getElementById('session-title-input')?.addEventListener('change', async (e) => {
    if (!currentEncounter) return;
    currentEncounter.title = e.target.value.trim() || 'Untitled encounter';
    document.getElementById('header-title').textContent = currentEncounter.title;
    await persist();
  });

  document.querySelectorAll('[data-export]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!currentEncounter) return showToast('No session open', 'error');
      try {
        exportEncounter(currentEncounter, btn.dataset.export);
        showToast(`Exported ${btn.dataset.export.toUpperCase()}`, 'success');
      } catch (e) {
        showToast(e.message, 'error');
      }
    });
  });

  await refreshHome();
  scheduleWhisperWarm();
  document.documentElement.dataset.appReady = '1';
}

init();
