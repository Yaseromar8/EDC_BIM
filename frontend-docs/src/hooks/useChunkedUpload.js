/**
 * useChunkedUpload — Resumable Chunked Upload Engine
 * ===================================================
 * GCS-native resumable upload protocol with:
 * - 8MB chunks (Google recommended)
 * - 3 concurrent uploads
 * - Auto-retry with exponential backoff
 * - Resume from last confirmed byte on disconnect
 * - Progress tracking per file
 */
import { useState, useCallback, useRef } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { rememberRecentPdf } from '../utils/recentPdfCache';

const MAX_CONCURRENT = 3;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 2000; // 2s, then 4s, then 8s

function putChunkWithProgress({ sessionUri, chunk, contentRange, contentType, onRequest, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', sessionUri);
    xhr.timeout = 120_000;
    xhr.setRequestHeader('Content-Range', contentRange);
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onload = () => resolve({
      status: xhr.status,
      text: xhr.responseText || '',
      range: xhr.getResponseHeader('Range'),
    });
    xhr.onerror = () => reject(new Error('No se pudo conectar con el almacenamiento'));
    xhr.ontimeout = () => reject(new Error('La transferencia tardó demasiado'));
    xhr.onabort = () => reject(new DOMException('Carga cancelada', 'AbortError'));

    onRequest(xhr);
    xhr.send(chunk);
  });
}

/**
 * Upload states:
 *   queued     → waiting in queue
 *   init       → requesting session from backend  
 *   uploading  → chunks being sent to GCS
 *   confirming → all chunks done, confirming with backend
 *   completed  → file_node created, done
 *   paused     → connection lost, waiting to retry
 *   error      → permanent failure
 */

