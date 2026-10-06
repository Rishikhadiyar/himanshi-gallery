import { $$, isReducedMotion, lerp } from '../utils/helpers.js';

export class MagneticButton {
  constructor() {
    if (isReducedMotion() || window.innerWidth < 768) return;
    
    this.buttons = $$('.magnetic-btn');
    this.buttons.forEach(btn => this.initMagnetic(btn));
  }

  initMagnetic(btn) {
    let targetX = 0, targetY = 0, currentX = 0, currentY = 0;
    let isHovering = false;
    
    const update = () => {
      if (!isHovering && Math.abs(currentX) < 0.1 && Math.abs(currentY) < 0.1) {
        btn.style.transform = `translateZ(0)`;
        return;
      }
      
      currentX = lerp(currentX, targetX, 0.1);
      currentY = lerp(currentY, targetY, 0.1);
      btn.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
      requestAnimationFrame(update);
    };

    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      
      // Pull strength
      targetX = x * 0.2;
      targetY = y * 0.2;
      
      if (!isHovering) {
        isHovering = true;
        update();
      }
    });

    btn.addEventListener('mouseleave', () => {
      isHovering = false;
      targetX = 0;
      targetY = 0;
    });
  }
}
