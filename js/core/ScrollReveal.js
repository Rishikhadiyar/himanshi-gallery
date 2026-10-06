import { $$, isReducedMotion } from '../utils/helpers.js';

export class ScrollReveal {
  constructor() {
    this.targets = $$('[data-reveal]');
    this.init();
  }

  init() {
    if (!('IntersectionObserver' in window) || isReducedMotion()) {
      this.targets.forEach(el => el.classList.add('revealed'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { 
      threshold: 0.15,
      rootMargin: "0px 0px -50px 0px"
    });

    this.targets.forEach(el => {
      const delay = el.getAttribute('data-delay');
      if (delay) el.style.setProperty('--reveal-delay', `${delay}ms`);
      observer.observe(el);
    });
  }
}