export function useChunkedUpload(api, projectPrefix, user, options = {}) {
  const [uploads, setUploads] = useState([]); // Array of upload items
  const activeCountRef = useRef(0);
  const queueRef = useRef([]);
  const cancelledIdsRef = useRef(new Set());
  const executeUploadRef = useRef(null);
  const sendChunksRef = useRef(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const abortControllersRef = useRef(new Map()); // uploadId → AbortController

  // ── Update a single upload item by its id ──
  const updateUpload = useCallback((id, patch) => {
    setUploads(prev => prev.map(u => u.id === id ? { ...u, ...patch } : u));
  }, []);

  // ── Remove an upload from the list ──
  const removeUpload = useCallback((id) => {
    setUploads(prev => prev.filter(u => u.id !== id));
  }, []);

  // ── Get auth headers ──
  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('visor_session_token') || sessionStorage.getItem('visor_session_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, []);

  // ── Process queue: start next uploads if under concurrency limit ──
  const processQueue = useCallback(() => {
    while (activeCountRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const next = queueRef.current.shift();
      if (next) {
        activeCountRef.current++;
        executeUploadRef.current(next).finally(() => {
          activeCountRef.current--;
          processQueue();
        });
      }
    }
  }, []);

  // ── CORE: Execute a single file upload ──
  const executeUpload = useCallback(async (item) => {
    const { id, file, folderPath } = item;

    try {
      // ── STEP 1: INIT — Request resumable session ──
      updateUpload(id, { status: 'init', statusText: 'Preparando la carga segura…' });

      const initRes = await apiFetch(`${api}/api/uploads/init`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          filename: file.name,
          size_bytes: file.size,
          mime_type: file.type || 'application/octet-stream',
          folder_path: folderPath,
          model_urn: projectPrefix,
          user: user?.name
        })
      });

      const initData = await initRes.json();
      if (cancelledIdsRef.current.has(id)) throw new DOMException('Carga cancelada', 'AbortError');
      if (!initRes.ok || !initData.success) {
        updateUpload(id, {
          status: 'error',
          statusText: initData.error || 'Error al iniciar subida',
          errorCode: initData.code || 'INIT_FAILED'
        });
        return;
      }

      const { uploadId, sessionUri, chunkSize, filename } = initData;
      updateUpload(id, {
        uploadId,
        sessionUri,
        chunkSize,
        filename,
        status: 'uploading',
        statusText: 'Subiendo...'
      });

      // ── STEP 2: CHUNK LOOP — Send chunks to GCS ──
      await sendChunksRef.current(id, file, sessionUri, chunkSize, uploadId, 0);
      if (cancelledIdsRef.current.has(id)) throw new DOMException('Carga cancelada', 'AbortError');

      // ── STEP 3: CONFIRM — Register in DB ──
      updateUpload(id, { status: 'confirming', progress: 100, statusText: 'Guardando en Documentos…' });

      const confirmRes = await apiFetch(`${api}/api/uploads/complete`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ uploadId })
      });

      const confirmData = await confirmRes.json();
      if (cancelledIdsRef.current.has(id)) throw new DOMException('Carga cancelada', 'AbortError');
      if (!confirmRes.ok || !confirmData.success) {
        throw new Error(confirmData.error || 'Error al confirmar');
      }

      const now = new Date();
      updateUpload(id, {
        status: 'completed',
        progress: 100,
        statusText: `Archivo listo · ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        nodeId: confirmData.node_id,
        version: confirmData.version,
        gcsUrn: confirmData.gcsUrn,
        filename: confirmData.filename || filename,
      });

      rememberRecentPdf({
        nodeId: confirmData.node_id,
        version: confirmData.version,
        gcsUrn: confirmData.gcsUrn,
        file,
      });

      // 🔥 Callback for UI Reaction & Cache Invalidation
      if (optionsRef.current.onUploadComplete) {
        optionsRef.current.onUploadComplete({
          ...item,
          filename: confirmData.filename || filename,
          version: confirmData.version,
          nodeId: confirmData.node_id,
          gcsUrn: confirmData.gcsUrn,
        }, confirmData);
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        updateUpload(id, { status: 'cancelled', statusText: 'Cancelado' });
      } else {
        console.error(`[ChunkedUpload] Fatal error for ${id}:`, err);
        updateUpload(id, {
          status: 'error',
          statusText: err.message || 'Error desconocido'
        });
      }
    }
  }, [api, projectPrefix, user, getHeaders, updateUpload]);

  // ── CHUNK SENDER with retry logic ──
  const sendChunks = useCallback(async (itemId, file, sessionUri, chunkSize, uploadId, startOffset) => {
    let offset = startOffset;
    let retryCount = 0;
    let lastReportedProgress = Math.floor((startOffset / file.size) * 100);

    while (offset < file.size) {
      if (cancelledIdsRef.current.has(itemId)) throw new DOMException('Carga cancelada', 'AbortError');
      const end = Math.min(offset + chunkSize, file.size);
      const chunk = file.slice(offset, end);
      const isLast = end === file.size;

      try {
        const chunkStart = offset;
        const response = await putChunkWithProgress({
          sessionUri,
          chunk,
          contentRange: `bytes ${chunkStart}-${end - 1}/${file.size}`,
          contentType: file.type || 'application/octet-stream',
          onRequest: xhr => abortControllersRef.current.set(itemId, xhr),
          onProgress: loaded => {
            const bytesSent = Math.min(file.size, chunkStart + loaded);
            const progress = Math.floor((bytesSent / file.size) * 100);
            if (progress === lastReportedProgress) return;
            lastReportedProgress = progress;
            updateUpload(itemId, {
              progress,
              bytesUploaded: bytesSent,
              statusText: `Subiendo… ${progress}%`,
            });
          },
        });

        if (response.status === 308 || response.status === 200 || response.status === 201) {
          // Chunk accepted
          offset = end;
          retryCount = 0; // Reset retry counter on success
          const progress = Math.floor((offset / file.size) * 100);

          updateUpload(itemId, {
            progress,
            bytesUploaded: offset,
            statusText: `Subiendo... ${progress}%`
          });

          // Periodically update backend with progress (every 5 chunks ≈ 40MB)
          if ((offset / chunkSize) % 5 === 0 || isLast) {
            apiFetch(`${api}/api/uploads/progress`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ uploadId, bytesUploaded: offset })
              }).catch(() => { /* seguimiento no crítico */ });
          }

          if (response.status === 200 || response.status === 201) {
            break; // Upload complete
          }
        } else if (response.status >= 500 || response.status === 408) {
          // Server error — retry
          throw new Error(`GCS error: ${response.status}`);
        } else {
          // Client error (4xx) — don't retry
          throw new Error(`Upload rejected (${response.status}): ${response.text}`);
        }

      } catch (err) {
        if (err.name === 'AbortError') throw err; // Propagate cancellation

        retryCount++;
        if (retryCount > MAX_RETRIES) {
          throw new Error(`Subida fallida después de ${MAX_RETRIES} intentos: ${err.message}`);
        }

        const delay = BASE_RETRY_DELAY * Math.pow(2, retryCount - 1);
        console.warn(`[ChunkedUpload] Chunk failed, retry ${retryCount}/${MAX_RETRIES} in ${delay}ms`, err);
        
        updateUpload(itemId, {
          status: 'paused',
          statusText: `Reintentando en ${delay / 1000}s... (${retryCount}/${MAX_RETRIES})`
        });

        await new Promise(r => setTimeout(r, delay));
        if (cancelledIdsRef.current.has(itemId)) throw new DOMException('Carga cancelada', 'AbortError');
        
        updateUpload(itemId, {
          status: 'uploading',
          statusText: `Reanudando...`
        });

        // Query GCS for actual progress before retrying
        try {
          const statusRes = await fetch(sessionUri, {
            method: 'PUT',
            headers: {
              'Content-Range': `bytes */${file.size}`,
              'Content-Type': file.type || 'application/octet-stream'
            },
            body: new Blob() // Empty body for status check
          });
          
          if (statusRes.status === 308) {
            const range = statusRes.headers.get('Range');
            if (range) {
              const confirmedEnd = parseInt(range.split('-')[1]) + 1;
              if (confirmedEnd > offset) {
                offset = confirmedEnd; // Jump ahead to confirmed position
                console.log(`[ChunkedUpload] Resumed from byte ${offset}`);
              }
            }
          } else if (statusRes.status === 200 || statusRes.status === 201) {
            break; // Already complete
          }
        } catch {
          // Status check failed, retry from current offset
        }
      }
    }

    abortControllersRef.current.delete(itemId);
  }, [api, getHeaders, updateUpload]);

  executeUploadRef.current = executeUpload;
  sendChunksRef.current = sendChunks;

  // ═══════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════

  /** Add files to upload queue and start processing */
  const addFiles = useCallback((fileList, folderPath) => {
    const newItems = Array.from(fileList).map(file => ({
      id: `upload_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      file,
      folderPath,
      filename: file.name,
      sizeBytes: file.size,
      mimeType: file.type || 'application/octet-stream',
      status: 'queued',
      statusText: 'En cola...',
      progress: 0,
      bytesUploaded: 0,
      uploadId: null,
      sessionUri: null,
      errorCode: null,
      chunkSize: 8 * 1024 * 1024,
      createdAt: new Date().toISOString()
    }));

    setUploads(prev => [...newItems, ...prev]);
    queueRef.current.push(...newItems);
    
    // Trigger processing (respects MAX_CONCURRENT)
    setTimeout(() => processQueue(), 0);

    return newItems.map(i => i.id);
  }, [processQueue]);

  /** Cancel a specific upload */
  const cancelUpload = useCallback(async (itemId) => {
    cancelledIdsRef.current.add(itemId);
    // Abort the in-flight fetch
    const controller = abortControllersRef.current.get(itemId);
    if (controller) controller.abort();

    // Remove from queue if not started
    queueRef.current = queueRef.current.filter(i => i.id !== itemId);

    // Get upload state to cancel on backend
    const item = uploads.find(u => u.id === itemId); // Note: may be stale

    updateUpload(itemId, { status: 'cancelled', statusText: 'Cancelado' });

    // Cancel on backend if we have an uploadId
    if (item?.uploadId) {
      try {
        await apiFetch(`${api}/api/uploads/${item.uploadId}`, {
          method: 'DELETE',
          headers: getHeaders()
        });
      } catch { /* best effort */ }
    }
  }, [api, getHeaders, updateUpload, uploads]);

  /** Cancel all uploads */
  const cancelAll = useCallback(() => {
    queueRef.current = [];
    uploads.forEach(u => {
      if (['queued', 'init', 'uploading', 'paused'].includes(u.status)) {
        cancelUpload(u.id);
      }
    });
  }, [uploads, cancelUpload]);

  /** Resume a pending upload from a previous session */
  const resumeUpload = useCallback(async (pendingSession) => {
    const {
      uploadId, filename, sizeBytes, bytesUploaded,
      sessionUri, folderPath, mimeType, chunkSize
    } = pendingSession;

    // We need the actual File object — user must re-select the file
    // For now, we create a placeholder that will prompt re-selection
    const item = {
      id: `resume_${uploadId}`,
      file: null, // Will need to be re-attached
      folderPath,
      filename,
      sizeBytes,
      mimeType,
      status: 'paused',
      statusText: 'Archivo necesario para reanudar',
      progress: Math.floor((bytesUploaded / sizeBytes) * 100),
      bytesUploaded,
      uploadId,
      sessionUri,
      errorCode: null,
      chunkSize: chunkSize || 8 * 1024 * 1024,
      needsFile: true // Flag: user must re-select the file
    };

    setUploads(prev => [item, ...prev]);
    return item.id;
  }, []);

  /** Attach a file to a resume-pending upload and start it */
  const attachFileAndResume = useCallback(async (itemId, file) => {
    setUploads(prev => prev.map(u => {
      if (u.id === itemId) {
        return { ...u, file, needsFile: false, status: 'uploading', statusText: 'Reanudando...' };
      }
      return u;
    }));

    // Find the item
    const item = uploads.find(u => u.id === itemId);
    if (!item) return;

    activeCountRef.current++;
    try {
      await sendChunks(
        itemId, file, item.sessionUri, item.chunkSize,
        item.uploadId, item.bytesUploaded
      );

      // Confirm
      updateUpload(itemId, { status: 'confirming', statusText: 'Confirmando...' });
      const confirmRes = await apiFetch(`${api}/api/uploads/complete`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ uploadId: item.uploadId })
      });
      const confirmData = await confirmRes.json();
      if (confirmData.success) {
        updateUpload(itemId, { status: 'completed', progress: 100, statusText: 'Completado' });
      }
    } catch (err) {
      updateUpload(itemId, { status: 'error', statusText: err.message });
    } finally {
      activeCountRef.current--;
      processQueue();
    }
  }, [api, getHeaders, updateUpload, processQueue, sendChunks, uploads]);

  /** Remove completed/error uploads from the list */
  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(u => 
      u.status !== 'completed' && u.status !== 'error' && u.status !== 'cancelled'
    ));
  }, []);

  /** Check if any uploads are in progress */
  const hasActiveUploads = uploads.some(u => 
    ['queued', 'init', 'uploading', 'confirming', 'paused'].includes(u.status)
  );

  const completedCount = uploads.filter(u => u.status === 'completed').length;
  const errorCount = uploads.filter(u => u.status === 'error').length;

  return {
    uploads,
    addFiles,
    cancelUpload,
    cancelAll,
    resumeUpload,
    attachFileAndResume,
    removeUpload,
    clearCompleted,
    hasActiveUploads,
    completedCount,
    errorCount
  };
}
