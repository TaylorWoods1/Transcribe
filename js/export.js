/**
 * Export encounters to JSON, Markdown, TXT, SRT, VTT.
 */
import { formatTimestamp } from './diarize.js';
import { buildTranscriptText } from './notes.js';

function speakerName(speakers, id) {
  return speakers.find((s) => s.id === id)?.name || 'Speaker';
}

export function exportJson(encounter) {
  const copy = { ...encounter };
  if (copy.audioBlob instanceof Blob) {
    copy.audioBlob = '[Blob omitted from JSON export — use audio export separately]';
  }
  return JSON.stringify(copy, null, 2);
}

export function exportMarkdown(encounter) {
  const { title, createdAt, speakers, segments, notes, actions, insights } = encounter;
  const date = new Date(createdAt).toLocaleString();
  let md = `# ${title}\n\n*${date}*\n\n`;
  md += `## Transcript\n\n`;
  for (const seg of segments || []) {
    const ts = formatTimestamp(seg.startMs);
    md += `**[${ts}] ${speakerName(speakers, seg.speakerId)}:** ${seg.text}\n\n`;
  }
  md += `## SOAP Notes\n\n`;
  md += `### Subjective\n${notes?.subjective || ''}\n\n`;
  md += `### Objective\n${notes?.objective || ''}\n\n`;
  md += `### Assessment\n${notes?.assessment || ''}\n\n`;
  md += `### Plan\n${notes?.plan || ''}\n\n`;
  if (notes?.freeform) md += `### Freeform\n${notes.freeform}\n\n`;
  md += `## Actions\n\n`;
  for (const a of actions || []) {
    md += `- [${a.done ? 'x' : ' '}] ${a.text}\n`;
  }
  if (insights?.summary) {
    md += `\n## Summary\n\n${insights.summary}\n`;
  }
  return md;
}

export function exportPlainText(encounter) {
  const { title, createdAt, notes, actions } = encounter;
  let txt = `${title}\n${new Date(createdAt).toLocaleString()}\n${'='.repeat(40)}\n\n`;
  txt += buildTranscriptText(encounter.segments, encounter.speakers) + '\n\n';
  txt += `SUBJECTIVE: ${notes?.subjective || ''}\n`;
  txt += `OBJECTIVE: ${notes?.objective || ''}\n`;
  txt += `ASSESSMENT: ${notes?.assessment || ''}\n`;
  txt += `PLAN: ${notes?.plan || ''}\n\n`;
  txt += 'ACTIONS:\n';
  for (const a of actions || []) {
    txt += `[${a.done ? 'x' : ' '}] ${a.text}\n`;
  }
  return txt;
}

function toSrtTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msRem = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(msRem).padStart(3, '0')}`;
}

function toVttTime(ms) {
  return toSrtTime(ms).replace(',', '.');
}

export function exportSrt(encounter) {
  const lines = [];
  (encounter.segments || []).forEach((seg, i) => {
    const start = seg.startMs || 0;
    const end = seg.endMs || start + 2000;
    lines.push(String(i + 1));
    lines.push(`${toSrtTime(start)} --> ${toSrtTime(end)}`);
    lines.push(`${speakerName(encounter.speakers, seg.speakerId)}: ${seg.text}`);
    lines.push('');
  });
  return lines.join('\n');
}

export function exportVtt(encounter) {
  const lines = ['WEBVTT', ''];
  for (const seg of encounter.segments || []) {
    const start = seg.startMs || 0;
    const end = seg.endMs || start + 2000;
    lines.push(`${toVttTime(start)} --> ${toVttTime(end)}`);
    lines.push(`${speakerName(encounter.speakers, seg.speakerId)}: ${seg.text}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function downloadFile(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportAudio(encounter) {
  if (!encounter.audioBlob) throw new Error('No audio recorded for this session.');
  downloadFile(`${safeName(encounter.title)}.webm`, encounter.audioBlob, encounter.audioBlob.type);
}

function safeName(title) {
  return (title || 'encounter').replace(/[^\w\-]+/g, '_').slice(0, 60);
}

export function exportEncounter(encounter, format) {
  const base = safeName(encounter.title);
  switch (format) {
    case 'json':
      downloadFile(`${base}.json`, exportJson(encounter), 'application/json');
      break;
    case 'md':
      downloadFile(`${base}.md`, exportMarkdown(encounter), 'text/markdown');
      break;
    case 'txt':
      downloadFile(`${base}.txt`, exportPlainText(encounter), 'text/plain');
      break;
    case 'srt':
      downloadFile(`${base}.srt`, exportSrt(encounter), 'text/plain');
      break;
    case 'vtt':
      downloadFile(`${base}.vtt`, exportVtt(encounter), 'text/vtt');
      break;
    case 'audio':
      return exportAudio(encounter);
    default:
      throw new Error(`Unknown format: ${format}`);
  }
}
