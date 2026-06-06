import { applyPostSaveAction, storageWarning } from "./core/actions.js";
import { getCapture, getCaptures, getMaterialsForCapture, saveCaptureWithMaterials, updateCapture } from "./core/db.js";
import { buildExportZipFile, buildShareText, canShareFiles, downloadFile } from "./core/export.js";
import { formatBytes, formatDateTime, formatDuration } from "./core/format.js";
import { buildMarkdown } from "./core/markdown.js";
import { compressImageFile, extensionForMime, objectUrlForBlob, pickSupportedAudioMime } from "./core/media.js";
import {
  CAPTURE_KINDS,
  CAPTURE_STATUS,
  ENTRY_TYPE_LABELS,
  ENTRY_TYPES,
  KIND_LABELS,
  MATERIAL_TYPES,
  STATUS_LABELS,
  appendEntry,
  createCapture,
  createEntry,
  createId,
  createMaterial,
  deriveCaptureKind,
  deriveEntryType,
  ideaTitle,
  nextIdeaNumber,
  normalizeCaptureThread,
  titleFromText
} from "./core/schema.js";
import { estimateStorage, requestPersistentStorage } from "./core/storage.js";

const app = document.querySelector("#app");
const photoInput = document.querySelector("#photo-input");

const state = {
  view: "home",
  captures: [],
  selectedCapture: null,
  selectedMaterials: [],
  sheet: null,
  toast: "",
  draft: null,
  recorder: null,
  backup: { status: "idle", captureId: "", progress: 0, file: null },
  storage: { usage: 0, quota: 0, available: 0 },
  persistent: false
};

init();

async function init() {
  bindGlobalEvents();
  state.persistent = await requestPersistentStorage();
  await refreshStorage();
  await loadHome();
  await registerServiceWorker();
}

function bindGlobalEvents() {
  app.addEventListener("click", handleClick);
  photoInput.addEventListener("change", handlePhotoInput);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./service-worker.js");
  } catch {
    showToast("離線快取尚未啟用");
  }
}

async function loadHome() {
  state.captures = await getCaptures();
  state.view = "home";
  render();
}

async function openDetail(id) {
  state.selectedCapture = await getCapture(id);
  state.selectedMaterials = await getMaterialsForCapture(id);
  state.view = "detail";
  render();
}

async function refreshStorage() {
  state.storage = await estimateStorage();
}

function render() {
  app.innerHTML = state.view === "detail" ? renderDetail() : renderHome();
  if (state.sheet) app.insertAdjacentHTML("beforeend", renderSheet());
  if (state.toast) app.insertAdjacentHTML("beforeend", `<div class="toast">${escapeHTML(state.toast)}</div>`);
}

function renderHome() {
  const unexported = state.captures.filter((capture) => capture.status === CAPTURE_STATUS.UNEXPORTED).length;
  const warning = storageWarning({ ...state.storage, unexportedCount: unexported });

  return `
    <main class="screen">
      <header class="topbar">
        <div class="brand">sparks</div>
        <div class="topbar-actions">
          ${renderBackupBeacon()}
          <button class="icon-button" data-action="refresh" aria-label="重新整理">↻</button>
        </div>
      </header>
      ${renderBackupProgress()}

      <h1 class="hero-title">你今天<br>看到什麼了？</h1>
      <p class="summary">${state.captures.length} 個現場 · ${unexported} 個尚未送往 AI</p>
      ${warning ? `<div class="warning">${warningText(warning)}</div>` : ""}

      ${state.captures.length ? renderCaptureList() : renderEmptyState()}

      ${renderBottomDock()}
    </main>
  `;
}

function renderEmptyState() {
  return `
    <section class="card empty">
      <h2>拍下你看到的，<br>說出你想到的。</h2>
      <p class="meta">不需要先想標題，Sparks 會幫你整理成 AI-ready Markdown。</p>
      <div class="sheet-actions">
        <button class="primary" data-action="start-photo">拍照開始</button>
        <button class="secondary" data-action="open-text">純文字</button>
        <button class="secondary" data-action="start-audio">純錄音</button>
      </div>
    </section>
  `;
}

