import { CONFIG, validateConfig } from '../config.js';
export { CONFIG, validateConfig };

/**
 * DriveService — Browser-direct Google Drive API & Google Identity Services (GIS) wrapper.
 * Handles public reads (API key), private reads (Bearer token), resumable chunked uploads,
 * file management, and per-user local favorites.
 */

// In-memory token storage (NEVER persisted to localStorage or printed to logs)
let _accessToken = null;
let _tokenExpiryTime = 0;
let _tokenClient = null;
let _gisLoadedPromise = null;
const _authListeners = new Set();

// In-memory session cache
let _cachedPublicItems = null;
const _privateBlobUrls = new Map(); // fileId -> blobUrl

// LocalStorage key for viewers' local favorites
const FAVORITES_STORAGE_KEY = 'himanshi_drive_favorites';

/**
 * Clean filename into a human-friendly title:
 * 1. Strip file extension
 * 2. Remove [bracket] and (parenthetical) tags
 * 3. Replace underscores and hyphens with spaces
 * 4. Collapse consecutive spaces and trim
 */
export function cleanFilename(filename = '') {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * High-resolution thumbnail URL transformer.
 * Appends or updates Google's =s parameter to =s500 for crisp card displays.
 */
export function getOptimizedThumbnail(thumbnailLink) {
  if (!thumbnailLink) return '';
  if (/=s\d+/.test(thumbnailLink)) {
    return thumbnailLink.replace(/=s\d+[^?]*/, '=w600-h340-c');
  }
  return `${thumbnailLink}=w600-h340-c`;
}

/** Neutral SVG placeholder data-URI for videos still processing in Drive */
export const VIDEO_PROCESSING_PLACEHOLDER = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22500%22%20height%3D%22281%22%20viewBox%3D%220%200%20500%20281%22%3E%3Crect%20fill%3D%22%23181818%22%20width%3D%22500%22%20height%3D%22281%22%2F%3E%3Ccircle%20cx%3D%22250%22%20cy%3D%22140%22%20r%3D%2228%22%20fill%3D%22rgba(255%2C255%2C255%2C0.1)%22%2F%3E%3Cpolygon%20points%3D%22244%2C128%20262%2C140%20244%2C152%22%20fill%3D%22%23e50914%22%2F%3E%3Ctext%20x%3D%22250%22%20y%3D%22190%22%20fill%3D%22%23888%22%20font-family%3D%22sans-serif%22%20font-size%3D%2213%22%20font-weight%3D%22600%22%20text-anchor%3D%22middle%22%3EProcessing%20preview%E2%80%A6%3C%2Ftext%3E%3C%2Fsvg%3E';

// ─── GIS (Google Identity Services) Setup ───────────────────────────────────

function loadGisScript() {
  if (_gisLoadedPromise) return _gisLoadedPromise;

  _gisLoadedPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve(window.google);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) {
        resolve(window.google);
      } else {
        reject(new Error('Google Identity Services library failed to initialize'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script'));
    document.head.appendChild(script);
  });

  return _gisLoadedPromise;
}

/**
 * Initialize GIS Token Client with required Drive scopes
 */
async function initTokenClient() {
  if (_tokenClient) return _tokenClient;

  const { isValid, missing } = validateConfig();
  if (!isValid && missing.includes('GOOGLE_CLIENT_ID')) {
    throw new Error('Missing GOOGLE_CLIENT_ID in js/config.js');
  }

  await loadGisScript();

  return new Promise((resolve) => {
    _tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (response) => {
        if (response.error) {
          console.error('[DriveService] OAuth error:', response.error);
          return;
        }
        _accessToken = response.access_token;
        const expiresIn = Number(response.expires_in) || 3600;
        _tokenExpiryTime = Date.now() + (expiresIn - 60) * 1000;
        _notifyAuthState(true);
      },
    });
    resolve(_tokenClient);
  });
}

function _notifyAuthState(isSignedIn) {
  _authListeners.forEach((listener) => {
    try {
      listener(isSignedIn);
    } catch (e) {
      console.error('[DriveService] Auth listener error:', e);
    }
  });
}

export function onAuthStateChanged(callback) {
  _authListeners.add(callback);
  return () => _authListeners.delete(callback);
}

export function isOwnerSignedIn() {
  return Boolean(_accessToken && Date.now() < _tokenExpiryTime);
}

/**
 * Prompt Owner to sign in with Google
 */
