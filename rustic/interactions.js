(() => {
  'use strict';

  const root = document.documentElement;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const introBootstrap = window.__weddingEnvelopeIntro;
  const introListeners = [];
  let introTimer;

  function finishIntro() {
    clearTimeout(introTimer);
    introBootstrap?.cancel?.();
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
      // The same cover sheet leaves the envelope. Input always skips the flourish.
      const elapsed = performance.now() - (introBootstrap?.started ?? performance.now());
      introTimer = setTimeout(finishIntro, Math.max(0, Math.min(1750, 1900 - elapsed)));
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

  const foldSection = document.querySelector('.invitation-section');
  const paper = document.querySelector('.paper-fold');
  const printStage = document.querySelector('.print-stage');
  const print = printStage?.querySelector('.moment');
  if (!foldSection || !paper || !printStage || !print) return;

  let enabled = false;
  let frame = 0;
  let layoutDirty = true;
  let viewportHeight = 0;
  let foldTop = 0;
  let printTop = 0;
  let lastFold = -1;
  let lastPrint = -1;
  const foldProperties = ['--fold-upper', '--fold-lower', '--fold-shade', '--crease-opacity', '--fold-shadow-y', '--fold-shadow-blur', '--fold-shadow-opacity'];
  const printProperties = ['--print-y', '--print-rotation', '--print-shadow-y', '--print-shadow-blur', '--print-shadow-opacity'];

  function clearMotion() {
    cancelAnimationFrame(frame);
    frame = 0;
    foldProperties.forEach(property => paper.style.removeProperty(property));
    printProperties.forEach(property => print.style.removeProperty(property));
    lastFold = lastPrint = -1;
  }

  const clamp = value => Math.min(1, Math.max(0, value));
  const ease = value => value * value * (3 - 2 * value);

  function update() {
    frame = 0;
    if (!enabled || document.hidden) return;
    const scrollY = window.scrollY;
    if (layoutDirty) {
      viewportHeight = window.innerHeight;
      // Measure untransformed normal-flow parents, never animated surfaces.
      foldTop = foldSection.getBoundingClientRect().top + scrollY;
      printTop = printStage.getBoundingClientRect().top + scrollY;
      layoutDirty = false;
    }
    const fold = 1 - ease(clamp((viewportHeight * .9 - (foldTop - scrollY)) / (viewportHeight * .66)));
    const settle = 1 - ease(clamp((viewportHeight * .96 - (printTop - scrollY)) / (viewportHeight * .5)));

    if (Math.abs(fold - lastFold) > .001) {
      paper.style.setProperty('--fold-upper', `${(-14 * fold).toFixed(2)}deg`);
      paper.style.setProperty('--fold-lower', `${(18 * fold).toFixed(2)}deg`);
      paper.style.setProperty('--fold-shade', (.035 + fold * .14).toFixed(3));
      paper.style.setProperty('--crease-opacity', (.35 + fold * .55).toFixed(3));
      paper.style.setProperty('--fold-shadow-y', `${(4 + fold * 11).toFixed(1)}px`);
      paper.style.setProperty('--fold-shadow-blur', `${(12 + fold * 15).toFixed(1)}px`);
      paper.style.setProperty('--fold-shadow-opacity', (.05 + fold * .07).toFixed(3));
      lastFold = fold;
    }
    if (Math.abs(settle - lastPrint) > .001) {
      print.style.setProperty('--print-y', `${(18 * settle).toFixed(2)}px`);
      print.style.setProperty('--print-rotation', `${(-3.4 * settle).toFixed(2)}deg`);
      print.style.setProperty('--print-shadow-y', `${(3 + settle * 9).toFixed(1)}px`);
      print.style.setProperty('--print-shadow-blur', `${(8 + settle * 15).toFixed(1)}px`);
      print.style.setProperty('--print-shadow-opacity', (.06 + settle * .07).toFixed(3));
      lastPrint = settle;
    }
  }

  function schedule(measure = false) {
    if (measure) layoutDirty = true;
    if (enabled && !document.hidden && !frame) frame = requestAnimationFrame(update);
  }

  function selectMotion() {
    enabled = root.dataset.design === 'letter' && !motion.matches;
    clearMotion();
    if (enabled) schedule(true);
  }

  window.addEventListener('scroll', () => schedule(), { passive: true });
  window.addEventListener('resize', () => schedule(true), { passive: true });
  window.addEventListener('pageshow', event => {
    if (event.persisted) finishIntro();
    schedule(true);
  });
  window.addEventListener('pagehide', () => { finishIntro(); clearMotion(); });
  document.addEventListener('wedding:designchange', () => { finishIntro(); selectMotion(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { finishIntro(); clearMotion(); }
    else schedule(true);
  });
  const onMotionChange = () => { if (motion.matches) finishIntro(); selectMotion(); };
  if (motion.addEventListener) motion.addEventListener('change', onMotionChange);
  else motion.addListener?.(onMotionChange);

  // Fonts and images can move a section after first layout; no animation loop runs at rest.
  document.fonts?.ready.then(() => schedule(true));
  document.fonts?.addEventListener?.('loadingdone', () => schedule(true));
  document.querySelectorAll('.hero--letter img, .moments-section img').forEach(image => {
    if (!image.complete) image.addEventListener('load', () => schedule(true), { once: true });
  });
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => schedule(true));
    [document.querySelector('.hero--letter'), foldSection, printStage].forEach(element => {
      if (element) observer.observe(element);
    });
  }
  selectMotion();
})();
