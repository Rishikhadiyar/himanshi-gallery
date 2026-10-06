import { $, $$, isTouchDevice } from '../utils/helpers.js?v=23';
import { deleteUpload } from '../core/UploadDB.js';
import { hoverPopup } from './HoverPopup.js?v=33';

/**
 * Normalize any data shape to the canonical gallery item:
 *   { url, type: 'image'|'video', title, date? }
 */
function normalize(data, index) {
  if (typeof data === 'string') {
    return { url: data, thumbnailUrl: data, type: 'image', title: `Image ${index + 1}`, date: '', tags: [], rating: 'U/A 16+', isFavorite: false, favoritedAt: null, uploadedAt: 0, isTop10: false, hasNewEpisode: false, progress: null, seasons: '1 Season', format: 'Series' };
  }
  return {
    url         : data.url,
    thumbnailUrl: data.thumbnailUrl || (data.type === 'image' ? data.url : ''),
    type        : data.type || 'image',
    title       : data.title || `Item ${index + 1}`,
    date        : data.date  || '',
    id          : data.id,
    tags        : data.tags       || ['User Upload'],
    rating      : data.rating     || 'U/A 16+',
    isFavorite  : data.isFavorite || false,
    favoritedAt : data.favoritedAt|| null,
    uploadedAt  : data.uploadedAt || 0,
    isTop10     : data.isTop10    || false,
    hasNewEpisode: data.hasNewEpisode || false,
    progress    : data.progress !== undefined ? data.progress : null,
    seasons     : data.seasons    || '1 Season',
    format      : data.format     || 'Series',
  };
}

export class GallerySlider {
  /**
   * @param {string}   trackId     - id of the .slider-track element
   * @param {Array}    images      - raw image data (strings or objects)
   * @param {Object}   [opts]
   * @param {Function} [opts.onAdd] - if provided, an "+" add card is appended;
   *                                  calling opts.onAdd() should open the upload modal.
   * @param {Function} [opts.onEdit] - called with (index, item) when edit is clicked
   */
  constructor(trackId, images = [], { onAdd, onEdit, onRemove } = {}) {
    this.trackId = trackId;
    this.track = $(`#${trackId}`);
    if (!this.track) return;

    this.container = this.track.parentElement;
    this.leftArrow  = this.container.querySelector('.slider-arrow-left');
    this.rightArrow = this.container.querySelector('.slider-arrow-right');

    // Normalize to canonical shape
    this.items  = images.map(normalize);
    this.onAdd    = onAdd    || null;
    this.onEdit   = onEdit   || null;
    this.onRemove = onRemove || null; // called with (item) when remove is clicked on a non-DB item

    this.isDragging = false;
    this.startX     = 0;
    this.scrollLeft = 0;

    this.init();
  }

  init() {
    this.populate();
    this.bindEvents();
  }

