(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const dialog = byId('guest-upload-dialog');
  const form = byId('guest-upload-form');
  const openButton = byId('open-guest-upload');
  const closeButton = byId('close-guest-upload');
  const cancelButton = byId('cancel-guest-upload');
  const submitButton = byId('submit-guest-upload');
  const nameInput = byId('guest-name');
  const fileInput = byId('guest-files');
  const fileCount = byId('guest-file-count');
  const fileList = byId('guest-file-list');
  const status = byId('guest-upload-status');
  const progress = byId('guest-upload-progress');
  if (![dialog, form, openButton, closeButton, cancelButton, submitButton, nameInput,
    fileInput, fileCount, fileList, status, progress].every(Boolean)) return;

  const config = window.WEDDING_SNAP_CONFIG || {};
  const limits = {
    files: Math.min(Number(config.maxFiles) || 100, 100),
    fileBytes: Math.min(Number(config.maxFileBytes) || 80 * 1024 * 1024, 80 * 1024 * 1024),
    totalBytes: Math.min(Number(config.maxTotalBytes) || 1024 * 1024 * 1024, 1024 * 1024 * 1024),
  };
  let baseUrl = '';
  try {
    const url = new URL(config.apiBaseUrl);
    if (url.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname)) {
      baseUrl = url.href.replace(/\/$/, '');
    }
  } catch { /* Leave the form usable, but do not pretend an upload is available. */ }

  const extensionTypes = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif',
    bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm',
    avi: 'video/x-msvideo', mpeg: 'video/mpeg', mpg: 'video/mpeg',
    '3gp': 'video/3gpp', '3g2': 'video/3gpp2', mkv: 'video/x-matroska',
  };
  const allowedTypes = new Set(Object.values(extensionTypes));
  const previewTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']);
  const mimeAliases = { 'image/jpg': 'image/jpeg', 'video/avi': 'video/x-msvideo', 'video/m4v': 'video/x-m4v' };
  const deniedExtensions = new Set(['svg', 'svgz', 'html', 'htm', 'xhtml', 'xml', 'js', 'mjs']);
  let queue = [];
  let sequence = 0;
  let busy = false;
  let previousBodyOverflow = '';
  let focusReturn = openButton;

  function formatBytes(bytes) {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  function setStatus(message, state = 'info') {
    if (status.textContent !== message) status.textContent = message;
    if (status.dataset.state !== state) status.dataset.state = state;
  }

  function userError(message) {
    return Object.assign(new Error(message), { userMessage: message });
  }

  function responseError(httpStatus, body) {
    const code = String(body?.code || '').toUpperCase();
    if (code === 'ORIGIN_NOT_ALLOWED') {
      return userError('공유받으신 청첩장 주소를 브라우저에서 열고 다시 보내 주세요.');
    }
    if (httpStatus === 413 || /TOO_LARGE|SIZE_LIMIT/.test(code)) {
      return userError('파일이 너무 커서 보내지 못했어요. 파일당 80 MB 이하로 선택해 주세요.');
    }
    if (httpStatus === 415 || /UNSUPPORTED|INVALID_FILE_TYPE/.test(code)) {
      return userError('지원하지 않는 파일 형식이에요. 다른 사진이나 영상으로 선택해 주세요.');
    }
    if ([401, 403, 410].includes(httpStatus) || /EXPIRED|INVALID_TOKEN/.test(code)) {
      return userError('전송을 이어갈 수 있는 시간이 지났어요. 실패한 파일을 목록에서 뺀 뒤 다시 선택해 주세요.');
    }
    if (httpStatus === 429) return userError('잠시 요청이 많아요. 조금 뒤에 다시 올려 주세요.');
    if (httpStatus === 507 || /STORAGE_FULL|QUOTA/.test(code)) {
      return userError('지금은 사진을 받을 공간이 부족해요. 신랑·신부에게 알려 주세요.');
    }
    return userError('사진을 보내지 못했어요. 잠시 후 다시 올려 주세요.');
  }

  function connectionError() {
    return userError(navigator.onLine === false
      ? '인터넷 연결이 끊겼어요. 연결을 확인한 뒤 다시 올려 주세요.'
      : '연결이 원활하지 않아 보내지 못했어요. 연결을 확인한 뒤 다시 올려 주세요.');
  }

  function normalizedType(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    if (deniedExtensions.has(extension) || !Object.prototype.hasOwnProperty.call(extensionTypes, extension)) return null;
    let type = (file.type || '').toLowerCase().split(';')[0].trim();
    type = mimeAliases[type] || type;
    if (!type || type === 'application/octet-stream') type = extensionTypes[extension] || '';
    return allowedTypes.has(type) ? type : null;
  }

  function revokePreview(item) {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
      item.previewUrl = null;
    }
  }

  function pendingItems() {
    return queue.filter(item => item.state !== 'uploaded');
  }

  function updateControls() {
    const pending = pendingItems();
    const allocated = queue.some(item => item.id);
    nameInput.disabled = busy;
    // A retry must retain the name attached to the original upload session.
    nameInput.readOnly = allocated;
    fileInput.disabled = busy;
    closeButton.disabled = busy;
    cancelButton.disabled = busy;
    submitButton.disabled = busy || !pending.length || !baseUrl;
    submitButton.textContent = busy ? '보내는 중…'
      : pending.some(item => item.state === 'failed') ? '다시 올리기'
      : queue.length && !pending.length ? '전달 완료' : '올리기';
    form.setAttribute('aria-busy', String(busy));
    fileList.querySelectorAll('.guest-file-remove').forEach(button => {
      const item = queue.find(entry => String(entry.localId) === button.dataset.fileId);
      button.disabled = busy || item?.state === 'uploaded';
    });
  }

  function renderQueue() {
    const fragment = document.createDocumentFragment();
    queue.forEach(item => {
      const row = document.createElement('li');
      row.className = 'guest-file-item';
      row.dataset.state = item.state;
      let preview;
      if (item.previewUrl) {
        preview = document.createElement('img');
        preview.src = item.previewUrl;
        preview.alt = '';
        preview.loading = 'lazy';
        preview.addEventListener('error', () => {
          const fallback = document.createElement('span');
          fallback.className = 'guest-file-preview';
          fallback.textContent = '사진';
          preview.replaceWith(fallback);
          revokePreview(item);
        }, { once: true });
      } else {
        preview = document.createElement('span');
        preview.textContent = item.type.startsWith('video/') ? '영상' : '사진';
      }
      preview.className = 'guest-file-preview';
      const details = document.createElement('div');
      details.className = 'guest-file-details';
      const title = document.createElement('span');
      title.className = 'guest-file-name';
      title.textContent = item.file.name;
      title.title = item.file.name;
      const meta = document.createElement('span');
      meta.className = 'guest-file-meta';
      const stateLabel = {
        queued: '전송 대기', uploading: '보내는 중', uploaded: '전달 완료', failed: '전송 실패',
      }[item.state];
      meta.textContent = `${formatBytes(item.file.size)} · ${stateLabel}${item.error ? ` — ${item.error}` : ''}`;
      details.append(title, meta);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'guest-file-remove';
      remove.dataset.fileId = item.localId;
      remove.textContent = item.state === 'uploaded' ? '완료' : '빼기';
      remove.setAttribute('aria-label', item.state === 'uploaded'
        ? `${item.file.name} 전달 완료`
        : `${item.file.name} 선택 목록에서 빼기`);
      remove.disabled = busy || item.state === 'uploaded';
      row.append(preview, details, remove);
      fragment.append(row);
    });
    fileList.replaceChildren(fragment);
    const total = queue.reduce((sum, item) => sum + item.file.size, 0);
    const uploaded = queue.filter(item => item.state === 'uploaded').length;
    fileCount.textContent = queue.length
      ? `총 ${queue.length}개 · ${formatBytes(total)}${uploaded ? ` · ${uploaded}개 전달 완료` : ''}`
      : '선택한 파일이 없습니다.';
    updateControls();
  }

  function clearQueue() {
    queue.forEach(revokePreview);
    queue = [];
    fileInput.value = '';
    nameInput.value = '';
    nameInput.readOnly = false;
    nameInput.setCustomValidity('');
    nameInput.removeAttribute('aria-invalid');
    fileInput.removeAttribute('aria-invalid');
    progress.hidden = true;
    setStatus('');
    renderQueue();
  }

  fileInput.addEventListener('change', () => {
    if (busy) return;
    const files = [...fileInput.files];
    fileInput.value = '';
    let added = 0;
    let duplicates = 0;
    let total = queue.reduce((sum, item) => sum + item.file.size, 0);
    const errors = new Set();
    files.forEach(file => {
      const key = `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
      if (queue.some(item => item.key === key)) { duplicates += 1; return; }
      const type = normalizedType(file);
      if (!type) { errors.add('사진과 영상 파일만 선택해 주세요.'); return; }
      if (!file.size) { errors.add('내용이 없는 파일은 보낼 수 없어요.'); return; }
      if (file.size > limits.fileBytes) { errors.add('파일 하나의 크기는 80 MB 이하여야 해요.'); return; }
      if (queue.length >= limits.files) { errors.add('한 번에 최대 100개까지 선택할 수 있어요.'); return; }
      if (total + file.size > limits.totalBytes) { errors.add('선택한 파일의 전체 크기는 1 GB 이하여야 해요.'); return; }
      queue.push({
        localId: ++sequence, key, file, type, state: 'queued', error: '', loaded: 0,
        previewUrl: previewTypes.has(type) ? URL.createObjectURL(file) : null,
      });
      total += file.size;
      added += 1;
    });
    fileInput.setAttribute('aria-invalid', String(errors.size > 0 && !queue.length));
    progress.hidden = true;
    renderQueue();
    const messages = [];
    if (added) messages.push(`${added}개를 선택했어요. ‘올리기’를 누르면 전달됩니다.`);
    if (duplicates) messages.push(`이미 선택한 ${duplicates}개는 한 번만 담았어요.`);
    messages.push(...errors);
    if (messages.length) setStatus(messages.join(' '), errors.size ? 'error' : 'info');
  });

  fileList.addEventListener('click', event => {
    const button = event.target.closest('.guest-file-remove');
    if (!button || busy) return;
    const index = queue.findIndex(item => String(item.localId) === button.dataset.fileId);
    if (index < 0 || queue[index].state === 'uploaded') return;
    revokePreview(queue[index]);
    queue.splice(index, 1);
    renderQueue();
    progress.hidden = true;
    setStatus('선택 목록에서 파일을 뺐어요.');
    const nextButton = fileList.querySelectorAll('.guest-file-remove')[Math.min(index, queue.length - 1)];
    if (nextButton && !nextButton.disabled) nextButton.focus();
    else fileInput.focus();
  });

  nameInput.addEventListener('input', () => {
    nameInput.setCustomValidity('');
    nameInput.removeAttribute('aria-invalid');
  });

  function closeDialog() {
    if (busy) {
      setStatus('사진과 영상을 보내고 있어요. 완료될 때까지 잠시만 기다려 주세요.');
      return;
    }
    dialog.close();
  }

  openButton.addEventListener('click', () => {
    if (dialog.open) return;
    focusReturn = document.activeElement;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    if (!baseUrl) setStatus('사진을 보내는 기능을 준비하고 있어요. 잠시 후 다시 방문해 주세요.', 'error');
    requestAnimationFrame(() => {
      if (!nameInput.value) nameInput.focus({ preventScroll: true });
      else if (nameInput.readOnly) fileInput.focus({ preventScroll: true });
      else nameInput.focus({ preventScroll: true });
    });
  });
  closeButton.addEventListener('click', closeDialog);
  cancelButton.addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeDialog();
  });
  dialog.addEventListener('close', () => {
    document.body.style.overflow = previousBodyOverflow;
    if (queue.length && queue.every(item => item.state === 'uploaded')) clearQueue();
    if (focusReturn?.isConnected) focusReturn.focus({ preventScroll: true });
  });

  async function createSession(items, guestName) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${baseUrl}/api/upload-sessions`, {
        method: 'POST', credentials: 'omit', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestName, files: items.map(item => ({ name: item.file.name, type: item.type, size: item.file.size })) }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw responseError(response.status, body);
      if (!body || typeof body.token !== 'string' || !body.token || !Array.isArray(body.files)
        || body.files.length !== items.length || body.files.some(file => !file?.id || !file?.type)) {
        throw userError('전송 준비를 마치지 못했어요. 잠시 후 다시 올려 주세요.');
      }
      items.forEach((item, index) => {
        item.id = body.files[index].id;
        item.token = body.token;
        item.sessionId = body.sessionId;
        item.expiresAt = body.expiresAt;
        item.uploadType = body.files[index].type;
      });
    } catch (error) {
      throw error.userMessage ? error : connectionError();
    } finally {
      clearTimeout(timeout);
    }
  }

  function updateProgress() {
    const total = queue.reduce((sum, item) => sum + item.file.size, 0);
    const transferred = queue.reduce((sum, item) => sum + (item.state === 'uploaded'
      ? item.file.size : item.state === 'uploading' ? item.loaded : 0), 0);
    const completed = queue.filter(item => item.state === 'uploaded').length;
    progress.value = total ? Math.min(100, transferred / total * 100) : 0;
    progress.setAttribute('aria-valuetext', `${queue.length}개 중 ${completed}개 전달 완료`);
    setStatus(`사진·영상을 보내고 있어요. ${queue.length}개 중 ${completed}개 전달 완료. 창을 닫지 말고 잠시만 기다려 주세요.`);
  }

  function uploadFile(item) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `${baseUrl}/api/uploads/${encodeURIComponent(item.id)}`);
      xhr.setRequestHeader('Authorization', `Bearer ${item.token}`);
      xhr.setRequestHeader('Content-Type', item.uploadType || item.type);
      xhr.responseType = 'json';
      xhr.timeout = 15 * 60 * 1000;
      xhr.upload.addEventListener('progress', event => {
        if (event.lengthComputable) {
          item.loaded = Math.min(item.file.size, event.loaded);
          updateProgress();
        }
      });
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300 && (xhr.response?.status === 'uploaded' || xhr.response?.ok === true)) {
          resolve();
        } else {
          reject(responseError(xhr.status, xhr.response));
        }
      });
      xhr.addEventListener('error', () => reject(connectionError()));
      xhr.addEventListener('timeout', () => reject(userError('전송에 시간이 오래 걸려 멈췄어요. 연결을 확인한 뒤 다시 올려 주세요.')));
      xhr.addEventListener('abort', () => reject(userError('전송이 멈췄어요. 다시 올리기를 눌러 주세요.')));
      xhr.send(item.file);
    });
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    if (!baseUrl) {
      setStatus('사진을 보내는 기능을 준비하고 있어요. 잠시 후 다시 방문해 주세요.', 'error');
      return;
    }
    const guestName = nameInput.value.replace(/\s+/g, ' ').trim();
    if (!guestName || [...guestName].length > 40) {
      nameInput.setCustomValidity('성함 또는 닉네임을 40자 이내로 입력해 주세요.');
      nameInput.setAttribute('aria-invalid', 'true');
      nameInput.reportValidity();
      nameInput.focus();
      return;
    }
    nameInput.value = guestName;
    const pending = pendingItems();
    if (!pending.length) {
      fileInput.setAttribute('aria-invalid', 'true');
      setStatus('보내실 사진이나 영상을 먼저 선택해 주세요.', 'error');
      fileInput.focus();
      return;
    }
    busy = true;
    progress.hidden = false;
    pending.forEach(item => { item.error = ''; item.loaded = 0; });
    updateControls();
    updateProgress();
    try {
      const newItems = pending.filter(item => !item.id);
      if (newItems.length) {
        try {
          await createSession(newItems, guestName);
        } catch (error) {
          newItems.forEach(item => { item.state = 'failed'; item.error = error.userMessage; });
        }
      }
      // IDs and tokens stay on the queue entries, so retrying never creates a second copy.
      for (const item of pending.filter(entry => entry.id)) {
        item.state = 'uploading';
        item.error = '';
        renderQueue();
        updateProgress();
        try {
          await uploadFile(item);
          item.state = 'uploaded';
          item.loaded = item.file.size;
        } catch (error) {
          item.state = 'failed';
          item.loaded = 0;
          item.error = error.userMessage || connectionError().userMessage;
        }
        renderQueue();
        updateProgress();
      }
    } finally {
      busy = false;
      progress.hidden = true;
      renderQueue();
      const completed = queue.filter(item => item.state === 'uploaded').length;
      const remaining = queue.length - completed;
      if (!remaining) {
        setStatus(`사진·영상 ${completed}개를 잘 받았습니다. 소중한 순간을 함께해 주셔서 고맙습니다.`, 'success');
        cancelButton.focus({ preventScroll: true });
      } else if (completed) {
        setStatus(`전체 ${queue.length}개 중 ${completed}개를 받았습니다. ${remaining}개는 보내지 못했어요. ‘다시 올리기’를 누르면 실패한 파일만 다시 보냅니다.`, 'error');
        submitButton.focus({ preventScroll: true });
      } else {
        const reason = queue.find(item => item.error)?.error || '사진을 보내지 못했어요.';
        setStatus(`${reason} 선택한 파일은 그대로 남아 있어요.`, 'error');
        submitButton.focus({ preventScroll: true });
      }
    }
  });

  window.addEventListener('beforeunload', event => {
    if (busy) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('pagehide', event => {
    if (!event.persisted) queue.forEach(revokePreview);
  });
  renderQueue();
})();
