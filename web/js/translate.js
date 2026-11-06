"use strict";

/* Translation requests go through our cloud endpoint; no provider keys live here. */
const HanyuTranslate = (() => {
  const api = 'https://d5du0ehkavrgcuf0765l.3rspsmhh.apigw.yandexcloud.net';
  const defaults = { enabled: false, ocrEnabled: false, maxTextChars: 2000, maxImageBytes: 1572864 };
  const count = text => [...String(text || '')].length;
  let draft = '';
  function setDraft(text) {
    if (typeof text !== 'string' || !text.trim() || count(text.trim()) > defaults.maxTextChars) return false;
    draft = text.trim(); return true;
  }
  function takeDraft() { const value = draft; draft = ''; return value; }
  function error(code, status = 0) { return Object.assign(new Error(code), { code, status }); }
  const messages = {
    empty_text: 'Введите текст или распознайте его на фотографии.',
    text_too_long: 'Текст слишком длинный. Разделите его на несколько частей.',
    invalid_language: 'Выберите китайский или русский язык.',
    invalid_image: 'Не удалось прочитать изображение. Выберите другую фотографию.',
    image_too_large: 'Фотография слишком большая. Выберите файл до 20 МБ.',
    image_format: 'Выберите фотографию JPG, PNG, WebP, HEIC или HEIF.',
    image_dimensions: 'Изображение слишком большое. Уменьшите его размер и попробуйте снова.',
    image_compression: 'Не удалось подготовить фотографию. Попробуйте обрезать её или выбрать другую.',
    no_text: 'На фотографии не найден текст. Снимите страницу ближе, при хорошем освещении.',
    no_text_found: 'На фотографии не найден текст. Снимите страницу ближе, при хорошем освещении.',
    translation_disabled: 'Перевод временно недоступен. Попробуйте позже.',
    ocr_disabled: 'Распознавание фотографий временно недоступно. Можно ввести текст вручную.',
    not_configured: 'Перевод пока не подключён. Попробуйте позже.',
    translation_not_configured: 'Перевод пока не подключён. Попробуйте позже.',
    quota_exceeded: 'Лимит переводов на сегодня исчерпан. Попробуйте завтра.',
    daily_limit: 'Лимит переводов на сегодня исчерпан. Попробуйте завтра.',
    daily_limit_exceeded: 'Лимит переводов на сегодня исчерпан. Попробуйте завтра.',
    budget_exceeded: 'Лимит переводов сейчас исчерпан. Попробуйте позже.',
    provider_busy: 'Переводчик сейчас занят. Подождите немного и попробуйте снова.',
    rate_limit: 'Слишком много запросов. Подождите немного и попробуйте снова.',
    monthly_limit: 'Лимит переводов на этот месяц исчерпан. Попробуйте позже.',
    usage_unavailable: 'Перевод временно недоступен. Попробуйте позже.',
    credentials_unavailable: 'Перевод временно недоступен. Попробуйте позже.',
    invalid_input: 'Проверьте текст, изображение и выбранные языки.',
    body_too_large: 'Запрос слишком большой. Уменьшите изображение или сократите текст.',
    translation_unavailable: 'Сервис перевода сейчас не отвечает. Попробуйте позже.',
    recognition_unavailable: 'Не удалось распознать фотографию. Попробуйте позже.',
    request_timeout: 'Ответ занимает слишком много времени. Попробуйте ещё раз.',
    rate_limited: 'Слишком много запросов. Подождите немного и попробуйте снова.',
    too_many_requests: 'Слишком много запросов. Подождите немного и попробуйте снова.',
    timeout: 'Ответ занимает слишком много времени. Попробуйте ещё раз.',
    offline: 'Нет связи с переводчиком. Проверьте интернет и попробуйте ещё раз.',
    upstream_error: 'Сервис перевода сейчас не отвечает. Попробуйте позже.',
    provider_error: 'Сервис перевода сейчас не отвечает. Попробуйте позже.',
    invalid_response: 'Не удалось получить результат. Попробуйте ещё раз.'
  };
  function message(err) {
    if (messages[err?.code]) return messages[err.code];
    if (err?.status === 429) return messages.rate_limited;
    if (err?.status === 413) return messages.image_too_large;
    if (err?.status === 503) return messages.translation_disabled;
    return messages.upstream_error;
  }
  async function request(path, body, signal, fetcher = fetch) {
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    if (signal?.aborted) throw error('aborted');
    signal?.addEventListener('abort', abort, { once: true });
    // Allow the cloud function to finish its budget reservation and provider call.
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, path === '/config' ? 10000 : 75000);
    try {
      const response = await fetcher(api + '/translate' + path, {
        method: body === undefined ? 'GET' : 'POST', cache: 'no-store', credentials: 'omit',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal
      });
      let data;
      try { data = await response.json(); } catch (_) { throw error('invalid_response', response.status); }
      if (!response.ok) throw error(typeof data?.error === 'string' ? data.error : 'upstream_error', response.status);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw error('invalid_response');
      return data;
    } catch (err) {
      if (signal?.aborted) throw error('aborted');
      if (timedOut) throw error('timeout');
      if (err?.code) throw err;
      throw error('offline');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  async function config(signal) {
    const data = await request('/config', undefined, signal);
    return { enabled: data.enabled === true, ocrEnabled: data.ocrEnabled === true,
      maxTextChars: Number.isSafeInteger(data.maxTextChars) && data.maxTextChars > 0 ? Math.min(10000, data.maxTextChars) : defaults.maxTextChars,
      maxImageBytes: Number.isSafeInteger(data.maxImageBytes) && data.maxImageBytes >= 65536 ? Math.min(defaults.maxImageBytes, data.maxImageBytes) : defaults.maxImageBytes };
  }
  async function translate(text, source, target, signal, limit = defaults.maxTextChars) {
    text = String(text || '').trim();
    if (!text) throw error('empty_text');
    if (count(text) > limit) throw error('text_too_long');
    if (!['auto', 'zh', 'ru'].includes(source) || !['zh', 'ru'].includes(target) || source === target) throw error('invalid_language');
    const result = await request('/text', { text, source, target }, signal);
    if (typeof result.text !== 'string' || !result.text.trim() || result.text.length > 100000) throw error('invalid_response');
    return { text: result.text, source: ['zh', 'ru'].includes(result.source) ? result.source : source, target };
  }
  async function recognize(photo, language, signal) {
    const result = await request('/photo', { image: photo.base64, mimeType: photo.mimeType, language }, signal);
    if (typeof result.text !== 'string' || result.text.length > 100000) throw error('invalid_response');
    if (!result.text.trim()) throw error('no_text');
    return { text: result.text, truncated: result.truncated === true };
  }
  function validateFile(file) {
    if (!file || !Number.isFinite(file.size) || file.size <= 0) throw error('invalid_image');
    if (file.size > 20 * 1024 * 1024) throw error('image_too_large');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (!allowed.includes(String(file.type).toLowerCase()) && !(file.type === '' && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || ''))) throw error('image_format');
  }
  function imageSize(width, height, maxEdge = 1800) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width * height > 64000000) throw error('image_dimensions');
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }
  async function preparePhoto(file, maxBytes = defaults.maxImageBytes) {
    validateFile(file);
    const url = URL.createObjectURL(file), image = new Image();
    let canvas;
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve; image.onerror = () => reject(error('invalid_image')); image.src = url;
      });
      let { width, height } = imageSize(image.naturalWidth, image.naturalHeight);
      canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw error('image_compression');
      for (let round = 0; round < 5; round++) {
        canvas.width = width; canvas.height = height;
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        for (const quality of [.88, .74, .6]) {
          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
          if (!blob) throw error('image_compression');
          if (blob.size <= maxBytes) {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            let binary = ''; for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
            return { blob, base64: btoa(binary), mimeType: 'image/jpeg', width, height, bytes: blob.size };
          }
        }
        width = Math.max(1, Math.round(width * .75)); height = Math.max(1, Math.round(height * .75));
      }
      throw error('image_compression');
    } catch (err) { throw err?.code ? err : error('invalid_image'); }
    finally { URL.revokeObjectURL(url); image.onload = image.onerror = null; if (canvas) canvas.width = canvas.height = 0; }
  }
  return { defaults, count, message, config, translate, recognize, validateFile, imageSize, preparePhoto, request, setDraft, takeDraft };
})();

