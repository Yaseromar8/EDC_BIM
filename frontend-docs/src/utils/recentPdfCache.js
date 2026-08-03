const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 3;
const TTL_MS = 10 * 60 * 1000;

const entries = new Map();

function makeKey(nodeId, version) {
  return `${String(nodeId)}:${String(version || 1)}`;
}

function revokeEntry(key, entry) {
  try {
    URL.revokeObjectURL(entry.url);
  } catch {
    // La URL ya pudo haber sido revocada por el navegador.
  }
  entries.delete(key);
}

function removeExpired(now = Date.now()) {
  for (const [key, entry] of entries) {
    if (now - entry.lastAccess > TTL_MS) revokeEntry(key, entry);
  }
}

function enforceLimits() {
  let totalBytes = Array.from(entries.values()).reduce((sum, entry) => sum + entry.size, 0);
  while (entries.size > MAX_ENTRIES || totalBytes > MAX_TOTAL_BYTES) {
    const oldest = entries.entries().next().value;
    if (!oldest) break;
    const [key, entry] = oldest;
    totalBytes -= entry.size;
    revokeEntry(key, entry);
  }
}

export function rememberRecentPdf({ nodeId, version, gcsUrn, file }) {
  const lowerName = file?.name?.toLowerCase() || '';
  const isPdf = file?.type === 'application/pdf' || lowerName.endsWith('.pdf') || lowerName.endsWith('.pdfx');
  if (!nodeId || !file || !isPdf || file.size > MAX_FILE_BYTES) return null;

  removeExpired();
  const key = makeKey(nodeId, version);
  const previous = entries.get(key);
  if (previous) revokeEntry(key, previous);

  const entry = {
    url: URL.createObjectURL(file),
    nodeId: String(nodeId),
    version: Number(version || 1),
    gcsUrn: gcsUrn || '',
    size: file.size,
    lastAccess: Date.now(),
  };
  entries.set(key, entry);
  enforceLimits();
  return entry.url;
}

export function getRecentPdfUrl({ nodeId, version, gcsUrn }) {
  if (!nodeId) return null;
  removeExpired();

  const entry = entries.get(makeKey(nodeId, version));
  if (!entry) return null;
  if (gcsUrn && entry.gcsUrn && gcsUrn !== entry.gcsUrn) {
    revokeEntry(makeKey(nodeId, version), entry);
    return null;
  }

  entry.lastAccess = Date.now();
  const key = makeKey(nodeId, version);
  entries.delete(key);
  entries.set(key, entry);
  return entry.url;
}

export function clearRecentPdfCache() {
  for (const [key, entry] of entries) revokeEntry(key, entry);
}
