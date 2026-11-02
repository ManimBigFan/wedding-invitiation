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

  // Readable HTML is the default. Only a working observer opts copy into reveals.
  const textTargets = [...document.querySelectorAll('.section h2, .invitation-copy, .moment-note, .guest-photo-copy, .closing__message')];
  const softTargets = [...document.querySelectorAll('.section .eyebrow, .signature, .closing__script, .closing__names')];
  let textObserver;
  function revealCopy() {
    textObserver?.disconnect();
    [...textTargets, ...softTargets].forEach(element => element.classList.add('is-revealed'));
  }
  if (!motion.matches && 'IntersectionObserver' in window) {
    try {
      textObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            textObserver.unobserve(entry.target);
          }
        });
      }, { threshold: .12, rootMargin: '0px 0px -28px 0px' });
      textTargets.forEach(element => {
        const fragment = document.createDocumentFragment();
        let lineIndex = 0;
        let ink;
        const addLine = () => {
          const line = document.createElement('span');
          line.className = 'reveal-line';
          ink = document.createElement('span');
          ink.className = 'reveal-line__ink';
          ink.style.setProperty('--line-delay', `${lineIndex++ * 110}ms`);
          line.append(ink);
          fragment.append(line);
        };
        addLine();
        [...element.childNodes].forEach(node => {
          if (node.nodeName === 'BR') addLine();
          else ink.append(node);
        });
        element.replaceChildren(fragment);
        element.classList.add('text-reveal');
        textObserver.observe(element);
        element.classList.add('is-reveal-ready');
      });
      softTargets.forEach(element => {
        element.classList.add('soft-reveal');
        textObserver.observe(element);
        element.classList.add('is-reveal-ready');
      });
      document.addEventListener('focusin', event => {
        event.target.closest?.('.is-reveal-ready')?.classList.add('is-revealed');
      });
    } catch { revealCopy(); }
  }

  const foldSection = document.querySelector('.invitation-section');
  const paper = document.querySelector('.paper-fold');
  const printStage = document.querySelector('.print-stage');
  const print = printStage?.querySelector('.moment');
  if (!foldSection || !paper || !printStage || !print) return;

  const story = document.getElementById('promise-story');
  const stage = story?.querySelector('.promise-stage');
  const canvas = document.getElementById('promise-canvas');
  const softwareCanvas = document.getElementById('promise-software');
  let renderer;
  let rendererKind = '';
  let webglFailed = false;
  let softwareFailed = false;
  let storyAnimated = false;
  let storyTop = 0;
  let storyHeight = 0;
  let storyTravel = 1;
  let lastStory = -1;
  let redrawStory = true;

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
  const phase = (start, end, value) => ease(clamp((value - start) / (end - start)));

  function failStory() {
    const failedKind = rendererKind;
    if (failedKind === 'webgl') webglFailed = true;
    else if (failedKind === 'canvas') softwareFailed = true;
    try { renderer?.dispose(); } catch { /* A lost context already released its buffers. */ }
    renderer = null;
    rendererKind = '';
    storyAnimated = false;
    story?.classList.remove('is-animated', 'is-rendered');
    story?.removeAttribute('style');
    story?.removeAttribute('data-renderer');
    if (failedKind === 'webgl' && !softwareFailed && root.dataset.design === 'letter') selectStory();
    schedule(true);
  }

  function selectStory() {
    if (!story || !stage || !canvas) return;
    story.removeAttribute('style');
    lastStory = -1;
    redrawStory = true;
    const selected = root.dataset.design === 'letter';
    if (selected && !renderer && !webglFailed) {
      try {
        renderer = window.WeddingRings?.create(canvas);
        if (renderer) rendererKind = 'webgl';
        else webglFailed = true;
      } catch { webglFailed = true; }
    }
    if (selected && !renderer && !softwareFailed && softwareCanvas) {
      try {
        renderer = window.WeddingRingsFallback?.create(softwareCanvas);
        if (renderer) rendererKind = 'canvas';
        else softwareFailed = true;
      } catch { softwareFailed = true; }
    }
    storyAnimated = Boolean(selected && enabled && renderer && window.CSS?.supports?.('overflow', 'clip'));
    story.classList.toggle('is-animated', storyAnimated);
    if (selected && renderer) {
      try {
        if (!renderer.render(storyAnimated ? 0 : 1)) { failStory(); return; }
        story.dataset.renderer = rendererKind;
        story.classList.add('is-rendered');
      } catch { failStory(); }
    }
  }

  canvas?.addEventListener('webglcontextlost', () => { if (rendererKind === 'webgl') failStory(); });

  function update() {
    frame = 0;
    if (!enabled || document.hidden) return;
    const scrollY = window.scrollY;
    if (layoutDirty) {
      viewportHeight = window.innerHeight;
      // Measure untransformed normal-flow parents, never animated surfaces.
      foldTop = foldSection.getBoundingClientRect().top + scrollY;
      printTop = printStage.getBoundingClientRect().top + scrollY;
      if (story && stage) {
        storyTop = story.getBoundingClientRect().top + scrollY;
        storyHeight = story.offsetHeight;
        storyTravel = Math.max(1, storyHeight - stage.offsetHeight);
        redrawStory = true;
      }
      layoutDirty = false;
    }
    if (storyAnimated && storyTop - scrollY < viewportHeight && storyTop + storyHeight - scrollY > 0) {
      const progress = clamp((scrollY - storyTop + 64) / storyTravel);
      if (redrawStory || Math.abs(progress - lastStory) > .0005) {
        const headingOut = phase(.13, .40, progress);
        const startOut = phase(.24, .49, progress);
        const endIn = phase(.62, .82, progress);
        story.style.setProperty('--story-heading-opacity', (1 - headingOut).toFixed(3));
        story.style.setProperty('--story-heading-y', `${(-headingOut * 28).toFixed(1)}px`);
        story.style.setProperty('--story-start-opacity', (1 - startOut).toFixed(3));
        story.style.setProperty('--story-start-y', `${(-startOut * 20).toFixed(1)}px`);
        story.style.setProperty('--story-end-opacity', endIn.toFixed(3));
        story.style.setProperty('--story-end-y', `${((1 - endIn) * 24).toFixed(1)}px`);
        story.style.setProperty('--story-hint-opacity', (1 - phase(.04, .22, progress)).toFixed(3));
        story.style.setProperty('--story-progress', progress.toFixed(4));
        story.style.setProperty('--story-shadow', (1 + Math.sin(progress * Math.PI) * .2).toFixed(3));
        try { if (!renderer.render(progress)) failStory(); }
        catch { failStory(); }
        lastStory = progress;
        redrawStory = false;
      }
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
    if (!storyAnimated && measure && renderer && root.dataset.design === 'letter' && !document.hidden) {
      try { if (!renderer.render(1)) failStory(); } catch { failStory(); }
    }
    if (enabled && !document.hidden && !frame) frame = requestAnimationFrame(update);
  }

  function selectMotion() {
    enabled = root.dataset.design === 'letter' && !motion.matches;
    clearMotion();
    selectStory();
    if (motion.matches) revealCopy();
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
    [document.querySelector('.hero--letter'), story, stage, foldSection, printStage].forEach(element => {
      if (element) observer.observe(element);
    });
  }
  selectMotion();
})();
