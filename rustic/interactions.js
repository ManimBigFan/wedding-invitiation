(() => {
  'use strict';

  const root = document.documentElement;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const introBootstrap = window.__weddingEnvelopeIntro;
  let introTimer;
  const introListeners = [];

  function finishIntro() {
    clearTimeout(introTimer);
    clearTimeout(introBootstrap?.timer);
    root.removeAttribute('data-auto-envelope');
    delete window.__weddingEnvelopeIntro;
    introListeners.splice(0).forEach(([target, type, callback, options]) => {
      target.removeEventListener(type, callback, options);
    });
  }

  function watchIntro(target, type, callback = finishIntro, options) {
    target.addEventListener(type, callback, options);
    introListeners.push([target, type, callback, options]);
  }

  if (root.hasAttribute('data-auto-envelope')) {
    if (motion.matches || root.dataset.design !== 'letter' ||
        (location.hash && location.hash !== '#top') || window.scrollY > 2 || document.hidden) {
      finishIntro();
    } else {
      // Play once on entry. Reading, navigating, or interacting always takes priority.
      // Start cleanup after styles and this script are ready, independent of network delay.
      clearTimeout(introBootstrap?.timer);
      introTimer = setTimeout(finishIntro, 1800);
      ['pointerdown', 'touchstart', 'wheel', 'scroll'].forEach(type => {
        watchIntro(window, type, finishIntro, { passive: true, capture: true });
      });
      watchIntro(window, 'keydown', finishIntro, true);
      watchIntro(document, 'focusin');
      watchIntro(document, 'wedding:designchange');
      watchIntro(window, 'hashchange');
      watchIntro(window, 'pagehide');
      watchIntro(document, 'visibilitychange', () => { if (document.hidden) finishIntro(); });
    }
  } else {
    finishIntro();
  }
  const revealTargets = [...document.querySelectorAll(
    '.invitation-section > *, .moments-section > *, .date-section > *, .location-section > *, .guest-photo-section > *, .closing > *'
  )];
  let observer;

  function revealAll() {
    observer?.disconnect();
    revealTargets.forEach(element => element.classList.add('is-revealed'));
  }

  if (!motion.matches && 'IntersectionObserver' in window) {
    try {
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
      revealTargets.forEach((element, index) => {
        element.style.setProperty('--reveal-delay', `${index % 3 * 45}ms`);
        element.classList.add('reveal-ready');
        observer.observe(element);
      });
      document.addEventListener('focusin', event => {
        const target = event.target.closest('.reveal-ready');
        if (target) {
          target.classList.add('is-revealed');
          observer.unobserve(target);
        }
      });
    } catch {
      revealAll();
    }
  }

  motion.addEventListener?.('change', () => {
    if (motion.matches) { finishIntro(); revealAll(); }
  });
})();
