export async function requestPersistentStorage(nav = globalThis.navigator) {
  if (!nav?.storage?.persist) return false;
  try {
    return await nav.storage.persist();
  } catch {
    return false;
  }
}

export async function estimateStorage(nav = globalThis.navigator) {
  if (!nav?.storage?.estimate) return { usage: 0, quota: 0, available: 0 };
  try {
    const estimate = await nav.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    return { usage, quota, available: Math.max(0, quota - usage) };
  } catch {
    return { usage: 0, quota: 0, available: 0 };
  }
}
