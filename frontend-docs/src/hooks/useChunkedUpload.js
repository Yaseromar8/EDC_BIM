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

const MAX_CONCURRENT = 3;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 2000; // 2s, then 4s, then 8s

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
        executeUpload(next).finally(() => {
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
      updateUpload(id, { status: 'init', statusText: 'Validando...' });

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
      await sendChunks(id, file, sessionUri, chunkSize, uploadId, 0);

      // ── STEP 3: CONFIRM — Register in DB ──
      updateUpload(id, { status: 'confirming', statusText: 'Confirmando...' });

      const confirmRes = await apiFetch(`${api}/api/uploads/complete`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ uploadId })
      });

      const confirmData = await confirmRes.json();
      if (!confirmRes.ok || !confirmData.success) {
        throw new Error(confirmData.error || 'Error al confirmar');
      }

      const now = new Date();
      updateUpload(id, {
        status: 'completed',
        progress: 100,
        statusText: `Completado el ${now.toLocaleDateString()} a las ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      });

      // 🔥 Callback for UI Reaction & Cache Invalidation
      if (options.onUploadComplete) {
        options.onUploadComplete({ ...item, version: confirmData.version, nodeId: confirmData.node_id }, confirmData);
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

    while (offset < file.size) {
      const end = Math.min(offset + chunkSize, file.size);
      const chunk = file.slice(offset, end);
      const isLast = end === file.size;

      try {
        const controller = new AbortController();
        abortControllersRef.current.set(itemId, controller);

        const response = await fetch(sessionUri, {
          method: 'PUT',
          headers: {
            'Content-Range': `bytes ${offset}-${end - 1}/${file.size}`,
            'Content-Type': file.type || 'application/octet-stream'
          },
          body: chunk,
          signal: controller.signal
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
            try {
              await apiFetch(`${api}/api/uploads/progress`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ uploadId, bytesUploaded: offset })
              });
            } catch (_) { /* non-critical */ }
          }

          if (response.status === 200 || response.status === 201) {
            break; // Upload complete
          }
        } else if (response.status >= 500 || response.status === 408) {
          // Server error — retry
          throw new Error(`GCS error: ${response.status}`);
        } else {
          // Client error (4xx) — don't retry
          const text = await response.text();
          throw new Error(`Upload rejected (${response.status}): ${text}`);
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
        } catch (_) {
          // Status check failed, retry from current offset
        }
      }
    }

    abortControllersRef.current.delete(itemId);
  }, [api, getHeaders, updateUpload]);

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
      } catch (_) { /* best effort */ }
    }
  }, [api, getHeaders, updateUpload, uploads]);

  /** Cancel all uploads */
  const cancelAll = useCallback(() => {
    queueRef.current = [];
    uploads.forEach(u => {
      if (u.status !== 'completed' && u.status !== 'error') {
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
