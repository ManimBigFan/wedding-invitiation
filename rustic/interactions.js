(() => {
  'use strict';

  // The opening is immediate. Only content entering the viewport is animated.
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
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
    if (motion.matches) revealAll();
  });
})();
