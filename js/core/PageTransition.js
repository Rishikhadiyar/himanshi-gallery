import { $ } from '../utils/helpers.js';

export class PageTransition {
  constructor() {
    this.overlay = $('#page-transition');
    if (this.overlay) {
      this.overlay.classList.remove('active');
    }
    this.bindEvents();
  }

  bindEvents() {
    if (!this.overlay) return;

    window.addEventListener('beforeunload', () => {
      this.overlay.classList.add('active');
    });

    // Handle back/forward cache restore
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
        this.overlay.classList.remove('active');
      }
    });
  }
}