function renderCaptureList() {
  const [latest, ...earlier] = state.captures;
  return `
    <section>
      <div class="section-label">最新 · ${formatDateTime(latest.createdAt)}</div>
      <article class="card latest">
        <button class="row" data-action="open-detail" data-id="${latest.id}" style="display:block;padding:0;border:0">
          <div class="thumb"></div>
          <h2 class="capture-title">${escapeHTML(latest.title)}</h2>
          <p class="meta">${captureMeta(latest)}</p>
        </button>
        <div style="display:flex;gap:8px;align-items:center;margin-top:14px">
          <button class="pill" data-action="quick-copy" data-id="${latest.id}">複製</button>
          <button class="pill" data-action="quick-share" data-id="${latest.id}">→ AI</button>
          <span style="flex:1"></span>
          <span class="status-dot ${latest.status}" title="${STATUS_LABELS[latest.status]}"></span>
        </div>
      </article>
    </section>

    ${earlier.length ? `
      <section>
        <div class="section-label">之前</div>
        <div class="card">
          ${earlier.map(renderCaptureRow).join("")}
        </div>
      </section>
    ` : ""}
  `;
}

function renderCaptureRow(capture) {
  return `
    <button class="row" data-action="open-detail" data-id="${capture.id}">
      <div class="glyph">${kindGlyph(capture.kind)}</div>
      <div>
        <div style="font-weight:800">${escapeHTML(capture.title)}</div>
        <div class="meta">${captureMeta(capture)}</div>
      </div>
      <span class="status-dot ${capture.status}" title="${STATUS_LABELS[capture.status]}"></span>
    </button>
  `;
}

function renderBottomDock() {
  return `
    <nav class="bottom-dock" aria-label="新增 capture">
      <button class="dock-secondary" data-action="open-text">文字</button>
      <button class="fab" data-action="start-photo" aria-label="拍照開始">⌾</button>
      <button class="dock-secondary" data-action="start-audio">錄音</button>
    </nav>
  `;
}

function renderBackupBeacon(capture = null) {
  const target = capture || state.captures.find((item) => item.status !== CAPTURE_STATUS.EXPORTED) || state.captures[0];
  const unexported = state.captures.filter((item) => item.status !== CAPTURE_STATUS.EXPORTED).length;
  const isTargetPreparing = target?.id && state.backup.captureId === target.id && state.backup.status === "preparing";
  const isTargetReady = target?.id && state.backup.captureId === target.id && state.backup.status === "ready";
  const needsBackup = target && target.status !== CAPTURE_STATUS.EXPORTED;
  const label = isTargetPreparing ? `${state.backup.progress}%` : isTargetReady ? "ZIP" : unexported ? String(unexported) : "✓";
  const classes = [
    "backup-beacon",
    needsBackup ? "needs-backup" : "",
    isTargetPreparing ? "preparing" : "",
    isTargetReady ? "ready" : ""
  ].filter(Boolean).join(" ");

  return `
    <button class="${classes}" data-action="backup-current" data-id="${target?.id || ""}" aria-label="備份狀態">
      <span></span>${escapeHTML(label)}
    </button>
  `;
}

function renderBackupProgress() {
  if (state.backup.status !== "preparing") return "";
  return `
    <div class="backup-progress" aria-label="正在準備備份">
      <div style="width:${Math.max(8, state.backup.progress)}%"></div>
    </div>
  `;
}

