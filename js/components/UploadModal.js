import {
  createResumableUpload,
  isOwnerSignedIn,
  signIn,
  cleanFilename,
  onAuthStateChanged,
} from '../core/DriveService.js?v=45';
import { generateAutoThumbnail } from '../utils/ThumbnailGenerator.js?v=45';

/**
 * UploadModal — dark Netflix-styled modal for adding photos/videos to Google Drive.
 * Supports chunked resumable upload with real progress tracking and cancellation.
 */
export class UploadModal {
  constructor(onUpload) {
    this.onUpload = onUpload; // fallback callback: receives normalized item
    this._closeTimer = null;
    this._isPrivate = false;
    this._activeUpload = null;
    this._createDOM();
    this._bindEvents();

    onAuthStateChanged(() => {
      this._updateAuthView();
    });
  }

  _createDOM() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'upload-modal-overlay hidden';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', 'Upload photo or video to Google Drive');

    this.overlay.innerHTML = `
      <div class="upload-modal">
        <button class="upload-modal-close" aria-label="Close">&times;</button>
        <h2 class="upload-modal-title">Upload to Google Drive</h2>

        <!-- Owner Sign-in Gate -->
        <div class="upload-auth-gate hidden" id="upload-auth-gate">
          <div class="upload-auth-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="36" height="36">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <p class="upload-auth-title">Owner Sign-in Required</p>
          <p class="upload-auth-desc">Only the authenticated site owner can upload photos or videos to Google Drive.</p>
          <button type="button" class="google-sign-in-btn" id="upload-signin-btn">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Sign in with Google
          </button>
        </div>

        <!-- Main Upload Form Body -->
        <div class="upload-form-body" id="upload-form-body">
          <label class="upload-drop-zone" id="upload-drop-zone" tabindex="0">
            <input type="file" id="upload-file-input" accept="image/*,video/*" hidden />
            <div class="upload-drop-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p class="upload-drop-text">Click or drop a photo / video here</p>
            <p class="upload-drop-hint" id="upload-filename">Supports JPG, PNG, GIF, MP4, MOV…</p>
          </label>

          <div class="upload-preview-wrap hidden" id="upload-preview-wrap">
            <img id="upload-preview-img" class="upload-preview-media hidden" alt="preview" referrerpolicy="no-referrer" />
            <video id="upload-preview-video" class="upload-preview-media hidden" muted playsinline controls></video>
          </div>

          <div class="upload-field">
            <label for="upload-title-input" class="upload-label">Title (optional)</label>
            <input type="text" id="upload-title-input" class="upload-input"
                   placeholder="Leave blank to use filename" maxlength="80" />
          </div>

          <!-- Progress Bar -->
          <div class="upload-progress-wrap hidden" id="upload-progress-wrap">
            <div class="upload-progress-info">
              <span class="upload-progress-label" id="upload-progress-label">Uploading to Google Drive…</span>
              <span class="upload-progress-percent" id="upload-progress-percent">0%</span>
            </div>
            <div class="upload-progress-bar">
              <div class="upload-progress-fill" id="upload-progress-fill"></div>
            </div>
          </div>

          <div class="upload-actions">
            <button type="button" class="upload-btn upload-btn-cancel" id="upload-cancel-btn">Cancel</button>
            <button type="button" class="upload-btn upload-btn-add" id="upload-add-btn" disabled>Upload to Drive</button>
          </div>
        </div>

        <p class="upload-error hidden" id="upload-error" role="alert"></p>
      </div>
    `;

    document.body.appendChild(this.overlay);

    // Cache DOM refs
    this._authGate     = this.overlay.querySelector('#upload-auth-gate');
    this._formBody     = this.overlay.querySelector('#upload-form-body');
    this._signinBtn    = this.overlay.querySelector('#upload-signin-btn');
    this._dropZone     = this.overlay.querySelector('#upload-drop-zone');
    this._fileInput    = this.overlay.querySelector('#upload-file-input');
    this._filename     = this.overlay.querySelector('#upload-filename');
    this._previewWrap  = this.overlay.querySelector('#upload-preview-wrap');
    this._previewImg   = this.overlay.querySelector('#upload-preview-img');
    this._previewVid   = this.overlay.querySelector('#upload-preview-video');
    this._titleInput   = this.overlay.querySelector('#upload-title-input');
    this._progressWrap = this.overlay.querySelector('#upload-progress-wrap');
    this._progressFill = this.overlay.querySelector('#upload-progress-fill');
    this._progressPct  = this.overlay.querySelector('#upload-progress-percent');
    this._progressLbl  = this.overlay.querySelector('#upload-progress-label');
    this._addBtn       = this.overlay.querySelector('#upload-add-btn');
    this._cancelBtn    = this.overlay.querySelector('#upload-cancel-btn');
    this._closeBtn     = this.overlay.querySelector('.upload-modal-close');
    this._error        = this.overlay.querySelector('#upload-error');