  /** Public: append a single new item without re-rendering the whole row */
  addItem(rawItem) {
    const item = normalize(rawItem, this.items.length);
    this.items.push(item);
    const addCard = this.track.querySelector('.gallery-add-card');
    const cardEl  = this._buildCard(item, this.items.length - 1);
    if (addCard) {
      this.track.insertBefore(cardEl, addCard);
    } else {
      this.track.appendChild(cardEl);
    }
    cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'end' });
  }

  /** Public: prepend a single new item at the very start of the row */
  addItemAtStart(rawItem) {
    const item = normalize(rawItem, 0);
    this.items.unshift(item);
    // Re-index all items
    this.items.forEach((it, i) => { it._index = i; });
    const cardEl = this._buildCard(item, 0);
    this.track.insertBefore(cardEl, this.track.firstChild);
    cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }

  /** Public: fully re-render this row with a new items array (e.g. Top Picks refresh) */
  repopulate(newItems) {
    this.items = newItems.map(normalize);
    this.populate();
    // Arrow state may change after repopulate (e.g. Top Picks gains/loses items)
    requestAnimationFrame(() => this._updateArrows());
  }

  /** Public: replace an existing item live (e.g. after edit) */
  replaceItem(index, rawItem) {
    if (index < 0 || index >= this.items.length) return;
    const newItem = normalize(rawItem, index);
    this.items[index] = newItem;

    // Find the DOM node. The "+" card might be there, but items match index sequentially.
    const nodes = this.track.querySelectorAll('.gallery-item:not(.gallery-add-card)');
    if (nodes[index]) {
      const newCard = this._buildCard(newItem, index);
      nodes[index].replaceWith(newCard);
    }
  }

  populate() {
    this.track.innerHTML = '';

    this.items.forEach((item, index) => {
      this.track.appendChild(this._buildCard(item, index));
    });

    // "+" add card (uploads row only)
    if (this.onAdd) {
      this.track.appendChild(this._buildAddCard());
    }

    // Recheck arrow visibility after content change
    requestAnimationFrame(() => this._updateArrows());
  }

  // ─── Card builders ──────────────────────────────────────────────────────

  _buildCard(item, index) {
    const card = document.createElement('div');
    card.className = 'gallery-item';
    card.tabIndex  = 0;

    // Staggered entrance
    const delay = Math.min(index * 40, 280);
    card.style.animationDelay = `${delay}ms`;
    card.classList.add('gallery-item--enter');

    // ── Media element ──
    if (item.type === 'video' && !item.thumbnailUrl) {
      card.appendChild(this._buildVideoMedia(item));
    } else {
      card.appendChild(this._buildImageMedia(item));
    }

    // ── Video type badge ──
    if (item.type === 'video') {
      const badge = document.createElement('div');
      badge.className = 'gallery-video-badge';
      badge.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M8 5v14l11-7z"/></svg>`;
      card.appendChild(badge);
    }

    // ── Overlay (title + action buttons) ──
    const overlay = document.createElement('div');
    overlay.className = 'gallery-item-overlay';
    overlay.innerHTML = `
      <div class="gallery-item-info">
        <span class="gallery-item-title">${item.title}</span>
        <div class="gallery-item-actions">
          <button class="gallery-action-btn gallery-play-btn" aria-label="Play" tabindex="-1">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button class="gallery-action-btn" aria-label="Add to list" tabindex="-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <button class="gallery-action-btn" aria-label="Like" tabindex="-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
              <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
            </svg>
          </button>
        </div>
      </div>
    `;
    card.appendChild(overlay);

    // ── 1. Top 10 Ribbon Tag (Top-left corner) ──
    const isTop10 = item.isTop10 || (this.trackId === 'slider-1' && index === 0);
    if (isTop10) {
      const top10Badge = document.createElement('div');
      top10Badge.className = 'card-badge-top10';
      top10Badge.setAttribute('aria-label', 'Top 10');
      top10Badge.innerHTML = `
        <span class="card-badge-top10-top">TOP</span>
        <span class="card-badge-top10-num">10</span>
      `;
      card.appendChild(top10Badge);
    }

    // ── 2. "New Episode" / "Watch Now" Split Badge ──
    const hasNewEpisode = item.hasNewEpisode || (this.trackId === 'slider-2' && (index === 0 || index === 2));
    if (hasNewEpisode) {
      const splitBadge = document.createElement('div');
      splitBadge.className = 'card-split-badge';
      splitBadge.innerHTML = `
        <span class="card-split-badge-tag">New Episode</span>
        <span class="card-split-badge-action">Watch Now</span>
      `;
      card.appendChild(splitBadge);
    }

    // ── 3. Watch Progress Bar (Continue Watching) ──
    let progress = item.progress;
    if (progress == null && this.trackId === 'slider-1') {
      if (index === 1) progress = 65;
      else if (index === 2) progress = 35;
      else if (index === 4) progress = 80;
    }
    if (progress != null && progress > 0) {
      const progressWrap = document.createElement('div');
      progressWrap.className = 'card-progress-bar';
      progressWrap.innerHTML = `<div class="card-progress-fill" style="width: ${Math.min(100, Math.max(0, progress))}%;"></div>`;
      card.appendChild(progressWrap);
    }

    // ── Remove / Trash button ──
    // Show for: (a) DB-backed uploads (item.id != null), OR (b) any item when slider has onRemove callback
    const showRemove = item.id != null || this.onRemove != null;
    if (showRemove) {
      const removeBtn = document.createElement('button');
      removeBtn.className  = 'gallery-remove-btn';
      removeBtn.tabIndex   = 0;

      // Determine if this is a Drive item (non-blob URL with an ID)
      const isDriveItem = item.id != null && item.url && !item.url.startsWith('blob:');

      if (isDriveItem) {
        // Trash icon for Drive items
        removeBtn.setAttribute('aria-label', `Move ${item.title} to Recycle Bin`);
        removeBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
            <path d="M10 11v6"></path><path d="M14 11v6"></path>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
          </svg>`;
      } else {
        // ✕ icon for local / blob items
        removeBtn.setAttribute('aria-label', `Remove ${item.title}`);
        removeBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" width="12" height="12">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6"  y1="6" x2="18" y2="18"/>
          </svg>`;
      }

      removeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();

        if (isDriveItem) {
          // Delegate to app-level handler with confirmation dialog
          const app = window._browseApp;
          if (app && typeof app._deleteDriveItem === 'function') {
            app._deleteDriveItem(item, this.trackId, card);
          } else {
            // Fallback: ask confirm inline
            if (!confirm(`Move "${item.title}" to Recycle Bin?`)) return;
            const { deleteDriveFile } = await import('../core/DriveService.js?v=38');
            try { await deleteDriveFile(item.id); } catch (err) { console.warn(err); }
            const idx = this.items.findIndex(i => i === item || (i.id != null && i.id === item.id));
            if (idx !== -1) this.items.splice(idx, 1);
            card.style.transition = `opacity var(--card-hover-speed) ease, transform var(--card-hover-speed) ease`;
            card.style.opacity    = '0';
            card.style.transform  = 'scale(0.85)';
            card.style.pointerEvents = 'none';
            card.addEventListener('transitionend', () => card.remove(), { once: true });
          }
          return;
        }

        if (item.id != null) {
          // IndexedDB / blob upload
          try {
            await deleteUpload(item.id);
          } catch (err) {
            console.warn('[GallerySlider] deleteUpload failed:', err);
          }
          if (item.url && item.url.startsWith('blob:')) URL.revokeObjectURL(item.url);
        } else if (this.onRemove) {
          // Preset/favorited item
          this.onRemove(item);
        }
        // Remove from this.items
        const idx = this.items.findIndex(i => i === item || (i.id != null && i.id === item.id));
        if (idx !== -1) this.items.splice(idx, 1);
        // Fade out then remove DOM node
        card.style.transition = `opacity var(--card-hover-speed) ease, transform var(--card-hover-speed) ease`;
        card.style.opacity    = '0';
        card.style.transform  = 'scale(0.85)';
        card.style.pointerEvents = 'none';
        card.addEventListener('transitionend', () => card.remove(), { once: true });
      });

      card.appendChild(removeBtn);
    }

    // ── Move to Safe Space button ──
    const isSafeSpaceSlider = this.trackId === 'slider-safespace';
    const canMoveToSafeSpace = !isSafeSpaceSlider && !item.isPrivate;
    if (canMoveToSafeSpace) {
      const safeBtn = document.createElement('button');
      safeBtn.className = 'gallery-safespace-btn';
      safeBtn.tabIndex = 0;
      safeBtn.setAttribute('aria-label', `Move ${item.title} to Safe Space`);
      safeBtn.setAttribute('title', 'Move to Safe Space');
      safeBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>`;

      safeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const app = window._browseApp;
        if (app && typeof app._moveToSafeSpace === 'function') {
          app._moveToSafeSpace(item, this.trackId, card);
        } else {
          try {
            const { moveToSafeSpace } = await import('../core/DriveService.js?v=38');
            if (item.id) await moveToSafeSpace(item.id);
            const idx = this.items.findIndex(i => i === item || (i.id != null && i.id === item.id));
            if (idx !== -1) this.items.splice(idx, 1);
            card.style.transition = `opacity var(--card-hover-speed) ease, transform var(--card-hover-speed) ease`;
            card.style.opacity = '0';
            card.style.transform = 'scale(0.85)';
            card.style.pointerEvents = 'none';
            card.addEventListener('transitionend', () => card.remove(), { once: true });
          } catch (err) {
            console.warn(err);
          }
        }
      });

      card.appendChild(safeBtn);
    }

    // ── Edit button (All cards) ──
    const editBtn = document.createElement('button');
    editBtn.className = 'gallery-edit-btn';
    editBtn.setAttribute('aria-label', `Edit ${item.title}`);
    editBtn.tabIndex = 0;
    editBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>`;

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onEdit) this.onEdit(index, item);
    });

    // ── Play button (All cards) ──
    const playBtn = card.querySelector('.gallery-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hoverPopup.close(true);
        const currentIndex = this.items.indexOf(item);
        const targetIdx = currentIndex !== -1 ? currentIndex : index;
        if (window.detailPanel) {
          window.detailPanel.open(this.items, targetIdx);
        } else if (window.lightbox) {
          window.lightbox.open(this.items, targetIdx);
        }
      });
    }

    card.appendChild(editBtn);

    // ── Deliberate hover physics (Desktop pointer only) ──
    // OPEN:  300ms hover-intent delay → then 450ms expansion @ --ease-out-expo
    // CLOSE: 60ms grace window → 400ms collapse @ --ease-apple-soft
    if (!isTouchDevice()) {
      let intentTimer = null;

      card.addEventListener('mouseenter', () => {
        // If re-entering the card that currently owns the popup, cancel any pending close
        if (hoverPopup.currentItem === item && hoverPopup.closeTimer) {
          clearTimeout(hoverPopup.closeTimer);
          hoverPopup.closeTimer = null;
        }

        // Apply opening easing class to card + siblings BEFORE popup fires
        card.classList.add('is-expanding');
        if (card.parentElement) {
          card.parentElement.querySelectorAll('.gallery-item').forEach(c => {
            if (c !== card) c.classList.add('is-expanding');
          });
        }

        // 300ms hover-intent delay — prevents jitter on rapid cursor sweeps
        intentTimer = setTimeout(() => {
          hoverPopup.open(card, item, this.items, index);
          // Start video thumbnail on intent confirmed
          const vid = card.querySelector('video.gallery-item-img');
          if (vid) vid.play().catch(() => {/* ignore */});
        }, 300);
      });

      card.addEventListener('mouseleave', (e) => {
        clearTimeout(intentTimer);

        // If the cursor moved into the popup overlay, DO NOT trigger close!
        if (hoverPopup.el && (hoverPopup.el === e.relatedTarget || hoverPopup.el.contains(e.relatedTarget))) {
          return;
        }

        // Strip open-easing class so collapse uses smooth close curve
        card.classList.remove('is-expanding');
        if (card.parentElement) {
          card.parentElement.querySelectorAll('.gallery-item').forEach(c => {
            c.classList.remove('is-expanding');
          });
        }

        // If popup is open on us, schedule smooth close with 150ms grace window
        if (hoverPopup.currentItem === item && hoverPopup.el.classList.contains('is-open')) {
          hoverPopup.scheduleClose(150);
        }

        const vid = card.querySelector('video.gallery-item-img');
        if (vid && !vid.paused) vid.pause();
      });

      // Keyboard focus: open immediately without intent delay
      card.addEventListener('focus', () => {
        card.classList.add('is-expanding');
        hoverPopup.open(card, item, this.items, index);
      });
      card.addEventListener('blur', () => {
        clearTimeout(intentTimer);
        card.classList.remove('is-expanding');
        if (hoverPopup.currentItem === item) {
          hoverPopup.close();
        }
      });
    }

    // Detail Panel trigger — pass normalized row items array + this index
    const openDetail = () => {
      if (this.isDragging || this.hasDragged) return;
      hoverPopup.close(true);
      const currentIndex = this.items.indexOf(item);
      const targetIdx = currentIndex !== -1 ? currentIndex : index;
      if (window.detailPanel) {
        window.detailPanel.open(this.items, targetIdx);
      } else if (window.lightbox) {
        window.lightbox.open(this.items, targetIdx);
      }
    };
    card.addEventListener('click', openDetail);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDetail();
      }
    });

    return card;
  }

  _buildImageMedia(item) {
    const img = document.createElement('img');
    img.referrerPolicy = 'no-referrer';
    img.setAttribute('referrerpolicy', 'no-referrer');

    const isVideo = item.type === 'video';
    const placeholder = isVideo
      ? 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22500%22%20height%3D%22281%22%20viewBox%3D%220%200%20500%20281%22%3E%3Crect%20fill%3D%22%23181818%22%20width%3D%22500%22%20height%3D%22281%22%2F%3E%3Ccircle%20cx%3D%22250%22%20cy%3D%22140%22%20r%3D%2228%22%20fill%3D%22rgba(255%2C255%2C255%2C0.1)%22%2F%3E%3Cpolygon%20points%3D%22244%2C128%20262%2C140%20244%2C152%22%20fill%3D%22%23e50914%22%2F%3E%3Ctext%20x%3D%22250%22%20y%3D%22190%22%20fill%3D%22%23888%22%20font-family%3D%22sans-serif%22%20font-size%3D%2213%22%20font-weight%3D%22600%22%20text-anchor%3D%22middle%22%3EProcessing%20preview%E2%80%A6%3C%2Ftext%3E%3C%2Fsvg%3E'
      : 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22500%22%20height%3D%22281%22%20viewBox%3D%220%200%20500%20281%22%3E%3Crect%20fill%3D%22%23181818%22%20width%3D%22500%22%20height%3D%22281%22%2F%3E%3C%2Fsvg%3E';

    // Use real thumbnailLink directly with no constructed URL guesses
    const initialSrc = item.thumbnailUrl || (isVideo ? placeholder : item.url);

    img.src = initialSrc;
    img.loading = 'lazy';
    img.alt = item.title || '';
    img.className = 'gallery-item-img';

    img.onerror = () => {
      // If the real thumbnail fails to load even with no-referrer,
      // fallback to neutral placeholder once without further network requests
      if (img.src !== placeholder) {
        img.src = placeholder;
      }
    };

    return img;
  }

  _buildVideoMedia(item) {
    // If no thumbnail, use _buildImageMedia so fallbacks and frame generator kick in
    return this._buildImageMedia(item);
  }

  _buildAddCard() {
    const card  = document.createElement('div');
    card.className = 'gallery-item gallery-add-card';
    card.tabIndex  = 0;
    card.setAttribute('aria-label', 'Add photo or video');
    card.innerHTML = `
      <div class="gallery-add-inner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        <span>Add</span>
      </div>
    `;
    card.addEventListener('click',   () => this.onAdd());
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.onAdd(); });
    return card;
  }

  // ─── Arrow / drag events ─────────────────────────────────────────────────

  /**
   * Calculate a page-width scroll amount:
   * Use the visible track width minus ~12% so the previous edge stays visible
   * as a continuity cue (same as real Netflix behavior).
   */
  _pageAmount() {
    return this.track.clientWidth * 0.88;
  }

  /**
   * Update left/right arrow visibility based on current scroll position.
   * Called after every scroll event (via rAF) and after resize/repopulate.
   */
  _updateArrows() {
    if (!this.leftArrow && !this.rightArrow) return;

    const sl = this.track.scrollLeft;
    const visible = this.track.clientWidth;
    const total = this.track.scrollWidth;
    const atStart = sl <= 2;
    const atEnd = sl + visible >= total - 2;

    if (this.leftArrow) {
      this.leftArrow.classList.toggle('is-hidden', atStart);
    }
    if (this.rightArrow) {
      // Also hide if content doesn't overflow at all
      this.rightArrow.classList.toggle('is-hidden', atEnd || total <= visible + 2);
    }
  }

  bindEvents() {
    // ── Arrow clicks: page-based scroll ──
    if (this.leftArrow) {
      this.leftArrow.addEventListener('click', () => {
        hoverPopup.close(true);
        this.track.scrollBy({ left: -this._pageAmount(), behavior: 'smooth' });
      });
    }
    if (this.rightArrow) {
      this.rightArrow.addEventListener('click', () => {
        hoverPopup.close(true);
        this.track.scrollBy({ left: this._pageAmount(), behavior: 'smooth' });
      });
    }

    // ── Track scroll → update arrow visibility (rAF throttled) ──
    let _arrowRaf = null;
    this.track.addEventListener('scroll', () => {
      if (_arrowRaf) return;
      _arrowRaf = requestAnimationFrame(() => {
        _arrowRaf = null;
        this._updateArrows();
      });
    }, { passive: true });

    // ── Window resize → recheck arrows (content may now overflow or fit) ──
    let _resizeRaf = null;
    window.addEventListener('resize', () => {
      if (_resizeRaf) return;
      _resizeRaf = requestAnimationFrame(() => {
        _resizeRaf = null;
        this._updateArrows();
      });
    }, { passive: true });

    // ── Drag-to-scroll (desktop pointer only; touch uses native momentum scroll) ──
    this.hasDragged = false;
    if (!isTouchDevice()) {
      this.track.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        hoverPopup.close(true);
        this.isDragging = true;
        this.hasDragged = false;
        this.startX     = e.pageX - this.track.offsetLeft;
        this.scrollLeft = this.track.scrollLeft;
        this.track.classList.add('is-dragging');
      });
      this.track.addEventListener('mouseleave', () => {
        this.isDragging = false;
        this.track.classList.remove('is-dragging');
      });
      this.track.addEventListener('mouseup', () => {
        this.isDragging = false;
        this.track.classList.remove('is-dragging');
        // Briefly retain hasDragged to prevent the immediate click event from opening cards
        setTimeout(() => { this.hasDragged = false; }, 60);
      });
      this.track.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        const x = e.pageX - this.track.offsetLeft;
        const walk = (x - this.startX) * 1.5;
        if (Math.abs(walk) > 5) {
          this.hasDragged = true;
        }
        e.preventDefault();
        this.track.scrollLeft = this.scrollLeft - walk;
      });
    }

    // ── Initial arrow state ──
    // Use rAF so the track has finished painting before we measure scrollWidth
    requestAnimationFrame(() => this._updateArrows());
  }
}
