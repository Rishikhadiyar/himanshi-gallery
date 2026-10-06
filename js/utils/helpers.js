/**
 * UTILS & HELPERS
 */

// Math
export const lerp = (start, end, factor) => start + (end - start) * factor;

// Performance
export const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

export const debounce = (func, delay) => {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
};

// DOM Query Helpers
export const $ = (selector, parent = document) => parent.querySelector(selector);
export const $$ = (selector, parent = document) => document.querySelectorAll(selector);

// Accessibility
export const isReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Device & Pointer detection
export const isTouchDevice = () => !window.matchMedia('(hover: hover) and (pointer: fine)').matches;
