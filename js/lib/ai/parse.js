/**
 * Shared structured-output parsing for agent tasks.
 */

/**
 * @param {string} text
 * @param {object} [fallback]
 * @returns {object}
 */
export function parseJsonText(text, fallback = {}) {
  const raw = String(text || '').trim();
  if (!raw) return { ...fallback };
  try {
    return JSON.parse(raw);
  } catch {
    if (fallback.summary !== undefined) {
      return { ...fallback, summary: raw };
    }
    return { ...fallback };
  }
}
