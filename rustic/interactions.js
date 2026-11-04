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
      }, { threshold: .15, rootMargin: '0px 0px -36px 0px' });
      textTargets.forEach(element => {
        const fragment = document.createDocumentFragment();
        let lineIndex = 0;
        let ink;
        const addLine = () => {
          const line = document.createElement('span');
          line.className = 'reveal-line';
          ink = document.createElement('span');
          ink.className = 'reveal-line__ink';
          ink.style.setProperty('--line-delay', `${lineIndex++ * 170}ms`);
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
  const story = document.getElementById('promise-story');
  const stage = story?.querySelector('.letter-stage');
  let enabled = false;
  let frame = 0;
  let layoutDirty = true;
  let viewportHeight = 0;
  let foldTop = 0;
  let printTop = 0;
  let storyTop = 0;
  let storyHeight = 0;
  let storyTravel = 1;
  let storyAnimated = false;
  let lastFold = -1;
  let lastPrint = -1;
  let lastStory = -1;
  const foldProperties = ['--fold-upper', '--fold-lower', '--fold-shade', '--crease-opacity', '--fold-shadow-y', '--fold-shadow-blur', '--fold-shadow-opacity'];
  const printProperties = ['--print-y', '--print-rotation', '--print-scale', '--print-clip', '--print-shadow-y', '--print-shadow-blur', '--print-shadow-opacity'];
  const storyProperties = ['--heading-opacity', '--heading-y', '--grid-opacity', '--grid-angle', '--grid-scale', '--envelope-x', '--envelope-y', '--envelope-angle', '--envelope-opacity', '--photo-x', '--photo-y', '--photo-angle', '--photo-scale', '--photo-clip', '--photo-shadow-y', '--photo-shadow-blur', '--backing-opacity', '--backing-y', '--backing-left', '--backing-right', '--line-one-opacity', '--line-one-y', '--line-two-opacity', '--line-two-y', '--hint-opacity', '--story-progress'];

  function clearProperties(element, properties) {
    if (element) properties.forEach(property => element.style.removeProperty(property));
  }

  function clearMotion() {
    cancelAnimationFrame(frame);
    frame = 0;
    clearProperties(paper, foldProperties);
    clearProperties(print, printProperties);
    lastFold = lastPrint = lastStory = -1;
  }

  const clamp = value => Math.min(1, Math.max(0, value));
  const ease = value => value * value * (3 - 2 * value);
  const phase = (start, end, value) => ease(clamp((value - start) / (end - start)));

  function selectStory() {
    const next = Boolean(story && stage && enabled && window.innerHeight >= 640 && window.CSS?.supports?.('overflow', 'clip'));
    if (next !== storyAnimated || !next) {
      storyAnimated = next;
      story?.classList.toggle('is-animated', next);
      clearProperties(story, storyProperties);
      lastStory = -1;
      layoutDirty = true;
    }
  }

  function updateStory(progress) {
    const pull = phase(.08, .48, progress);
    const release = phase(.18, .69, progress);
    const settle = phase(.45, .78, progress);
    const headingOut = phase(.10, .32, progress);
    const lineOne = phase(.55, .70, progress);
    const lineTwo = phase(.70, .87, progress);
    const diagonal = Math.sin(pull * Math.PI);
    const values = {
      '--heading-opacity': (1 - headingOut).toFixed(3),
      '--heading-y': `${(-headingOut * 28).toFixed(1)}px`,
      '--grid-opacity': (.52 * (1 - phase(.30, .62, progress))).toFixed(3),
      '--grid-angle': `${(-release * 6).toFixed(2)}deg`,
      '--grid-scale': (1 + release * .045).toFixed(3),
      '--envelope-x': `${(release * 120).toFixed(1)}px`,
      '--envelope-y': `${(release * 180).toFixed(1)}px`,
      '--envelope-angle': `${(-6 + release * 28).toFixed(2)}deg`,
      '--envelope-opacity': (1 - phase(.48, .72, progress)).toFixed(3),
      '--photo-x': `${(diagonal * 30 * (1 - settle)).toFixed(1)}px`,
      '--photo-y': `${(65 - pull * 140 + settle * 75).toFixed(1)}px`,
      '--photo-angle': `${(-5 * (1 - settle) + diagonal * 14).toFixed(2)}deg`,
      '--photo-scale': (.72 + pull * .30 - settle * .02).toFixed(3),
      '--photo-clip': `${(38 * (1 - pull)).toFixed(1)}%`,
      '--photo-shadow-y': `${(7 + diagonal * 10 + settle * 3).toFixed(1)}px`,
      '--photo-shadow-blur': `${(18 + diagonal * 18 + settle * 4).toFixed(1)}px`,
      '--backing-opacity': phase(.25, .55, progress).toFixed(3),
      '--backing-y': `${(30 * (1 - settle)).toFixed(1)}px`,
      '--backing-left': `${(-14 + settle * 11).toFixed(2)}deg`,
      '--backing-right': `${(12 - settle * 10).toFixed(2)}deg`,
      '--line-one-opacity': lineOne.toFixed(3),
      '--line-one-y': `${(110 * (1 - lineOne)).toFixed(1)}%`,
      '--line-two-opacity': lineTwo.toFixed(3),
      '--line-two-y': `${(110 * (1 - lineTwo)).toFixed(1)}%`,
      '--hint-opacity': (1 - phase(.03, .18, progress)).toFixed(3),
      '--story-progress': progress.toFixed(4)
    };
    Object.entries(values).forEach(([property, value]) => story.style.setProperty(property, value));
  }

  function update() {
    frame = 0;
    if (!enabled || document.hidden) return;
    const scrollY = window.scrollY;
    if (layoutDirty) {
      selectStory();
      viewportHeight = window.innerHeight;
      // Only untransformed parents are measured; the paper remains in normal flow.
      if (foldSection && paper) foldTop = foldSection.getBoundingClientRect().top + scrollY;
      if (printStage && print) printTop = printStage.getBoundingClientRect().top + scrollY;
      if (story && stage) {
        storyTop = story.getBoundingClientRect().top + scrollY;
        storyHeight = story.offsetHeight;
        storyTravel = Math.max(1, storyHeight - stage.offsetHeight);
      }
      layoutDirty = false;
    }
    if (storyAnimated && storyTop - scrollY < viewportHeight && storyTop + storyHeight - scrollY > 0) {
      const progress = clamp((scrollY - storyTop + 64) / storyTravel);
      if (Math.abs(progress - lastStory) > .0005) {
        updateStory(progress);
        lastStory = progress;
      }
    }
    if (paper && foldSection) {
      const fold = 1 - ease(clamp((viewportHeight * .9 - (foldTop - scrollY)) / (viewportHeight * .66)));
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
    }
    if (print && printStage) {
      const settle = 1 - ease(clamp((viewportHeight * .94 - (printTop - scrollY)) / (viewportHeight * .52)));
      if (Math.abs(settle - lastPrint) > .001) {
        print.style.setProperty('--print-y', `${(48 * settle).toFixed(2)}px`);
        print.style.setProperty('--print-rotation', `${(-7.5 * settle).toFixed(2)}deg`);
        print.style.setProperty('--print-scale', (1 - .08 * settle).toFixed(3));
        print.style.setProperty('--print-clip', `${(16 * settle).toFixed(1)}%`);
        print.style.setProperty('--print-shadow-y', `${(3 + settle * 12).toFixed(1)}px`);
        print.style.setProperty('--print-shadow-blur', `${(8 + settle * 20).toFixed(1)}px`);
        print.style.setProperty('--print-shadow-opacity', (.06 + settle * .09).toFixed(3));
        lastPrint = settle;
      }
    }
  }

  function schedule(measure = false) {
    if (measure) layoutDirty = true;
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

  // Optional sections never prevent cleanup, preferences, or navigation listeners.
  document.fonts?.ready.then(() => schedule(true));
  document.fonts?.addEventListener?.('loadingdone', () => schedule(true));
  document.querySelectorAll('.hero--letter img, .letter-story img, .moments-section img').forEach(image => {
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
