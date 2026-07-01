/**
 * Shared JSDoc type definitions for Tiger encounters.
 * Import in other modules via: /** @typedef {import('./lib/types.js').Encounter} Encounter * /
 */

/**
 * @typedef {object} Speaker
 * @property {string} id
 * @property {string} name
 * @property {string} color - Hex color e.g. #2563eb
 */

/**
 * @typedef {object} Segment
 * @property {string} id
 * @property {string} speakerId
 * @property {number} startMs
 * @property {number} endMs
 * @property {string} text
 * @property {number|null} [confidence]
 * @property {boolean} [isFinal]
 * @property {number} [createdAt]
 */

/**
 * @typedef {object} SoapNotes
 * @property {string} subjective
 * @property {string} objective
 * @property {string} assessment
 * @property {string} plan
 * @property {string} freeform
 */

/**
 * @typedef {object} ActionItem
 * @property {string} id
 * @property {string} text
 * @property {boolean} done
 * @property {string|null} [sourceSegmentId]
 * @property {number} [createdAt]
 */

/**
 * @typedef {object} EncounterInsights
 * @property {string} summary
 * @property {Array<{type: string, value: string}>} entities
 * @property {Array<{text: string, segmentId?: string}>} questions
 * @property {Array<{keyword?: string, severity?: string, message: string}>} considerations
 */

/**
 * @typedef {object} EncounterSettings
 * @property {string} language - BCP 47
 * @property {boolean} enhancedTranscription
 */

/**
 * @typedef {object} Encounter
 * @property {string} id
 * @property {string} title
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {string} timezone
 * @property {number} durationMs
 * @property {Blob|null} audioBlob
 * @property {Speaker[]} speakers
 * @property {Segment[]} segments
 * @property {SoapNotes} notes
 * @property {ActionItem[]} actions
 * @property {EncounterInsights} insights
 * @property {EncounterSettings} settings
 */

/**
 * @typedef {object} AppSettings
 * @property {string} timezone
 * @property {string} language
 * @property {boolean} enhancedTranscription
 * @property {boolean} [liveAssistEnabled]
 * @property {boolean} [liveAssistAi]
 * @property {Speaker[]} speakers
 */

export {};
