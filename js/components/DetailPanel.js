import { $ } from '../utils/helpers.js';
import { shareItem, downloadItem } from '../utils/shareUtils.js';

export class DetailPanel {
  constructor() {
    this.items = [];
    this.currentIndex = 0;
    this.isMuted = true;
    this._currentVideo = null;
    this._closeTimer = null;
    this.likeStateMap = new Map(); // tracks liked status per item url/title
    this.likeCountMap = new Map(); // tracks like counts per item

    this._createDOM();
    this._bindEvents();
  }

  _createDOM() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'detail-panel-overlay hidden';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', 'Item details');

    this.overlay.innerHTML = `
      <div class="detail-panel-modal">
        <!-- Close button (X) -->
        <button class="detail-panel-close-btn" aria-label="Close detail panel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <!-- Media Area (Top, Portrait / Tall Frame) -->
        <div class="detail-panel-media-wrap">
          <div class="detail-panel-media-slot"></div>
          
          <!-- Gradient overlay at bottom of media -->
          <div class="detail-panel-media-gradient"></div>

          <!-- Mute toggle (visible when video is playing) -->
          <button class="detail-panel-mute-btn hidden" aria-label="Toggle mute">
            <svg class="mute-icon-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <line x1="23" y1="9" x2="17" y2="15"></line>
              <line x1="17" y1="9" x2="23" y2="15"></line>
            </svg>
            <svg class="mute-icon-unmuted hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
          </button>

          <!-- Fullscreen / Expand button -->
          <button class="detail-panel-fullscreen-btn" aria-label="Fullscreen view" title="Fullscreen view">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
              <polyline points="15 3 21 3 21 9"></polyline>
              <polyline points="9 21 3 21 3 15"></polyline>
              <line x1="21" y1="3" x2="14" y2="10"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
          </button>

          <!-- Bottom-left overlay on media -->
          <div class="detail-panel-meta">
            <h2 class="detail-panel-title"></h2>
            <p class="detail-panel-subtitle"></p>
            <div class="detail-panel-author">
              <div class="detail-panel-avatar">H</div>
              <span class="detail-panel-handle">@himanshi_originals</span>
            </div>
          </div>

          <!-- Right-side vertical icon rail (overlaid on media) -->
          <div class="detail-panel-social-rail">
            <!-- Heart / Like -->
            <div class="detail-panel-action-group">
              <button class="detail-panel-action-btn detail-panel-btn-like" aria-label="Like">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
              </button>
              <span class="detail-panel-count detail-panel-like-count">128K</span>
            </div>

            <!-- Comment / Speech Bubble -->
            <div class="detail-panel-action-group">
              <button class="detail-panel-action-btn detail-panel-btn-comment" aria-label="Comments">
                <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                </svg>
              </button>
              <span class="detail-panel-count detail-panel-comment-count">3.2K</span>
            </div>

            <!-- Share / Repost -->
            <div class="detail-panel-action-group">
              <button class="detail-panel-action-btn detail-panel-btn-share" aria-label="Share">
                <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                  <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
                </svg>
              </button>
              <span class="detail-panel-count detail-panel-share-count">16.8K</span>
            </div>

            <!-- Download -->
            <div class="detail-panel-action-group">
              <button class="detail-panel-action-btn detail-panel-btn-download" aria-label="Download">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </button>
              <span class="detail-panel-count detail-panel-download-count">Save</span>
            </div>

            <!-- Safe Space (Move to Safe Space) -->
            <div class="detail-panel-action-group detail-panel-group-safespace">
              <button class="detail-panel-action-btn detail-panel-btn-safespace" aria-label="Move to Safe Space" title="Move to Safe Space">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </button>
              <span class="detail-panel-count">Safe</span>
            </div>
          </div>

          <!-- Quick Feedback Toast -->
          <div class="detail-panel-toast hidden"></div>
        </div>

        <!-- Episodes Section (Below Media) -->
        <div class="detail-panel-episodes-section">
          <div class="detail-panel-episodes-header">
            <h3 class="detail-panel-episodes-title">Episodes</h3>
            <span class="detail-panel-episodes-badge"></span>
          </div>
          <div class="detail-panel-episodes-list" role="list"></div>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    // Cache elements
    this.modal = this.overlay.querySelector('.detail-panel-modal');
    this.closeBtn = this.overlay.querySelector('.detail-panel-close-btn');
    this.mediaWrap = this.overlay.querySelector('.detail-panel-media-wrap');
    this.mediaSlot = this.overlay.querySelector('.detail-panel-media-slot');
    this.muteBtn = this.overlay.querySelector('.detail-panel-mute-btn');
    this.fullscreenBtn = this.overlay.querySelector('.detail-panel-fullscreen-btn');
    this.muteIconMuted = this.muteBtn.querySelector('.mute-icon-muted');
    this.muteIconUnmuted = this.muteBtn.querySelector('.mute-icon-unmuted');
    
    this.titleEl = this.overlay.querySelector('.detail-panel-title');
    this.subtitleEl = this.overlay.querySelector('.detail-panel-subtitle');
    this.handleEl = this.overlay.querySelector('.detail-panel-handle');
    
    this.likeBtn = this.overlay.querySelector('.detail-panel-btn-like');
    this.likeCountEl = this.overlay.querySelector('.detail-panel-like-count');
    this.commentBtn = this.overlay.querySelector('.detail-panel-btn-comment');
    this.commentCountEl = this.overlay.querySelector('.detail-panel-comment-count');
    this.shareBtn = this.overlay.querySelector('.detail-panel-btn-share');
    this.shareCountEl = this.overlay.querySelector('.detail-panel-share-count');
    this.downloadBtn = this.overlay.querySelector('.detail-panel-btn-download');
    this.downloadCountEl = this.overlay.querySelector('.detail-panel-download-count');
    this.safespaceBtn = this.overlay.querySelector('.detail-panel-btn-safespace');
    this.safespaceGroup = this.overlay.querySelector('.detail-panel-group-safespace');
    this.toastEl = this.overlay.querySelector('.detail-panel-toast');
    
    this.episodesBadge = this.overlay.querySelector('.detail-panel-episodes-badge');
    this.episodesList = this.overlay.querySelector('.detail-panel-episodes-list');
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /**
   * Open the detail panel for a given items array (siblings from row) at the specified index.
   * @param {Array} items - Sibling items from the row
   * @param {number} index - Index of the item clicked
   */
  open(items, index = 0) {
    if (!items || !items.length) return;
    this.items = items;
    this.currentIndex = Math.max(0, Math.min(index, items.length - 1));

    // Cancel any pending close animation immediately to prevent fighting
    if (this._closeTimer) {
      clearTimeout(this._closeTimer);
      this._closeTimer = null;
    }

    this._renderCurrentItem();
    this._renderEpisodesList();

    // 1. Remove hidden and reset closed state
    this.overlay.classList.remove('hidden', 'is-open', 'is-closing', 'is-opening');
    // 2. Force reflow of overlay AND inner modal so the browser paints closed state first
    void this.overlay.offsetWidth;
    const modal = this.overlay.querySelector('.detail-panel-modal');
    if (modal) void modal.offsetWidth;
    // 3. NOW trigger the cinematic 800ms transition to is-open
    this.overlay.classList.add('is-open');

    document.body.style.overflow = 'hidden';
    this.closeBtn.focus();
  }

  close() {
    this._stopVideo();
    // Cancel any existing close timer
    if (this._closeTimer) {
      clearTimeout(this._closeTimer);
      this._closeTimer = null;
    }

    // Remove is-open to trigger 600ms close transition
    this.overlay.classList.remove('is-open', 'is-opening', 'is-closing');

    // Wait exactly 600ms (matches --t-cinematic-close) before hiding
    this._closeTimer = setTimeout(() => {
      this._closeTimer = null;
      if (!this.overlay.classList.contains('is-open')) {
        this.overlay.classList.add('hidden');
      }
    }, 600);
    document.body.style.overflow = '';
  }

  selectItem(index) {
    if (index < 0 || index >= this.items.length) return;
    if (index === this.currentIndex) return;

    this.currentIndex = index;
    this._renderCurrentItem();
    this._updateActiveEpisodeItem();
  }

  // ─── Content Rendering ──────────────────────────────────────────────────

  _renderCurrentItem() {
    this._stopVideo();

    const item = this.items[this.currentIndex];
    if (!item) return;

    const url = typeof item === 'string' ? item : item.url;
    const title = typeof item === 'string' ? `Item ${this.currentIndex + 1}` : (item.title || 'Untitled');
    const type = typeof item === 'string' ? 'image' : (item.type || 'image');
    const tags = Array.isArray(item.tags) ? item.tags : [];

    // Title
    this.titleEl.textContent = title;

    // Subtitle: use tags or formatted description
    if (tags.length > 0) {
      this.subtitleEl.textContent = tags.join(' • ');
    } else {
      this.subtitleEl.textContent = 'Original Series • Himanshi Exclusive';
    }

    // Avatar handle: use first word of title, cap at 14 chars
    const firstWord = title.split(/\s+/)[0] || 'stream';
    const cleanHandle = firstWord.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14);
    this.handleEl.textContent = `@himanshi_${cleanHandle || 'stream'}`;

    // Swap Media
    this.mediaSlot.innerHTML = '';
    if (type === 'video') {
      const vid = document.createElement('video');
      vid.className = 'detail-panel-media detail-panel-media--video';
      vid.src = url;
      vid.autoplay = true;
      vid.loop = true;
      vid.playsInline = true;
      vid.muted = this.isMuted;
      this.mediaSlot.appendChild(vid);
      this._currentVideo = vid;

      this.muteBtn.classList.remove('hidden');
      this._updateMuteUI();

      vid.play().catch(() => {/* Autoplay policy handled */});
    } else {
      const img = document.createElement('img');
      img.className = 'detail-panel-media detail-panel-media--img';
      img.referrerPolicy = 'no-referrer';
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.src = url;
      img.alt = title;
      img.loading = 'eager';
      this.mediaSlot.appendChild(img);
      this._currentVideo = null;

      this.muteBtn.classList.add('hidden');
    }

    // Toggle Safe Space action visibility (hide if already in Safe Space)
    if (this.safespaceGroup) {
      if (item.isPrivate) {
        this.safespaceGroup.classList.add('hidden');
      } else {
        this.safespaceGroup.classList.remove('hidden');
      }
    }

    // Social stats per item (deterministic based on title/url)
    const key = url || title;
    let isLiked = this.likeStateMap.get(key);
    if (isLiked === undefined) {
      isLiked = false;
      this.likeStateMap.set(key, isLiked);
    }

    let baseLikes = this.likeCountMap.get(key);
    if (baseLikes === undefined) {
      // Deterministic decorative count based on title char codes
      let hash = 0;
      for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) & 0xffff;
      baseLikes = 60 + (hash % 180); // e.g. 60 - 240 K
      this.likeCountMap.set(key, baseLikes);
    }

    const currentLikes = isLiked ? (baseLikes + 0.1).toFixed(1) : baseLikes;
    this.likeCountEl.textContent = `${currentLikes}K`;
    this._updateLikeBtnUI(isLiked);

    // Comment count & share count
    let hash2 = 0;
    for (let i = 0; i < title.length; i++) hash2 = (hash2 * 17 + title.charCodeAt(i)) & 0xfff;
    this.commentCountEl.textContent = `${(1.2 + (hash2 % 30) / 10).toFixed(1)}K`;
    this.shareCountEl.textContent = `${(5.5 + (hash2 % 50) / 10).toFixed(1)}K`;
  }

  _renderEpisodesList() {
    this.episodesList.innerHTML = '';
    const total = this.items.length;
    this.episodesBadge.textContent = `${total} Episode${total === 1 ? '' : 's'}`;

    this.items.forEach((item, idx) => {
      const epEl = document.createElement('div');
      epEl.className = 'detail-panel-episode-item' + (idx === this.currentIndex ? ' is-active' : '');
      epEl.setAttribute('role', 'button');
      epEl.setAttribute('tabindex', '0');
      epEl.dataset.index = idx;

      const title = item.title || `Episode ${idx + 1}`;
      const tags = (item.tags && item.tags.length) ? item.tags.join(' • ') : `Episode ${idx + 1}`;
      const url = item.url;
      const isVideo = item.type === 'video';
      const thumbSrc = item.thumbnailUrl || url;

      epEl.innerHTML = `
        <div class="detail-panel-ep-thumb-wrap">
          ${(isVideo && !item.thumbnailUrl)
            ? `<video class="detail-panel-ep-thumb" src="${url}" muted preload="metadata"></video>`
            : `<img class="detail-panel-ep-thumb" referrerpolicy="no-referrer" src="${thumbSrc}" alt="${title}" loading="lazy" />`
          }
          <div class="detail-panel-ep-play-overlay">
            <svg viewBox="0 0 24 24" fill="white" width="16" height="16">
              <path d="M8 5v14l11-7z"></path>
            </svg>
          </div>
          ${isVideo ? `<span class="detail-panel-ep-tag">VID</span>` : ''}
        </div>
        <div class="detail-panel-ep-details">
          <div class="detail-panel-ep-title-row">
            <span class="detail-panel-ep-num">E${idx + 1}</span>
            <span class="detail-panel-ep-title">${title}</span>
          </div>
          <p class="detail-panel-ep-desc">${tags}</p>
        </div>
        <div class="detail-panel-ep-status">
          <span class="detail-panel-ep-playing-pill">Playing</span>
        </div>
      `;

      epEl.addEventListener('click', () => {
        this.selectItem(idx);
      });

      epEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.selectItem(idx);
        }
      });

      this.episodesList.appendChild(epEl);
    });

    // Scroll active item into view
    this._scrollActiveEpisodeIntoView();
  }

  _updateActiveEpisodeItem() {
    const epNodes = this.episodesList.querySelectorAll('.detail-panel-episode-item');
    epNodes.forEach((node, idx) => {
      node.classList.toggle('is-active', idx === this.currentIndex);
    });
    this._scrollActiveEpisodeIntoView();
  }

  _scrollActiveEpisodeIntoView() {
    const activeEl = this.episodesList.querySelector('.detail-panel-episode-item.is-active');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  _updateLikeBtnUI(isLiked) {
    this.likeBtn.classList.toggle('is-liked', isLiked);
    const svg = this.likeBtn.querySelector('svg');
    if (svg) {
      if (isLiked) {
        svg.setAttribute('fill', '#e50914');
        svg.setAttribute('stroke', '#e50914');
      } else {
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
      }
    }
  }

  _updateMuteUI() {
    if (this.isMuted) {
      this.muteIconMuted.classList.remove('hidden');
      this.muteIconUnmuted.classList.add('hidden');
      this.muteBtn.setAttribute('aria-label', 'Unmute video');
    } else {
      this.muteIconMuted.classList.add('hidden');
      this.muteIconUnmuted.classList.remove('hidden');
      this.muteBtn.setAttribute('aria-label', 'Mute video');
    }
  }

  _stopVideo() {
    if (this._currentVideo) {
      this._currentVideo.pause();
      this._currentVideo = null;
    }
  }

  showToast(msg) {
    this._showToast(msg);
  }

  _showToast(msg) {
    if (this.overlay.classList.contains('hidden')) {
      if (!this._globalToastEl) {
        this._globalToastEl = document.createElement('div');
        this._globalToastEl.className = 'detail-panel-toast detail-panel-toast--global';
        document.body.appendChild(this._globalToastEl);
      }
      this._globalToastEl.textContent = msg;
      this._globalToastEl.classList.remove('hidden');
      this._globalToastEl.classList.add('is-visible');
      clearTimeout(this._globalToastTimer);
      this._globalToastTimer = setTimeout(() => {
        this._globalToastEl.classList.remove('is-visible');
        setTimeout(() => this._globalToastEl.classList.add('hidden'), 250);
      }, 2500);
      return;
    }

    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('hidden');
    this.toastEl.classList.add('is-visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('is-visible');
      setTimeout(() => this.toastEl.classList.add('hidden'), 250);
    }, 2000);
  }

  // ─── Event Listeners ─────────────────────────────────────────────────────

  _bindEvents() {
    // Close button
    this.closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });

    // Backdrop click: if clicked outside modal, dismiss
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    // Keyboard Esc to close
    document.addEventListener('keydown', (e) => {
      // If fullscreen player is open on top, don't close detail panel
      if (window.lightbox && !window.lightbox.overlay.classList.contains('hidden')) {
        return;
      }
      if (!this.overlay.classList.contains('hidden') && e.key === 'Escape') {
        this.close();
      }
    });

    // Fullscreen / Expand handlers (both button & direct click on media)
    const openFullscreen = () => {
      if (window.lightbox && this.items && this.items.length) {
        if (this._currentVideo) {
          this._currentVideo.pause();
        }
        window.lightbox.open(this.items, this.currentIndex);
      }
    };

    this.fullscreenBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openFullscreen();
    });

    this.mediaWrap.addEventListener('click', (e) => {
      // Prevent triggering if clicked on any interactive controls
      if (e.target.closest('.detail-panel-fullscreen-btn, .detail-panel-mute-btn, .detail-panel-close-btn, .detail-panel-social-rail, .detail-panel-author, .detail-panel-action-btn')) {
        return;
      }
      openFullscreen();
    });

    // Mute toggle
    this.muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isMuted = !this.isMuted;
      if (this._currentVideo) {
        this._currentVideo.muted = this.isMuted;
      }
      this._updateMuteUI();
    });

    // Like button toggle
    this.likeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentItem = this.items[this.currentIndex];
      if (!currentItem) return;

      const key = currentItem.url || currentItem.title;
      const wasLiked = !!this.likeStateMap.get(key);
      const isLiked = !wasLiked;
      this.likeStateMap.set(key, isLiked);

      const baseLikes = this.likeCountMap.get(key) || 100;
      const count = isLiked ? (baseLikes + 0.1).toFixed(1) : baseLikes;
      this.likeCountEl.textContent = `${count}K`;

      this._updateLikeBtnUI(isLiked);

      // Trigger pop bounce animation
      this.likeBtn.classList.remove('btn-pop');
      void this.likeBtn.offsetWidth;
      this.likeBtn.classList.add('btn-pop');
    });

    // Comment button
    this.commentBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._showToast('Comments feature coming soon!');
    });

    // Share button
    this.shareBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const currentItem = this.items[this.currentIndex];
      if (!currentItem) return;
      const itemObj = typeof currentItem === 'string'
        ? { url: currentItem, title: 'Himanshi Show', type: 'image' }
        : currentItem;
      await shareItem(itemObj, (msg) => this._showToast(msg));
    });

    // Download button
    this.downloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentItem = this.items[this.currentIndex];
      if (!currentItem) return;
      const itemObj = typeof currentItem === 'string'
        ? { url: currentItem, title: 'Himanshi Show', type: 'image' }
        : currentItem;
      downloadItem(itemObj);
    });

    // Move to Safe Space button
    if (this.safespaceBtn) {
      this.safespaceBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const currentItem = this.items[this.currentIndex];
        if (!currentItem) return;

        if (window._browseApp && typeof window._browseApp._moveToSafeSpace === 'function') {
          this._showToast('Moving to Safe Space 🔒…');
          const itemToMove = currentItem;
          this.items.splice(this.currentIndex, 1);
          if (this.items.length === 0) {
            this.close();
          } else {
            this.currentIndex = Math.min(this.currentIndex, this.items.length - 1);
            this._renderCurrentItem();
            this._renderEpisodesList();
          }
          await window._browseApp._moveToSafeSpace(itemToMove);
        }
      });
    }
  }
}