export async function signIn() {
  const client = await initTokenClient();
  return new Promise((resolve, reject) => {
    client.callback = (response) => {
      if (response.error) {
        console.error('[DriveService] Sign-in error:', response.error);
        reject(new Error(response.error_description || response.error));
        return;
      }
      _accessToken = response.access_token;
      const expiresIn = Number(response.expires_in) || 3600;
      _tokenExpiryTime = Date.now() + (expiresIn - 60) * 1000;
      _notifyAuthState(true);
      resolve(_accessToken);
    };
    client.requestAccessToken({ prompt: '' });
  });
}

/**
 * Sign out Owner and revoke token
 */
export function signOut() {
  if (_accessToken && window.google?.accounts?.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(_accessToken, () => {});
    } catch (e) {
      // ignore revocation failure
    }
  }
  _accessToken = null;
  _tokenExpiryTime = 0;
  _notifyAuthState(false);
}

/**
 * Get an active access token, silently requesting refresh if expired
 */
export async function getValidAccessToken() {
  if (isOwnerSignedIn()) {
    return _accessToken;
  }

  // Attempt silent refresh
  try {
    const client = await initTokenClient();
    return await new Promise((resolve, reject) => {
      client.callback = (response) => {
        if (response.error) {
          _accessToken = null;
          _tokenExpiryTime = 0;
          _notifyAuthState(false);
          reject(new Error(response.error));
          return;
        }
        _accessToken = response.access_token;
        const expiresIn = Number(response.expires_in) || 3600;
        _tokenExpiryTime = Date.now() + (expiresIn - 60) * 1000;
        _notifyAuthState(true);
        resolve(_accessToken);
      };
      client.requestAccessToken({ prompt: 'none' });
    });
  } catch (err) {
    _accessToken = null;
    _tokenExpiryTime = 0;
    _notifyAuthState(false);
    throw new Error('Owner authentication required');
  }
}

// ─── Local Favorites Management (Per-Viewer) ────────────────────────────────

export function getFavoritesMap() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

export function isItemFavorited(id) {
  if (!id) return false;
  const favs = getFavoritesMap();
  return Boolean(favs[id]);
}

export function getItemFavoritedAt(id) {
  if (!id) return null;
  const favs = getFavoritesMap();
  return favs[id] || null;
}

export function toggleItemFavorite(id) {
  if (!id) return false;
  const favs = getFavoritesMap();
  const willBeFavorite = !favs[id];
  if (willBeFavorite) {
    favs[id] = Date.now();
  } else {
    delete favs[id];
  }
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favs));
  return willBeFavorite;
}

// ─── Drive Item Mapper ──────────────────────────────────────────────────────

/**
 * Map raw Drive v3 file resource to application item shape
 */
