/**
 * ThumbnailGenerator.js — High-performance automatic thumbnail generator
 * for videos and photos in the browser.
 *
 * Supports:
 * - Extracting representative video frames using offscreen <video> + <canvas>
 * - Downscaling & optimizing high-res photos to lightweight crisp thumbnails
 * - Exporting to Data URLs, Blobs, and Google Drive-compatible URL-safe Base64
 */

/**
 * Generate a high-quality thumbnail from an image File, Blob, or URL.
 * Scales down to max dimension 640px to keep gallery fast and memory-light.
 *
 * @param {File|Blob|string} imageSource
 * @param {number} maxDimension
 * @returns {Promise<{ dataUrl: string, blob: Blob, base64: string, urlSafeBase64: string }>}
 */
export async function generatePhotoThumbnail(imageSource, maxDimension = 640) {
  console.log('[CHECKPOINT 1 - PHOTO] Right when thumbnail generation starts for photo:', imageSource instanceof File ? imageSource.name : (imageSource instanceof Blob ? 'Blob (' + imageSource.size + ' bytes)' : imageSource));
  return new Promise((resolve, reject) => {
    let objectUrl = null;
    let src = '';

    if (typeof imageSource === 'string') {
      src = imageSource;
    } else if (imageSource instanceof Blob) {
      objectUrl = URL.createObjectURL(imageSource);
      src = objectUrl;
    } else {
      return reject(new Error('Invalid image source'));
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    const cleanup = () => {
      if (objectUrl) {
        try { URL.revokeObjectURL(objectUrl); } catch (_) {}
      }
    };

    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width || 640;
        let height = img.naturalHeight || img.height || 360;

        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        const rawBase64 = dataUrl.split(',')[1] || '';
        const urlSafeBase64 = rawBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        canvas.toBlob(
          (blob) => {
            console.log('[CHECKPOINT 5 - PHOTO] Right after canvas.toBlob() resolves. Blob size:', blob?.size, 'Blob type:', blob?.type);
            cleanup();
            resolve({
              dataUrl,
              blob: blob || null,
              base64: rawBase64,
              urlSafeBase64,
              width,
              height,
            });
          },
          'image/jpeg',
          0.88
        );
      } catch (err) {
        console.error('[CHECKPOINT 5 - PHOTO ERROR] Error during photo canvas.toBlob/processing:', err);
        cleanup();
        reject(err);
      }
    };

    img.onerror = (err) => {
      console.error('[CHECKPOINT 1 - PHOTO ERROR] Failed to load image for thumbnail generation:', err);
      cleanup();
      reject(new Error('Failed to load image for thumbnail generation'));
    };

    img.src = src;
  });
}

/**
 * Generate a representative thumbnail frame from a video File, Blob, or URL.
 * Automatically seeks past black opening frames (1.5s or 10% duration).
 *
 * @param {File|Blob|string} videoSource
 * @param {number} maxDimension
 * @returns {Promise<{ dataUrl: string, blob: Blob, base64: string, urlSafeBase64: string }>}
 */
