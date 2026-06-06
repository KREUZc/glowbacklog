import { buildAIPrompt, buildMarkdown, buildMetadataJson } from "./markdown.js";
import { captureFolderName } from "./format.js";
import { buildZipBlob } from "./zip.js";

export function makeFile(parts, filename, type) {
  if (typeof File !== "undefined") {
    return new File(parts, filename, { type });
  }
  return { parts, name: filename, type };
}

export function buildExportFiles(capture, materials = []) {
  const noteFile = makeFile([buildMarkdown(capture, materials)], "note.md", "text/markdown;charset=utf-8");
  const metadataFile = makeFile([buildMetadataJson(capture, materials)], "metadata.json", "application/json;charset=utf-8");
  const mediaFiles = materials
    .filter((material) => material.blob)
    .map((material) => makeFile([material.blob], material.filename, material.mimeType));
  return [noteFile, metadataFile, ...mediaFiles];
}

export function buildShareText(capture, materials = []) {
  return buildAIPrompt(capture, materials);
}

export function exportPackageName(capture) {
  return `${captureFolderName(capture)}.zip`;
}

export async function buildExportZipFile(capture, materials = [], { onProgress } = {}) {
  const files = buildExportFiles(capture, materials);
  const zipBlob = await buildZipBlob(files, {
    folder: captureFolderName(capture),
    onProgress
  });
  return makeFile([zipBlob], exportPackageName(capture), "application/zip");
}

export function canShareFiles(files, nav = globalThis.navigator) {
  if (!files?.length) return false;
  if (!nav?.canShare) return false;
  try {
    return nav.canShare({ files });
  } catch {
    return false;
  }
}

export function downloadFile(file) {
  if (!globalThis.document || !globalThis.URL?.createObjectURL) return false;
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name || "note.md";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
