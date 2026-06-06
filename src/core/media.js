export const AUDIO_MIME_CANDIDATES = [
  "audio/mp4",
  "audio/aac",
  "audio/webm;codecs=opus",
  "audio/webm"
];

export function pickSupportedAudioMime(mediaRecorder = globalThis.MediaRecorder) {
  if (!mediaRecorder?.isTypeSupported) return "";
  return AUDIO_MIME_CANDIDATES.find((type) => mediaRecorder.isTypeSupported(type)) || "";
}

export function extensionForMime(mimeType = "") {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("markdown")) return "md";
  if (mimeType.includes("json")) return "json";
  return "bin";
}

export async function compressImageFile(file, { maxEdge = 1800, quality = 0.82 } = {}) {
  if (!file?.type?.startsWith("image/")) return file;
  if (!globalThis.createImageBitmap || !globalThis.document) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });

  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
}

export function objectUrlForBlob(blob) {
  if (!blob || !globalThis.URL?.createObjectURL) return "";
  return URL.createObjectURL(blob);
}
