import { $ } from '../utils/helpers.js';

export class Validation {
  constructor() {
    this.bindEvents();
  }

  bindEvents() {
    const heroBtn = $('#get-started-btn');
    if (heroBtn) heroBtn.addEventListener('click', () => this.validateAndSubmit('hero-email', 'get-started-btn'));

    const faqBtn = $('#faq-get-started-btn');
    if (faqBtn) faqBtn.addEventListener('click', () => this.validateAndSubmit('faq-email', 'faq-get-started-btn'));
  }

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  showError(input, msg) {
    this.clearInputState(input);
    input.classList.add('input-error-state');
    
    input.classList.remove('shake');
    void input.offsetWidth; 
    input.classList.add('shake');

    const err = document.createElement('p');
    err.className = 'input-error';
    err.setAttribute('role', 'alert');
    err.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14" style="margin-right:4px; vertical-align:middle;"><path fill-rule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm-.5-4.5a1 1 0 112 0 1 1 0 01-2 0zm1-2a.5.5 0 00.5-.5v-4a.5.5 0 00-1 0v4a.5.5 0 00.5.5z" clip-rule="evenodd"/></svg>${msg}`;
    input.parentNode.appendChild(err);
  }

  showSuccess(input, button) {
    this.clearInputState(input);
    input.classList.add('input-success-state');
    
    const originalText = button.innerHTML;
    button.classList.add('btn-success-state');
    button.innerHTML = `Success <svg viewBox="0 0 24 24" fill="none" width="20" height="20" style="margin-left:4px;"><path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    
    setTimeout(() => {
      button.classList.remove('btn-success-state');
      button.innerHTML = originalText;
      input.value = '';
      this.clearInputState(input);
    }, 3000);
  }

  clearInputState(input) {
    input.classList.remove('input-error-state', 'input-success-state', 'shake');
    const existing = input.parentNode.querySelector('.input-error');
    if (existing) existing.remove();
  }

  validateAndSubmit(inputId, btnId) {
    const input = $(`#${inputId}`);
    const btn = $(`#${btnId}`);
    if(!input || !btn) return;

    const email = input.value.trim();

    if (!email) {
      this.showError(input, 'Email is required.');
      return;
    }
    if (!this.isValidEmail(email)) {
      this.showError(input, 'Please enter a valid email address.');
      return;
    }

    this.showSuccess(input, btn);
    
    // Redirect to profile choosing screen after success animation
    setTimeout(() => {
      window.dispatchEvent(new Event('show-profiles'));
    }, 1000);
  }
}