export function mapDriveFileToItem(file, isPrivate = false) {
  const isVideo = file.mimeType ? file.mimeType.startsWith('video/') : false;
  // Use real thumbnailLink from Drive API (with optimized size params if present) - no constructed URL guesses
  const realThumb = getOptimizedThumbnail(file.thumbnailLink) || file.thumbnailLink || '';

  let mediaUrl = '';
  if (!isPrivate) {
    // Public media endpoint with API key (supports HTTP range requests for seeking)
    mediaUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${CONFIG.GOOGLE_API_KEY}`;
  } else {
    // If already generated a blob URL for this private file, use it
    mediaUrl = _privateBlobUrls.get(file.id) || '';
  }

  // Parse custom tags if stored as comma-separated string or array
  let tags = [];
  if (file.properties?.tags) {
    tags = Array.isArray(file.properties.tags)
      ? file.properties.tags
      : file.properties.tags.split(',').map((t) => t.trim()).filter(Boolean);
  }

  return {
    id: file.id,
    url: mediaUrl,
    thumbnailUrl: realThumb || (isVideo ? VIDEO_PROCESSING_PLACEHOLDER : ''),
    type: isVideo ? 'video' : 'image',
    title: file.properties?.title || cleanFilename(file.name),
    tags: tags.length > 0 ? tags : (isVideo ? ['Drive Video'] : ['Drive Photo']),
    rating: file.properties?.rating || (isPrivate ? 'Private' : 'U/A 13+'),
    uploadedAt: file.createdTime ? new Date(file.createdTime).getTime() : Date.now(),
    isPrivate: Boolean(isPrivate),
    isFavorite: isItemFavorited(file.id),
    favoritedAt: getItemFavoritedAt(file.id),
    rawDriveFile: file,
  };
}

// ─── Drive API Operations ───────────────────────────────────────────────────

/**
 * Fetch all files from the Public Drive folder without authentication.
 * Uses Google API Key.
 */
export async function fetchPublicItems(forceRefresh = false) {
  const { isValid, missing } = validateConfig();
  if (!isValid) {
    console.error(`[DriveService] Configuration incomplete. Missing keys: ${missing.join(', ')}`);
    return {
      success: false,
      items: [],
      error: `Missing configuration: ${missing.join(', ')}`,
      isConfigMissing: true,
      missing,
    };
  }

  if (_cachedPublicItems && !forceRefresh) {
    return { success: true, items: _cachedPublicItems };
  }

  try {
    const files = [];
    let pageToken = null;

    do {
      let queryUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${CONFIG.PUBLIC_FOLDER_ID}' in parents and trashed=false`)}&fields=${encodeURIComponent('nextPageToken,files(id,name,mimeType,createdTime,thumbnailLink,properties)')}&pageSize=200&key=${CONFIG.GOOGLE_API_KEY}`;
      if (pageToken) {
        queryUrl += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      const res = await fetch(queryUrl);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson.error?.message || `HTTP ${res.status} ${res.statusText}`;
        console.error('[DriveService] Public listing error:', errMsg);
        return { success: false, items: [], error: errMsg, status: res.status };
      }

      const data = await res.json();
      if (data.files && Array.isArray(data.files)) {
        files.push(...data.files);
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    // Map files to items
    const items = files.map((f) => mapDriveFileToItem(f, false));

    // Schedule delayed thumbnail refresh for fresh videos missing thumbnails
    items.forEach((item) => {
      if (item.type === 'video' && (!item.thumbnailUrl || item.thumbnailUrl === VIDEO_PROCESSING_PLACEHOLDER)) {
        _retryThumbnailCheck(item.id, false);
      }
    });

    _cachedPublicItems = items;
    return { success: true, items };
  } catch (err) {
    console.error('[DriveService] Network/fetch error fetching public files:', err);
    return { success: false, items: [], error: err.message || 'Network connection failed' };
  }
}

/**
 * Fetch all files from the Private Safe Space folder.
 * Requires Owner authentication via Bearer token.
 */
export async function fetchPrivateItems() {
  const { isValid, missing } = validateConfig();
  if (!isValid && missing.includes('PRIVATE_FOLDER_ID')) {
    throw new Error('Missing PRIVATE_FOLDER_ID in js/config.js');
  }

  const token = await getValidAccessToken();
  const files = [];
  let pageToken = null;

  do {
    let queryUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${CONFIG.PRIVATE_FOLDER_ID}' in parents and trashed=false`)}&fields=${encodeURIComponent('nextPageToken,files(id,name,mimeType,createdTime,thumbnailLink,properties)')}&pageSize=200`;
    if (pageToken) {
      queryUrl += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    let res = await fetch(queryUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      const newToken = await getValidAccessToken();
      res = await fetch(queryUrl, {
        headers: { Authorization: `Bearer ${newToken}` },
      });
    }

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.files && Array.isArray(data.files)) {
      files.push(...data.files);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  // For private items, convert media to blob URLs with the Bearer token
  const items = await Promise.all(
    files.map(async (file) => {
      let blobUrl = _privateBlobUrls.get(file.id);
      if (!blobUrl) {
        try {
          const mediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (mediaRes.ok) {
            const blob = await mediaRes.blob();
            blobUrl = URL.createObjectURL(blob);
            _privateBlobUrls.set(file.id, blobUrl);
          }
        } catch (mediaErr) {
          console.warn('[DriveService] Could not preload private blob for', file.name, mediaErr);
        }
      }

      const item = mapDriveFileToItem(file, true);
      if (blobUrl) {
        item.url = blobUrl;
      }
      return item;
    })
  );

  return items;
}

/**
 * Resumable upload in chunks (Owner only).
 * Supports cancellation via AbortController and granular progress tracking.
 */
export function createResumableUpload(
  file,
  { title, tags = '', rating = 'U/A 13+', isPrivate = false, thumbnail = null } = {},
  onProgress = null
) {
  const abortController = new AbortController();

  const promise = (async () => {
    const token = await getValidAccessToken();
    const folderId = isPrivate ? CONFIG.PRIVATE_FOLDER_ID : CONFIG.PUBLIC_FOLDER_ID;

    if (!folderId || folderId.startsWith('PASTE_')) {
      throw new Error(`Target Drive folder ID is not configured in js/config.js`);
    }

    const cleanTitle = title?.trim() || cleanFilename(file.name);
    const metadata = {
      name: file.name,
      parents: [folderId],
      properties: {
        title: cleanTitle,
        tags: Array.isArray(tags) ? tags.join(', ') : String(tags),
        rating: rating || 'U/A 13+',
      },
    };

    // Attach custom thumbnail so Google Drive stores and serves it immediately
    if (thumbnail?.urlSafeBase64) {
      console.log('[CHECKPOINT 6 - DRIVE SAVE] Attaching custom thumbnail to Google Drive metadata.contentHints. Length:', thumbnail.urlSafeBase64.length);
      metadata.contentHints = {
        thumbnail: {
          image: thumbnail.urlSafeBase64,
          mimeType: 'image/jpeg',
        },
      };
    } else {
      console.warn('[CHECKPOINT 6 - DRIVE SAVE] NO thumbnail.urlSafeBase64 available to attach to Drive metadata!');
    }

    // 1. Initiate Resumable Upload Session
    const initRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=${encodeURIComponent('id,name,mimeType,createdTime,thumbnailLink,properties')}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': file.type || 'application/octet-stream',
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify(metadata),
      signal: abortController.signal,
    });

    if (!initRes.ok) {
      const err = await initRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to initiate resumable upload: ${initRes.status}`);
    }

    const uploadUrl = initRes.headers.get('Location');
    if (!uploadUrl) {
      throw new Error('Drive API did not return an upload location URL');
    }

    // 2. Upload file in 2 MiB chunks (multiple of 256 KiB required by Drive)
    const CHUNK_SIZE = 1024 * 1024 * 2;
    let start = 0;
    let uploadedFile = null;

    while (start < file.size) {
      if (abortController.signal.aborted) {
        throw new Error('Upload cancelled');
      }

      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const chunkRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes ${start}-${end - 1}/${file.size}`,
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: chunk,
        signal: abortController.signal,
      });

      if (chunkRes.status === 308) {
        // Resume Incomplete: parse Range header
        const range = chunkRes.headers.get('Range');
        if (range) {
          const match = range.match(/bytes=0-(\d+)/);
          if (match) {
            start = parseInt(match[1], 10) + 1;
          } else {
            start = end;
          }
        } else {
          start = end;
        }
      } else if (chunkRes.status === 200 || chunkRes.status === 201) {
        uploadedFile = await chunkRes.json();
        break;
      } else {
        const errJson = await chunkRes.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Chunk upload failed: HTTP ${chunkRes.status}`);
      }

      if (typeof onProgress === 'function') {
        const loaded = Math.min(start, file.size);
        onProgress({
          loaded,
          total: file.size,
          percent: Math.round((loaded / file.size) * 100),
        });
      }
    }

    if (!uploadedFile) {
      throw new Error('Upload finished but file record was not received');
    }

    // Update in-memory session cache
    const newItem = mapDriveFileToItem(uploadedFile, isPrivate);
    console.log('[CHECKPOINT 6 - DRIVE SAVE RESULT] Upload response received from Drive API:', uploadedFile);
    console.log('[CHECKPOINT 6 - DRIVE SAVE RESULT] Initial mapped newItem.thumbnailUrl (from Drive response):', newItem.thumbnailUrl);
    if (thumbnail?.dataUrl) {
      newItem.thumbnailUrl = thumbnail.dataUrl;
      console.log('[CHECKPOINT 6 - DRIVE SAVE RESULT] Overridden newItem.thumbnailUrl with local thumbnail.dataUrl:', newItem.thumbnailUrl?.slice(0, 50) + '...');
    }
    if (!isPrivate) {
      if (!_cachedPublicItems) _cachedPublicItems = [];
      _cachedPublicItems.unshift(newItem);
    }

    return newItem;
  })();

  return {
    promise,
    abort: () => abortController.abort(),
  };
}

