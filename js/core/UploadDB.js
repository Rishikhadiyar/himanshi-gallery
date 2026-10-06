/**
 * UploadDB — IndexedDB wrapper for persisting user-uploaded blobs.
 * Store: 'uploads', keyPath: 'id' (auto-increment)
 * Record shape: { id, blob, type, title, date, uploadedAt, isFavorite, favoritedAt }
 */

const DB_NAME   = 'netflix-gallery';
const DB_VER    = 2; // bumped to add isFavorite index
const STORE     = 'uploads';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
      // v2: no new object store needed, isFavorite is just a field on records
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/** Save a blob record, returns the new record's id */
export async function saveUpload({ blob, thumbnailBlob, type, title, date, isPrivate = false }) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req   = store.add({
      blob,
      thumbnailBlob: thumbnailBlob || null,
      type,
      title,
      date,
      uploadedAt : Date.now(),
      isFavorite : false,
      favoritedAt: null,
      isPrivate  : Boolean(isPrivate),
    });
    req.onsuccess = () => resolve(req.result); // numeric id
    req.onerror   = () => reject(req.error);
  });
}

/** Return all stored records as an array */
export async function getAllUploads() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req   = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** Delete a record by id */
export async function deleteUpload(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req   = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Update fields on an existing record (e.g. isFavorite toggle, thumbnailBlob).
 * Merges the patch object with the existing record.
 */
export async function updateUpload(id, patch) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    // First get the current record
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (!record) { reject(new Error(`Record ${id} not found`)); return; }
      const updated = { ...record, ...patch };
      const putReq  = store.put(updated);
      putReq.onsuccess = () => resolve();
      putReq.onerror   = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Extract a representative video frame as an image Blob.
 * 1. Creates an off-screen <video> element with an Object URL.
 * 2. Seeks to ~10% of duration (or 1s) to avoid black opening frames.
 * 3. On seeked, draws the frame onto a canvas and outputs a JPEG Blob.
 * 4. Falls back gracefully (resolves null) if extraction fails.
 */
export function generateVideoThumbnail(videoBlob) {
  return new Promise((resolve) => {
    if (!videoBlob || !(videoBlob instanceof Blob)) {
      resolve(null);
      return;
    }

    const video = document.createElement('video');
    const url = URL.createObjectURL(videoBlob);
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let isDone = false;
    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 4000);

    function cleanup() {
      if (isDone) return;
      isDone = true;
      clearTimeout(timer);
      video.onerror = null;
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
      try { URL.revokeObjectURL(url); } catch (_) {}
    }

    const captureFrame = () => {
      try {
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 360;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            cleanup();
            resolve(blob || null);
          },
          'image/jpeg',
          0.85
        );
      } catch (err) {
        console.warn('[Thumbnail] Frame capture error:', err);
        cleanup();
        resolve(null);
      }
    };

    video.onerror = () => {
      cleanup();
      resolve(null);
    };

    video.onloadedmetadata = () => {
      let seekTime = 1;
      if (video.duration && Number.isFinite(video.duration) && video.duration > 0) {
        seekTime = Math.min(Math.max(video.duration * 0.1, 0.5), Math.max(video.duration - 0.1, 0.1));
      }
      if (Math.abs(video.currentTime - seekTime) < 0.05 && video.readyState >= 2) {
        captureFrame();
      } else {
        video.currentTime = seekTime;
      }
    };

    video.onseeked = () => {
      captureFrame();
    };

    video.src = url;
  });
}

/**
 * Backfill existing uploads that lack a thumbnailBlob.
 * For videos: extracts a video frame and persists thumbnailBlob to IndexedDB.
 * For photos: sets thumbnailBlob to the existing photo blob and persists.
 * Returns boolean indicating whether any records were updated.
 */
export async function backfillThumbnails(records) {
  if (!Array.isArray(records) || records.length === 0) return false;
  let hasUpdates = false;

  for (const record of records) {
    if (!record.thumbnailBlob) {
      if (record.type === 'video') {
        try {
          const thumbBlob = await generateVideoThumbnail(record.blob);
          if (thumbBlob) {
            record.thumbnailBlob = thumbBlob;
            await updateUpload(record.id, { thumbnailBlob: thumbBlob });
            hasUpdates = true;
          }
        } catch (err) {
          console.warn('[UploadDB] Video backfill failed for item', record.id, err);
        }
      } else {
        // Photo: use record.blob as its own thumbnail
        try {
          record.thumbnailBlob = record.blob;
          await updateUpload(record.id, { thumbnailBlob: record.blob });
          hasUpdates = true;
        } catch (err) {
          console.warn('[UploadDB] Photo backfill failed for item', record.id, err);
        }
      }
    }
  }

  return hasUpdates;
}

/**
 * Convert a stored record to the standard gallery item shape.
 * Creates persistent Object URLs for the session.
 */
export function recordToItem(record) {
  const isVideo = record.type === 'video';
  const url = URL.createObjectURL(record.blob);
  let thumbnailUrl = '';
  if (record.thumbnailBlob) {
    thumbnailUrl = URL.createObjectURL(record.thumbnailBlob);
  } else if (!isVideo) {
    thumbnailUrl = url;
  }

  return {
    id          : record.id,
    url         : url,
    thumbnailUrl: thumbnailUrl || url,
    type        : record.type,   // 'image' | 'video'
    title       : record.title,
    date        : record.date,
    uploadedAt  : record.uploadedAt || 0,
    isFavorite  : record.isFavorite || false,
    favoritedAt : record.favoritedAt || null,
    isPrivate   : Boolean(record.isPrivate),
    tags        : record.tags   || ['User Upload'],
    rating      : record.rating || 'U/A 16+',
  };
}
