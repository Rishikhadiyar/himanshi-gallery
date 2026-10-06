import { CursorGlow }    from './components/CursorGlow.js';
import { PageTransition } from './core/PageTransition.js';
import { GallerySlider }  from './components/GallerySlider.js?v=45';
import { Lightbox }       from './components/Lightbox.js?v=45';
import { DetailPanel }    from './components/DetailPanel.js?v=45';
import { UploadModal }    from './components/UploadModal.js?v=45';
import { $, isTouchDevice } from './utils/helpers.js?v=23';
import { validateConfig }  from './config.js?v=39';
import {
  fetchPublicItems,
  fetchPrivateItems,
  deleteDriveFile,
  permanentlyDeleteDriveFile,
  fetchTrashedItems,
  restoreDriveFile,
  moveToSafeSpace,
  toggleItemFavorite,
  isItemFavorited,
  getItemFavoritedAt,
  isOwnerSignedIn,
  signIn,
  signOut,
  onAuthStateChanged,
} from './core/DriveService.js?v=45';

/**
 * Build a preset item with all required fields.
 * uploadedAt uses a fixed past date so real uploads naturally sort above them.
 */
let _presetDate = new Date('2024-01-01').getTime();
function img(url, title, tags = [], rating = 'U/A 16+', options = {}) {
  // Each preset gets a slightly different past timestamp so they have stable order
  _presetDate -= 1000;
  return {
    url,
    thumbnailUrl: url,
    type: options.type || 'image',
    title,
    tags,
    rating,
    uploadedAt: _presetDate,
    isFavorite: false,
    favoritedAt: null,
    seasons: options.seasons || '1 Season',
    year: options.year || '2023',
    format: options.format || 'Series',
    isTop10: options.isTop10 || false,
    hasNewEpisode: options.hasNewEpisode || false,
    progress: options.progress !== undefined ? options.progress : null,
    ...options
  };
}

// ==========================================================================
// SAFE SPACE CONFIGURATION
// Edit the constant below to change your secret unlock phrase.
// Typing this exact phrase into the search box will unlock your Safe Space.
// ==========================================================================
const SAFE_SPACE_CODE = 'change-me-to-your-secret-code';

class BrowseApp {
  constructor() {
    this.sliders = {};
    // Master list of all items (preset + public uploaded), used for cross-row logic
    this.allItems = [];
    // Private items strictly quarantined for the Safe Space
    this.privateItems = [];
    this._isSafeSpaceActive = false;
    this._safeSpaceEventsBound = false;
    this.uploadModal = null;
    this.init();
  }

  async init() {
    // ── 1. Load public items from Google Drive ──
    // Show skeleton cards immediately while fetching from Drive
    this._showSkeletonRows();

    let publicUploads = [];
    let driveError = null;
    let isConfigMissing = false;

    const { isValid, missing } = validateConfig();
    if (!isValid) {
      isConfigMissing = true;
      console.error(
        `[BrowseApp] Google Drive config incomplete. Missing: ${missing.join(', ')}. ` +
        'Open js/config.js and fill in your credentials. Falling back to preset demo items.'
      );
    } else {
      const driveResult = await fetchPublicItems();
      if (driveResult.success) {
        publicUploads = driveResult.items;
      } else {
        driveError = driveResult.error || 'Unknown error';
        console.warn('[BrowseApp] Google Drive fetch failed:', driveError);
      }
    }

    // Private items start empty; populated only after owner signs in via Safe Space
    this.privateItems = [];

    // ── 2. Define hardcoded preset arrays ──
    const trendingPresets = [
      img('https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?w=500&q=80', 'Stranger Things', ['Sci-Fi', 'Horror', '80s'], 'TV-14', { seasons: '4 Seasons', year: '2016', isTop10: true, progress: 68 }),
      img('https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&q=80', 'Cinema Night', ['Drama', 'Heartfelt', 'Classic'], 'U/A 13+', { progress: 42 }),
      img('https://images.unsplash.com/photo-1585951237318-9ea5e175b891?w=500&q=80', 'Dark Drama', ['Gritty', 'Thriller', 'Dark'], 'A', { progress: 85 }),
      img('https://images.unsplash.com/photo-1616530940355-351fabd9524b?w=500&q=80', 'Neon City', ['Cyberpunk', 'Action', 'Sci-Fi'], 'U/A 16+', { seasons: '2 Seasons', year: '2022' }),
      img('https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=500&q=80', 'Film Noir', ['Mystery', 'Crime', 'Classic'], 'U/A 13+', { format: 'Film', year: '2020' }),
      img('https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=500&q=80', 'Thriller', ['Suspense', 'Psychological'], 'A', { progress: 24 }),
      img('https://images.unsplash.com/photo-1485846234645-a62644f84728?w=500&q=80', 'Action Cut', ['Explosive', 'Action', 'Blockbuster'], 'U/A 16+', { format: 'Film', year: '2023' }),
      img('https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=500&q=80', 'Epic Scene', ['Adventure', 'Fantasy', 'Epic'], 'U/A 13+', { seasons: '3 Seasons', year: '2021' }),
    ];

    const originalsImages = [
      img('https://images.unsplash.com/photo-1604998103924-89e012e5265a?w=500&q=80', 'The Crown', ['Historical', 'Drama', 'Royal'], 'U/A 16+', { seasons: '6 Seasons', year: '2016', isTop10: true, hasNewEpisode: true }),
      img('https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=500&q=80', 'Ozark', ['Crime', 'Drama', 'Gritty'], 'A', { seasons: '4 Seasons', year: '2017' }),
      img('https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=500&q=80', 'Mindhunter', ['Psychological', 'Crime', 'Dark'], 'A', { seasons: '2 Seasons', year: '2017' }),
      img('https://images.unsplash.com/photo-1518676590629-3dcbd9c5a5c9?w=500&q=80', 'Squid Game', ['Thriller', 'Survival', 'Korean'], 'A', { seasons: '2 Seasons', year: '2021', isTop10: true }),
      img('https://images.unsplash.com/photo-1505775561242-7276188edfa4?w=500&q=80', 'Wednesday', ['Teen', 'Mystery', 'Dark Comedy'], 'U/A 13+', { seasons: '1 Season', year: '2022', hasNewEpisode: true }),
      img('https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&q=80', 'Dark', ['Sci-Fi', 'Mind-Bending', 'German'], 'U/A 16+', { seasons: '3 Seasons', year: '2017' }),
      img('https://images.unsplash.com/photo-1500462918059-b1a0cb512f1d?w=500&q=80', 'Arcane', ['Animation', 'Fantasy', 'Action'], 'U/A 16+', { seasons: '2 Seasons', year: '2021', hasNewEpisode: true }),
    ];

    const topPicksFallback = [
      img('https://images.unsplash.com/photo-1515634928627-2a4e0dae3ddf?w=500&q=80', 'The Witcher', ['Fantasy', 'Action', 'Monsters'], 'A', { seasons: '3 Seasons', year: '2019' }),
      img('https://images.unsplash.com/photo-1507924538820-ede94a04019d?w=500&q=80', 'Bridgerton', ['Romance', 'Period', 'Drama'], 'A', { seasons: '3 Seasons', year: '2020', hasNewEpisode: true }),
      img('https://images.unsplash.com/photo-1519340333755-56e9c1d04079?w=500&q=80', 'Emily in Paris', ['Rom-Com', 'Lighthearted'], 'U/A 13+', { seasons: '4 Seasons', year: '2020' }),
      img('https://images.unsplash.com/photo-1560169897-fc0cdbdfa4d5?w=500&q=80', 'Money Heist', ['Heist', 'Action', 'Spanish'], 'A', { seasons: '5 Parts', year: '2017', isTop10: true }),
      img('https://images.unsplash.com/photo-1485846234645-a62644f84728?w=500&q=80', 'Peaky Blinders', ['Crime', 'Period', 'British'], 'A', { seasons: '6 Seasons', year: '2013' }),
      img('https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=500&q=80', 'Narcos', ['Crime', 'Drug Cartel', 'Gritty'], 'A', { seasons: '3 Seasons', year: '2015' }),
      img('https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&q=80', 'Breaking Bad', ['Crime', 'Drama', 'Masterpiece'], 'A', { seasons: '5 Seasons', year: '2008' }),
    ];

    // ── 3. Apply preset overrides (user replaced a card with their own upload) ──
    const getOverrides = () => JSON.parse(localStorage.getItem('preset_overrides') || '{}');
    const applyOverrides = (trackId, defaultItems) => {
      const overrides = getOverrides();
      return defaultItems.map((item, index) => {
        const overrideId = overrides[`${trackId}_${index}`];
        if (overrideId != null) {
          const dbItem = publicUploads.find(u => u.id === overrideId);
          if (dbItem) return dbItem;
        }
        return item;
      });
    };

    // ── 4. Build master list of all public items ──
    // Public uploads first (sorted newest first), then presets
    const sortedUploads = [...publicUploads].sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
    
    // ── 5. Build Trending Now = uploads (newest first) + presets ──
    const trendingItems = [
      ...sortedUploads,
      ...applyOverrides('slider-1', trendingPresets),
    ];

    // ── 6. Build Top Picks = favorited public items (newest fav first), fallback to presets ──
    const allFavorited = [
      ...publicUploads.filter(i => i.isFavorite),
      ...trendingPresets.filter(i => i.isFavorite), // presets can't be favorited on load, but kept for future
    ].sort((a, b) => (b.favoritedAt || 0) - (a.favoritedAt || 0));

    const topPicksItems = allFavorited.length > 0
      ? allFavorited
      : applyOverrides('slider-3', topPicksFallback);

    // Store master allItems for reference by HoverPopup favorite toggle (strictly public items only)
    this.allItems = [...publicUploads, ...trendingPresets, ...topPicksFallback, ...originalsImages];

    // Snapshot the items each row was built with — used to restore Home view exactly.
    // These are stored BEFORE rows are created, capturing the original build-time arrays.
    this._originalRows = {
      'slider-1': trendingItems,
      'slider-2': applyOverrides('slider-2', originalsImages),
      'slider-3': topPicksItems,
    };

    // ── 7. Page modules ──
    new PageTransition();

    // Reveal the page as soon as DOM is ready (don't wait for all images/fonts)
    // This prevents getting stuck on black screen when external assets are slow.
    const _revealPage = () => {
      document.body.classList.add('loaded');
      const pt = $('#page-transition');
      if (pt) pt.classList.remove('active');
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _revealPage);
    } else {
      // DOMContentLoaded already fired (readyState is 'interactive' or 'complete')
      _revealPage();
    }

