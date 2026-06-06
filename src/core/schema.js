export const CAPTURE_KINDS = Object.freeze({
  PHOTO: "photo",
  MULTI_PHOTO: "multi_photo",
  PHOTO_VOICE: "photo_voice",
  AUDIO: "audio",
  TEXT: "text"
});

export const MATERIAL_TYPES = Object.freeze({
  PHOTO: "photo",
  AUDIO: "audio",
  MARKDOWN: "markdown",
  METADATA: "metadata"
});

export const ENTRY_TYPES = Object.freeze({
  TEXT: "text",
  PHOTO: "photo",
  AUDIO: "audio",
  MIXED: "mixed"
});

export const CAPTURE_STATUS = Object.freeze({
  UNEXPORTED: "unexported",
  COPIED: "copied",
  SHARED: "shared",
  EXPORTED: "exported"
});

export const KIND_LABELS = Object.freeze({
  [CAPTURE_KINDS.PHOTO]: "一圖",
  [CAPTURE_KINDS.MULTI_PHOTO]: "多圖",
  [CAPTURE_KINDS.PHOTO_VOICE]: "圖 + 錄音",
  [CAPTURE_KINDS.AUDIO]: "純錄音",
  [CAPTURE_KINDS.TEXT]: "純文字"
});

export const ENTRY_TYPE_LABELS = Object.freeze({
  [ENTRY_TYPES.TEXT]: "文字延伸",
  [ENTRY_TYPES.PHOTO]: "照片延伸",
  [ENTRY_TYPES.AUDIO]: "錄音延伸",
  [ENTRY_TYPES.MIXED]: "混合延伸"
});

export const STATUS_LABELS = Object.freeze({
  [CAPTURE_STATUS.UNEXPORTED]: "未送",
  [CAPTURE_STATUS.COPIED]: "已複製",
  [CAPTURE_STATUS.SHARED]: "已分享",
  [CAPTURE_STATUS.EXPORTED]: "已匯出"
});

export const FIRST_IDEA_NUMBER = 101;