function renderDetail() {
  if (!state.selectedCapture) return renderHome();
  const capture = normalizeCaptureThread(state.selectedCapture);
  const materials = state.selectedMaterials;
  const markdown = buildMarkdown(capture, materials);

  return `
    <main class="screen">
      <div class="detail-header">
        <button class="icon-button" data-action="go-home" aria-label="回首頁">‹</button>
        <div>
          <div class="brand">sparks</div>
          <div class="meta">${STATUS_LABELS[capture.status]}</div>
        </div>
        <span style="flex:1"></span>
        ${renderBackupBeacon(capture)}
      </div>
      ${renderBackupProgress()}

      <h1 class="detail-title">${escapeHTML(capture.title)}</h1>
      <p class="summary">${captureMeta(capture)}</p>

      <section class="thread-actions" aria-label="新增延伸記錄">
        <button class="pill" data-action="append-text">＋文字</button>
        <button class="pill" data-action="append-photo">＋照片</button>
        <button class="pill" data-action="append-audio">＋錄音</button>
      </section>

      ${materials.filter((material) => material.type === MATERIAL_TYPES.PHOTO).length ? renderPhotoSection(materials) : ""}
      ${materials.find((material) => material.type === MATERIAL_TYPES.AUDIO) ? renderAudioSection(materials.find((material) => material.type === MATERIAL_TYPES.AUDIO), capture) : ""}

      ${renderThreadSection(capture, materials)}

      <section>
        <div class="section-label">Transcript</div>
        <div class="card" style="padding:14px;color:var(--text-soft)">
          ${escapeHTML(capture.transcript || "還沒有轉錄。v1 先保留音訊與 Markdown placeholder。")}
        </div>
      </section>

      <section>
        <div class="section-label">AI-ready Markdown</div>
        <div class="card markdown-preview">${escapeHTML(markdown)}</div>
      </section>

      <section>
        <div class="section-label">Materials</div>
        <div class="card material-list">
          <div class="material-item"><span>note.md</span><span>generated</span></div>
          <div class="material-item"><span>metadata.json</span><span>generated</span></div>
          ${materials.map((material) => `<div class="material-item"><span>${escapeHTML(material.filename)}</span><span>${formatBytes(material.size)}</span></div>`).join("")}
        </div>
      </section>

      <nav class="bottom-dock" aria-label="capture actions">
        <button class="dock-secondary" data-action="detail-copy">複製</button>
        <button class="primary ai" data-action="detail-share">傳給 AI</button>
        <button class="dock-secondary" data-action="detail-export">匯出</button>
      </nav>
    </main>
  `;
}

function renderThreadSection(capture, materials) {
  const entries = normalizeCaptureThread(capture).entries || [];
  return `
    <section>
      <div class="section-label">Discussion Thread · ${entries.length}</div>
      <div class="thread-list">
        ${entries.length ? entries.map((entry, index) => renderEntryCard(entry, materials, index)).join("") : `
          <div class="card" style="padding:14px;color:var(--text-soft)">還沒有延伸記錄。</div>
        `}
      </div>
    </section>
  `;
}

function renderEntryCard(entry, materials, index) {
  const entryMaterials = materials.filter((material) => material.entryId === entry.id || entry.materialIds?.includes(material.id));
  const mediaText = [
    entry.photoCount ? `${entry.photoCount} photo` : "",
    entry.durationMs ? formatDuration(entry.durationMs) : "",
    entryMaterials.length ? `${entryMaterials.length} files` : ""
  ].filter(Boolean).join(" · ");

  return `
    <article class="thread-entry card">
      <div class="thread-entry-head">
        <span class="comment-index">${index + 1}</span>
        <div>
          <strong>${ENTRY_TYPE_LABELS[entry.type] || entry.type}</strong>
          <div class="meta">${formatDateTime(entry.createdAt)}${mediaText ? ` · ${escapeHTML(mediaText)}` : ""}</div>
        </div>
      </div>
      ${entry.text ? `<p>${escapeHTML(entry.text)}</p>` : ""}
      ${entry.transcript ? `<p class="meta">${escapeHTML(entry.transcript)}</p>` : ""}
      ${entryMaterials.length ? `
        <div class="entry-materials">
          ${entryMaterials.map((material) => `<span>${escapeHTML(material.filename)}</span>`).join("")}
        </div>
      ` : ""}
    </article>
  `;
}

