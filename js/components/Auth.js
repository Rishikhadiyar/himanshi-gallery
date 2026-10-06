import { $, $$ } from '../utils/helpers.js';

export class Auth {
  constructor() {
    this.signinBtn = $('#signin-btn');
    this.authWrapper = $('#auth-wrapper');
    this.profilesScreen = $('#profiles-screen');
    this.profileItems = $$('.profile-item');
    this.pageTransition = $('#page-transition');
    
    this.bindEvents();
  }

  bindEvents() {
    if (this.signinBtn) {
      this.signinBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.showProfiles();
      });
    }

    if (this.profileItems) {
      this.profileItems.forEach(item => {
        item.addEventListener('click', () => {
          this.login(item);
        });
      });
    }

    // Listen for external trigger from email validation
    window.addEventListener('show-profiles', () => {
      this.showProfiles();
    });
  }

  showProfiles() {
    // 1. Fade to black
    this.pageTransition.classList.add('active');
    
    setTimeout(() => {
      // 2. Show profiles screen behind black
      this.profilesScreen.classList.remove('hidden');
      this.profilesScreen.classList.add('active');
      
      // 3. Fade from black
      setTimeout(() => {
        this.pageTransition.classList.remove('active');
      }, 30);
    }, 420); // Matches new 0.55s transition midpoint
  }

  login(profileItem) {
    const profileName = profileItem.querySelector('.profile-name').innerText;
    const avatarClass = profileItem.querySelector('.profile-avatar').className.split(' ')[1]; // profile-red, etc.

    // 1. Fade to black
    this.pageTransition.classList.add('active');

    setTimeout(() => {
      // 2. Hide profiles screen
      this.profilesScreen.classList.remove('active');
      
      setTimeout(() => {
        this.profilesScreen.classList.add('hidden');
      }, 400);

      // Redirect to Browse page after fade
      setTimeout(() => {
        window.location.href = 'browse.html';
      }, 30);

    }, 450); // Matches new transition duration
  }
}
