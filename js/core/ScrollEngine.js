import { $, $$, lerp, isReducedMotion } from '../utils/helpers.js';

export class ScrollEngine {
  constructor() {
    this.targetScroll = window.scrollY;
    this.currentScroll = window.scrollY;
    this.isTicking = false;
    this.mouseX = 0; 
    this.mouseY = 0;
    this.targetMouseX = 0; 
    this.targetMouseY = 0;

    this.heroBg = $('.hero-bg');
    this.lightRays = $('.hero-light-rays');
    this.heroContent = $('.hero-content');
    this.navbar = $('.navbar');
    this.progressBar = $('#scroll-progress');
    this.scrollTopBtn = $('#scroll-top');
    this.mediaContainers = $$('.feature-media');
    this.cachedMedia = [];

    this.init();
  }

  init() {
    window.addEventListener('scroll', this.onScroll, { passive: true });
    
    if (!isReducedMotion()) {
      window.addEventListener('mousemove', this.onMouseMove, { passive: true });
      window.addEventListener('resize', this.updateMediaMetrics, { passive: true });
      this.updateMediaMetrics();
    }

    if (this.scrollTopBtn) {
      this.scrollTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    this.onScroll(); // Kickstart
  }

  updateMediaMetrics = () => {
    if (!this.mediaContainers || this.mediaContainers.length === 0) return;
    const scrollY = window.scrollY;
    this.cachedMedia = this.mediaContainers.map(container => {
      const rect = container.getBoundingClientRect();
      const wrapper = container.querySelector('.media-tilt-wrapper');
      return {
        wrapper,
        docTop: rect.top + scrollY,
        left: rect.left,
        width: rect.width,
        height: rect.height
      };
    });
  }

  onScroll = () => {
    this.targetScroll = window.scrollY;
    
    // Progress Bar
    if (this.progressBar) {
      const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrolled = (winScroll / height) * 100;
      this.progressBar.style.width = scrolled + "%";
    }

    // Scroll to top button
    if (this.scrollTopBtn) {
      if (this.targetScroll > window.innerHeight) {
        this.scrollTopBtn.classList.add('visible');
      } else {
        this.scrollTopBtn.classList.remove('visible');
      }
    }

    // Navbar Glass
    if (this.navbar) {
      if (this.targetScroll > 60) {
        this.navbar.classList.add('scrolled');
      } else {
        this.navbar.classList.remove('scrolled');
      }
    }

    if (!this.isTicking) {
      requestAnimationFrame(this.render);
      this.isTicking = true;
    }
  }

  onMouseMove = (e) => {
    this.targetMouseX = (e.clientX / window.innerWidth) * 2 - 1;
    this.targetMouseY = (e.clientY / window.innerHeight) * 2 - 1;
    if (!this.isTicking) {
      requestAnimationFrame(this.render);
      this.isTicking = true;
    }
  }

  render = () => {
    this.currentScroll = lerp(this.currentScroll, this.targetScroll, 0.08);
    this.mouseX = lerp(this.mouseX, this.targetMouseX, 0.05);
    this.mouseY = lerp(this.mouseY, this.targetMouseY, 0.05);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    
    if (!isReducedMotion()) {
      // 1. Hero Content
      if (this.currentScroll < vh * 1.5) {
        if(this.heroContent) {
          const progress = Math.min(1, Math.max(0, this.currentScroll / (vh * 0.75)));
          const opacity = 1 - (progress * 1.5);
          const scale = 1 - (progress * 0.1);
          const y = this.currentScroll * 0.4;
          
          this.heroContent.style.opacity = Math.max(0, opacity);
          this.heroContent.style.transform = `translate3d(0, ${y}px, 0) scale(${scale})`;
          this.heroContent.style.filter = progress > 0 ? `blur(${progress * 15}px)` : `blur(0)`;
        }

        if(this.heroBg) {
          const bgY = this.currentScroll * 0.25;
          const panX = this.mouseX * -20; 
          const panY = this.mouseY * -20;
          this.heroBg.style.transform = `translate3d(${panX}px, ${bgY + panY}px, 0) scale(1.05)`;
        }
        
        if(this.lightRays) {
          this.lightRays.style.transform = `translate3d(0, ${this.currentScroll * 0.15}px, 0)`;
          this.lightRays.style.opacity = Math.max(0, 0.5 - (this.currentScroll / vh));
        }
      }

      // 2. Feature Media 3D Tilt (using cached metrics to avoid layout reflows)
      if (this.cachedMedia && this.cachedMedia.length > 0) {
        this.cachedMedia.forEach(item => {
          const top = item.docTop - this.currentScroll;
          const bottom = top + item.height;
          // Only compute if in viewport
          if (top < vh && bottom > 0 && item.wrapper) {
            const centerX = item.left + item.width / 2;
            const centerY = top + item.height / 2;
            const distX = (this.mouseX * (vw / 2)) + (vw / 2) - centerX;
            const distY = (this.mouseY * (vh / 2)) + (vh / 2) - centerY;
            const distance = Math.sqrt(distX * distX + distY * distY);
            if (distance < 800) {
              const tiltX = (distY / 800) * -15; // Max 15deg
              const tiltY = (distX / 800) * 15;
              item.wrapper.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.02, 1.02, 1.02)`;
            } else {
              item.wrapper.style.transform = `translateZ(0)`;
            }
          }
        });
      }
    }

    if (Math.abs(this.targetScroll - this.currentScroll) > 0.5 || Math.abs(this.targetMouseX - this.mouseX) > 0.01) {
      requestAnimationFrame(this.render);
    } else {
      this.isTicking = false;
    }
  }
}