function renderPhotoSection(materials) {
  const photos = materials.filter((material) => material.type === MATERIAL_TYPES.PHOTO);
  return `
    <section>
      <div class="section-label">Photos · ${photos.length}</div>
      <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px">
        ${photos.map((photo, index) => `
          <div class="thumb" style="min-width:210px;background-image:url('${objectUrlForBlob(photo.blob)}');background-size:cover;background-position:center">
            <span class="pill" style="position:absolute;left:10px;bottom:10px">${index + 1}</span>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderAudioSection(material, capture) {
  const url = objectUrlForBlob(material.blob);
  return `
    <section>
      <div class="section-label">Audio</div>
      <div class="card" style="padding:14px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
          <strong>${formatDuration(capture.durationMs)}</strong>
          <span class="meta">${escapeHTML(material.filename)}</span>
        </div>
        <audio controls src="${url}" style="width:100%;margin-top:12px"></audio>
      </div>
    </section>
  `;
}

function renderSheet() {
  switch (state.sheet.type) {
  case "text":
    return renderTextSheet();
  case "post-photo":
    return renderPostPhotoSheet();
  case "recorder":
    return renderRecorderSheet();
  case "support":
    return renderSupportSheet();
  default:
    return "";
  }
}

function renderTextSheet() {
  const isAppend = Boolean(state.sheet.captureId);
  return `
    <div class="sheet-backdrop">
      <section class="sheet">
        <h2>${isAppend ? "新增文字延伸" : "純文字 .md"}</h2>
        <p class="meta">${isAppend ? "這會成為目前 post 的新 comment，AI 會把整串重新聚合。" : "先寫下來，Sparks 會整理成 AI-ready Markdown。"}</p>
        <textarea id="text-input" class="editor" autofocus placeholder="今天想到...">${escapeHTML(state.sheet.text || "")}</textarea>
        <div class="sheet-actions">
          <button class="primary" data-action="save-text">${isAppend ? "加入 comment" : "儲存 note.md"}</button>
          <button class="secondary" data-action="close-sheet">取消</button>
        </div>
      </section>
    </div>
  `;
}

function renderPostPhotoSheet() {
  const count = state.draft?.materials?.filter((material) => material.type === MATERIAL_TYPES.PHOTO).length || 0;
  return `
    <div class="sheet-backdrop">
      <section class="sheet">
        <h2>拍好了。下一步？</h2>
        <p class="meta">已存 ${count} 張到這個 capture draft。</p>
        <div class="sheet-actions">
          <button class="sheet-row primary-row" data-action="record-after-photo">
            <span class="sheet-icon">●</span><span><strong>立即錄音補充</strong><br><small>趁想法還在，會綁定在這個 capture</small></span><span>›</span>
          </button>
          <button class="sheet-row" data-action="add-photo">
            <span class="sheet-icon">＋</span><span><strong>再拍一張</strong><br><small>合併到同一個現場</small></span><span>›</span>
          </button>
          <button class="sheet-row" data-action="finish-photo">
            <span class="sheet-icon">✓</span><span><strong>完成</strong><br><small>先存照片，稍後再整理</small></span><span>›</span>
          </button>
        </div>
      </section>
    </div>
  `;
}

function renderRecorderSheet() {
  const elapsed = state.recorder ? Date.now() - state.recorder.startedAt : 0;
  return `
    <div class="sheet-backdrop">
      <section class="sheet">
        <h2>錄音中</h2>
        <p class="meta">前景短錄音，最多建議 5 分鐘。</p>
        <div class="recorder">
          <div class="status-dot"></div>
          <div class="timer">${formatDuration(elapsed)}</div>
          <div class="wave">${Array.from({ length: 34 }, (_, index) => `<span style="height:${12 + Math.abs(Math.sin(index * 0.7)) * 34}px"></span>`).join("")}</div>
        </div>
        <div class="sheet-actions">
          <button class="primary" data-action="stop-recording">停止並保存</button>
          <button class="secondary" data-action="cancel-recording">取消</button>
        </div>
      </section>
    </div>
  `;
}

function renderSupportSheet() {
  return `
    <div class="sheet-backdrop">
      <section class="sheet">
        <h2>${escapeHTML(state.sheet.title)}</h2>
        <p class="meta">${escapeHTML(state.sheet.message)}</p>
        <div class="sheet-actions">
          <button class="secondary" data-action="close-sheet">知道了</button>
        </div>
      </section>
    </div>
  `;
}

async function handleClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === "refresh") return loadHome();
  if (action === "go-home") return loadHome();
  if (action === "open-detail") return openDetail(id);
  if (action === "open-text") return openTextSheet();
  if (action === "save-text") return saveTextCapture();
  if (action === "start-photo") return startPhotoFlow("new");
  if (action === "add-photo") return startPhotoFlow("append");
  if (action === "finish-photo") return finishPhotoDraft(false);
  if (action === "record-after-photo") return startRecording("photo");
  if (action === "start-audio") return startRecording("audio");
  if (action === "stop-recording") return stopRecording();
  if (action === "cancel-recording") return cancelRecording();
  if (action === "quick-copy") return quickAction(id, "copy");
  if (action === "quick-share") return quickAction(id, "share");
  if (action === "detail-copy") return detailCopy();
  if (action === "detail-share") return detailShare();
  if (action === "detail-export") return detailExport();
  if (action === "append-text") return openTextSheet(state.selectedCapture?.id);
  if (action === "append-photo") return startPhotoFlow("append-existing", state.selectedCapture?.id);
  if (action === "append-audio") return startRecording("append-existing");
  if (action === "backup-current") return backupCurrent(id);
  if (action === "close-sheet") return closeSheet();
}

