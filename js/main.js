import { CursorGlow } from './components/CursorGlow.js';
import { Spotlight } from './components/Spotlight.js';
import { MagneticButton } from './components/MagneticButton.js';
import { Ripple } from './components/Ripple.js';
import { FAQ } from './components/FAQ.js';
import { Validation } from './components/Validation.js';
import { Auth } from './components/Auth.js';
import { ScrollEngine } from './core/ScrollEngine.js';
import { ScrollReveal } from './core/ScrollReveal.js';
import { PageTransition } from './core/PageTransition.js';
import { $ } from './utils/helpers.js';

class App {
  constructor() {
    this.init();
  }

  init() {
    // ── Splash: runs on EVERY load, refresh (F5), and back-navigation ──
    const runSplash = () => {
      document.body.classList.add('loaded');
      const splash = document.getElementById('splash-screen');
      if (!splash) return;

      // 1. Make sure splash is fully visible (clears any leftover .hide from prev session)
      splash.classList.remove('hide');

      // 2. Remove .animate so we can reset the animation to its start state
      splash.classList.remove('animate');

      // 3. Force browser to recalculate layout — this is what makes the restart work
      //    Without this, toggling the class has no effect
      void splash.offsetWidth;

      // 4. Add .animate — this STARTS all CSS animations from 0ms freshly
      splash.classList.add('animate');

      // 5. Hide splash after the full sequence completes
      //    H: 1.4s | Last letter (--i:7): 0.9s + 7×80ms delay + 0.55s anim ≈ 2.01s
      //    Hold 0.65s → hide at 2650ms
      clearTimeout(window._splashTimer);
      window._splashTimer = setTimeout(() => splash.classList.add('hide'), 2650);
    };

    // Fires on fresh load, refresh, or immediately if already loaded
    if (document.readyState === 'complete') {
      runSplash();
    } else {
      window.addEventListener('load', runSplash);
    }

    // Fires on browser Back/Forward navigation (bfcache — 'load' does NOT fire here)
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
        clearTimeout(window._splashTimer);
        runSplash();
      }
    });

    // Initialize all ES6 Modules
    try {
      new PageTransition();
      new CursorGlow();
      new Spotlight();
      new MagneticButton();
      new Ripple();
      new FAQ();
      new Validation();
      new Auth();
      new ScrollEngine();
      new ScrollReveal();

      console.log('Himanshi Streaming Platform Loaded. 🚀 16 Features Active.');
    } catch (e) {
      console.error('Error initializing components:', e);
    }
  }
}

// Bootstrap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new App();
  });
} else {
  new App();
}
