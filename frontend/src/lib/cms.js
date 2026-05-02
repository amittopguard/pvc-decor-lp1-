import { api } from "./api";

// Cache with 30-second TTL so admin edits reflect quickly
const cache = {};
const CACHE_TTL = 30 * 1000; // 30 seconds

export async function fetchCMS(collection) {
  const now = Date.now();
  if (cache[collection] && (now - cache[collection].ts) < CACHE_TTL) {
    return cache[collection].data;
  }
  try {
    const { data } = await api.get(`/content/${collection}`);
    const items = data.items || [];
    cache[collection] = { data: items, ts: now };
    return items;
  } catch (e) {
    console.warn(`CMS fetch failed for "${collection}":`, e.message);
    // Return stale cache if available
    if (cache[collection]) return cache[collection].data;
    return [];
  }
}

// Get single item (first in collection)
export async function fetchCMSSingle(collection) {
  const items = await fetchCMS(collection);
  return items[0] || null;
}

// Clear cache (call after admin saves)
export function clearCMSCache(collection) {
  if (collection) {
    delete cache[collection];
  } else {
    Object.keys(cache).forEach((k) => delete cache[k]);
  }
}