function openTextSheet(captureId = "") {
  state.sheet = { type: "text", text: "", captureId };
  render();
}

async function saveTextCapture() {
  const textarea = document.querySelector("#text-input");
  const text = textarea?.value?.trim() || "";
  if (!text) return showToast("先寫一點東西");

  if (state.sheet.captureId) {
    return appendTextEntry(state.sheet.captureId, text);
  }

  const ideaNumber = nextIdeaNumber(state.captures);
  const capture = createCapture({
    ideaNumber,
    title: ideaTitle(ideaNumber, titleFromText(text, "文字靈感")),
    kind: CAPTURE_KINDS.TEXT,
    notes: text,
    photoCount: 0
  });
  const entry = createEntry({
    captureId: capture.id,
    type: ENTRY_TYPES.TEXT,
    text,
    createdAt: capture.createdAt
  });
  capture.entries = [entry];

  await saveCaptureWithMaterials(capture, []);
  await refreshStorage();
  state.sheet = null;
  prepareBackupInBackground(capture.id);
  await openDetail(capture.id);
  showToast("已保存在本機，右上角可備份");
}

async function appendTextEntry(captureId, text) {
  const capture = await getCapture(captureId);
  const entry = createEntry({
    captureId,
    type: ENTRY_TYPES.TEXT,
    text
  });
  const updated = appendEntry(capture, entry);
  await updateCapture(updated);
  state.sheet = null;
  await refreshStorage();
  await openDetail(captureId);
  prepareBackupInBackground(captureId);
  showToast("已新增文字 comment");
}

function startPhotoFlow(mode, captureId = "") {
  photoInput.dataset.mode = mode;
  photoInput.dataset.captureId = captureId;
  photoInput.value = "";
  photoInput.click();
}

async function handlePhotoInput(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const compressed = await compressImageFile(file);
    if (photoInput.dataset.mode === "append-existing") {
      await appendPhotoEntry(photoInput.dataset.captureId, compressed);
      return;
    }

    const draft = state.draft || createPhotoDraft();
    const index = draft.materials.filter((material) => material.type === MATERIAL_TYPES.PHOTO).length + 1;
    const filename = `photo_${String(index).padStart(3, "0")}.jpg`;
    const material = createMaterial({
      captureId: draft.capture.id,
      entryId: draft.entry.id,
      filename,
      type: MATERIAL_TYPES.PHOTO,
      mimeType: compressed.type || "image/jpeg",
      size: compressed.size,
      blob: compressed
    });

    draft.materials.push(material);
    draft.entry.materialIds.push(material.id);
    draft.entry.photoCount = draft.materials.filter((item) => item.type === MATERIAL_TYPES.PHOTO).length;
    draft.entry.type = deriveEntryType({ photoCount: draft.entry.photoCount });
    draft.capture.photoCount = draft.materials.filter((item) => item.type === MATERIAL_TYPES.PHOTO).length;
    draft.capture.kind = deriveCaptureKind({ photoCount: draft.capture.photoCount });
    draft.capture.materialIds = draft.materials.map((item) => item.id);
    draft.capture.entries = [draft.entry];
    state.draft = draft;
    state.sheet = { type: "post-photo" };
    render();
  } catch (error) {
    showSupport("照片保存失敗", error.message || "請再試一次，或改用純文字記錄。");
  }
}

