/**
 * 📸 Upload Queue Service (Dalux-style Background Uploads)
 * 
 * Saves photos to IndexedDB immediately when captured.
 * If the page is closed/refreshed before the upload finishes,
 * the queue automatically resumes on next page load.
 * 
 * Flow:
 *   1. User takes photo → saved instantly to IndexedDB (survives refresh/close)
 *   2. Upload starts in background
 *   3. On success → removed from IndexedDB
 *   4. On page reload → pending uploads auto-resume
 */

const DB_NAME = 'visor_upload_queue';
const STORE_NAME = 'pending_photos';
const DB_VERSION = 1;

// --- IndexedDB Helpers ---

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Enqueue a photo for upload. Saves the file blob + metadata to IndexedDB.
 * Returns immediately — the photo is now safe even if the page closes.
 */
export async function enqueuePhoto({ id, file, pinId, modelUrn, uploadPath, captureDate, desc }) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        // Convert File to ArrayBuffer for reliable IndexedDB storage
        const arrayBuffer = await file.arrayBuffer();

        store.put({
            id,
            fileName: file.name,
            fileType: file.type || 'application/octet-stream',
            fileSize: file.size,
            fileData: arrayBuffer,
            pinId,
            modelUrn,
            uploadPath,
            captureDate: captureDate?.toISOString() || new Date().toISOString(),
            desc: desc || file.name,
            enqueuedAt: Date.now(),
            status: 'pending' // pending | uploading | failed
        });

        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });

        db.close();
        console.log(`[UploadQueue] 📥 Enqueued photo ${id} (${file.name}) for pin ${pinId}`);
        return true;
    } catch (err) {
        console.error('[UploadQueue] Failed to enqueue:', err);
        return false;
    }
}

/**
 * Remove a successfully uploaded photo from the queue.
 */
export async function dequeuePhoto(id) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        db.close();
        console.log(`[UploadQueue] ✅ Dequeued photo ${id}`);
    } catch (err) {
        console.error('[UploadQueue] Failed to dequeue:', err);
    }
}

/**
 * Get all pending photos from the queue.
 */
export async function getPendingPhotos() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                db.close();
                resolve(request.result || []);
            };
            request.onerror = () => {
                db.close();
                reject(request.error);
            };
        });
    } catch (err) {
        console.error('[UploadQueue] Failed to get pending:', err);
        return [];
    }
}

/**
 * Get count of pending uploads.
 */
export async function getPendingCount() {
    const pending = await getPendingPhotos();
    return pending.length;
}

/**
 * Get pending photos with temporary blob URLs for thumbnail display.
 * This allows showing thumbnails immediately on page load while uploads resume.
 * Returns: [{ pinId, photo: { id, src (blob URL), desc, date, isUploading: true } }]
 */
export async function getPendingThumbnails() {
    const pending = await getPendingPhotos();
    return pending.map(item => {
        // Create a temporary blob URL from the stored ArrayBuffer
        const blob = new Blob([item.fileData], { type: item.fileType });
        const blobUrl = URL.createObjectURL(blob);

        return {
            pinId: item.pinId,
            photo: {
                id: item.id,
                src: blobUrl,
                desc: item.desc || item.fileName,
                date: item.captureDate?.split('T')[0],
                displayDate: new Date(item.captureDate).toLocaleDateString(),
                fullPath: 'Subiendo...',
                isUploading: true
            }
        };
    });
}

/**
 * Process all pending uploads. Call this on app startup.
 * @param {Function} onPhotoUploaded - callback(pinId, photoData) called for each successful upload
 * @param {Function} getBackendUrl - returns the BACKEND_URL string
 */
export async function processPendingUploads(onPhotoUploaded, getBackendUrl) {
    const pending = await getPendingPhotos();
    if (pending.length === 0) return;

    console.log(`[UploadQueue] 🔄 Resuming ${pending.length} pending upload(s)...`);

    const { apiFetch } = await import('../utils/apiFetch');
    const { uploadFile } = await import('./uploadService');

    for (const item of pending) {
        try {
            console.log(`[UploadQueue] Uploading: ${item.fileName} for pin ${item.pinId}`);

            const BACKEND_URL = getBackendUrl();

            // Reconstruct File from stored ArrayBuffer
            const blob = new Blob([item.fileData], { type: item.fileType });
            const file = new File([blob], item.fileName, { type: item.fileType });

            // 1. Get Signed URL
            const urlResp = await apiFetch(`${BACKEND_URL}/api/docs/upload-url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: file.name,
                    contentType: file.type,
                    model_urn: item.modelUrn
                })
            });
            const urlData = await urlResp.json();
            if (!urlData.success) throw new Error(urlData.error);

            // 2. Upload to GCS
            await uploadFile(file, urlData.uploadUrl, { isDirect: true });

            // 3. Confirm
            const confirmResp = await apiFetch(`${BACKEND_URL}/api/docs/upload-confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: file.name,
                    gcs_urn: urlData.gcs_urn,
                    size_bytes: file.size,
                    mime_type: file.type,
                    path: item.uploadPath,
                    model_urn: item.modelUrn
                })
            });
            const confirmData = await confirmResp.json();

            if (confirmData.success) {
                // SIN token en la URL: esta se GUARDA en la base y se comparte. Antes
                // llevaba la sesion entera del que subia la foto, de 7 dias y
                // reutilizable. El permiso de lectura se firma al mostrar (ver
                // utils/permisosDeLectura).
                const permalinkUrl = `${BACKEND_URL}/api/docs/proxy?urn=${urlData.gcs_urn}`;

                // Notify the app that this photo is ready
                if (onPhotoUploaded) {
                    onPhotoUploaded(item.pinId, {
                        id: item.id,
                        src: permalinkUrl,
                        desc: item.desc,
                        date: item.captureDate?.split('T')[0],
                        displayDate: new Date(item.captureDate).toLocaleDateString(),
                        fullPath: `${item.uploadPath}${item.fileName}`,
                        gcs_urn: urlData.gcs_urn,
                        isUploading: false,
                        tempId: item.id
                    });
                }

                // Remove from queue
                await dequeuePhoto(item.id);
                console.log(`[UploadQueue] ✅ ${item.fileName} uploaded successfully`);
            } else {
                console.error(`[UploadQueue] ❌ Confirm failed for ${item.fileName}:`, confirmData.error);
            }
        } catch (err) {
            console.error(`[UploadQueue] ❌ Failed to upload ${item.fileName}:`, err.message);
            // Leave in queue for next retry
        }
    }
}
