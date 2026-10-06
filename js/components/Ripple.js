import { $$ } from '../utils/helpers.js';

export class Ripple {
  constructor() {
    this.buttons = $$('.get-started-btn, .signin-btn');
    this.bindEvents();
  }

  bindEvents() {
    this.buttons.forEach(btn => {
      btn.addEventListener('mousedown', (e) => this.createRipple(e, btn));
      btn.addEventListener('touchstart', (e) => this.createRipple(e, btn), {passive: true});
    });
  }

  createRipple(event, button) {
    const circle = document.createElement('span');
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;

    const rect = button.getBoundingClientRect();
    const clientX = event.clientX || (event.touches && event.touches[0].clientX) || rect.left + radius;
    const clientY = event.clientY || (event.touches && event.touches[0].clientY) || rect.top + radius;

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${clientX - rect.left - radius}px`;
    circle.style.top = `${clientY - rect.top - radius}px`;
    circle.classList.add('ripple');

    const existing = button.querySelector('.ripple');
    if (existing) existing.remove();

    button.appendChild(circle);
    setTimeout(() => circle.remove(), 600);
  }
}