function createPhotoDraft() {
  const ideaNumber = nextIdeaNumber(state.captures);
  const capture = createCapture({
    ideaNumber,
    title: ideaTitle(ideaNumber, "拍下的現場"),
    kind: CAPTURE_KINDS.PHOTO,
    notes: "拍下現場後，可以補一句你想到的。",
    photoCount: 0
  });
  const entry = createEntry({
    captureId: capture.id,
    type: ENTRY_TYPES.PHOTO,
    text: capture.notes,
    createdAt: capture.createdAt
  });
  capture.entries = [entry];
  return { capture, entry, materials: [] };
}

async function appendPhotoEntry(captureId, file) {
  if (!captureId) return showSupport("找不到原始記錄", "請回到首頁重新打開記錄後再新增照片。");
  const capture = await getCapture(captureId);
  const existingMaterials = await getMaterialsForCapture(captureId);
  const photoIndex = existingMaterials.filter((item) => item.type === MATERIAL_TYPES.PHOTO).length + 1;
  const entry = createEntry({
    captureId,
    type: ENTRY_TYPES.PHOTO,
    photoCount: 1
  });
  const material = createMaterial({
    captureId,
    entryId: entry.id,
    filename: `photo_${String(photoIndex).padStart(3, "0")}.jpg`,
    type: MATERIAL_TYPES.PHOTO,
    mimeType: file.type || "image/jpeg",
    size: file.size,
    blob: file
  });
  entry.materialIds = [material.id];
  const updated = appendEntry(capture, entry);
  await saveCaptureWithMaterials(updated, [material]);
  await refreshStorage();
  await openDetail(captureId);
  prepareBackupInBackground(captureId);
  showToast("已新增照片 comment");
}

async function finishPhotoDraft(hasAudio) {
  if (!state.draft) return;
  const draft = state.draft;
  draft.capture.kind = deriveCaptureKind({
    photoCount: draft.capture.photoCount,
    hasAudio
  });
  draft.capture.materialIds = draft.materials.map((item) => item.id);
  draft.capture.updatedAt = new Date().toISOString();

  await saveCaptureWithMaterials(draft.capture, draft.materials);
  await refreshStorage();
  state.draft = null;
  state.sheet = null;
  prepareBackupInBackground(draft.capture.id);
  await openDetail(draft.capture.id);
  showToast("已保存在本機，右上角可備份");
}

async function startRecording(mode) {
  if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
    return showSupport("這個瀏覽器不支援錄音", "請用 iPhone Safari 或支援 MediaRecorder 的瀏覽器開啟。");
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickSupportedAudioMime();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };
    recorder.onstop = () => finishRecording(mode, stream, chunks, recorder.mimeType || mimeType);
    recorder.start(1000);
    state.recorder = {
      mode,
      stream,
      recorder,
      chunks,
      startedAt: Date.now(),
      captureId: mode === "append-existing" ? state.selectedCapture?.id : "",
      interval: setInterval(render, 500)
    };
    state.sheet = { type: "recorder" };
    render();
  } catch (error) {
    showSupport("無法開始錄音", error.message || "請確認麥克風權限。");
  }
}

function stopRecording() {
  if (!state.recorder) return;
  state.recorder.recorder.stop();
}

function cancelRecording() {
  if (!state.recorder) return;
  cleanupRecorder();
  state.sheet = null;
  render();
}

