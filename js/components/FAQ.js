import { $, $$, isReducedMotion } from '../utils/helpers.js';

export class FAQ {
  constructor() {
    this.items = $$('.faq-item');
    this.bindEvents();
  }

  bindEvents() {
    this.items.forEach(item => {
      const btn = item.querySelector('.faq-question');
      if (btn) {
        btn.addEventListener('click', () => this.toggle(item.id));
        btn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.toggle(item.id);
          }
        });
      }
    });
  }

  toggle(id) {
    const item = $(`#${id}`);
    if (!item) return;
    
    const btn = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');
    const inner = item.querySelector('.faq-answer-inner');
    const isOpen = item.classList.contains('open');

    // Close others
    $$('.faq-item.open').forEach(el => {
      if (el.id !== id) {
        el.classList.remove('open');
        const elBtn = el.querySelector('.faq-question');
        const elAns = el.querySelector('.faq-answer');
        if (elBtn) elBtn.setAttribute('aria-expanded', 'false');
        if (elAns) elAns.style.height = '0px';
      }
    });

    if (!isOpen) {
      item.classList.add('open');
      if (btn) btn.setAttribute('aria-expanded', 'true');
      const height = inner.getBoundingClientRect().height;
      answer.style.height = `${height}px`;
      
      setTimeout(() => {
        if (item.classList.contains('open')) answer.style.height = 'auto';
      }, 600);
    } else {
      item.classList.remove('open');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      
      const height = inner.getBoundingClientRect().height;
      answer.style.height = `${height}px`;
      void answer.offsetHeight; // reflow
      answer.style.height = '0px';
    }
  }
}
