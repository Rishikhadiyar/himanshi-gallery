import { $$, isReducedMotion } from '../utils/helpers.js';

export class Spotlight {
  constructor() {
    if (isReducedMotion() || window.innerWidth < 768) return;
    this.sections = $$('.feature-section');
    this.bindEvents();
  }

  bindEvents() {
    this.sections.forEach(section => {
      section.addEventListener('mousemove', (e) => {
        const rect = section.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        section.style.setProperty('--mouse-x', `${x}px`);
        section.style.setProperty('--mouse-y', `${y}px`);
      }, { passive: true });
    });
  }
}