async function finishRecording(mode, stream, chunks, mimeType) {
  const recorderState = state.recorder;
  const durationMs = recorderState ? Date.now() - recorderState.startedAt : 0;
  cleanupRecorder(stream);
  const blob = new Blob(chunks, { type: mimeType || "audio/mp4" });
  const extension = extensionForMime(blob.type || "audio/mp4");
  const filename = `audio.${extension === "mp4" ? "m4a" : extension}`;

  if (mode === "append-existing" && recorderState?.captureId) {
    return appendAudioEntry(recorderState.captureId, blob, filename, durationMs);
  }

  if (mode === "photo" && state.draft) {
    const material = createMaterial({
      captureId: state.draft.capture.id,
      entryId: state.draft.entry.id,
      filename,
      type: MATERIAL_TYPES.AUDIO,
      mimeType: blob.type || "audio/mp4",
      size: blob.size,
      blob
    });
    state.draft.materials.push(material);
    state.draft.entry.materialIds.push(material.id);
    state.draft.entry.durationMs = durationMs;
    state.draft.entry.transcript = "v1 已保存錄音。需要時可把音訊與 Markdown 一起存到檔案。";
    state.draft.entry.type = deriveEntryType({
      photoCount: state.draft.entry.photoCount,
      hasAudio: true,
      hasText: Boolean(state.draft.entry.text)
    });
    state.draft.capture.durationMs = durationMs;
    state.draft.capture.transcript = "v1 已保存錄音。需要時可把音訊與 Markdown 一起存到檔案。";
    return finishPhotoDraft(true);
  }

  const ideaNumber = nextIdeaNumber(state.captures);
  const capture = createCapture({
    ideaNumber,
    title: ideaTitle(ideaNumber, "錄下的想法"),
    kind: CAPTURE_KINDS.AUDIO,
    transcript: "v1 已保存錄音。後續可加入語音轉文字。",
    durationMs,
    photoCount: 0
  });
  const entry = createEntry({
    captureId: capture.id,
    type: ENTRY_TYPES.AUDIO,
    transcript: capture.transcript,
    durationMs,
    createdAt: capture.createdAt
  });
  const material = createMaterial({
    captureId: capture.id,
    entryId: entry.id,
    filename,
    type: MATERIAL_TYPES.AUDIO,
    mimeType: blob.type || "audio/mp4",
    size: blob.size,
    blob
  });
  entry.materialIds = [material.id];
  capture.materialIds = [material.id];
  capture.entries = [entry];
  await saveCaptureWithMaterials(capture, [material]);
  await refreshStorage();
  state.sheet = null;
  prepareBackupInBackground(capture.id);
  await openDetail(capture.id);
  showToast("已保存在本機，右上角可備份");
}

async function appendAudioEntry(captureId, blob, filename, durationMs) {
  const capture = await getCapture(captureId);
  const entry = createEntry({
    captureId,
    type: ENTRY_TYPES.AUDIO,
    transcript: "v1 已保存錄音。後續可加入語音轉文字。",
    durationMs
  });
  const material = createMaterial({
    captureId,
    entryId: entry.id,
    filename,
    type: MATERIAL_TYPES.AUDIO,
    mimeType: blob.type || "audio/mp4",
    size: blob.size,
    blob
  });
  entry.materialIds = [material.id];
  const updated = appendEntry(capture, entry);
  await saveCaptureWithMaterials(updated, [material]);
  await refreshStorage();
  await openDetail(captureId);
  prepareBackupInBackground(captureId);
  showToast("已新增錄音 comment");
}

function cleanupRecorder(stream = state.recorder?.stream) {
  if (state.recorder?.interval) clearInterval(state.recorder.interval);
  stream?.getTracks?.().forEach((track) => track.stop());
  state.recorder = null;
}

async function quickAction(id, type) {
  const payload = await payloadForCapture(id);
  if (type === "copy") return copyMarkdown(payload.capture, payload.materials);
  return shareAI(payload.capture, payload.materials);
}

async function detailCopy() {
  await copyMarkdown(state.selectedCapture, state.selectedMaterials);
  await openDetail(state.selectedCapture.id);
}

async function detailShare() {
  await shareAI(state.selectedCapture, state.selectedMaterials);
  await openDetail(state.selectedCapture.id);
}

async function detailExport() {
  await exportFiles(state.selectedCapture, state.selectedMaterials);
  await openDetail(state.selectedCapture.id);
}

async function backupCurrent(id = "") {
  const captureId = id || state.selectedCapture?.id || state.captures.find((capture) => capture.status !== CAPTURE_STATUS.EXPORTED)?.id || state.captures[0]?.id;
  if (!captureId) return showToast("目前沒有可備份的內容");
  const payload = await payloadForCapture(captureId);
  await exportFiles(payload.capture, payload.materials);
  if (state.view === "detail" && state.selectedCapture?.id === captureId) {
    await openDetail(captureId);
  } else {
    await loadHome();
  }
}

