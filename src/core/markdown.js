import { ENTRY_TYPE_LABELS, KIND_LABELS, ideaNumberFromTitle, normalizeCaptureThread } from "./schema.js";
import { captureFolderName, formatDateTime } from "./format.js";

export function materialLines(materials = []) {
  if (!materials.length) return "- _這則點子目前沒有附件，先從文字與討論串開始整理。_";
  return materials.map((material) => `- ${material.filename}`).join("\n");
}

export function materialsForEntry(entry, materials = []) {
  const ids = new Set(entry.materialIds || []);
  return materials.filter((material) => ids.has(material.id) || material.entryId === entry.id);
}

export function entryMarkdown(entry, materials = [], index = 0, ideaNumber = 0) {
  const entryMaterials = materialsForEntry(entry, materials);
  const text = entry.text?.trim() || "_這個 comment 沒有手打文字，請從照片、錄音或上下文推回當時的想法。_";
  const transcript = entry.transcript?.trim() || "_還沒有逐字稿。若有音訊，請先摘要語氣、關鍵詞與可能的行動線索。_";
  const label = ideaNumber ? `點子${ideaNumber}-${index + 1}` : `點子片段 ${index + 101}`;
  return `### ${label}: ${ENTRY_TYPE_LABELS[entry.type] || entry.type}
Created: ${formatDateTime(entry.createdAt)}

What I noticed:
${text}

Voice / transcript:
${transcript}

Materials:
${materialLines(entryMaterials)}
`;
}

export function buildMarkdown(capture, materials = []) {
  const thread = normalizeCaptureThread(capture);
  const entries = thread.entries || [];
  const ideaNumber = Number(thread.ideaNumber) || ideaNumberFromTitle(thread.title);
  const displayTitle = ideaNumber && !String(thread.title).includes(`點子${ideaNumber}`)
    ? `點子${ideaNumber}｜${thread.title}`
    : thread.title;
  const notes = thread.notes?.trim() || entries.map((entry) => entry.text?.trim()).filter(Boolean).join("\n\n") || "_還沒有整理過的文字。請把下方片段當成原料，先萃取出一個有用的方向。_";
  const transcript = thread.transcript?.trim() || entries.map((entry) => entry.transcript?.trim()).filter(Boolean).join("\n\n") || "_還沒有逐字稿。若有音訊，請先幫我抓出重點與可行動的下一步。_";
  const nextActions = [
    "把這則點子濃縮成一句值得繼續追的主張",
    "列出 3 個可以立即嘗試的使用方式",
    "指出還缺哪一張照片、哪一句補充、或哪個驗證問題"
  ];

  return `# ${displayTitle}

Idea: ${ideaNumber ? `點子${ideaNumber}` : "未編號點子"}
Created: ${formatDateTime(thread.createdAt)}
Updated: ${formatDateTime(thread.updatedAt)}
Type: ${thread.kind}
Label: ${KIND_LABELS[thread.kind] || thread.kind}
Entries: ${entries.length}

## Open This First
這是一包從現場收回來的靈感材料。它可能還粗糙，但已經有照片、錄音、文字或後續補充。請先幫我看見其中最值得行動的部分，而不是只做摘要。

## AI Aggregate Brief
請把下方 Discussion Thread 聚合成這個 post 的最新版本：保留原始脈絡，補出可能缺口，並整理成一份可以拿去寫作、設計、產品思考或下一步執行的輸出。

## Current Context
${notes}

## Aggregated Notes
${notes}

## Aggregated Transcript
${transcript}

## All Materials
${materialLines(materials)}

## Discussion Thread
${entries.length ? entries.map((entry, index) => entryMarkdown(entry, materials, index, ideaNumber)).join("\n") : "_No comments yet._"}

## Next Actions
${nextActions.map((item) => `- ${item}`).join("\n")}

## Reuse Ideas
- 變成一段內容草稿。
- 變成一個產品假設。
- 變成一份設計或研究 brief。
- 變成下一次拍攝、訪談、驗證的 checklist。

## For AI
請根據以上素材，幫我找出這則點子最有生命力的方向，並產出可以馬上使用的版本。
`;
}

export function buildAIPrompt(capture, materials = []) {
  return `請根據以下素材，幫我把這則靈感整理成可以立刻使用的下一步。

請包含：
1. 這則點子的核心亮點
2. 它可能解決的問題或可以延伸的用途
3. 可以今天就做的小行動
4. 一段可以直接複製使用的短稿

${buildMarkdown(capture, materials)}`;
}

export function buildMetadata(capture, materials = []) {
  const thread = normalizeCaptureThread(capture);
  return {
    id: thread.id,
    idea_number: Number(thread.ideaNumber) || ideaNumberFromTitle(thread.title) || null,
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