/**
 * Trash (delete) a file from Drive (Owner only)
 */
export async function deleteDriveFile(fileId) {
  const token = await getValidAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trashed: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to trash file (${res.status})`);
  }

  // Clear from public cache if present
  if (_cachedPublicItems) {
    _cachedPublicItems = _cachedPublicItems.filter((i) => i.id !== fileId);
  }
  // Revoke blob URL if private
  if (_privateBlobUrls.has(fileId)) {
    URL.revokeObjectURL(_privateBlobUrls.get(fileId));
    _privateBlobUrls.delete(fileId);
  }

  return true;
}

/**
 * Permanently delete a file from Drive (skips the trash, owner only).
 */
export async function permanentlyDeleteDriveFile(fileId) {
  const token = await getValidAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to permanently delete file (${res.status})`);
  }

  if (_cachedPublicItems) {
    _cachedPublicItems = _cachedPublicItems.filter((i) => i.id !== fileId);
  }
  if (_privateBlobUrls.has(fileId)) {
    URL.revokeObjectURL(_privateBlobUrls.get(fileId));
    _privateBlobUrls.delete(fileId);
  }
  return true;
}

/**
 * Fetch all trashed files owned by the user across both folders (owner only).
 */
export async function fetchTrashedItems() {
  const token = await getValidAccessToken();
  const fields = 'files(id,name,mimeType,createdTime,thumbnailLink,properties,parents)';
  const query  = encodeURIComponent('trashed=true');
  const url    = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${encodeURIComponent(fields)}&pageSize=200&orderBy=trashedTime+desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to fetch trashed files (${res.status})`);
  }

  const data = await res.json();
  const files = data.files || [];
  return files.map((f) => mapDriveFileToItem(f, false));
}

/**
 * Restore a trashed file (remove trashed=true flag), owner only.
 */
export async function restoreDriveFile(fileId) {
  const token = await getValidAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trashed: false }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to restore file (${res.status})`);
  }

  // Re-insert into public cache
  const restored = await res.json();
  const restoredItem = mapDriveFileToItem(restored, false);
  if (_cachedPublicItems) {
    _cachedPublicItems.unshift(restoredItem);
  } else {
    _cachedPublicItems = [restoredItem];
  }
  return restoredItem;
}

