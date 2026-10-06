import { $ } from '../utils/helpers.js';
import { shareItem, downloadItem } from '../utils/shareUtils.js';

export class Lightbox {
  constructor() {
    this.createDOM();
    this.items        = []; // normalized gallery items
    this.currentIndex = 0;
    this.bindEvents();
  }

  createDOM() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'netflix-player hidden';
    this.overlay.innerHTML = `
      <div class="netflix-player-ui">
        <button class="netflix-player-back" aria-label="Back to browse">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="32" height="32">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        <div class="netflix-player-actions">
          <button class="netflix-player-action-btn netflix-player-btn-share" aria-label="Share">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
          </button>
          <button class="netflix-player-action-btn netflix-player-btn-download" aria-label="Download">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="netflix-player-media-slot"></div>
    `;
    document.body.appendChild(this.overlay);

    this.mediaSlot = this.overlay.querySelector('.netflix-player-media-slot');
    this.backBtn   = this.overlay.querySelector('.netflix-player-back');
    this.closeBtn  = this.backBtn; // alias so open() doesn't crash
    this.shareBtn  = this.overlay.querySelector('.netflix-player-btn-share');
    this.downloadBtn = this.overlay.querySelector('.netflix-player-btn-download');
    this.uiOverlay = this.overlay.querySelector('.netflix-player-ui');
    this.idleTimer = null;
    this._closeTimer = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** items: array of normalized objects { url, type, title, date? } */
  open(items, index) {
    this.items        = items;
    this.currentIndex = index;
    this._updateContent();

    if (this._closeTimer) {
      clearTimeout(this._closeTimer);
      this._closeTimer = null;
    }

    // 1. Remove hidden and reset closed state
    this.overlay.classList.remove('hidden', 'is-open');
    // 2. Forced reflow on overlay AND media slot so browser paints closed state first
    void this.overlay.offsetWidth;
    if (this.mediaSlot) void this.mediaSlot.offsetWidth;
    // 3. NOW trigger cinematic 800ms transition to is-open
    this.overlay.classList.add('is-open');

    this.closeBtn.focus();
    document.body.style.overflow = 'hidden';
  }

  close() {
    this._stopVideo();

    if (this._closeTimer) {
      clearTimeout(this._closeTimer);
      this._closeTimer = null;
    }

    this.overlay.classList.remove('is-open');

    // Wait exactly 600ms (matches --t-cinematic-close) before applying hidden
    this._closeTimer = setTimeout(() => {
      this._closeTimer = null;
      if (!this.overlay.classList.contains('is-open')) {
        this.overlay.classList.add('hidden');
      }
    }, 600);

    const detailPanelOpen = document.querySelector('.detail-panel-overlay.is-open');
    if (!detailPanelOpen) {
      document.body.style.overflow = '';
    } else if (window.detailPanel && window.detailPanel._currentVideo) {
      window.detailPanel._currentVideo.play().catch(() => {});
    }
  }

  // Arrows removed (Netflix doesn't swipe through movies)
  prev() {}
  next() {}

  // ── Internal ────────────────────────────────────────────────────────────

  _updateContent() {
    this._stopVideo(); // pause any playing video before swapping

    const data  = this.items[this.currentIndex];
    const url   = typeof data === 'string' ? data   : data.url;
    const title = typeof data === 'string' ? `Image ${this.currentIndex + 1}` : (data.title || '');
    const type  = typeof data === 'string' ? 'image' : (data.type || 'image');

    // Swap media element
    this.mediaSlot.innerHTML = '';
    if (type === 'video') {
      const vid         = document.createElement('video');
      vid.className     = 'netflix-player-video';
      vid.src           = url;
      vid.controls      = false; // We use the custom netflix-player-ui, not native controls
      vid.autoplay      = true;
      vid.playsInline   = true;
      this.mediaSlot.appendChild(vid);
      this._currentVideo = vid;

      // Click on video area: toggle play/pause
      vid.addEventListener('click', () => {
        if (vid.paused) vid.play().catch(() => {});
        else vid.pause();
      });

      // Ensure it actually plays
      vid.play().catch(() => {});
    } else {
      const img   = document.createElement('img');
      img.className = 'netflix-player-img';
      img.referrerPolicy = 'no-referrer';
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.src     = url;
      img.alt     = title;
      this.mediaSlot.appendChild(img);
      this._currentVideo = null;
    }
  }

  _stopVideo() {
    if (this._currentVideo) {
      this._currentVideo.pause();
      this._currentVideo = null;
    }
  }

  bindEvents() {
    this.backBtn.addEventListener('click', () => this.close());

    this.shareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentItem = this.items[this.currentIndex];
      if (currentItem) {
        shareItem(currentItem);
      }
    });

    this.downloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentItem = this.items[this.currentIndex];
      if (currentItem) {
        downloadItem(currentItem);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (this.overlay.classList.contains('hidden')) return;
      if (e.key === 'Escape') this.close();
    });

    // Idle mouse detection
    this.overlay.addEventListener('mousemove', () => {
      this.overlay.classList.remove('is-idle');
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => {
        this.overlay.classList.add('is-idle');
      }, 3000); // hide controls after 3 seconds
    });
  }
}
