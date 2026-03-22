import axios from 'axios';

/**
 * Uploads a file with progress tracking.
 * @param {File} file - The file to upload.
 * @param {string} url - The endpoint or signed URL.
 * @param {Object} options - Additional options.
 * @param {Function} options.onProgress - Callback for progress (0-100).
 * @param {boolean} options.isDirect - If true, it uses a PUT request (Direct to GCS/S3).
 * @param {Object} options.formData - Optional form data labels/projects if not direct.
 */
export const uploadFile = async (file, url, { onProgress, isDirect = false, formData: extraData = {} } = {}) => {
  if (isDirect) {
    // Direct upload to GCS/OSS via signed PUT URL
    await axios.put(url, file, {
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        if (onProgress) onProgress(percentCompleted);
      },
    });
    return { success: true };
  } else {
    // Upload via Backend Proxy (POST multipart/form-data)
    const formData = new FormData();
    formData.append('file', file);
    Object.entries(extraData).forEach(([key, value]) => {
      formData.append(key, value);
    });

    const response = await axios.post(url, formData, {
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || file.size));
        if (onProgress) onProgress(percentCompleted);
      },
    });
    return response.data;
  }
};