async function payloadForCapture(id) {
  const capture = await getCapture(id);
  const materials = await getMaterialsForCapture(id);
  return { capture, materials };
}

async function copyMarkdown(capture, materials) {
  const text = buildShareText(capture, materials);
  try {
    await navigator.clipboard.writeText(text);
    await saveStatus(capture, "copy_ai");
    showToast("已複製給 AI");
  } catch {
    showSupport("無法自動複製", "請打開詳情頁手動選取 Markdown。");
  }
}

async function shareAI(capture, materials) {
  const text = buildShareText(capture, materials);
  if (!navigator.share) {
    await copyMarkdown(capture, materials);
    return;
  }
  try {
    await navigator.share({ title: capture.title, text });
    await saveStatus(capture, "share_ai");
  } catch (error) {
    if (error.name !== "AbortError") await copyMarkdown(capture, materials);
  }
}

async function exportFiles(capture, materials) {
  const prepared = state.backup.captureId === capture.id && state.backup.file ? state.backup.file : null;
  const zipFile = prepared || await buildExportZipFile(capture, materials, {
    onProgress: (progress) => {
      state.backup = { status: "preparing", captureId: capture.id, progress, file: null };
      render();
    }
  });
  state.backup = { status: "ready", captureId: capture.id, progress: 100, file: zipFile };
  const files = [zipFile];

  if (navigator.share && canShareFiles(files)) {
    try {
      await navigator.share({ title: capture.title, files });
      await saveStatus(capture, "save_to_files");
      state.backup = { status: "idle", captureId: "", progress: 0, file: null };
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }

  downloadFile(zipFile);
  await saveStatus(capture, "save_to_files");
  state.backup = { status: "idle", captureId: "", progress: 0, file: null };
  showToast("已下載 ZIP");
}

async function prepareBackupInBackground(captureId) {
  if (!captureId) return;
  state.backup = { status: "preparing", captureId, progress: 8, file: null };
  render();
  try {
    const payload = await payloadForCapture(captureId);
    const file = await buildExportZipFile(payload.capture, payload.materials, {
      onProgress: (progress) => {
        if (state.backup.captureId === captureId) {
          state.backup = { status: "preparing", captureId, progress: Math.max(12, progress), file: null };
          render();
        }
      }
    });
    state.backup = { status: "ready", captureId, progress: 100, file };
    render();
  } catch {
    state.backup = { status: "dirty", captureId, progress: 0, file: null };
    render();
  }
}

async function saveStatus(capture, action) {
  const updated = applyPostSaveAction(capture, action);
  await updateCapture(updated);
  if (state.selectedCapture?.id === capture.id) state.selectedCapture = updated;
}

function closeSheet() {
  state.sheet = null;
  render();
}

function showSupport(title, message) {
  state.sheet = { type: "support", title, message };
  render();
}

function showToast(message) {
  state.toast = message;
  render();
  setTimeout(() => {
    if (state.toast === message) {
      state.toast = "";
      render();
    }
  }, 1600);
}

function captureMeta(capture) {
  const thread = normalizeCaptureThread(capture);
  const pieces = [KIND_LABELS[thread.kind] || thread.kind];
  if (thread.entries?.length) pieces.push(`${thread.entries.length} comments`);
  if (thread.photoCount > 1) pieces.push(`x${thread.photoCount}`);
  if (thread.durationMs) pieces.push(formatDuration(thread.durationMs));
  pieces.push(formatDateTime(thread.createdAt));
  return pieces.join(" · ");
}

function kindGlyph(kind) {
  switch (kind) {
  case CAPTURE_KINDS.PHOTO:
    return "□";
  case CAPTURE_KINDS.MULTI_PHOTO:
    return "▣";
  case CAPTURE_KINDS.PHOTO_VOICE:
    return "◉";
  case CAPTURE_KINDS.AUDIO:
    return "≋";
  case CAPTURE_KINDS.TEXT:
    return "T";
  default:
    return "•";
  }
}

function warningText(code) {
  if (code === "local_storage_high") return "本機儲存空間偏高，建議先存到檔案。";
  if (code === "backup_recommended") return "有多筆素材只保存在本機，建議存到檔案。";
  return "";
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