    this._file = null;
  }

  _bindEvents() {
    this._signinBtn.addEventListener('click', async () => {
      try {
        this._hideError();
        this._signinBtn.disabled = true;
        this._signinBtn.textContent = 'Connecting…';
        await signIn();
      } catch (err) {
        this._showError(err.message || 'Sign in failed');
      } finally {
        this._signinBtn.disabled = false;
        this._signinBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          Sign in with Google
        `;
      }
    });

    // Drop zone interactions
    this._dropZone.addEventListener('click', () => this._fileInput.click());
    this._dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._fileInput.click();
      }
    });

    // Drag-and-drop
    this._dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this._dropZone.classList.add('drag-over');
    });
    this._dropZone.addEventListener('dragleave', () => this._dropZone.classList.remove('drag-over'));
    this._dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this._dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) this._handleFile(file);
    });

    this._fileInput.addEventListener('change', () => {
      if (this._fileInput.files[0]) this._handleFile(this._fileInput.files[0]);
    });

    this._cancelBtn.addEventListener('click', () => this._handleCancel());
    this._closeBtn.addEventListener('click', () => this._handleCancel());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this._handleCancel();
    });

    document.addEventListener('keydown', (e) => {
      if (!this.overlay.classList.contains('hidden') && e.key === 'Escape') {
        this._handleCancel();
      }
    });

    this._addBtn.addEventListener('click', () => this._handleAdd());
  }

  _updateAuthView() {
    const signedIn = isOwnerSignedIn();
    this._authGate.classList.toggle('hidden', signedIn);
    this._formBody.classList.toggle('hidden', !signedIn);
  }

  _handleFile(file) {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      this._showError('Please select a valid image or video file.');
      return;
    }
    this._hideError();
    this._file = file;
    this._filename.textContent = file.name;
    this._generatedThumbnail = null;

    // Show preview
    const objURL = URL.createObjectURL(file);
    this._previewWrap.classList.remove('hidden');

    if (isImage) {
      this._previewImg.src = objURL;
      this._previewImg.classList.remove('hidden');
      this._previewVid.classList.add('hidden');
      this._previewVid.src = '';
    } else {
      this._previewVid.src = objURL;
      this._previewVid.classList.remove('hidden');
      this._previewImg.classList.add('hidden');
      this._previewImg.src = '';
    }

    // Automatically generate optimized thumbnail in the background
    console.log('[CHECKPOINT 0 - UPLOAD MODAL] File selected in modal:', file.name, 'Size:', file.size, 'Type:', file.type);
    this._thumbnailPromise = generateAutoThumbnail(file)
      .then((thumb) => {
        this._generatedThumbnail = thumb;
        console.log('[CHECKPOINT 0 - UPLOAD MODAL] generateAutoThumbnail completed. Result:', thumb ? { hasDataUrl: Boolean(thumb.dataUrl), hasBlob: Boolean(thumb.blob), blobSize: thumb.blob?.size, hasUrlSafeBase64: Boolean(thumb.urlSafeBase64) } : null);
        if (thumb?.dataUrl) {
          // If video, update preview image with extracted frame
          if (isVideo && this._previewImg) {
            this._previewImg.src = thumb.dataUrl;
          }
        }
        return thumb;
      })
      .catch((err) => {
        console.error('[CHECKPOINT 0 - UPLOAD MODAL ERROR] Auto thumbnail generation error:', err);
        return null;
      });

    this._addBtn.disabled = false;
  }

  async _handleAdd() {
    if (!this._file) return;

    if (!isOwnerSignedIn()) {
      console.warn('[CHECKPOINT 0 - UPLOAD MODAL] Attempted upload without owner sign-in.');
      this._updateAuthView();
      return;
    }

    const title = this._titleInput.value.trim() || cleanFilename(this._file.name);

    this._addBtn.disabled = true;
    this._addBtn.textContent = 'Processing & Uploading…';
    this._dropZone.style.pointerEvents = 'none';
    this._progressWrap.classList.remove('hidden');
    this._progressFill.style.width = '0%';
    this._progressPct.textContent = '0%';
    this._hideError();

    // Await thumbnail if still generating (up to 2.5s)
    let thumbnail = this._generatedThumbnail;
    if (!thumbnail && this._thumbnailPromise) {
      console.log('[CHECKPOINT 0 - UPLOAD MODAL] Awaiting in-flight thumbnail generation promise...');
      thumbnail = await Promise.race([
        this._thumbnailPromise,
        new Promise((r) => setTimeout(() => r(null), 2500)),
      ]);
    }
    console.log('[CHECKPOINT 0 - UPLOAD MODAL] Thumbnail passed to createResumableUpload:', thumbnail ? { hasBlob: Boolean(thumbnail.blob), blobSize: thumbnail.blob?.size, urlSafeLength: thumbnail.urlSafeBase64?.length } : 'NULL');

    const upload = createResumableUpload(
      this._file,
      {
        title,
        isPrivate: this._isPrivate,
        thumbnail,
      },
      ({ loaded, total, percent }) => {
        this._progressFill.style.width = `${percent}%`;
        this._progressPct.textContent = `${percent}%`;
        const mbLoaded = (loaded / (1024 * 1024)).toFixed(1);
        const mbTotal = (total / (1024 * 1024)).toFixed(1);
        this._progressLbl.textContent = `Uploading… ${mbLoaded}MB / ${mbTotal}MB`;
      }
    );

    this._activeUpload = upload;

    try {
      const newItem = await upload.promise;
      this._activeUpload = null;
      if (this._onSuccess) {
        this._onSuccess(newItem);
      } else if (this.onUpload) {
        this.onUpload(newItem);
      }
      this.close();
    } catch (err) {
      if (err.message === 'Upload cancelled') {
        this._showError('Upload was cancelled.');
      } else {
        console.error('[UploadModal] Google Drive upload error:', err);
        this._showError(`Upload failed: ${err.message || 'Unknown error'}`);
      }
      this._addBtn.disabled = false;
      this._addBtn.textContent = 'Upload to Drive';
      this._dropZone.style.pointerEvents = '';
      this._progressWrap.classList.add('hidden');
      this._activeUpload = null;
    }
  }

  _handleCancel() {
    if (this._activeUpload) {
      this._activeUpload.abort();
      this._activeUpload = null;
    }
    this.close();
  }

  _showError(msg) {
    this._error.textContent = msg;
    this._error.classList.remove('hidden');
  }

  _hideError() {
    this._error.classList.add('hidden');
  }

  open(onSuccess = null, modalTitle = 'Upload to Google Drive', isPrivate = false) {
    this._onSuccess = onSuccess;
    this._isPrivate = Boolean(isPrivate);
    this.overlay.querySelector('.upload-modal-title').textContent = modalTitle;
    this._reset();
    this._updateAuthView();

    if (this._closeTimer) {
      clearTimeout(this._closeTimer);
      this._closeTimer = null;
    }

    this.overlay.classList.remove('hidden', 'is-open');
    void this.overlay.offsetWidth;
    const modal = this.overlay.querySelector('.upload-modal');
    if (modal) void modal.offsetWidth;
    this.overlay.classList.add('is-open');

    if (isOwnerSignedIn()) {
      this._dropZone.focus();
    }
    document.body.style.overflow = 'hidden';
  }

  close() {
    if (this._closeTimer) {
      clearTimeout(this._closeTimer);
      this._closeTimer = null;
    }

    this.overlay.classList.remove('is-open');

    this._closeTimer = setTimeout(() => {
      this._closeTimer = null;
      if (!this.overlay.classList.contains('is-open')) {
        this.overlay.classList.add('hidden');
      }
    }, 600);
    document.body.style.overflow = '';
  }

  _reset() {
    this._file = null;
    this._fileInput.value = '';
    this._titleInput.value = '';
    this._filename.textContent = 'Supports JPG, PNG, GIF, MP4, MOV…';
    this._previewWrap.classList.add('hidden');
    this._previewImg.classList.add('hidden');
    this._previewVid.classList.add('hidden');
    this._previewImg.src = '';
    this._previewVid.src = '';
    this._progressWrap.classList.add('hidden');
    this._progressFill.style.width = '0%';
    this._progressPct.textContent = '0%';
    this._addBtn.disabled = true;
    this._addBtn.textContent = 'Upload to Drive';
    this._dropZone.style.pointerEvents = '';
    this._hideError();
  }
}