async function pageTranslate(initialMode) {
  const labels = { auto: 'Определить язык', zh: 'Китайский', ru: 'Русский' };
  let active = true, mode = initialMode === 'photo' ? 'photo' : 'text', settings = { ...HanyuTranslate.defaults };
  let configuring = true, configured = false, busy = '', revision = 0, photoRevision = 0, configRevision = 0, configController = null, photo = null, previewUrl = '', result = null, detectedSource = '';
  const controllers = new Set();
  const cameraIcon = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6l1.5-2h5L16 6h4a1 1 0 0 1 1 1v12H3V7a1 1 0 0 1 1-1z"/><circle cx="12" cy="12.5" r="3.5"/></svg>';
  const imageIcon = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></svg>';
  app.innerHTML = `${topbar('Переводчик', '#/learn')}<section class="translator">
    <p class="sub translate-intro">Понимайте китайский: переводите фразы или текст на фотографии.</p>
    <div class="seg translate-tabs" aria-label="Способ перевода"><button id="tr-tab-text" aria-pressed="${mode === 'text'}">Текст</button><button id="tr-tab-photo" aria-pressed="${mode === 'photo'}">${cameraIcon} Фото</button></div>
    <div class="translate-language-row translate-direction"><input type="hidden" id="tr-source" value="zh"><span id="tr-source-name">中文</span><button id="tr-swap" class="translate-swap" aria-label="Поменять языки местами">⇄</button><span id="tr-target-name">Русский</span><input type="hidden" id="tr-target" value="ru"></div>
    <div id="tr-photo-panel" class="translate-photo-panel" ${mode === 'photo' ? '' : 'hidden'}>
      <div class="translate-photo-pick"><button class="btn" id="tr-camera">${cameraIcon} Сфотографировать</button><button class="btn ghost" id="tr-gallery">${imageIcon} Из галереи</button></div>
      <input id="tr-camera-file" class="translate-file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" tabindex="-1" aria-label="Сделать фотографию">
      <input id="tr-gallery-file" class="translate-file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" tabindex="-1" aria-label="Выбрать фотографию">
      <div id="tr-photo-preview" class="translate-photo-preview" hidden><img id="tr-photo-image" alt="Выбранная фотография для распознавания"><button id="tr-remove-photo" aria-label="Убрать фотографию">${ic('close')}</button><span id="tr-photo-size"></span></div>
      <p class="hint translate-photo-notice">После нажатия «Распознать текст» фотография отправится в Yandex AI Studio (Qwen) для распознавания. Фото не сохраняется в вашей библиотеке.</p>
      <button class="btn ghost" id="tr-recognize" disabled>Распознать текст</button>
    </div>
    <div id="tr-service" class="translate-service" role="status">Подключаем переводчик…</div>
    <button class="translate-reconnect" id="tr-reconnect" hidden>Попробовать подключиться снова</button>
    <div class="translate-source-box"><div class="translate-box-top"><label id="tr-source-label" for="tr-input">Исходный текст</label><button id="tr-clear" aria-label="Очистить текст">${ic('close')}</button></div><textarea id="tr-input" placeholder="Введите китайский или русский текст…" aria-describedby="tr-count tr-input-note" spellcheck="false"></textarea><div class="translate-box-bottom"><span id="tr-detected"></span><span id="tr-count">0 / 2 000</span></div></div>
    <p id="tr-input-note" class="hint translate-edit-note">Можно вставить текст из сообщения или учебника.</p>
    <button class="btn translate-go" id="tr-submit" disabled>Перевести</button>
    <button class="btn ghost mt" id="tr-explain" disabled>Объяснить с ИИ</button>
    <div id="tr-status" class="translate-status" role="status" aria-live="polite"></div>
    <section id="tr-result-panel" class="translate-result" aria-label="Результат перевода" hidden><div class="translate-result-top"><span id="tr-result-language">Перевод</span><span class="translate-machine">Машинный перевод</span></div><p id="tr-result-text" dir="auto"></p><div class="translate-result-actions"><button id="tr-copy">${ic('layers')} Копировать</button><button id="tr-speak">${ic('speaker')} Прослушать</button></div></section>
    <p class="hint translate-bottom-note">Перевод требует интернета. Текст отправляется в Yandex только по вашей команде; история переводов здесь не сохраняется.</p>
  </section>`;
  const el = id => $('#tr-' + id);
  const input = el('input'), source = el('source'), target = el('target');
  input.value = HanyuTranslate.takeDraft();
  function stopSpeech() { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }
  function clearResult() { result = null; detectedSource = ''; el('result-panel').hidden = true; el('detected').textContent = ''; stopSpeech(); }
  function cancel() { revision++; photoRevision++; controllers.forEach(controller => controller.abort()); controllers.clear(); busy = ''; }
  function status(text = '', kind = '') { el('status').textContent = text; el('status').className = 'translate-status' + (kind ? ' is-' + kind : ''); }
  function controller() { const c = new AbortController(); controllers.add(c); return c; }
  function refresh() {
    el('source-name').textContent = source.value === 'zh' ? '中文' : 'Русский';
    el('target-name').textContent = target.value === 'zh' ? '中文' : 'Русский';
    const length = HanyuTranslate.count(input.value.trim()), valid = length > 0 && length <= settings.maxTextChars;
    el('count').textContent = `${length.toLocaleString('ru-RU')} / ${settings.maxTextChars.toLocaleString('ru-RU')}`;
    el('count').className = length > settings.maxTextChars ? 'is-over-limit' : '';
    el('submit').disabled = configuring || !!busy || !settings.enabled || !valid;
    el('explain').disabled = !!busy || !valid || typeof HanyuAI === 'undefined';
    el('submit').textContent = busy === 'translate' ? 'Переводим…' : 'Перевести';
    el('recognize').disabled = configuring || !!busy || !settings.ocrEnabled || !photo;
    el('recognize').textContent = busy === 'recognize' ? 'Распознаём…' : 'Распознать текст';
    el('camera').disabled = el('gallery').disabled = busy === 'prepare';
    el('source-label').textContent = mode === 'photo' ? 'Текст с фотографии' : 'Исходный текст';
    el('input-note').textContent = mode === 'photo' ? 'Проверьте распознанный текст, исправьте ошибки и нажмите «Перевести».' : 'Можно вставить текст из сообщения или учебника.';
  }
  function service() {
    el('service').hidden = configured && settings.enabled && (mode !== 'photo' || settings.ocrEnabled);
    el('service').textContent = configuring ? 'Подключаем переводчик…' : !configured ? 'Не удалось подключиться. Проверьте интернет.' : !settings.enabled ? HanyuTranslate.message({code:'translation_disabled'}) : HanyuTranslate.message({code:'ocr_disabled'});
    el('reconnect').hidden = configuring || (configured && settings.enabled && (mode !== 'photo' || settings.ocrEnabled));
  }
  async function loadConfig() {
    configController?.abort(); const token = ++configRevision, c = new AbortController(); configController = c; configuring = true; service(); refresh();
    try { const next = await HanyuTranslate.config(c.signal); if (!active || token !== configRevision) return; settings = next; configured = true; }
    catch (err) { if (!active || token !== configRevision) return; configured = false; settings = { ...HanyuTranslate.defaults }; }
    finally { if (active && token === configRevision) { configuring = false; configController = null; service(); refresh(); } }
  }
  function setMode(next) {
    if (mode === next) return; cancel(); mode = next; clearResult(); status();
    el('photo-panel').hidden = mode !== 'photo'; el('tab-text').setAttribute('aria-pressed', String(mode === 'text')); el('tab-photo').setAttribute('aria-pressed', String(mode === 'photo'));
    service(); refresh();
  }
  function changed() { cancel(); clearResult(); status(); refresh(); }
  el('tab-text').onclick = () => setMode('text'); el('tab-photo').onclick = () => setMode('photo');
  input.oninput = changed;
  source.onchange = () => { if (source.value === target.value) target.value = source.value === 'zh' ? 'ru' : 'zh'; changed(); };
  target.onchange = () => { if (source.value === target.value) source.value = target.value === 'zh' ? 'ru' : 'zh'; changed(); };
  el('swap').onclick = () => {
    const oldTarget = target.value, oldSource = result?.source || detectedSource || source.value, oldResult = result?.text;
    source.value = oldTarget; target.value = ['zh','ru'].includes(oldSource) && oldSource !== oldTarget ? oldSource : oldTarget === 'zh' ? 'ru' : 'zh';
    if (oldResult) input.value = oldResult; changed(); input.focus();
  };
  el('clear').onclick = () => { input.value = ''; changed(); input.focus(); };
  el('explain').onclick = () => {
    const text = input.value.trim();
    if (!text || HanyuTranslate.count(text) > settings.maxTextChars || typeof HanyuAI === 'undefined') return;
    HanyuAI.setDraft(text, 'explain'); location.hash = '#/ai/explain';
  };
  el('reconnect').onclick = loadConfig;
  function removePhoto() {
    photoRevision++; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ''; photo = null;
    el('photo-image').removeAttribute('src'); el('photo-preview').hidden = true;
    el('camera-file').value = el('gallery-file').value = '';
  }
  el('remove-photo').onclick = () => { cancel(); removePhoto(); status(); refresh(); };
  el('camera').onclick = () => el('camera-file').click(); el('gallery').onclick = () => el('gallery-file').click();
  async function choosePhoto(file) {
    if (!file || !active) return;
    cancel(); removePhoto(); clearResult(); input.value = ''; status('Подготавливаем фотографию…');
    const token = ++photoRevision; busy = 'prepare'; refresh();
    try {
      const next = await HanyuTranslate.preparePhoto(file, settings.maxImageBytes);
      if (!active || token !== photoRevision) return;
      photo = next; previewUrl = URL.createObjectURL(next.blob); el('photo-image').src = previewUrl; el('photo-preview').hidden = false;
      el('photo-size').textContent = `${next.width} × ${next.height}`; status('Фотография готова. Нажмите «Распознать текст».');
    } catch (err) { if (active && token === photoRevision) status(HanyuTranslate.message(err), 'error'); }
    finally { if (active && token === photoRevision) { busy = ''; refresh(); } }
  }
  el('camera-file').onchange = e => choosePhoto(e.target.files?.[0]); el('gallery-file').onchange = e => choosePhoto(e.target.files?.[0]);
  el('recognize').onclick = async () => {
    if (!photo || busy || !settings.ocrEnabled) return;
    cancel(); clearResult(); const token = revision, c = controller(); busy = 'recognize'; status('Распознаём текст на фотографии…'); refresh();
    try {
      const recognized = await HanyuTranslate.recognize(photo, source.value, c.signal), text = recognized.text;
      if (!active || token !== revision) return;
      input.value = text; status(recognized.truncated ? 'На фото слишком много текста: показана только первая часть. Снимите нужный фрагмент отдельно.' : HanyuTranslate.count(text.trim()) > settings.maxTextChars ? 'Текст распознан. Для перевода сократите его или переводите по частям.' : 'Текст распознан. Проверьте его и нажмите «Перевести».'); input.focus();
    } catch (err) { if (active && token === revision) status(HanyuTranslate.message(err), 'error'); }
    finally { controllers.delete(c); if (active && token === revision) { busy = ''; refresh(); } }
  };
  el('submit').onclick = async () => {
    if (busy || !settings.enabled) return;
    cancel(); clearResult(); const token = revision, c = controller(); busy = 'translate'; status('Переводим…'); refresh();
    try {
      const translated = await HanyuTranslate.translate(input.value, source.value, target.value, c.signal, settings.maxTextChars);
      if (!active || token !== revision) return;
      result = translated; detectedSource = result.source;
      el('result-text').textContent = result.text; el('result-text').className = result.target === 'zh' ? 'zh' : '';
      el('result-language').textContent = labels[result.target];
      el('detected').textContent = source.value === 'auto' && labels[detectedSource] && detectedSource !== 'auto' ? `${labels[detectedSource]} · определён` : '';
      el('result-panel').hidden = false; status('Перевод готов.');
    } catch (err) { if (active && token === revision) status(HanyuTranslate.message(err), 'error'); }
    finally { controllers.delete(c); if (active && token === revision) { busy = ''; refresh(); } }
  };
  el('copy').onclick = async () => {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.text); if (active) status('Перевод скопирован.'); }
    catch (_) { if (active) status('Выделите текст перевода и скопируйте его вручную.'); }
  };
  el('speak').onclick = () => {
    if (!result) return;
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return status('Озвучивание не поддерживается этим браузером.');
    stopSpeech(); const speech = new SpeechSynthesisUtterance(result.text), language = result.target === 'zh' ? 'zh-CN' : 'ru-RU';
    speech.lang = language; speech.rate = result.target === 'zh' ? .85 : 1;
    const voice = window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase() === language.toLowerCase()) || window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith(result.target));
    if (voice) speech.voice = voice;
    const speechRevision = revision; speech.onerror = event => { if (active && speechRevision === revision && !['canceled', 'interrupted'].includes(event.error)) status('Не удалось озвучить перевод. Проверьте языки речи в настройках устройства.'); };
    window.speechSynthesis.speak(speech);
  };
  onLeave(() => { active = false; configRevision++; configController?.abort(); cancel(); removePhoto(); stopSpeech(); });
  refresh(); await loadConfig();
}
