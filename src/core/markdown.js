import { ENTRY_TYPE_LABELS, KIND_LABELS, normalizeCaptureThread } from "./schema.js";
import { captureFolderName, formatDateTime } from "./format.js";

export function materialLines(materials = []) {
  if (!materials.length) return "- _No materials yet_";
  return materials.map((material) => `- ${material.filename}`).join("\n");
}

export function materialsForEntry(entry, materials = []) {
  const ids = new Set(entry.materialIds || []);
  return materials.filter((material) => ids.has(material.id) || material.entryId === entry.id);
}

export function entryMarkdown(entry, materials = [], index = 0) {
  const entryMaterials = materialsForEntry(entry, materials);
  const text = entry.text?.trim() || "_No typed text._";
  const transcript = entry.transcript?.trim() || "_No transcript yet._";
  return `### Comment ${index + 1}: ${ENTRY_TYPE_LABELS[entry.type] || entry.type}
Created: ${formatDateTime(entry.createdAt)}

Text:
${text}

Transcript:
${transcript}

Materials:
${materialLines(entryMaterials)}
`;
}

export function buildMarkdown(capture, materials = []) {
  const thread = normalizeCaptureThread(capture);
  const entries = thread.entries || [];
  const notes = thread.notes?.trim() || entries.map((entry) => entry.text?.trim()).filter(Boolean).join("\n\n") || "_No typed notes yet._";
  const transcript = thread.transcript?.trim() || entries.map((entry) => entry.transcript?.trim()).filter(Boolean).join("\n\n") || "_No transcript yet._";
  const nextActions = [
    "整理成可以執行的下一步",
    "找出可變成內容或產品的方向",
    "決定是否要匯出到 Files / iCloud / Google Drive"
  ];

  return `# ${thread.title}

Created: ${formatDateTime(thread.createdAt)}
Updated: ${formatDateTime(thread.updatedAt)}
Type: ${thread.kind}
Label: ${KIND_LABELS[thread.kind] || thread.kind}
Entries: ${entries.length}

## AI Aggregate Brief
請把下方 Discussion Thread 聚合成這個 post 的最新版本，保留脈絡、補上缺口，並整理成可行動輸出。

## Current Context
${notes}

## Aggregated Notes
${notes}

## Aggregated Transcript
${transcript}

## All Materials
${materialLines(materials)}

## Discussion Thread
${entries.length ? entries.map((entry, index) => entryMarkdown(entry, materials, index)).join("\n") : "_No comments yet._"}

## Next Actions
${nextActions.map((item) => `- ${item}`).join("\n")}

## For AI
請根據以上素材，協助我整理成可行動的下一步。
`;
}

export function buildAIPrompt(capture, materials = []) {
  return `請根據以下素材，幫我整理成可以立刻執行的下一步。

請包含：
1. 問題洞察
2. 可能用途
3. 下一步待辦
4. 可以直接複製使用的短稿

${buildMarkdown(capture, materials)}`;
}

export function buildMetadata(capture, materials = []) {
  const thread = normalizeCaptureThread(capture);
  return {
    id: thread.id,
    title: thread.title,
    created_at: thread.createdAt,
    updated_at: thread.updatedAt,
    capture_type: thread.kind,
    status: thread.status,
    folder: captureFolderName(thread),
    entries: (thread.entries || []).map((entry) => ({
      id: entry.id,
      type: entry.type,
      text: entry.text,
      transcript: entry.transcript,
      materialIds: entry.materialIds || [],
      durationMs: entry.durationMs || 0,
      photoCount: entry.photoCount || 0,
      createdAt: entry.createdAt
    })),
    materials: materials.map((material) => ({
      id: material.id,
      entryId: material.entryId || "",
      filename: material.filename,
      type: material.type,
      mimeType: material.mimeType,
      size: material.size
    })),
    export_version: 1
  };
}

export function buildMetadataJson(capture, materials = []) {
  return JSON.stringify(buildMetadata(capture, materials), null, 2);
}
