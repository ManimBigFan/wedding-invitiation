(() => {
  'use strict';

  const root = document.documentElement;
  const hero = document.querySelector('.hero--letter');
  const card = document.getElementById('letter-card');
  const intro = document.getElementById('envelope-intro');
  const openButton = document.getElementById('open-envelope');
  const skipButton = document.getElementById('skip-envelope');
  const replayButton = document.getElementById('replay-envelope');
  const title = document.getElementById('letter-title');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const sessionKey = 'rustic-letter-opened-v1';
  let opened = false;
  let opening = false;
  let openingTimer;

  try { opened = sessionStorage.getItem(sessionKey) === 'true'; } catch { /* Session memory is optional. */ }

  function finishOpening(focus = false, remember = true) {
    clearTimeout(openingTimer);
    const wasOpening = opening;
    opening = false;
    hero.classList.remove('is-sealed', 'is-opening');
    intro.hidden = true;
    card.inert = false;
    card.removeAttribute('aria-hidden');
    openButton.disabled = false;
    openButton.setAttribute('aria-expanded', 'true');
    replayButton.hidden = false;
    if (remember) {
      opened = true;
      try { sessionStorage.setItem(sessionKey, 'true'); } catch { /* Keep the current visit usable. */ }
    }
    if (wasOpening && !motion.matches && root.dataset.design === 'letter') {
      card.classList.add('just-opened');
    }
    if (focus && root.dataset.design === 'letter') title.focus({ preventScroll: true });
  }

  function sealEnvelope(focus = false) {
    clearTimeout(openingTimer);
    opening = false;
    card.classList.remove('just-opened');
    hero.classList.remove('is-opening');
    hero.classList.add('is-sealed');
    intro.hidden = false;
    card.inert = true;
    card.setAttribute('aria-hidden', 'true');
    replayButton.hidden = true;
    openButton.disabled = false;
    openButton.setAttribute('aria-expanded', 'false');
    if (focus) openButton.focus({ preventScroll: true });
  }

  function openEnvelope() {
    if (opening) return;
    if (motion.matches) { finishOpening(true); return; }
    opening = true;
    openButton.disabled = true;
    hero.classList.add('is-opening');
    // A timer also completes the interaction if animation events are interrupted.
    openingTimer = setTimeout(() => finishOpening(true), 900);
  }

  function syncDesign() {
    if (root.dataset.design !== 'letter') {
      finishOpening(false, opening);
    } else if (!opened && (!location.hash || location.hash === '#top')) {
      sealEnvelope();
    } else {
      finishOpening(false, false);
    }
  }

  openButton.addEventListener('click', openEnvelope);
  skipButton.addEventListener('click', () => finishOpening(true));
  replayButton.addEventListener('click', () => {
    sealEnvelope(true);
    hero.scrollIntoView({ block: 'start', behavior: motion.matches ? 'instant' : 'smooth' });
  });
  document.addEventListener('wedding:designchange', syncDesign);
  window.addEventListener('hashchange', () => {
    if (location.hash && location.hash !== '#top') finishOpening(false, false);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && opening) finishOpening(false);
  });
  syncDesign();

  const revealTargets = [...document.querySelectorAll('.invitation-section > *, .moments-section > *, .date-section > *, .location-section > *, .closing > *')];
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
        if (target) { target.classList.add('is-revealed'); observer.unobserve(target); }
      });
    } catch { revealAll(); }
  }
  function adaptMotion() {
    if (!motion.matches) return;
    revealAll();
    if (opening) finishOpening(true);
  }
  motion.addEventListener?.('change', adaptMotion);
})();
