import { CAPTURE_STATUS, statusAfterAction } from "./schema.js";

export function applyPostSaveAction(capture, action) {
  return {
    ...capture,
    status: statusAfterAction(action),
    updatedAt: new Date().toISOString()
  };
}

export function storageWarning({ usage = 0, quota = 0, unexportedCount = 0 } = {}) {
  if (quota > 0 && usage / quota > 0.82) return "local_storage_high";
  if (unexportedCount >= 5) return "backup_recommended";
  return "";
}

export function isCaptureSafeEnough(capture) {
  return capture.status !== CAPTURE_STATUS.UNEXPORTED;
}
