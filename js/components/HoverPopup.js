import { $, isTouchDevice } from '../utils/helpers.js?v=23';
import { shareItem, downloadItem } from '../utils/shareUtils.js';

class HoverPopup {
  constructor() {
    this.el = null;
    this.timer = null;
    this.closeTimer = null;
    this._collapseTimer = null;
    this._collapsingCard = null;
    this.currentItem = null;
    this.currentIndex = -1;
    this.currentItemsArray = null;
    this.currentCardEl = null;
    this.hoverVideo = null;
    this.isMuted = true;
    this._onScroll = this._handleScroll.bind(this);
    this._scrollRafId = null;
    this._openRaf = null;
    this._hasScrollListener = false;
    this._createDOM();
  }

  _createDOM() {
    this.el = document.createElement('div');
    this.el.className = 'netflix-hover-popup';
    this.el.style.display = 'none';

    // When moving mouse from card into popup, cancel any close timers
    this.el.addEventListener('mouseenter', () => {
      if (this.closeTimer) {
        clearTimeout(this.closeTimer);
        this.closeTimer = null;
      }
    });

    // When leaving the popup itself, schedule it to close with a grace period
    this.el.addEventListener('mouseleave', (e) => {
      // If moving back to the current card, do not close!
      if (this.currentCardEl && (this.currentCardEl === e.relatedTarget || this.currentCardEl.contains(e.relatedTarget))) {
        return;
      }
      this.scheduleClose(150);
    });

    // Single event-delegation handler for ALL clicks inside the popup
    this.el.addEventListener('click', (e) => {

      // ── Mute button (video rows) ──
      const muteBtn = e.target.closest('.popup-mute-btn');
      if (muteBtn) {
        e.stopPropagation();
        this.isMuted = !this.isMuted;
        if (this.hoverVideo) {
          this.hoverVideo.muted = this.isMuted;
        }
        this._updateMuteIcon(muteBtn);
        return;
      }

      // ── Like / Favorite button ──
      const likeBtn = e.target.closest('.popup-btn-like');
      if (likeBtn) {
        e.stopPropagation();
        const item = this.currentItem;
        if (!item) return;
        const isFav = !item.isFavorite;
        likeBtn.classList.toggle('is-favorited', isFav);
        const svg = likeBtn.querySelector('svg');
        if (svg) svg.setAttribute('fill', isFav ? 'white' : 'none');
        likeBtn.setAttribute('aria-label', isFav ? 'Remove from favorites' : 'Add to favorites');
        if (typeof window.onFavoriteToggle === 'function') {
          window.onFavoriteToggle(item);
        }
        return;
      }

      // ── Notify / Remind Me button ──
      const notifyBtn = e.target.closest('.popup-btn-notify');
      if (notifyBtn) {
        e.stopPropagation();
        notifyBtn.classList.toggle('is-notified');
        const isNotified = notifyBtn.classList.contains('is-notified');
        notifyBtn.setAttribute('aria-label', isNotified ? 'Reminder set' : 'Remind me');
        return;
      }

      // ── Play button ──
      const playBtn = e.target.closest('.popup-btn-play');
      if (playBtn) {
        e.stopPropagation();
        if (this.currentItemsArray) {
          if (window.detailPanel) {
            window.detailPanel.open(this.currentItemsArray, this.currentIndex);
          } else if (window.lightbox) {
            window.lightbox.open(this.currentItemsArray, this.currentIndex);
          }
          this.close(true);
        }
        return;
      }

      // ── Share button ──
      const shareBtn = e.target.closest('.popup-btn-share');
      if (shareBtn) {
        e.stopPropagation();
        if (this.currentItem) {
          shareItem(this.currentItem);
        }
        return;
      }

      // ── Download button ──
      const downloadBtn = e.target.closest('.popup-btn-download');
      if (downloadBtn) {
        e.stopPropagation();
        if (this.currentItem) {
          downloadItem(this.currentItem);
        }
        return;
      }

      // ── Safe Space button ──
      const safeBtn = e.target.closest('.popup-btn-safespace');
      if (safeBtn) {
        e.stopPropagation();
        if (this.currentItem) {
          const app = window._browseApp;
          if (app && typeof app._moveToSafeSpace === 'function') {
            app._moveToSafeSpace(this.currentItem, null, this.currentCardEl);
            this.close(true);
          }
        }
        return;
      }

      // ── Other action buttons (add to list, more info) — no-op ──
      if (e.target.closest('.popup-action-btn')) return;

      // ── Clicking the media/info area opens DetailPanel (preferred) or Lightbox ──
      if (this.currentItemsArray) {
        if (window.detailPanel) {
          window.detailPanel.open(this.currentItemsArray, this.currentIndex);
        } else if (window.lightbox) {
          window.lightbox.open(this.currentItemsArray, this.currentIndex);
        }
        this.close(true);
      }
    });

    document.body.appendChild(this.el);
  }

