import { $, isReducedMotion, lerp } from '../utils/helpers.js';

export class CursorGlow {
  constructor() {
    if (isReducedMotion() || window.innerWidth < 768) return;
    
    this.cursor = $('#cursor-glow');
    if (!this.cursor) return;

    this.mouseX = window.innerWidth / 2;
    this.mouseY = window.innerHeight / 2;
    this.cursorX = this.mouseX;
    this.cursorY = this.mouseY;
    
    this.bindEvents();
    this.render();
  }

  bindEvents() {
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    }, { passive: true });
  }

  render = () => {
    // Lerp towards mouse
    this.cursorX = lerp(this.cursorX, this.mouseX, 0.15);
    this.cursorY = lerp(this.cursorY, this.mouseY, 0.15);
    
    this.cursor.style.transform = `translate3d(${this.cursorX}px, ${this.cursorY}px, 0) translate(-50%, -50%)`;
    
    requestAnimationFrame(this.render);
  }
}