/**
 * Move a file from the Public folder into the Private (Safe Space) folder.
 * Uses Drive API parent-change (add new parent, remove old parent).
 * Requires Owner authentication — no email verification needed.
 */
export async function moveToSafeSpace(fileId) {
  const token = await getValidAccessToken();

  // Get current parents first so we can remove them
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to get file metadata (${metaRes.status})`);
  }
  const { parents = [] } = await metaRes.json();
  const removeParents = parents.join(',');

  // Move: addParents = PRIVATE_FOLDER_ID, removeParents = current parents
  const moveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${CONFIG.PRIVATE_FOLDER_ID}&removeParents=${removeParents}&fields=id,name,mimeType,createdTime,thumbnailLink,properties,parents`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: { isPrivate: 'true' },
      }),
    }
  );

  if (!moveRes.ok) {
    const err = await moveRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to move file to Safe Space (${moveRes.status})`);
  }

  // Remove from public cache
  if (_cachedPublicItems) {
    _cachedPublicItems = _cachedPublicItems.filter((i) => i.id !== fileId);
  }

  const movedFile = await moveRes.json();
  let blobUrl = _privateBlobUrls.get(fileId);
  if (!blobUrl) {
    try {
      const mediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (mediaRes.ok) {
        const blob = await mediaRes.blob();
        blobUrl = URL.createObjectURL(blob);
        _privateBlobUrls.set(fileId, blobUrl);
      }
    } catch (e) {
      console.warn('[DriveService] blob preload error on move:', e);
    }
  }

  const item = mapDriveFileToItem(movedFile, true);
  if (blobUrl) item.url = blobUrl;
  return item;
}

/**
 * Update file properties/title in Drive (Owner only)
 */
export async function updateDriveFile(fileId, { title, tags }) {
  const token = await getValidAccessToken();
  const properties = {};
  if (title != null) properties.title = title.trim();
  if (tags != null) properties.tags = Array.isArray(tags) ? tags.join(', ') : String(tags);

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to update file properties (${res.status})`);
  }

  const updatedFile = await res.json();
  return updatedFile;
}

/**
 * Background retry check for freshly uploaded videos whose thumbnails Drive is still processing.
 */
function _retryThumbnailCheck(fileId, isPrivate = false) {
  setTimeout(async () => {
    try {
      let url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,thumbnailLink&key=${CONFIG.GOOGLE_API_KEY}`;
      let headers = {};
      if (isPrivate && isOwnerSignedIn()) {
        url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,thumbnailLink`;
        headers = { Authorization: `Bearer ${_accessToken}` };
      }
      const res = await fetch(url, { headers });
      if (!res.ok) return;
      const data = await res.json();
      if (data.thumbnailLink) {
        const thumbUrl = getOptimizedThumbnail(data.thumbnailLink);
        // Find existing cards in DOM with this id and update image src
        document.querySelectorAll(`.gallery-item img`).forEach((img) => {
          if (img.src === VIDEO_PROCESSING_PLACEHOLDER) {
            img.src = thumbUrl;
          }
        });
      }
    } catch (e) {
      // quiet retry
    }
  }, 4500);
}