  /**
   * Opens the popup over a specific card.
   * @param {HTMLElement} cardEl - The original card element we hovered
   * @param {Object} item - The data model for this card
   * @param {Array} itemsArray - The full array of items in this row (for Lightbox)
   * @param {number} index - The index in the array
   */
  open(cardEl, item, itemsArray, index) {
    if (isTouchDevice()) return;
    if (this._openRaf) {
      cancelAnimationFrame(this._openRaf);
      this._openRaf = null;
    }
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    // Cancel any pending collapse timer from previous card
    if (this._collapseTimer) {
      clearTimeout(this._collapseTimer);
      this._collapseTimer = null;
    }
    // Clean up previous collapsing card if still marked
    if (this._collapsingCard && this._collapsingCard !== cardEl) {
      this._collapsingCard.classList.remove('is-collapsing');
      this._collapsingCard = null;
    }
    this._detachScrollListener();

    this.currentCardEl = cardEl;
    this.currentItem = item;
    this.currentIndex = index;
    this.currentItemsArray = itemsArray;

    // Promote card z-index immediately
    cardEl.classList.add('has-popup-open');

    // Get exact screen coords of the card
    const rect = cardEl.getBoundingClientRect();
    
    // Position the popup exactly over the card (it will scale up from center via CSS)
    this.el.style.top = `${rect.top}px`;
    this.el.style.left = `${rect.left}px`;
    this.el.style.width = `${rect.width}px`;
    
    // Render content
    const tagsHtml = (item.tags || []).join(' <span class="popup-tag-dot">•</span> ');
    
    let mediaHtml = '';
    if (item.type === 'video') {
      mediaHtml = `
        <video class="popup-media-video" src="${item.url}" muted loop playsinline autoplay></video>
        <button class="popup-mute-btn" aria-label="Toggle Mute">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <line x1="23" y1="9" x2="17" y2="15"></line>
            <line x1="17" y1="9" x2="23" y2="15"></line>
          </svg>
        </button>
      `;
    } else {
      mediaHtml = `<img class="popup-media-img" referrerpolicy="no-referrer" src="${item.url}" alt="${item.title}" />`;
    }

    this.el.innerHTML = `
      <div class="popup-media-section">
        ${mediaHtml}
        <div class="popup-netflix-badge">
          <svg viewBox="0 0 24 32" fill="#E50914" height="15" width="auto">
            <path d="M0 0h6v12h12V0h6v32h-6V18H6v14H0z"></path>
          </svg>
        </div>
        <div class="popup-media-overlay"></div>
        <h3 class="popup-media-title">${item.title}</h3>
      </div>
      
      <div class="popup-info-section">
        <div class="popup-actions-row">
          <div class="popup-actions-left">
            <button class="popup-action-btn popup-btn-play" aria-label="Play">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"/></svg>
            </button>
            <button class="popup-action-btn popup-btn-notify" aria-label="Remind me">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
            </button>
            <button class="popup-action-btn" aria-label="Add to list">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
            <button class="popup-action-btn popup-btn-like ${item.isFavorite ? 'is-favorited' : ''}" aria-label="${item.isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
              <svg viewBox="0 0 24 24" fill="${item.isFavorite ? 'white' : 'none'}" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
                <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
              </svg>
            </button>
          </div>
          <div class="popup-actions-right">
            <button class="popup-action-btn popup-btn-share" aria-label="Share">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
              </svg>
            </button>
            <button class="popup-action-btn popup-btn-download" aria-label="Download">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </button>
            ${!item.isPrivate ? `
            <button class="popup-action-btn popup-btn-safespace" aria-label="Move to Safe Space" title="Move to Safe Space">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </button>` : ''}
            <button class="popup-action-btn" aria-label="More Info">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="popup-meta-row">
          <span class="popup-type">${item.format || (item.type === 'video' ? 'Series' : 'Series')}</span>
          <span class="popup-meta-sep">•</span>
          <span class="popup-rating">${item.rating || 'U/A 16+'}</span>
          <span class="popup-meta-sep">•</span>
          <span class="popup-seasons">${item.seasons || '1 Season'}</span>
          <span class="popup-hd">HD</span>
        </div>
        
        <div class="popup-tags-row">
          ${tagsHtml}
        </div>
      </div>
    `;

    // Wire up hoverVideo reference & sync initial mute state/icon
    if (item.type === 'video') {
      this.hoverVideo = this.el.querySelector('.popup-media-video');
      const muteBtn = this.el.querySelector('.popup-mute-btn');
      // Apply current mute state to this video
      this.hoverVideo.muted = this.isMuted;
      // Sync the button icon with the current isMuted state
      this._updateMuteIcon(muteBtn);
    } else {
      this.hoverVideo = null;
    }

    // ── Edge-Aware Origin Shift ──
    // Automatically calculate the card's position in the viewport / rail track.
    // First two slots: 'center left', last two slots: 'center right', otherwise: 'center center'.
    let origin = 'center center';
    let slotType = 'center';

    const track = cardEl.parentElement;
    if (track) {
      const cards = Array.from(track.querySelectorAll('.gallery-item'));
      const activeIdx = cards.indexOf(cardEl);
      const totalCards = cards.length;
      const rect = cardEl.getBoundingClientRect();

      if (activeIdx <= 1 || rect.left < 80) {
        origin = 'center left';
        slotType = 'left';
      } else if (activeIdx >= totalCards - 2 || rect.right > window.innerWidth - 80) {
        origin = 'center right';
        slotType = 'right';
      } else {
        origin = 'center center';
        slotType = 'center';
      }
    }

    // ── Atomic Zero-Interrupt Rest State Setup ──
    // Temporarily disable transitions so the popup instantly mounts at cardEl position at rest scale(1), opacity 0
    this.el.style.transition = 'none';
    this.el.classList.remove('is-open', 'is-opening');
    this.el.style.top = `${rect.top}px`;
    this.el.style.left = `${rect.left}px`;
    this.el.style.width = `${rect.width}px`;
    this.el.style.transformOrigin = origin;
    this.el.style.display = 'flex';

    // Force layout of starting rest state
    void this.el.offsetWidth;

    // Re-enable CSS transitions
    this.el.style.transition = '';

    // Double-rAF guarantees the rest state is committed before triggering the 800ms expansion
    this._openRaf = requestAnimationFrame(() => {
      this._openRaf = requestAnimationFrame(() => {
        this._openRaf = null;
        if (!this.currentCardEl || this.currentCardEl !== cardEl) return;
        this.el.classList.add('is-open');
        this._applySiblingSlides(cardEl, slotType);
        this._attachScrollListener();
      });
    });
  }

