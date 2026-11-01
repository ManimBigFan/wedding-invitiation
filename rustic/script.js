(() => {
  'use strict';

  const designs = ['letter', 'photo', 'emboss'];
  const links = [...document.querySelectorAll('[data-design-link]')];
  const toast = document.getElementById('toast');
  let toastTimer;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3500);
  }

  function applyDesign(design, scroll = false) {
    const selected = designs.includes(design) ? design : 'letter';
    document.documentElement.dataset.design = selected;
    links.forEach(link => {
      if (link.dataset.designLink === selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (scroll) window.scrollTo({ top: 0, behavior: 'instant' });
  }

  applyDesign(new URLSearchParams(location.search).get('design'));
  links.forEach(link => link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const url = new URL(location.href);
    url.searchParams.set('design', link.dataset.designLink);
    url.hash = '';
    history.pushState(null, '', url);
    applyDesign(link.dataset.designLink, true);
  }));
  window.addEventListener('popstate', () => applyDesign(new URLSearchParams(location.search).get('design')));

  async function copyText(text, successMessage) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const field = document.createElement('textarea');
        field.value = text;
        field.setAttribute('readonly', '');
        field.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        if (!copied) throw new Error('Copy unavailable');
      }
      showToast(successMessage);
    } catch {
      showToast('복사가 지원되지 않아 내용을 표시합니다.');
      window.prompt('아래 내용을 길게 눌러 복사해 주세요.', text);
    }
  }

  document.getElementById('copy-address').addEventListener('click', () => {
    copyText(document.getElementById('venue-address').textContent.trim(), '예식장 주소를 복사했습니다.');
  });

  document.getElementById('share-invitation').addEventListener('click', async () => {
    const url = new URL(location.href);
    url.hash = '';
    const data = { title: '이기훈 · 한승미의 결혼식에 초대합니다', text: '2027년 3월 28일 일요일 오전 11시 30분 · 더채플앳청담', url: url.href };
    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }
    await copyText(url.href, '청첩장 링크를 복사했습니다.');
  });

  const weddingDate = new Date('2027-03-28T11:30:00+09:00');
  const countdown = document.getElementById('countdown');
  function updateCountdown() {
    const now = new Date();
    const weddingDay = Date.UTC(2027, 2, 28);
    const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const getPart = type => Number(localDate.find(part => part.type === type).value);
    const today = Date.UTC(getPart('year'), getPart('month') - 1, getPart('day'));
    const days = Math.round((weddingDay - today) / 86400000);
    if (days > 0) countdown.innerHTML = `기훈과 승미의 결혼식까지 <strong>${days}</strong>일`;
    else if (days === 0) countdown.textContent = '오늘, 저희 결혼합니다.';
    else countdown.textContent = '함께해 주셔서 감사합니다.';
  }
  updateCountdown();
  setInterval(updateCountdown, 60000);

  function icsDate(date) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }
  function foldCalendarLine(line) {
    const encoder = new TextEncoder();
    let result = '', width = 0;
    for (const character of line) {
      const length = encoder.encode(character).length;
      if (width + length > 75) { result += '\r\n '; width = 1; }
      result += character;
      width += length;
    }
    return result;
  }
  document.getElementById('save-calendar').addEventListener('click', () => {
    const calendar = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gihun and Seungmi//Wedding Invitation//KO', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT', 'UID:gihun-seungmi-20270328@wedding-invitation', `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(weddingDate)}`,
      'SUMMARY:이기훈 · 한승미 결혼식', 'LOCATION:더채플앳청담 - 서울특별시 강남구 선릉로 757',
      'DESCRIPTION:2027년 3월 28일 일요일 오전 11시 30분\\n더채플앳청담', 'END:VEVENT', 'END:VCALENDAR', ''
    ].map(foldCalendarLine).join('\r\n');
    const url = URL.createObjectURL(new Blob([calendar], { type: 'text/calendar;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'gihun-seungmi-wedding.ics';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    showToast('일정 파일을 열어 캘린더에 추가해 주세요.');
  });

  const dialog = document.getElementById('photo-dialog');
  const openPhoto = document.getElementById('open-photo');
  const closePhoto = document.getElementById('close-photo');
  let previousOverflow = '';

  openPhoto.addEventListener('click', () => {
    if (typeof dialog.showModal !== 'function') {
      window.open(openPhoto.querySelector('img').src, '_blank', 'noopener');
      return;
    }
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    closePhoto.focus();
  });
  closePhoto.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow;
    openPhoto.focus({ preventScroll: true });
  });
})();