export async function generateVideoThumbnail(videoSource, maxDimension = 640) {
  console.log('[CHECKPOINT 1 - VIDEO] Right when thumbnail generation starts for video:', videoSource instanceof File ? videoSource.name : (videoSource instanceof Blob ? 'Blob (' + videoSource.size + ' bytes)' : videoSource));
  return new Promise((resolve) => {
    let objectUrl = null;
    let src = '';

    if (typeof videoSource === 'string') {
      src = videoSource;
    } else if (videoSource instanceof Blob) {
      objectUrl = URL.createObjectURL(videoSource);
      src = objectUrl;
    } else {
      console.warn('[CHECKPOINT 1 - VIDEO] Invalid video source provided');
      return resolve(null);
    }

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.crossOrigin = 'anonymous';

    let isDone = false;
    let hasLoadedData = false;
    let hasSeeked = false;

    const loadedDataTimeout = setTimeout(() => {
      if (!hasLoadedData) {
        console.error('[CHECKPOINT 2 - VIDEO ERROR] video loadeddata NEVER fired within 5 seconds! readyState:', video.readyState, 'networkState:', video.networkState, 'error:', video.error);
      }
    }, 5000);

    let seekedTimeout = null;

    const timeout = setTimeout(() => {
      console.warn('[CHECKPOINT 1 - VIDEO TIMEOUT] Total 6s timeout reached before video thumbnail completion.');
      finish(null);
    }, 6000); // 6s max wait

    function finish(result) {
      if (isDone) return;
      isDone = true;
      clearTimeout(timeout);
      clearTimeout(loadedDataTimeout);
      if (seekedTimeout) clearTimeout(seekedTimeout);
      video.onerror = null;
      video.onloadeddata = null;
      video.onseeked = null;
      video.ontimeupdate = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (objectUrl) {
        try { URL.revokeObjectURL(objectUrl); } catch (_) {}
      }
      resolve(result);
    }

    const captureFrame = () => {
      try {
        let width = video.videoWidth || 640;
        let height = video.videoHeight || 360;

        if (width === 0 || height === 0) {
          width = 640;
          height = 360;
        }

        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(video, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        const rawBase64 = dataUrl.split(',')[1] || '';
        const urlSafeBase64 = rawBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        canvas.toBlob(
          (blob) => {
            console.log('[CHECKPOINT 5 - VIDEO] Right after canvas.toBlob() resolves. Blob size:', blob?.size, 'Blob type:', blob?.type);
            finish({
              dataUrl,
              blob: blob || null,
              base64: rawBase64,
              urlSafeBase64,
              width,
              height,
            });
          },
          'image/jpeg',
          0.88
        );
      } catch (err) {
        console.error('[CHECKPOINT 5 - VIDEO ERROR] canvas.toBlob / captureFrame threw:', err);
        finish(null);
      }
    };

    let hasSought = false;
    const attemptSeek = () => {
      if (hasSought) return;
      hasSought = true;
      let seekTime = 1.0;
      if (video.duration && Number.isFinite(video.duration) && video.duration > 0) {
        // Aim for 10% into the video, between 0.5s and 5.0s, to get an active scene
        seekTime = Math.min(Math.max(video.duration * 0.1, 0.5), Math.min(video.duration - 0.2, 5.0));
      }
      try {
        console.log('[CHECKPOINT 3 - VIDEO] Right after currentTime is set to', seekTime, 'and before waiting for seeked. (current currentTime:', video.currentTime, ')');
        seekedTimeout = setTimeout(() => {
          if (!hasSeeked) {
            console.error('[CHECKPOINT 4 - VIDEO ERROR] video seeked NEVER fired within 5 seconds! readyState:', video.readyState);
          }
        }, 5000);
        video.currentTime = seekTime;
      } catch (seekErr) {
        console.warn('[CHECKPOINT 3 - VIDEO SEEK ERROR] Seeking threw an error:', seekErr, '- falling back to captureFrame()');
        captureFrame();
      }
    };

    video.onloadeddata = () => {
      hasLoadedData = true;
      clearTimeout(loadedDataTimeout);
      console.log('[CHECKPOINT 2 - VIDEO] Right after the video loadeddata event fires. readyState:', video.readyState, 'videoWidth:', video.videoWidth, 'videoHeight:', video.videoHeight, 'duration:', video.duration);
      attemptSeek();
    };

    video.onseeked = () => {
      hasSeeked = true;
      if (seekedTimeout) clearTimeout(seekedTimeout);
      console.log('[CHECKPOINT 4 - VIDEO] Right when seeked fires. currentTime:', video.currentTime);
      captureFrame();
    };

    video.onerror = (e) => {
      console.error('[CHECKPOINT 1 - VIDEO ERROR] video element encountered an error:', video.error || e);
      finish(null);
    };

    video.src = src;
  });
}

/**
 * Universal thumbnail generator: auto-detects if file is image or video
 * and returns the optimized thumbnail object.
 *
 * @param {File|Blob} file
 * @returns {Promise<{ dataUrl: string, blob: Blob, base64: string, urlSafeBase64: string }|null>}
 */
export async function generateAutoThumbnail(file) {
  if (!file) return null;
  const isVideo = file.type?.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(file.name || '');
  const isImage = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(file.name || '');

  try {
    if (isVideo) {
      return await generateVideoThumbnail(file);
    } else if (isImage) {
      return await generatePhotoThumbnail(file);
    }
  } catch (err) {
    console.warn('[ThumbnailGenerator] Auto thumbnail failed:', err);
  }
  return null;
}