    // Hard fallback: if window.load is somehow delayed, force reveal after 1.5s
    setTimeout(_revealPage, 1500);

    new CursorGlow();
    window.lightbox = new Lightbox();
    window.detailPanel = new DetailPanel();

    // ── 8b. Wire billboard AFTER lightbox is ready ──
    this._initBillboard(publicUploads);

    // ── Show Drive error banner if fetch failed (not config missing) ──
    if (driveError && !isConfigMissing) {
      this._showDriveErrorBanner(driveError);
    }

    // ── React to owner auth state changes (show/hide upload controls) ──
    onAuthStateChanged((signedIn) => {
      this._updateOwnerControls(signedIn);
    });

    // ── 8. Upload/Edit Modal ──
    this.uploadModal = new UploadModal((newItem) => {
      // Private items are exclusively managed within the Safe Space
      if (newItem.isPrivate) return;

      // When a new public upload happens, prepend it to Trending Now
      if (this.sliders['slider-1']) {
        this.sliders['slider-1'].addItemAtStart(newItem);
      }
      if (this._onNewUploadNotification) {
        this._onNewUploadNotification(newItem);
      }
    });

    // Global edit handler (owner-only: replaces the card in the slider)
    const handleEdit = (trackId, index, oldItem) => {
      if (!isOwnerSignedIn()) {
        this.uploadModal.open();
        return;
      }
      this.uploadModal.open((newItem) => {
        if (this.sliders[trackId]) {
          this.sliders[trackId].replaceItem(index, newItem);
        }
      }, `Replace ${oldItem.title || 'Item'}`);
    };

    // Store handleEdit for later use by _updateOwnerControls
    this._handleEdit = handleEdit;

    // Expose favoriteToggleCallback so HoverPopup can call it
    window.onFavoriteToggle = (item) => this._handleFavoriteToggle(item);

    // ── 9. Create Rows ──
    // Trending Now: uploads + presets, with a "+" add button
    this.sliders['slider-1'] = new GallerySlider(
      'slider-1',
      trendingItems,
      {
        onAdd:  () => this.uploadModal.open(),
        onEdit: (idx, item) => handleEdit('slider-1', idx, item),
      }
    );

    // Netflix Originals: untouched
    this.sliders['slider-2'] = new GallerySlider(
      'slider-2',
      applyOverrides('slider-2', originalsImages),
      { onEdit: (idx, item) => handleEdit('slider-2', idx, item) }
    );

    // Top Picks: favorites or fallback
    this.sliders['slider-3'] = new GallerySlider(
      'slider-3',
      topPicksItems,
      {
        onEdit:   (idx, item) => handleEdit('slider-3', idx, item),
        // Removing from Top Picks = unfavoriting the item
        onRemove: (item) => this._handleFavoriteToggle(item),
      }
    );

    // ── 10. Navbar scroll effect ──
    const navbar = $('#navbar');
    if (navbar) {
      window.addEventListener('scroll', () => {
        navbar.classList.toggle('scrolled', window.scrollY > 10);
      }, { passive: true });
    }

    // ── 11. Nav link filters ──
    this._initNavFilters();

    // ── 12. Search Box ──
    this._initSearch();

    // ── 13. Notifications Dropdown ──
    // Pass public Drive items as notification feed; sorted by uploadedAt descending
    const notifItems = [...publicUploads].sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
    this._initNotifications(notifItems);

    // ── 14. Mobile Navigation & Profile Menu ──
    this._initMobileNav();
    this._initProfileMenu();

