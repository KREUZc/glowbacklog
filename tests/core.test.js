import test from "node:test";
import assert from "node:assert/strict";

import { applyPostSaveAction, storageWarning } from "../src/core/actions.js";
import { buildExportFiles, buildExportZipFile, buildShareText, canShareFiles, exportPackageName } from "../src/core/export.js";
import { captureFolderName, fileDateStamp, formatBytes, formatDuration, slugify } from "../src/core/format.js";
import { buildMarkdown, buildMetadata } from "../src/core/markdown.js";
import { extensionForMime, pickSupportedAudioMime } from "../src/core/media.js";
import {
  CAPTURE_KINDS,
  CAPTURE_STATUS,
  ENTRY_TYPES,
  MATERIAL_TYPES,
  appendEntry,
  createCapture,
  createEntry,
  createMaterial,
  deriveCaptureKind,
  ideaTitle,
  nextIdeaNumber,
  normalizeCaptureThread,
  statusAfterAction,
  titleFromText
} from "../src/core/schema.js";

test("deriveCaptureKind maps capture materials to product kinds", () => {
  assert.equal(deriveCaptureKind({ photoCount: 1 }), CAPTURE_KINDS.PHOTO);
  assert.equal(deriveCaptureKind({ photoCount: 3 }), CAPTURE_KINDS.MULTI_PHOTO);
  assert.equal(deriveCaptureKind({ photoCount: 2, hasAudio: true }), CAPTURE_KINDS.PHOTO_VOICE);
  assert.equal(deriveCaptureKind({ hasAudio: true }), CAPTURE_KINDS.AUDIO);
  assert.equal(deriveCaptureKind({ hasText: true }), CAPTURE_KINDS.TEXT);
});

test("statusAfterAction supports the post-save action sheet", () => {
  assert.equal(statusAfterAction("copy_ai"), CAPTURE_STATUS.COPIED);
  assert.equal(statusAfterAction("share_ai"), CAPTURE_STATUS.SHARED);
  assert.equal(statusAfterAction("save_to_files"), CAPTURE_STATUS.EXPORTED);
  assert.equal(statusAfterAction("later"), CAPTURE_STATUS.UNEXPORTED);
});

test("format helpers produce stable user-facing and file-safe values", () => {
  const date = new Date("2026-06-06T12:20:00+08:00");
  assert.equal(fileDateStamp(date), "2026-06-06_1220");
  assert.equal(slugify("咖啡店 / menu #1"), "咖啡店-menu-1");
  assert.equal(formatDuration(65_000), "1:05");
  assert.equal(formatBytes(1536), "1.5 KB");
});

test("captureFolderName combines date stamp and safe title", () => {
  const capture = createCapture({
    title: "咖啡店菜單 / 點餐想法",
    createdAt: "2026-06-06T12:20:00+08:00"
  });
  assert.equal(captureFolderName(capture), "2026-06-06_1220-咖啡店菜單-點餐想法");
  assert.equal(exportPackageName(capture), "2026-06-06_1220-咖啡店菜單-點餐想法.zip");
});

test("titleFromText creates short titles from text captures", () => {
  assert.equal(titleFromText("第一行\n第二行"), "第一行");
  assert.equal(titleFromText(""), "");
  assert.match(titleFromText("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"), /\.\.\.$/);
});

test("idea numbering starts at 101 and creates readable post titles", () => {
  assert.equal(nextIdeaNumber([]), 101);
  assert.equal(ideaTitle(101, "咖啡店菜單"), "點子101｜咖啡店菜單");
  assert.equal(nextIdeaNumber([
    createCapture({ title: "舊資料一" }),
    createCapture({ title: "舊資料二" })
  ]), 103);
  assert.equal(nextIdeaNumber([
    createCapture({ ideaNumber: 101, title: "點子101｜咖啡店菜單" }),
    createCapture({ title: "點子104｜展場觀察" })
  ]), 105);
});

test("capture acts as a post and appended entries act as comments", () => {
  const capture = createCapture({
    title: "產品想法",
    notes: "先拍白板",
    createdAt: "2026-06-06T12:20:00+08:00"
  });
  capture.entries = [createEntry({
    captureId: capture.id,
    type: ENTRY_TYPES.TEXT,
    text: "先拍白板",
    createdAt: capture.createdAt
  })];
  const updated = appendEntry(capture, createEntry({
    captureId: capture.id,
    type: ENTRY_TYPES.TEXT,
    text: "補充：這比較像 thread，不是單筆 note。"
  }));

  assert.equal(updated.entries.length, 2);
  assert.equal(updated.status, CAPTURE_STATUS.UNEXPORTED);
  assert.match(updated.notes, /thread/);
});

test("legacy captures normalize into a root thread entry", () => {
  const capture = createCapture({
    title: "舊資料",
    notes: "legacy note"
  });
  const normalized = normalizeCaptureThread(capture);
  assert.equal(normalized.entries.length, 1);
  assert.equal(normalized.entries[0].id, `${capture.id}_root`);
  assert.equal(normalized.entries[0].text, "legacy note");
});