  _attachScrollListener() {
    if (this._hasScrollListener) return;
    this._hasScrollListener = true;
    window.addEventListener('scroll', this._onScroll, { passive: true });
    document.addEventListener('scroll', this._onScroll, { capture: true, passive: true });
    window.addEventListener('resize', this._onScroll, { passive: true });
  }

  _detachScrollListener() {
    if (!this._hasScrollListener) return;
    this._hasScrollListener = false;
    window.removeEventListener('scroll', this._onScroll, { passive: true });
    document.removeEventListener('scroll', this._onScroll, { capture: true, passive: true });
    window.removeEventListener('resize', this._onScroll, { passive: true });
    if (this._scrollRafId) {
      cancelAnimationFrame(this._scrollRafId);
      this._scrollRafId = null;
    }
  }

  _handleScroll() {
    if (!this.currentCardEl || !this.el.classList.contains('is-open')) {
      this._detachScrollListener();
      return;
    }

    if (this._scrollRafId) return;

    this._scrollRafId = requestAnimationFrame(() => {
      this._scrollRafId = null;

      if (!this.currentCardEl || !this.el.classList.contains('is-open')) {
        this._detachScrollListener();
        return;
      }

      const rect = this.currentCardEl.getBoundingClientRect();

      // Auto-close if the card has scrolled fully out of the viewport
      if (
        rect.bottom < 0 ||
        rect.top > window.innerHeight ||
        rect.right < 0 ||
        rect.left > window.innerWidth
      ) {
        this.close(true);
        return;
      }

      // Auto-close if the card has scrolled out of its .slider-track bounds
      const track = this.currentCardEl.closest('.slider-track');
      if (track) {
        const trackRect = track.getBoundingClientRect();
        if (rect.right < trackRect.left || rect.left > trackRect.right) {
          this.close(true);
          return;
        }
      }

      // Update position to stay anchored to the card
      this.el.style.top = `${rect.top}px`;
      this.el.style.left = `${rect.left}px`;
      this.el.style.width = `${rect.width}px`;
    });
  }

  _updateMuteIcon(btn) {
    if (this.isMuted) {
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <line x1="23" y1="9" x2="17" y2="15"></line>
          <line x1="17" y1="9" x2="23" y2="15"></line>
        </svg>`;
    } else {
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>`;
    }
  }