    console.log('Himanshi Browse Page Loaded.');
  }

  /**
   * Handle a favorite toggle from the HoverPopup.
   * For Drive items, favorites are persisted per-viewer in localStorage keyed by Drive file id.
   * This means every visitor can maintain their own My List without writing to Drive.
   */
  _handleFavoriteToggle(item) {
    if (!item) return;

    // Use Drive service's localStorage favorites for Drive items (have a string id from Drive)
    // For preset items (no id), maintain in-memory only
    const willBeFavorite = !item.isFavorite;
    item.isFavorite = willBeFavorite;
    item.favoritedAt = willBeFavorite ? Date.now() : null;

    // Persist to localStorage if this is a Drive-backed item
    if (item.id) {
      toggleItemFavorite(item.id);
    }

    // Re-render Top Picks slider with updated favorites
    this._refreshTopPicks();
  }

  _refreshTopPicks() {
    if (!this.sliders['slider-3']) return;

    // Gather all public items across public sliders (strictly exclude slider-safespace and private items)
    const allTracked = Object.entries(this.sliders)
      .filter(([k]) => k !== 'slider-safespace')
      .flatMap(([, s]) => s.items || []);
    const favorited  = allTracked.filter(i => i.isFavorite && !i.isPrivate)
                                 .sort((a, b) => (b.favoritedAt || 0) - (a.favoritedAt || 0));

    if (favorited.length > 0) {
      this.sliders['slider-3'].repopulate(favorited);
    }
    // If no favorites, leave current items as-is (fallback already shown)

    // Also refresh filter row if currently viewing My List
    if (this._activeFilter === 'mylist') {
      this._applyFilter('mylist');
    }
  }

  // ─── Nav Filter System ────────────────────────────────────────────────────

  _initNavFilters() {
    const links = document.querySelectorAll('.browse-nav-links a');
    const filterMap = [
      { text: 'Home',                  filter: 'home' },
      { text: 'Videos',                filter: 'tvshows' },
      { text: 'TV Shows',              filter: 'tvshows' },
      { text: 'Photos',                filter: 'movies' },
      { text: 'Movies',                filter: 'movies' },
      { text: 'New & Popular',         filter: 'newpopular' },
      { text: 'My List',               filter: 'mylist' },
      { text: 'Browse by Languages',   filter: 'languages' },
    ];

    links.forEach(link => {
      const text = link.textContent.trim();
      const entry = filterMap.find(m => m.text === text);
      if (!entry) return;

      link.addEventListener('click', (e) => {
        e.preventDefault();
        if (this._closeSearch) this._closeSearch();
        const safeSpaceRow = document.getElementById('safespace-row');
        if (safeSpaceRow) safeSpaceRow.classList.add('hidden');
        this._isSafeSpaceActive = false;
        this._applyFilter(entry.filter, link);
      });
    });

    // Mark initial active link
    const homeLink = [...links].find(l => l.textContent.trim() === 'Home');
    if (homeLink) this._setActiveNav(homeLink);
    this._activeFilter = 'home';
  }

  /** Mark a nav link as active and remove active from all others */
  _setActiveNav(activeLinkEl) {
    document.querySelectorAll('.browse-nav-links a').forEach(l => l.classList.remove('active'));
    if (activeLinkEl) activeLinkEl.classList.add('active');
  }

  _transitionView(callback) {
    const container = document.querySelector('.galleries-container');
    if (!container) {
      callback();
      return;
    }
    container.classList.add('is-transitioning');
    setTimeout(() => {
      callback();
      requestAnimationFrame(() => {
        container.classList.remove('is-transitioning');
      });
    }, 140);
  }

  /** Dispatch the right action for a given filter key */
  _applyFilter(filter, linkEl) {
    // For re-calls without a link element (e.g. from _refreshTopPicks), find the link
    const link = linkEl || [...document.querySelectorAll('.browse-nav-links a')]
      .find(l => {
        const text = l.textContent.trim();
        const map = {
          home: ['Home'],
          tvshows: ['Videos', 'TV Shows'],
          movies: ['Photos', 'Movies'],
          newpopular: ['New & Popular'],
          mylist: ['My List'],
          languages: ['Browse by Languages']
        };
        return (map[filter] || []).includes(text);
      });

    this._activeFilter = filter;

    if (filter === 'home') {
      this._setActiveNav(link);
      this._transitionView(() => this._showHome());
      return;
    }

    if (filter === 'languages') {
      // Decorative — show a toast and don't change the view
      const msg = 'Language filtering coming soon!';
      if (window.detailPanel && typeof window.detailPanel._showToast === 'function') {
        window.detailPanel._showToast(msg);
      } else {
        // Fallback: brief console note
        console.info('[Nav]', msg);
      }
      return; // Don't update the active class, don't change view
    }

    this._setActiveNav(link);

    // Build master pool from all known items (all sliders + allItems)
    const pool = this._getAllKnownItems();

    let filtered = [];
    let title = '';
    let emptyMsg = '';

    switch (filter) {
      case 'tvshows':
        filtered = pool.filter(i => i.type === 'video');
        title = 'Videos';
        emptyMsg = 'No videos yet — upload something to get started!';
        break;

      case 'movies':
        filtered = pool.filter(i => i.type === 'image');
        title = 'Photos';
        emptyMsg = 'No photos yet — upload something to get started!';
        break;

      case 'newpopular':
        filtered = [...pool].sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
        title = 'New & Popular';
        emptyMsg = 'Nothing here yet.';
        break;

      case 'mylist':
        filtered = pool.filter(i => i.isFavorite)
                       .sort((a, b) => (b.favoritedAt || 0) - (a.favoritedAt || 0));
        title = 'My List';
        emptyMsg = 'Your list is empty — tap the thumbs\u2011up on anything to add it here.';
        break;
    }

    // Deduplicate by url to avoid the same item appearing twice from allItems + slider overlap
    const seen = new Set();
    filtered = filtered.filter(i => {
      if (seen.has(i.url)) return false;
      seen.add(i.url);
      return true;
    });

    this._transitionView(() => this._showFiltered(title, filtered, emptyMsg));
  }

  /** Collect every known public item from public slider instances + allItems, deduplicated by url */
  _getAllKnownItems() {
    const sliderItems = Object.entries(this.sliders)
      .filter(([k]) => k !== 'slider-safespace')
      .flatMap(([, s]) => s.items || []);
    const combined = [...sliderItems, ...this.allItems];
    // Deduplicate by url and exclude any private items
    const seen = new Set();
    return combined.filter(i => {
      if (!i || !i.url || i.isPrivate) return false;
      if (seen.has(i.url)) return false;
      seen.add(i.url);
      return true;
    });
  }

  /** Show the original three-row Home view */
  _showHome() {
    // Hide Safe Space row
    const safeSpaceRow = document.getElementById('safespace-row');
    if (safeSpaceRow) safeSpaceRow.classList.add('hidden');
    this._isSafeSpaceActive = false;

    // Restore all three home rows
    ['home-row-1', 'home-row-2', 'home-row-3'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('hidden');
    });

    // Hide the filter row
    const filterRow = document.getElementById('filter-row');
    if (filterRow) filterRow.classList.add('hidden');

    // Restore each slider to its original items (snapshot taken at init time)
    if (this._originalRows) {
      Object.entries(this._originalRows).forEach(([trackId, originalItems]) => {
        const slider = this.sliders[trackId];
        if (slider) slider.repopulate(originalItems);
      });
    }

    // Re-run Top Picks (may have changed via favorites since init)
    this._refreshTopPicks();
  }

  /** Show a single filtered row, hiding the three home rows */
  _showFiltered(title, items, emptyMsg) {
    // Hide Safe Space row
    const safeSpaceRow = document.getElementById('safespace-row');
    if (safeSpaceRow) safeSpaceRow.classList.add('hidden');
    this._isSafeSpaceActive = false;

    // Hide home rows
    ['home-row-1', 'home-row-2', 'home-row-3'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });

    const filterRow     = document.getElementById('filter-row');
    const filterTitle   = document.getElementById('filter-row-title');
    const filterEmpty   = document.getElementById('filter-empty-state');
    const filterEmptyMsg = document.getElementById('filter-empty-msg');
    const sliderTrack   = document.getElementById('slider-filter');

    if (!filterRow) return;

    // Update title
    if (filterTitle) filterTitle.textContent = title;

    // Show filter row
    filterRow.classList.remove('hidden');

    if (items.length === 0) {
      // Empty state
      if (sliderTrack) sliderTrack.style.display = 'none';
      const arrows = filterRow.querySelectorAll('.slider-arrow');
      arrows.forEach(a => a.classList.add('hidden'));
      if (filterEmpty) filterEmpty.classList.remove('hidden');
      if (filterEmptyMsg) filterEmptyMsg.textContent = emptyMsg;
    } else {
      // Restore slider visibility
      if (sliderTrack) sliderTrack.style.display = '';
      const arrows = filterRow.querySelectorAll('.slider-arrow');
      arrows.forEach(a => a.classList.remove('hidden'));
      if (filterEmpty) filterEmpty.classList.add('hidden');

      // Create or repopulate the filter slider
      if (!this.sliders['slider-filter']) {
        this.sliders['slider-filter'] = new GallerySlider('slider-filter', items, {});
      } else {
        this.sliders['slider-filter'].repopulate(items);
      }
    }
  }

  // ─── Safe Space System ───────────────────────────────────────────────────

  _showSafeSpace() {
    this._isSafeSpaceActive = true;

    // Hide home rows and filter row
    ['home-row-1', 'home-row-2', 'home-row-3', 'filter-row'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });

    // Remove active highlight from standard nav links
    document.querySelectorAll('.browse-nav-links a').forEach(l => l.classList.remove('active'));

    // Bind Safe Space buttons once
    if (!this._safeSpaceEventsBound) {
      this._safeSpaceEventsBound = true;
      const exitBtn = document.getElementById('safespace-exit-btn');
      if (exitBtn) {
        exitBtn.addEventListener('click', () => this._exitSafeSpace());
      }
      const addBtn = document.getElementById('safespace-add-btn');
      if (addBtn) {
        addBtn.addEventListener('click', () => this._openSafeSpaceUpload());
      }
      const emptyAddBtn = document.getElementById('safespace-empty-add-btn');
      if (emptyAddBtn) {
        emptyAddBtn.addEventListener('click', () => this._openSafeSpaceUpload());
      }
    }

    const safeSpaceRow = document.getElementById('safespace-row');
    if (safeSpaceRow) {
      safeSpaceRow.classList.remove('hidden');
      safeSpaceRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    this._renderSafeSpace();

    // If owner not signed in, kick off loading after sign-in
    if (!isOwnerSignedIn()) return;

    // If privateItems is empty, fetch from Drive now (first time unlocking this session)
    if (this.privateItems.length === 0 && !this._safeSpaceLoading) {
      this._safeSpaceLoading = true;
      fetchPrivateItems()
        .then((items) => {
          this._safeSpaceLoading = false;
          this.privateItems = items;
          this._renderSafeSpace();
        })
        .catch((err) => {
          this._safeSpaceLoading = false;
          console.warn('[BrowseApp] Could not fetch private Drive items:', err);
          this._renderSafeSpace();
        });
    }
  }

  _renderSafeSpace() {
    const safeSpaceRow = document.getElementById('safespace-row');
    if (!safeSpaceRow) return;

    // ── Auth Gate: require owner sign-in before revealing private content ──
    let authGate = safeSpaceRow.querySelector('.safespace-auth-gate');
    const emptyState  = document.getElementById('safespace-empty-state');
    const sliderTrack = document.getElementById('slider-safespace');
    const arrows = safeSpaceRow.querySelectorAll('.slider-arrow');
    const addBtn = document.getElementById('safespace-add-btn');

    if (!isOwnerSignedIn()) {
      // Inject auth gate once
      if (!authGate) {
        authGate = document.createElement('div');
        authGate.className = 'safespace-auth-gate';
        authGate.innerHTML = `
          <div class="safespace-auth-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <p class="safespace-auth-title">Sign in to Unlock Safe Space</p>
          <p class="safespace-auth-desc">Your private photos and videos are stored in Google Drive. Sign in as owner to view them.</p>
          <button type="button" class="google-sign-in-btn" id="safespace-signin-btn">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Sign in with Google
          </button>
        `;

        const sliderContainer = safeSpaceRow.querySelector('.slider-container');
        if (sliderContainer) {
          safeSpaceRow.insertBefore(authGate, sliderContainer);
        } else {
          safeSpaceRow.appendChild(authGate);
        }

        authGate.querySelector('#safespace-signin-btn').addEventListener('click', async () => {
          try {
            await signIn();
            this._safeSpaceLoading = false;
            this._showSafeSpace();
          } catch (err) {
            console.warn('[BrowseApp] Safe Space sign-in failed:', err);
          }
        });
      }

      authGate.classList.remove('hidden');
      if (sliderTrack) sliderTrack.style.display = 'none';
      if (emptyState) emptyState.classList.add('hidden');
      if (addBtn) addBtn.style.visibility = 'hidden';
      arrows.forEach(a => a.classList.add('hidden'));
      return;
    }

    // Owner is signed in: hide auth gate
    if (authGate) authGate.classList.add('hidden');
    if (addBtn) addBtn.style.visibility = '';

    // Deduplicate private items by Drive id or URL
    const seen = new Set();
    this.privateItems = this.privateItems.filter(i => {
      if (!i) return false;
      const key = i.id ? `id_${i.id}` : i.url;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (this.privateItems.length === 0) {
      if (sliderTrack) sliderTrack.style.display = 'none';
      arrows.forEach(a => a.classList.add('hidden'));
      if (emptyState) emptyState.classList.remove('hidden');
    } else {
      if (sliderTrack) sliderTrack.style.display = '';
      arrows.forEach(a => a.classList.remove('hidden'));
      if (emptyState) emptyState.classList.add('hidden');

      if (!this.sliders['slider-safespace']) {
        this.sliders['slider-safespace'] = new GallerySlider(
          'slider-safespace',
          this.privateItems,
          {
            onAdd: () => this._openSafeSpaceUpload(),
            onEdit: (idx, item) => this._editSafeSpaceItem(idx, item),
            onRemove: async (item) => {
              if (item.id) {
                try { await deleteDriveFile(item.id); } catch (e) { /* silently continue */ }
              }
              const pIdx = this.privateItems.findIndex(i => i === item || (i.id && i.id === item.id));
              if (pIdx !== -1) this.privateItems.splice(pIdx, 1);
              if (this.privateItems.length === 0) this._renderSafeSpace();
            },
          }
        );
      } else {
        this.sliders['slider-safespace'].repopulate(this.privateItems);
      }
    }
  }

  _openSafeSpaceUpload() {
    this.uploadModal.open((newItem) => {
      newItem.isPrivate = true;
      this.privateItems.unshift(newItem);
      this._renderSafeSpace();
    }, 'Add to Safe Space', true);
  }

  _editSafeSpaceItem(idx, oldItem) {
    this.uploadModal.open((newItem) => {
      newItem.isPrivate = true;
      this.privateItems[idx] = newItem;
      if (this.sliders['slider-safespace']) {
        this.sliders['slider-safespace'].replaceItem(idx, newItem);
      }
    }, `Replace ${oldItem.title || 'Item'}`, true);
  }

  _exitSafeSpace() {
    const safeSpaceRow = document.getElementById('safespace-row');
    if (safeSpaceRow) safeSpaceRow.classList.add('hidden');
    this._isSafeSpaceActive = false;

    // Restore Home view and highlight Home in nav
    const homeLink = [...document.querySelectorAll('.browse-nav-links a')]
      .find(l => l.textContent.trim() === 'Home');
    this._setActiveNav(homeLink);
    this._activeFilter = 'home';
    this._showHome();
  }

  // ─── Search & Notifications ───────────────────────────────────────────────

  _initSearch() {
    const searchContainer = document.getElementById('nav-search');
    const searchBtn       = document.getElementById('nav-search-btn');
    const searchInput     = document.getElementById('nav-search-input');
    const searchClear     = document.getElementById('nav-search-clear');

    if (!searchContainer || !searchInput) return;

    const openSearch = () => {
      searchContainer.classList.add('active');
      searchInput.focus();
    };

    const restoreNormalView = () => {
      if (this._activeFilter && this._activeFilter !== 'home') {
        this._applyFilter(this._activeFilter);
      } else {
        this._showHome();
      }
    };

    const closeSearch = () => {
      searchContainer.classList.remove('active');
      if (searchInput.value.trim().length > 0) {
        searchInput.value = '';
        if (searchClear) searchClear.classList.add('hidden');
        restoreNormalView();
      }
    };

    this._closeSearch = closeSearch;

    // Toggle button: open if closed, close if open & empty, focus if open with text
    if (searchBtn) {
      searchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (searchContainer.classList.contains('active')) {
          if (!searchInput.value.trim()) {
            closeSearch();
          } else {
            searchInput.focus();
          }
        } else {
          openSearch();
        }
      });
    }

    // Live search as user types (debounced for smooth typing experience)
    let searchDebounce = null;
    searchInput.addEventListener('input', () => {
      const raw = searchInput.value;
      const trimmed = raw.trim();

      // Check for secret Safe Space trigger code (exact match, trimmed, case-sensitive)
      if (trimmed === SAFE_SPACE_CODE) {
        clearTimeout(searchDebounce);
        searchInput.value = '';
        if (searchClear) searchClear.classList.add('hidden');
        if (searchContainer.classList.contains('active')) {
          searchContainer.classList.remove('active');
        }
        searchInput.blur();
        this._showSafeSpace();
        return;
      }

      const query = trimmed.toLowerCase();

      if (searchClear) {
        searchClear.classList.toggle('hidden', raw.length === 0);
      }

      if (!query) {
        clearTimeout(searchDebounce);
        restoreNormalView();
        return;
      }

      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        // Remove active highlight from nav links while actively searching
        document.querySelectorAll('.browse-nav-links a').forEach(l => l.classList.remove('active'));

        // Filter all known items by title or tags
        const pool = this._getAllKnownItems();
        const matches = pool.filter(item => {
          const title = (item.title || '').toLowerCase();
          const tags = Array.isArray(item.tags) ? item.tags : [];
          const titleMatch = title.includes(query);
          const tagsMatch = tags.some(t => (t || '').toLowerCase().includes(query));
          return titleMatch || tagsMatch;
        });

        // Deduplicate by url
        const seen = new Set();
        const uniqueMatches = matches.filter(i => {
          if (!i || !i.url) return false;
          if (seen.has(i.url)) return false;
          seen.add(i.url);
          return true;
        });

        const title = `Search: "${raw.trim()}"`;
        const emptyMsg = `No results for "${raw.trim()}"`;
        this._showFiltered(title, uniqueMatches, emptyMsg);
      }, 120);
    });

    // Clear button
    if (searchClear) {
      searchClear.addEventListener('click', (e) => {
        e.stopPropagation();
        searchInput.value = '';
        searchClear.classList.add('hidden');
        searchInput.focus();
        restoreNormalView();
      });
    }

    // Keydown handlers
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (searchInput.value.trim() === SAFE_SPACE_CODE) {
          clearTimeout(searchDebounce);
          searchInput.value = '';
          if (searchClear) searchClear.classList.add('hidden');
          if (searchContainer.classList.contains('active')) {
            searchContainer.classList.remove('active');
          }
          searchInput.blur();
          this._showSafeSpace();
        }
      } else if (e.key === 'Escape') {
        closeSearch();
      }
    });

    // Click outside: if empty, collapse search container
    document.addEventListener('click', (e) => {
      if (!searchContainer.contains(e.target)) {
        if (!searchInput.value.trim()) {
          searchContainer.classList.remove('active');
        }
      }
    });
  }

  _initNotifications(sortedUploads) {
    const notifContainer = document.getElementById('nav-notifications');
    const notifBtn       = document.getElementById('nav-notifications-btn');
    const notifDropdown  = document.getElementById('nav-notifications-dropdown');
    const notifBadge     = document.getElementById('nav-notifications-badge');
    const notifList      = document.getElementById('nav-notifications-list');

    if (!notifContainer || !notifBtn || !notifDropdown || !notifList) return;

    this._notifUploads = [...(sortedUploads || [])];

    const formatRelativeTime = (timestamp) => {
      if (!timestamp) return 'Recently';
      const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
      if (diffSec < 60) return 'Just now';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour}h ago`;
      const diffDay = Math.floor(diffHour / 24);
      if (diffDay === 1) return 'Yesterday';
      if (diffDay < 7) return `${diffDay}d ago`;
      return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    const renderNotifications = () => {
      notifList.innerHTML = '';
      if (!this._notifUploads || this._notifUploads.length === 0) {
        notifList.innerHTML = '<div class="nav-notifications-empty">No new notifications</div>';
        return;
      }

      // Sort newest uploads first, limit to 8
      const recent = [...this._notifUploads]
        .sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0))
        .slice(0, 8);

      recent.forEach(item => {
        const row = document.createElement('div');
        row.className = 'nav-notification-item';
        const thumbUrl = item.thumbnailUrl || (item.type === 'image' ? item.url : '');
        const isVideo = item.type === 'video';

        row.innerHTML = `
          ${thumbUrl ? `<img class="nav-notification-thumb" src="${thumbUrl}" alt="" />` : `<div class="nav-notification-thumb" style="display:flex;align-items:center;justify-content:center;color:#888;font-size:9px;font-weight:700;">${isVideo ? 'VIDEO' : 'PHOTO'}</div>`}
          <div class="nav-notification-info">
            <div class="nav-notification-title">New upload: <strong>${item.title || 'Untitled'}</strong></div>
            <div class="nav-notification-time">${formatRelativeTime(item.uploadedAt)}</div>
          </div>
        `;

        row.addEventListener('click', (e) => {
          e.stopPropagation();
          notifDropdown.classList.remove('is-open');
          if (window.detailPanel) {
            window.detailPanel.open([item], 0);
          }
        });

        notifList.appendChild(row);
      });
    };

    const checkBadge = () => {
      if (!notifBadge) return;
      const lastSeen = parseInt(localStorage.getItem('himanshi_last_seen_notification') || '0', 10);
      const hasUnseen = (this._notifUploads || []).some(u => (u.uploadedAt || 0) > lastSeen);
      notifBadge.classList.toggle('hidden', !hasUnseen);
    };

    const markSeen = () => {
      if (notifBadge) notifBadge.classList.add('hidden');
      localStorage.setItem('himanshi_last_seen_notification', Date.now().toString());
    };

    renderNotifications();
    checkBadge();

    // Toggle dropdown on button click
    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = notifDropdown.classList.contains('is-open');
      if (!isOpen) {
        renderNotifications();
        notifDropdown.classList.add('is-open');
        markSeen();
      } else {
        notifDropdown.classList.remove('is-open');
      }
    });

    // Click outside closes dropdown
    document.addEventListener('click', (e) => {
      if (!notifContainer.contains(e.target)) {
        notifDropdown.classList.remove('is-open');
      }
    });

    // Escape closes dropdown
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        notifDropdown.classList.remove('is-open');
      }
    });

    // Reactive callback for live uploads
    this._onNewUploadNotification = (newItem) => {
      if (!this._notifUploads) this._notifUploads = [];
      this._notifUploads.unshift(newItem);
      renderNotifications();
      checkBadge();
    };
  }
  /**
   * Wire up the billboard:
   * - If a video upload exists, display it as the featured item
   * - Hover-to-play (muted) with mute toggle button
   * - Play button opens Lightbox
   */
  _initBillboard(sortedUploads) {
    const billboardEl  = document.getElementById('billboard');
    const bgEl         = document.getElementById('billboard-bg');
    const videoEl      = document.getElementById('billboard-video');
    const titleImg     = document.getElementById('billboard-title-img');
    const textTitle    = document.getElementById('billboard-text-title');
    const synopsisEl   = document.getElementById('billboard-synopsis');
    const metaEl       = document.getElementById('billboard-meta');
    const playBtn      = document.getElementById('billboard-play-btn');
    const infoBtn      = document.getElementById('billboard-info-btn');
    const muteBtn      = document.getElementById('billboard-mute-btn');

    if (!billboardEl || !videoEl) return;

    // Find most recently uploaded VIDEO
    const latestVideo = sortedUploads.find(u => u.type === 'video');

    // Default fallback video (Stranger Things sample or placeholder)
    const fallbackVideo = {
      title: 'Stranger Things',
      type: 'video',
      url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
      tags: ['Sci-Fi', 'Horror', 'Mystery'],
      format: 'Series',
      year: '2016',
      seasons: '4 Seasons',
      rating: 'TV-14',
      synopsis: 'When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces and one strange little girl.'
    };

    // Use uploaded video if available, else fallback
    const featured = latestVideo || fallbackVideo;
    const billboardItem = featured;
    const billboardItems = [featured];

    // Load video source and show it
    videoEl.src = featured.url;
    videoEl.classList.remove('hidden');

    // Hide the static background image since we use the video element's first frame as the poster
    if (bgEl) bgEl.style.display = 'none';

    // Update title: if it's an upload, hide the default Stranger Things logo and show text
    if (latestVideo) {
      if (titleImg) titleImg.classList.add('hidden');
      if (textTitle) {
        textTitle.textContent = featured.title || 'Featured';
        textTitle.classList.remove('hidden');
      }
    } else {
      // It's the fallback, keep the logo image visible
      if (titleImg) titleImg.classList.remove('hidden');
      if (textTitle) textTitle.classList.add('hidden');
    }

    // ── Update Metadata Row: Format: Series • Genre • Year • Seasons • Rating ──
    if (metaEl) {
      const metaParts = [];
      metaParts.push(featured.format || (featured.type === 'video' ? 'Series' : 'Film'));
      if (featured.tags && featured.tags.length) {
        metaParts.push(featured.tags[0]);
      }
      metaParts.push(featured.year || '2016');
      metaParts.push(featured.seasons || '4 Seasons');
      metaParts.push(featured.rating || 'TV-14');
      metaEl.textContent = metaParts.join(' • ');
    }

    // Update synopsis
    if (synopsisEl) {
      if (featured.synopsis) {
        synopsisEl.textContent = featured.synopsis;
      } else if (!latestVideo) {
        synopsisEl.textContent = 'When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces and one strange little girl.';
      } else if (featured.tags && featured.tags.length) {
        synopsisEl.textContent = `A gripping ${featured.tags.join(' • ')} experience streaming now on Himanshi.`;
      }
    }

    // Always show mute button
    if (muteBtn) muteBtn.classList.remove('hidden');

    // Mute toggle
    let isMuted = true;
    videoEl.muted = true;

    const muteIconMuted = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <line x1="23" y1="9" x2="17" y2="15"></line>
        <line x1="17" y1="9" x2="23" y2="15"></line>
      </svg>`;
    const muteIconUnmuted = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      </svg>`;

    if (muteBtn) {
      muteBtn.innerHTML = muteIconMuted;
      // Remove any old listeners (if this gets called twice)
      const newMuteBtn = muteBtn.cloneNode(true);
      muteBtn.parentNode.replaceChild(newMuteBtn, muteBtn);
      
      newMuteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isMuted = !isMuted;
        videoEl.muted = isMuted;
        newMuteBtn.innerHTML = isMuted ? muteIconMuted : muteIconUnmuted;
        newMuteBtn.setAttribute('aria-label', isMuted ? 'Unmute' : 'Mute');
      });
    }

    // Hover-to-play behaviour (Desktop pointer only; touch devices show clean static poster frame)
    if (!isTouchDevice()) {
      let hoverTimer = null;
      billboardEl.addEventListener('mouseenter', () => {
        hoverTimer = setTimeout(() => {
          videoEl.play().then(() => {
            videoEl.classList.add('is-playing');
          }).catch(() => {/* autoplay blocked */});
        }, 500);
      });
      billboardEl.addEventListener('mouseleave', () => {
        clearTimeout(hoverTimer);
        videoEl.pause();
        videoEl.classList.remove('is-playing');
      });
    }

    // Wire billboard Play button
    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (billboardItem && window.lightbox) {
          window.lightbox.open(billboardItems, 0);
        }
      });
    }

    // Wire billboard More Info button
    if (infoBtn) {
      infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (billboardItem && window.detailPanel) {
          window.detailPanel.open(billboardItems, 0);
        }
      });
    }
  }

  /**
   * Mobile "Browse ▾" dropdown toggle for small viewports.
   */
  _initMobileNav() {
    const toggleBtn = document.getElementById('mobile-nav-toggle');
    const navLinks  = document.getElementById('browse-nav-links');
    if (!toggleBtn || !navLinks) return;

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navLinks.classList.toggle('is-open');
      toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      const caret = toggleBtn.querySelector('.mobile-nav-caret');
      if (caret) caret.style.transform = isOpen ? 'rotate(180deg)' : 'none';
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!toggleBtn.contains(e.target) && !navLinks.contains(e.target)) {
        navLinks.classList.remove('is-open');
        toggleBtn.setAttribute('aria-expanded', 'false');
        const caret = toggleBtn.querySelector('.mobile-nav-caret');
        if (caret) caret.style.transform = 'none';
      }
    });

    // Close when any link inside is tapped
    navLinks.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => {
        navLinks.classList.remove('is-open');
        toggleBtn.setAttribute('aria-expanded', 'false');
        const caret = toggleBtn.querySelector('.mobile-nav-caret');
        if (caret) caret.style.transform = 'none';
      });
    });
  }

  /**
   * Profile dropdown click-toggle for touch and keyboard accessibility.
   * Also injects the Google Sign-in / Sign-out control under "Account".
   */
  _initProfileMenu() {
    const profileBtn = document.getElementById('nav-profile-btn');
    const dropdown   = document.getElementById('nav-dropdown');
    if (!profileBtn || !dropdown) return;

    profileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('is-open');
      this._refreshOwnerMenuItem();
    });

    document.addEventListener('click', (e) => {
      if (!profileBtn.contains(e.target)) {
        dropdown.classList.remove('is-open');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') dropdown.classList.remove('is-open');
    });

    // Wire Owner sign-in/out link (already has id="nav-owner-account-link" in HTML)
    const accountLink = document.getElementById('nav-owner-account-link')
      || [...dropdown.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Account');
    if (accountLink) {
      accountLink.id = 'nav-owner-account-link';
      this._refreshOwnerMenuItem();
      accountLink.addEventListener('click', async (e) => {
        e.preventDefault();
        dropdown.classList.remove('is-open');
        if (isOwnerSignedIn()) {
          signOut();
        } else {
          try {
            await signIn();
          } catch (err) {
            console.warn('[BrowseApp] Sign-in failed:', err);
          }
        }
        this._refreshOwnerMenuItem();
      });
    }

    // Wire Recycle Bin link
    const binLink = document.getElementById('nav-recycle-bin-link');
    if (binLink) {
      binLink.addEventListener('click', (e) => {
        e.preventDefault();
        dropdown.classList.remove('is-open');
        this.openRecycleBin();
      });
    }

    // Wire main "Sign out of Himanshi" link
    const signoutLink = document.getElementById('nav-signout-link')
      || [...dropdown.querySelectorAll('a')].find((a) => /sign out of himanshi/i.test(a.textContent));
    if (signoutLink) {
      signoutLink.addEventListener('click', async (e) => {
        e.preventDefault();
        dropdown.classList.remove('is-open');

        // Sign out of Owner Mode & revoke Google Drive token
        signOut();

        // Clear session storage and any rogue keys from previous projects
        try {
          sessionStorage.clear();
          localStorage.removeItem('cti_token');
          localStorage.removeItem('dashboard_user');
          localStorage.removeItem('token');
          localStorage.removeItem('auth');
        } catch (_) {}

        // Unregister any stale service workers from other localhost projects
        if ('serviceWorker' in navigator) {
          try {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const r of regs) await r.unregister();
          } catch (_) {}
        }

        // Navigate cleanly to the Himanshi landing page
        window.location.replace('index.html');
      });
    }
  }

  _refreshOwnerMenuItem() {
    const link = document.getElementById('nav-owner-account-link');
    if (!link) return;
    const signedIn = isOwnerSignedIn();
    link.textContent = signedIn ? 'Sign out of Owner Mode' : 'Sign in as Owner';
    link.style.color = signedIn ? '#e50914' : '';

    // Show/hide Recycle Bin link in dropdown
    const binLink = document.getElementById('nav-recycle-bin-link');
    if (binLink) {
      binLink.style.display = signedIn ? '' : 'none';
    }
  }

  /** Show or hide upload/edit/delete controls based on owner auth state */
  _updateOwnerControls(signedIn) {
    this._refreshOwnerMenuItem();
    if (this._isSafeSpaceActive) {
      this._renderSafeSpace();
    }
  }

  // ─── Delete Confirmation ───────────────────────────────────────────────────

  /**
   * Show a Netflix-styled confirmation dialog before deleting a Drive item.
   * @param {object} item  - gallery item with .id and .title
   * @param {Function} onConfirm - called if user confirms
   */
  _confirmDelete(item, onConfirm) {
    // Remove any existing dialog
    document.getElementById('drive-delete-confirm')?.remove();

    const dlg = document.createElement('div');
    dlg.id = 'drive-delete-confirm';
    dlg.className = 'drive-delete-confirm-overlay';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-label', 'Confirm delete');
    dlg.innerHTML = `
      <div class="drive-delete-confirm-box">
        <div class="drive-delete-confirm-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="40" height="40">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
            <path d="M10 11v6"></path><path d="M14 11v6"></path>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
          </svg>
        </div>
        <h3 class="drive-delete-confirm-title">Move to Recycle Bin?</h3>
        <p class="drive-delete-confirm-msg">
          "<strong>${item.title || 'This item'}</strong>" will be moved to your Google Drive Recycle Bin.
          You can restore it any time from the Recycle Bin in the profile menu.
        </p>
        <div class="drive-delete-confirm-actions">
          <button class="drive-delete-btn-cancel" id="drive-del-cancel">Cancel</button>
          <button class="drive-delete-btn-confirm" id="drive-del-confirm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
            </svg>
            Move to Bin
          </button>
        </div>
      </div>`;

    document.body.appendChild(dlg);

    const close = () => {
      dlg.classList.add('is-closing');
      dlg.addEventListener('animationend', () => dlg.remove(), { once: true });
    };

    dlg.querySelector('#drive-del-cancel').addEventListener('click', close);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });

    dlg.querySelector('#drive-del-confirm').addEventListener('click', async () => {
      close();
      await onConfirm();
    });

    // Animate in
    requestAnimationFrame(() => dlg.classList.add('is-open'));
  }

  /**
   * Delete a Drive item with confirmation + toast feedback.
   * Removes the card from the slider on success.
   */
  async _deleteDriveItem(item, sliderKey, cardEl) {
    this._confirmDelete(item, async () => {
      const btn = cardEl?.querySelector('.gallery-remove-btn');
      if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; }
      try {
        await deleteDriveFile(item.id);
        // Animate card out
        if (cardEl) {
          cardEl.style.transition = 'opacity var(--card-hover-speed) ease, transform var(--card-hover-speed) ease';
          cardEl.style.opacity = '0';
          cardEl.style.transform = 'scale(0.85)';
          cardEl.style.pointerEvents = 'none';
          cardEl.addEventListener('transitionend', () => cardEl.remove(), { once: true });
        }
        // Remove from slider items array
        if (sliderKey && this.sliders[sliderKey]) {
          const idx = this.sliders[sliderKey].items.findIndex(
            (i) => i === item || (i.id && i.id === item.id)
          );
          if (idx !== -1) this.sliders[sliderKey].items.splice(idx, 1);
        }
        this._showToast('Moved to Recycle Bin', 'You can restore it from the Recycle Bin.', 'trash');
      } catch (err) {
        console.error('[BrowseApp] Delete failed:', err);
        this._showToast('Delete failed', err.message || 'Try again.', 'error');
        if (btn) { btn.disabled = false; btn.style.opacity = ''; }
      }
    });
  }

  /**
   * Move an item directly to Safe Space (Owner only, no email verification needed)
   */
  async _moveToSafeSpace(item, sliderKey, cardEl) {
    if (!isOwnerSignedIn()) {
      try {
        this._showToast('Signing in…', 'Connecting to Google Drive to move file…', 'info');
        await signIn();
      } catch (err) {
        console.warn('[BrowseApp] Sign in cancelled or failed:', err);
        this._showToast('Sign-in required', 'Sign in as Owner to move files to Safe Space.', 'error');
        return;
      }
    }

    const safeBtn = cardEl?.querySelector('.gallery-safespace-btn');
    if (safeBtn) { safeBtn.disabled = true; safeBtn.style.opacity = '0.4'; }

    try {
      const isDriveItem = item.id != null && item.url && !item.url.startsWith('blob:');
      let movedItem = null;

      if (isDriveItem) {
        movedItem = await moveToSafeSpace(item.id);
      } else {
        movedItem = { ...item, isPrivate: true };
      }

      // Animate card out of public gallery
      if (cardEl) {
        cardEl.style.transition = 'opacity var(--card-hover-speed) ease, transform var(--card-hover-speed) ease';
        cardEl.style.opacity = '0';
        cardEl.style.transform = 'scale(0.85)';
        cardEl.style.pointerEvents = 'none';
        cardEl.addEventListener('transitionend', () => cardEl.remove(), { once: true });
      }

      // Remove from source slider
      if (sliderKey && this.sliders[sliderKey]) {
        const idx = this.sliders[sliderKey].items.findIndex(
          (i) => i === item || (i.id && i.id === item.id)
        );
        if (idx !== -1) this.sliders[sliderKey].items.splice(idx, 1);
      }

      // Remove from all other public sliders if duplicate
      ['slider-1', 'slider-2', 'slider-3', 'slider-filter'].forEach((key) => {
        if (key !== sliderKey && this.sliders[key]) {
          const idx = this.sliders[key].items.findIndex(
            (i) => i === item || (i.id && i.id === item.id)
          );
          if (idx !== -1) {
            this.sliders[key].items.splice(idx, 1);
            const track = document.getElementById(key);
            const duplicateCard = track?.querySelector(`[data-id="${item.id}"]`);
            if (duplicateCard) duplicateCard.remove();
          }
        }
      });

      // Remove from homeItems array
      const homeIdx = this.homeItems.findIndex(
        (i) => i === item || (i.id && i.id === item.id)
      );
      if (homeIdx !== -1) this.homeItems.splice(homeIdx, 1);

      // Add to private items
      if (movedItem) {
        const pIdx = this.privateItems.findIndex(
          (i) => i.id === movedItem.id || i.url === movedItem.url
        );
        if (pIdx === -1) {
          this.privateItems.unshift(movedItem);
        } else {
          this.privateItems[pIdx] = movedItem;
        }

        // If safe space slider is initialized, repopulate
        if (this.sliders['slider-safespace']) {
          this.sliders['slider-safespace'].repopulate(this.privateItems);
        }
      }

      this._showToast(
        'Moved to Safe Space 🔒',
        `"${item.title}" is now secured in your private Safe Space.`,
        'safe'
      );
    } catch (err) {
      console.error('[BrowseApp] Move to Safe Space failed:', err);
      this._showToast('Move failed', err.message || 'Could not move file to Safe Space.', 'error');
      if (safeBtn) { safeBtn.disabled = false; safeBtn.style.opacity = ''; }
    }
  }

  // ─── Recycle Bin Modal ────────────────────────────────────────────────────

  async openRecycleBin() {
    if (!isOwnerSignedIn()) {
      this._showToast('Owner sign-in required', 'Sign in as Owner to view the Recycle Bin.', 'error');
      return;
    }

    // Remove existing modal
    document.getElementById('recycle-bin-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'recycle-bin-modal';
    modal.className = 'recycle-bin-modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Drive Recycle Bin');
    modal.innerHTML = `
      <div class="recycle-bin-box">
        <div class="recycle-bin-header">
          <div class="recycle-bin-header-left">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
              <path d="M10 11v6"></path><path d="M14 11v6"></path>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
            </svg>
            <h2>Recycle Bin</h2>
          </div>
          <button class="recycle-bin-close" id="recycle-bin-close" aria-label="Close Recycle Bin">&times;</button>
        </div>
        <p class="recycle-bin-subtitle">Items moved to trash in your Google Drive. Google automatically permanently deletes after 30 days.</p>
        <div class="recycle-bin-grid" id="recycle-bin-grid">
          <div class="recycle-bin-loading">
            <svg class="recycle-bin-spinner" viewBox="0 0 50 50" width="36" height="36">
              <circle cx="25" cy="25" r="20" fill="none" stroke="#e50914" stroke-width="4" stroke-dasharray="94.2" stroke-dashoffset="70" stroke-linecap="round"/>
            </svg>
            <span>Loading trashed items…</span>
          </div>
        </div>
      </div>`;

    document.body.appendChild(modal);

    const closeModal = () => {
      modal.classList.add('is-closing');
      modal.addEventListener('animationend', () => modal.remove(), { once: true });
    };

    modal.querySelector('#recycle-bin-close').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', function escBin(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escBin); }
    });

    // Show modal
    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('is-open'));

    // Load trashed items
    const grid = modal.querySelector('#recycle-bin-grid');
    try {
      const items = await fetchTrashedItems();
      grid.innerHTML = '';
      if (items.length === 0) {
        grid.innerHTML = `<div class="recycle-bin-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="52" height="52">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
          </svg>
          <p>Recycle Bin is empty</p>
          <span>Deleted photos and videos will appear here</span>
        </div>`;
        return;
      }

      items.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'recycle-bin-card';
        card.dataset.id = item.id;

        const isVideo = item.type === 'video';
        const thumbSrc = item.thumbnailUrl || `https://lh3.googleusercontent.com/d/${item.id}=w300`;

        card.innerHTML = `
          <div class="recycle-bin-card-thumb">
            <img src="${thumbSrc}" alt="${item.title}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'300\\' height=\\'170\\' viewBox=\\'0 0 300 170\\'%3E%3Crect fill=\\'%23222\\' width=\\'300\\' height=\\'170\\'/%3E%3C/svg%3E'">
            ${isVideo ? `<div class="recycle-bin-card-type">
              <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M8 5v14l11-7z"/></svg> Video
            </div>` : ''}
          </div>
          <div class="recycle-bin-card-info">
            <span class="recycle-bin-card-title">${item.title}</span>
          </div>
          <div class="recycle-bin-card-actions">
            <button class="recycle-bin-restore-btn" data-id="${item.id}" aria-label="Restore ${item.title}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
                <polyline points="1 4 1 10 7 10"></polyline>
                <path d="M3.51 15a9 9 0 1 0 .49-4.95"></path>
              </svg>
              Restore
            </button>
            <button class="recycle-bin-perma-btn" data-id="${item.id}" aria-label="Permanently delete ${item.title}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
              </svg>
              Delete Forever
            </button>
          </div>`;

        // Restore
        card.querySelector('.recycle-bin-restore-btn').addEventListener('click', async () => {
          const btn = card.querySelector('.recycle-bin-restore-btn');
          btn.disabled = true;
          btn.textContent = 'Restoring…';
          try {
            const restored = await restoreDriveFile(item.id);
            card.style.opacity = '0';
            card.style.transform = 'scale(0.85)';
            card.style.transition = 'opacity var(--card-hover-speed) ease, transform var(--card-hover-speed) ease';
            card.addEventListener('transitionend', () => card.remove(), { once: true });
            this._showToast('Restored!', `"${item.title}" has been restored to your gallery.`, 'success');
            // Prepend to Trending Now if the slider exists
            if (this.sliders['slider-1']) {
              this.sliders['slider-1'].addItemAtStart(restored);
            }
          } catch (err) {
            btn.disabled = false;
            btn.innerHTML = 'Restore';
            this._showToast('Restore failed', err.message, 'error');
          }
        });

        // Permanent delete
        card.querySelector('.recycle-bin-perma-btn').addEventListener('click', async () => {
          const confirmMsg = `Permanently delete "${item.title}"? This cannot be undone.`;
          if (!confirm(confirmMsg)) return;
          const btn = card.querySelector('.recycle-bin-perma-btn');
          btn.disabled = true;
          btn.textContent = 'Deleting…';
          try {
            await permanentlyDeleteDriveFile(item.id);
            card.style.opacity = '0';
            card.style.transform = 'scale(0.85)';
            card.style.transition = 'opacity var(--card-hover-speed) ease, transform var(--card-hover-speed) ease';
            card.addEventListener('transitionend', () => card.remove(), { once: true });
            this._showToast('Permanently deleted', `"${item.title}" has been removed forever.`, 'trash');
          } catch (err) {
            btn.disabled = false;
            btn.textContent = 'Delete Forever';
            this._showToast('Delete failed', err.message, 'error');
          }
        });

        grid.appendChild(card);
      });
    } catch (err) {
      grid.innerHTML = `<div class="recycle-bin-empty">
        <p style="color:#e50914">Failed to load Recycle Bin</p>
        <span>${err.message}</span>
      </div>`;
    }
  }

  // ─── Toast Notification ───────────────────────────────────────────────────

  _showToast(title, message, type = 'info') {
    const existing = document.getElementById('browse-toast');
    if (existing) existing.remove();

    const iconMap = {
      success : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>`,
      error   : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      trash   : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="18" height="18"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`,
      safe    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
      info    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    };

    const toast = document.createElement('div');
    toast.id = 'browse-toast';
    toast.className = `browse-toast browse-toast--${type}`;
    toast.innerHTML = `
      <span class="browse-toast-icon">${iconMap[type] || iconMap.info}</span>
      <div class="browse-toast-text">
        <strong>${title}</strong>
        ${message ? `<span>${message}</span>` : ''}
      </div>
      <button class="browse-toast-close" aria-label="Dismiss">&times;</button>`;

    document.body.appendChild(toast);
    toast.querySelector('.browse-toast-close').addEventListener('click', () => toast.remove());

    requestAnimationFrame(() => toast.classList.add('is-visible'));
    const t = setTimeout(() => {
      toast.classList.remove('is-visible');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 4500);
    toast.querySelector('.browse-toast-close').addEventListener('click', () => clearTimeout(t));
  }

  /** Show skeleton shimmer cards in all home rows while Drive data is loading */
  _showSkeletonRows() {
    ['slider-1', 'slider-2', 'slider-3'].forEach((trackId) => {
      const track = document.getElementById(trackId);
      if (!track) return;
      track.innerHTML = '';
      for (let i = 0; i < 6; i++) {
        const skel = document.createElement('div');
        skel.className = 'gallery-item gallery-skeleton-card';
        track.appendChild(skel);
      }
    });
  }

  /** Show a dismissible error banner when Drive fetch fails */
  _showDriveErrorBanner(errorMsg) {
    const galleriesContainer = document.querySelector('.galleries-container');
    if (!galleriesContainer) return;
    const banner = document.createElement('div');
    banner.className = 'drive-status-banner';
    banner.id = 'drive-error-banner';
    let friendlyMsg = 'Could not load photos and videos from Google Drive.';
    if (errorMsg && /403/.test(errorMsg)) {
      friendlyMsg = 'Access denied to Google Drive folder. Check your API Key and folder sharing.';
    } else if (errorMsg && /network|fetch/i.test(errorMsg)) {
      friendlyMsg = 'Network error — check your internet connection and try refreshing.';
    } else if (errorMsg && /quota/i.test(errorMsg)) {
      friendlyMsg = 'Google Drive API quota exceeded. Photos will load again shortly.';
    }
    banner.innerHTML = `
      <span><strong>Drive unavailable:</strong> ${friendlyMsg} Demo preset items are shown instead.</span>
      <button class="drive-status-close" aria-label="Dismiss">&times;</button>
    `;
    banner.querySelector('.drive-status-close').addEventListener('click', () => banner.remove());
    galleriesContainer.prepend(banner);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window._browseApp = new BrowseApp();
});