test("buildMarkdown includes AI-ready required sections", () => {
  const capture = createCapture({
    title: "Roadmap 白板會議",
    createdAt: "2026-06-06T12:20:00+08:00",
    kind: CAPTURE_KINDS.PHOTO_VOICE,
    notes: "白板上有 MVP、beta、launch。",
    transcript: "先做 PWA MVP。"
  });
  const material = createMaterial({
    captureId: capture.id,
    filename: "photo_001.jpg",
    type: MATERIAL_TYPES.PHOTO,
    mimeType: "image/jpeg",
    size: 123,
    blob: new Blob(["x"], { type: "image/jpeg" })
  });
  const markdown = buildMarkdown(capture, [material]);
  assert.match(markdown, /^# Roadmap 白板會議/);
  assert.match(markdown, /Idea: 未編號點子/);
  assert.match(markdown, /## AI Aggregate Brief/);
  assert.match(markdown, /## Current Context/);
  assert.match(markdown, /## Aggregated Notes/);
  assert.match(markdown, /## Aggregated Transcript/);
  assert.match(markdown, /## All Materials/);
  assert.match(markdown, /## Discussion Thread/);
  assert.match(markdown, /photo_001\.jpg/);
  assert.match(markdown, /## For AI/);
});

test("buildShareText wraps Markdown with an action prompt", () => {
  const capture = createCapture({ ideaNumber: 101, title: "點子101｜靈感", notes: "做一個工具。" });
  const text = buildShareText(capture, []);
  assert.match(text, /請根據以下素材/);
  assert.match(text, /# 點子101｜靈感/);
  assert.match(text, /### 點子101-1/);
});

test("buildMetadata creates export manifest", () => {
  const capture = createCapture({ title: "素材", kind: CAPTURE_KINDS.TEXT });
  const metadata = buildMetadata(capture, []);
  assert.equal(metadata.id, capture.id);
  assert.equal(metadata.export_version, 1);
  assert.equal(metadata.capture_type, CAPTURE_KINDS.TEXT);
  assert.equal(metadata.idea_number, null);
});

test("buildExportFiles returns note metadata and media files", () => {
  const capture = createCapture({ title: "匯出測試", notes: "內容" });
  const material = createMaterial({
    captureId: capture.id,
    filename: "audio.m4a",
    type: MATERIAL_TYPES.AUDIO,
    mimeType: "audio/mp4",
    size: 5,
    blob: new Blob(["audio"], { type: "audio/mp4" })
  });
  const files = buildExportFiles(capture, [material]);
  assert.equal(files[0].name, "note.md");
  assert.equal(files[1].name, "metadata.json");
  assert.equal(files[2].name, "audio.m4a");
});

test("buildExportZipFile returns a standard named zip package", async () => {
  const capture = createCapture({
    title: "ZIP 測試",
    createdAt: "2026-06-06T12:20:00+08:00",
    notes: "內容"
  });
  const zipFile = await buildExportZipFile(capture, []);
  const bytes = new Uint8Array(await zipFile.arrayBuffer());
  assert.equal(zipFile.name, "2026-06-06_1220-zip-測試.zip");
  assert.equal(zipFile.type, "application/zip");
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
});

test("audio MIME helpers feature-detect without hard coding a single format", () => {
  const fakeRecorder = {
    isTypeSupported(type) {
      return type === "audio/webm;codecs=opus";
    }
  };
  assert.equal(pickSupportedAudioMime(fakeRecorder), "audio/webm;codecs=opus");
  assert.equal(extensionForMime("audio/mp4"), "m4a");
  assert.equal(extensionForMime("audio/webm;codecs=opus"), "webm");
});

test("canShareFiles handles missing and throwing navigator.canShare safely", () => {
  assert.equal(canShareFiles([new File(["x"], "x.md")], {}), false);
  assert.equal(canShareFiles([new File(["x"], "x.md")], { canShare: () => true }), true);
  assert.equal(canShareFiles([new File(["x"], "x.md")], { canShare: () => { throw new Error("nope"); } }), false);
});

test("post-save action updates capture status", () => {
  const capture = createCapture({ title: "saved" });
  const copied = applyPostSaveAction(capture, "copy_ai");
  assert.equal(copied.status, CAPTURE_STATUS.COPIED);
  assert.match(copied.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("storageWarning recommends backup before local-only data piles up", () => {
  assert.equal(storageWarning({ usage: 900, quota: 1000, unexportedCount: 0 }), "local_storage_high");
  assert.equal(storageWarning({ usage: 10, quota: 1000, unexportedCount: 5 }), "backup_recommended");
  assert.equal(storageWarning({ usage: 10, quota: 1000, unexportedCount: 1 }), "");
});