export function createId(prefix = "id") {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function ideaNumberFromTitle(title = "") {
  const match = String(title).match(/點子\s*(\d+)/);
  return match ? Number(match[1]) : 0;
}

export function nextIdeaNumber(captures = []) {
  const explicitMax = captures.reduce((max, capture) => {
    const number = Number(capture.ideaNumber) || ideaNumberFromTitle(capture.title);
    return Math.max(max, Number.isFinite(number) ? number : 0);
  }, FIRST_IDEA_NUMBER - 1);
  const countBasedMax = FIRST_IDEA_NUMBER + captures.length - 1;
  return Math.max(explicitMax, countBasedMax) + 1;
}

export function ideaTitle(number = FIRST_IDEA_NUMBER, hint = "") {
  const label = `點子${Number(number) || FIRST_IDEA_NUMBER}`;
  const cleanedHint = String(hint).trim();
  return cleanedHint ? `${label}｜${cleanedHint}` : label;
}

export function deriveCaptureKind({ photoCount = 0, hasAudio = false, hasText = false } = {}) {
  if (photoCount > 0 && hasAudio) return CAPTURE_KINDS.PHOTO_VOICE;
  if (photoCount > 1) return CAPTURE_KINDS.MULTI_PHOTO;
  if (photoCount === 1) return CAPTURE_KINDS.PHOTO;
  if (hasAudio) return CAPTURE_KINDS.AUDIO;
  if (hasText) return CAPTURE_KINDS.TEXT;
  return CAPTURE_KINDS.TEXT;
}

export function deriveEntryType({ photoCount = 0, hasAudio = false, hasText = false } = {}) {
  const activeTypes = [photoCount > 0, hasAudio, hasText].filter(Boolean).length;
  if (activeTypes > 1) return ENTRY_TYPES.MIXED;
  if (photoCount > 0) return ENTRY_TYPES.PHOTO;
  if (hasAudio) return ENTRY_TYPES.AUDIO;
  return ENTRY_TYPES.TEXT;
}

export function summarizeEntries(entries = []) {
  return entries.reduce((summary, entry) => ({
    photoCount: summary.photoCount + (entry.photoCount || 0),
    durationMs: summary.durationMs + (entry.durationMs || 0),
    hasAudio: summary.hasAudio || entry.type === ENTRY_TYPES.AUDIO || entry.type === ENTRY_TYPES.MIXED,
    hasText: summary.hasText || Boolean(entry.text?.trim()),
    text: [...summary.text, entry.text?.trim()].filter(Boolean),
    transcript: [...summary.transcript, entry.transcript?.trim()].filter(Boolean)
  }), {
    photoCount: 0,
    durationMs: 0,
    hasAudio: false,
    hasText: false,
    text: [],
    transcript: []
  });
}

export function createEntry({
  id = createId("ent"),
  captureId,
  type = ENTRY_TYPES.TEXT,
  text = "",
  transcript = "",
  materialIds = [],
  durationMs = 0,
  photoCount = 0,
  createdAt = new Date().toISOString()
} = {}) {
  if (!captureId) throw new Error("captureId is required");
  return {
    id,
    captureId,
    type,
    text,
    transcript,
    materialIds,
    durationMs,
    photoCount,
    createdAt
  };
}

export function normalizeCaptureThread(capture = {}) {
  if (Array.isArray(capture.entries) && capture.entries.length) return capture;
  const materialIds = Array.isArray(capture.materialIds) ? capture.materialIds : [];
  const hasLegacyContent = Boolean(capture.notes || capture.transcript || materialIds.length || capture.photoCount || capture.durationMs);
  if (!hasLegacyContent) return { ...capture, entries: [] };

  const entry = createEntry({
    id: `${capture.id}_root`,
    captureId: capture.id,
    type: deriveEntryType({
      photoCount: capture.photoCount || 0,
      hasAudio: Boolean(capture.durationMs || capture.transcript),
      hasText: Boolean(capture.notes)
    }),
    text: capture.notes || "",
    transcript: capture.transcript || "",
    materialIds,
    durationMs: capture.durationMs || 0,
    photoCount: capture.photoCount || 0,
    createdAt: capture.createdAt
  });

  return { ...capture, entries: [entry] };
}

export function appendEntry(capture, entry) {
  const normalized = normalizeCaptureThread(capture);
  const entries = [...normalized.entries, entry];
  const summary = summarizeEntries(entries);
  return {
    ...normalized,
    updatedAt: new Date().toISOString(),
    status: CAPTURE_STATUS.UNEXPORTED,
    kind: deriveCaptureKind({
      photoCount: summary.photoCount,
      hasAudio: summary.hasAudio,
      hasText: summary.hasText
    }),
    notes: summary.text.join("\n\n"),
    transcript: summary.transcript.join("\n\n"),
    durationMs: summary.durationMs,
    photoCount: summary.photoCount,
    materialIds: entries.flatMap((item) => item.materialIds || []),
    entries
  };
}

export function createCapture({
  id = createId("cap"),
  title,
  ideaNumber = 0,
  createdAt = new Date().toISOString(),
  kind = CAPTURE_KINDS.TEXT,
  status = CAPTURE_STATUS.UNEXPORTED,
  notes = "",
  transcript = "",
  materialIds = [],
  durationMs = 0,
  photoCount = 0,
  entries = []
} = {}) {
  const now = new Date().toISOString();
  return {
    id,
    ideaNumber,
    title: title || (ideaNumber ? ideaTitle(ideaNumber, titleFromText(notes)) : titleFromText(notes)) || "新現場",
    createdAt,
    updatedAt: now,
    kind,
    status,
    notes,
    transcript,
    materialIds,
    durationMs,
    photoCount,
    entries
  };
}

export function createMaterial({
  id = createId("mat"),
  captureId,
  entryId = "",
  filename,
  type,
  mimeType,
  size = 0,
  blob,
  createdAt = new Date().toISOString()
} = {}) {
  if (!captureId) throw new Error("captureId is required");
  if (!filename) throw new Error("filename is required");
  if (!type) throw new Error("type is required");
  return { id, captureId, entryId, filename, type, mimeType: mimeType || "application/octet-stream", size, blob, createdAt };
}

export function titleFromText(text = "", fallback = "") {
  const normalized = String(text).split(/\n/)[0]?.trim() || "";
  if (!normalized) return fallback;
  return normalized.length > 26 ? `${normalized.slice(0, 26)}...` : normalized;
}

export function statusAfterAction(action) {
  switch (action) {
  case "copy_ai":
    return CAPTURE_STATUS.COPIED;
  case "share_ai":
    return CAPTURE_STATUS.SHARED;
  case "save_to_files":
    return CAPTURE_STATUS.EXPORTED;
  default:
    return CAPTURE_STATUS.UNEXPORTED;
  }
}