  /**
   * Schedule the popup to close with a graceful window.
   * Prevents accidental collapse when moving cursor across card/popup boundaries.
   */
  scheduleClose(delay = 150) {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
    }
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.close();
    }, delay);
  }

  /**
   * Close the popup.
   * CLOSING state: 600ms var(--ease-netflix-ref-close).
   * z-index held at 99 during 600ms collapse via .is-collapsing on the card.
   * @param {boolean} instant - if true, skips animation (useful for click-open)
   */
  close(instant = false) {
    if (this._openRaf) {
      cancelAnimationFrame(this._openRaf);
      this._openRaf = null;
    }
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    if (this._collapseTimer) {
      clearTimeout(this._collapseTimer);
      this._collapseTimer = null;
    }
    this._detachScrollListener();

    const cardEl = this.currentCardEl;
    this.currentCardEl = null;

    if (instant) {
      this.el.classList.remove('is-open', 'is-opening');
      this.el.style.display = 'none';
      if (this.hoverVideo) this.hoverVideo.pause();
      if (this._collapsingCard) {
        this._collapsingCard.classList.remove('is-collapsing');
        this._collapsingCard = null;
      }
      if (cardEl) {
        cardEl.classList.remove('is-collapsing', 'has-popup-open');
      }
      this._clearSiblingSlides();
    } else {
      // 1. Immediately trigger smooth scale-down & fade-out
      this.el.classList.remove('is-open', 'is-opening');

      // 2. Immediately start sliding siblings back in sync with popup collapsing
      this._clearSiblingSlides();

      // 3. Stage card z-index: hold at 99 during 300ms collapse, then release to 1
      if (cardEl) {
        cardEl.classList.add('is-collapsing');
        cardEl.classList.remove('has-popup-open');
        this._collapsingCard = cardEl;
      }

      // 4. After 300ms collapse completes: hide popup, pause video, release z-index
      this._collapseTimer = setTimeout(() => {
        this._collapseTimer = null;
        if (!this.el.classList.contains('is-open')) {
          this.el.style.display = 'none';
          if (this.hoverVideo) this.hoverVideo.pause();
        }
        if (this._collapsingCard) {
          this._collapsingCard.classList.remove('is-collapsing');
          this._collapsingCard = null;
        }
      }, 300); // matches 300ms CSS close transition
    }
  }

  /**
   * Fluid Sibling Repulsion (The Wave Effect):
   * Cascading translate offsets (±40px, ±20px, ±10px) applied outward
   * from the active card, respecting the edge-aware origin shift.
   */
  _applySiblingSlides(cardEl, slotType = 'center') {
    this._clearSiblingSlides();
    if (!cardEl || !cardEl.parentElement) return;

    const track = cardEl.parentElement;
    const cards = Array.from(track.querySelectorAll('.gallery-item'));
    const activeIdx = cards.indexOf(cardEl);
    if (activeIdx === -1) return;

    cardEl.classList.add('has-popup-open');

    cards.forEach((c, idx) => {
      const dist = idx - activeIdx;
      if (dist === 0) return;

      if (slotType === 'left') {
        // Expanded from 'center left' -> only right siblings push outward
        if (dist === 1) {
          c.classList.add('slide-right-1');
        } else if (dist === 2) {
          c.classList.add('slide-right-2');
        } else if (dist >= 3) {
          c.classList.add('slide-right-3');
        }
      } else if (slotType === 'right') {
        // Expanded from 'center right' -> only left siblings push outward
        if (dist === -1) {
          c.classList.add('slide-left-1');
        } else if (dist === -2) {
          c.classList.add('slide-left-2');
        } else if (dist <= -3) {
          c.classList.add('slide-left-3');
        }
      } else {
        // 'center center' -> wave repulsion pushes both directions
        if (dist === -1) {
          c.classList.add('slide-left-1');
        } else if (dist === -2) {
          c.classList.add('slide-left-2');
        } else if (dist <= -3) {
          c.classList.add('slide-left-3');
        } else if (dist === 1) {
          c.classList.add('slide-right-1');
        } else if (dist === 2) {
          c.classList.add('slide-right-2');
        } else if (dist >= 3) {
          c.classList.add('slide-right-3');
        }
      }
    });
  }

  _clearSiblingSlides() {
    document.querySelectorAll('.gallery-item').forEach(el => {
      el.classList.remove(
        'has-popup-open',
        'slide-left',
        'slide-right',
        'slide-left-1',
        'slide-left-2',
        'slide-left-3',
        'slide-right-1',
        'slide-right-2',
        'slide-right-3'
      );
    });
  }
}

// Export singleton
export const hoverPopup = new HoverPopup();
