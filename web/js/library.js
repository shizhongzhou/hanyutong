"use strict";
/* In-app reading and playback. Only reading positions are stored on-device. */
const CloudLibrary = (() => {
  const api = 'https://d5du0ehkavrgcuf0765l.3rspsmhh.apigw.yandexcloud.net';
  const progressKey = 'hanyutong-library-progress-v1';
  let catalogPromise;
  const tickets = new Map();
  let progress = {};
  try { progress = JSON.parse(localStorage.getItem(progressKey)) || {}; } catch (_) {}
  if (typeof progress !== 'object' || Array.isArray(progress)) progress = {};
  // Remove reading copies saved by the earlier development preview.
  try { indexedDB.deleteDatabase('hanyu-cloud-library'); } catch (_) {}
  const validate = data => {
    if (data?.version !== 2 || !Array.isArray(data.books) || !Array.isArray(data.files) || data.files.length !== data.totalFiles) throw Error('Invalid library');
    const books = new Set(data.books.map(b => b.id)), ids = new Set();
    for (const f of data.files) {
      if (!/^rts-[a-f0-9]{24}$/.test(f.id) || ids.has(f.id) || !books.has(f.bookId) ||
          'key' in f || 'preview' in f || 'sha256' in f ||
          !Number.isSafeInteger(f.size) || f.size <= 0 || !Number.isSafeInteger(f.viewSize) || f.viewSize < 0 ||
          !['pdf', 'audio', 'document', 'slides'].includes(f.kind) ||
          (f.lesson !== null && (!Number.isSafeInteger(f.lesson) || f.lesson < 1))) throw Error('Invalid library entry');
      ids.add(f.id);
    }
    return data;
  };
  const load = () => catalogPromise ||= (async () => {
    try {
      const response = await fetch(api + '/library/catalog', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw Error('Cloud catalog unavailable');
      return validate(await response.json());
    } catch (_) {
      const response = await fetch('data/library-catalog.json', { cache: 'no-cache' });
      if (!response.ok) throw Error('Library unavailable');
      return validate(await response.json());
    }
  })().catch(error => { catalogPromise = null; throw error; });
  const state = id => progress[id] || {};
  const update = (id, changes) => {
    progress[id] = { ...state(id), ...changes };
    try { localStorage.setItem(progressKey, JSON.stringify(progress)); } catch (_) {}
  };
  const request = async (url, options, consume = response => response) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, { ...options, signal: AbortSignal.any([options.signal, AbortSignal.timeout(20000)].filter(Boolean)) });
        if (![429, 502, 503, 504].includes(response.status) || attempt === 2) return await consume(response);
        await response.body?.cancel();
      } catch (error) { if (options.signal?.aborted || attempt === 2) throw error; }
      await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
    }
  };
  const mediaUrl = async (file, signal, refresh = false) => {
    let ticket = tickets.get(file.id);
    if (refresh || !ticket || ticket.expires * 1000 < Date.now() + 60000) {
      const response = await request(api + '/library/access/' + file.id, { method: 'POST', cache: 'no-store', signal });
      if (!response.ok) throw Error('Reading session unavailable');
      ticket = await response.json();
      tickets.set(file.id, ticket);
    }
    return api + '/library/media/' + file.id + '?ticket=' + encodeURIComponent(ticket.token);
  };
  const range = async (file, begin, end, signal) => {
    const buffers = [];
    for (let offset = begin; offset < end; offset += 262144) {
      const last = Math.min(end, offset + 262144) - 1;
      const consume = async response => {
        if (response.status !== 206) return {status:response.status};
        if (response.headers.get('Content-Range') !== `bytes ${offset}-${last}/${file.viewSize}`) throw Error('Invalid reading range');
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length !== last - offset + 1) throw Error('Incomplete reading range');
        return {status:206,bytes};
      };
      const options = {headers:{Range:`bytes=${offset}-${last}`},cache:'no-store',signal};
      let response = await request(await mediaUrl(file, signal), options, consume);
      if (response.status === 401) response = await request(await mediaUrl(file, signal, true), options, consume);
      if (response.status !== 206) throw Error('Reading range unavailable');
      buffers.push(response.bytes);
    }
    const result = new Uint8Array(end - begin); let offset = 0;
    for (const bytes of buffers) { result.set(bytes, offset); offset += bytes.length; }
    return result;
  };
  const companions = (catalog, file) => catalog.files.filter(f => f.bookId === file.bookId && f.kind === 'audio' && (file.lesson == null || f.lesson === file.lesson))
    .sort((a, b) => (a.track ?? 9999) - (b.track ?? 9999) || a.name.localeCompare(b.name, 'zh', {numeric:true}));
  const readerFor = (catalog, file) => {
    if (file.kind !== 'audio') return file;
    if (file.readerId) return catalog.files.find(f => f.id === file.readerId) || null;
    const same = catalog.files.filter(f => f.bookId === file.bookId && f.kind !== 'audio');
    return (file.lesson != null && same.find(f => f.kind === 'slides' && f.lesson === file.lesson)) ||
      same.find(f => f.kind === 'pdf' && /Учебник|教材/i.test(f.name)) || same.find(f => f.kind === 'pdf') || null;
  };
  const unitsFor = (catalog, file) => {
    const tracks = companions(catalog, file), known = catalog.books.find(b => b.id === file.bookId)?.units || [];
    const units = new Map((file.lesson ? known.filter(u => u.lesson === file.lesson) : known).map(u => [u.unit, {...u}]));
    for (const track of tracks) if (!units.has(track.unit)) units.set(track.unit, {unit:track.unit, lesson:track.lesson, section:track.section || 'Аудио к материалу'});
    return [...units.values()].map(unit => ({...unit, tracks:tracks.filter(t => t.unit === unit.unit)}));
  };
  return { load, validate, state, update, mediaUrl, range, companions, readerFor, unitsFor };
})();

const LIB_KIND = { pdf: 'Учебники PDF', audio: 'Аудио', slides: 'Презентации' };
const LIB_ICON = { pdf: 'book', audio: 'speaker', document: 'read', slides: 'layers' };
const libLink = id => '#/libfile/' + encodeURIComponent(id);

async function pageLibrary(bookId) {
  const current = location.hash;
  app.innerHTML = `${topbar('Путь к успеху', bookId ? '#/library' : '#/learn')}<p class="empty">Загрузка учебников…</p>`;
  const catalog = await CloudLibrary.load();
  if (location.hash !== current) return;
  const book = bookId && catalog.books.find(b => b.id === bookId);
  if (bookId && !book) { app.innerHTML = `${topbar('Учебники', '#/library')}<p class="empty">Книга не найдена.</p>`; return; }
  const fileRow = f => {
    const p = CloudLibrary.state(f.id);
    return `<a href="${libLink(f.id)}"><span class="ic">${ic(LIB_ICON[f.kind])}</span><span class="t"><b>${esc(f.name.replace(/\.[^.]+$/, ''))}</b><small>${fmtSize(f.size)}${p.page ? ` · стр. ${Math.floor(p.page)}` : ''}${p.pos ? ` · ${Math.floor(p.pos / 60)}:${String(Math.floor(p.pos % 60)).padStart(2, '0')}` : ''}${p.done ? ' · ✓' : ''}</small></span>${ic('go', 'i go')}</a>`;
  };
  if (book) {
    const files = catalog.files.filter(f => f.bookId === book.id).sort((a, b) => natCmp(a.group + '/' + a.name, b.group + '/' + b.name));
    app.innerHTML = `${topbar(esc(book.title), '#/library')}<p class="sub">${esc(book.originalTitle)} · ${book.fileCount} файлов · ${fmtSize(book.bytes)}</p>
      <label class="field library-search"><span>Найти урок или файл</span><input id="lib-search" type="search" placeholder="Номер урока или название"></label>
      <div class="seg library-filters"><button data-kind="all" aria-pressed="true">Все</button>${Object.keys(LIB_KIND).filter(k => book.counts[k]).map(k => `<button data-kind="${k}" aria-pressed="false">${LIB_KIND[k]}</button>`).join('')}</div><div id="lib-files"></div>`;
    let selected = 'all';
    const render = () => {
      const query = $('#lib-search').value.trim().toLocaleLowerCase();
      const shown = files.filter(f => (selected === 'all' || f.kind === selected) && (f.name + ' ' + f.group).toLocaleLowerCase().includes(query));
      $('#lib-files').innerHTML = shown.length ? Object.keys(LIB_KIND).map(kind => {
        const group = shown.filter(f => f.kind === kind);
        return group.length ? `<div class="section"><h2>${LIB_KIND[kind]}</h2><span class="muted">${group.length}</span></div><div class="list library-files">${group.map(fileRow).join('')}</div>` : '';
      }).join('') : '<p class="empty">Ничего не найдено. Попробуйте другой номер урока.</p>';
    };
    $('#lib-search').oninput = render;
    $$('[data-kind]').forEach(button => button.onclick = () => {
      selected = button.dataset.kind;
      $$('[data-kind]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      render();
    });
    render();
    return;
  }
  const recent = catalog.files.filter(f => CloudLibrary.state(f.id).opened).sort((a, b) => CloudLibrary.state(b.id).opened - CloudLibrary.state(a.id).opened)[0];
  app.innerHTML = `${topbar('Путь к успеху · 成功之路', '#/learn')}
    <div class="card-blue library-intro"><p class="kicker">БИБЛИОТЕКА УЧЕБНИКОВ</p><h2>От первых слов<br>до свободной речи</h2><p class="sub">${catalog.books.length} раздел · ${catalog.files.filter(f => f.kind === 'pdf').length} PDF · ${catalog.files.filter(f => f.kind === 'audio').length} аудиозаписи<br>Учебники, упражнения и материалы к урокам.</p></div>
    <p class="hint">Читайте и слушайте прямо здесь. Аудио находится рядом с соответствующим учебником или уроком. Место остановки запоминается.</p>
    ${recent ? `<div class="section"><h2>Продолжить</h2></div><div class="list library-files">${fileRow(recent)}</div>` : ''}
    <div class="section"><h2>Все разделы</h2><span class="muted">${catalog.books.length}</span></div>
    <div class="library-books">${catalog.books.map(b => `<a class="library-book" href="#/library/${b.id}"><span class="library-number">${String(b.number).padStart(2, '0')}</span><div><h3>${esc(b.title)}</h3><p>${[b.counts.pdf ? `${b.counts.pdf} PDF` : '', b.counts.audio ? `${b.counts.audio} аудио` : '', b.counts.document || b.counts.slides ? 'Материалы к урокам' : ''].filter(Boolean).join(' · ')}</p></div>${ic('go')}</a>`).join('')}</div>
    <div class="list mt">${row('#/shelf', 'download', 'Мои файлы', 'Добавить другие учебники с устройства')}</div>`;
}

async function pageLibraryFile(id) {
  let active = true, pdfTask, renderTask, player, renderPage, currentAudio, audioSerial = 0;
  const abort = new AbortController();
  app.classList.add('library-reading');
  const rememberAudio = () => {
    if (player?.readyState >= 1 && currentAudio) CloudLibrary.update(currentAudio.id, { pos: !player.ended && Number.isFinite(player.currentTime) ? player.currentTime : 0 });
  };
  onLeave(() => { active = false; rememberAudio(); abort.abort(); renderTask?.cancel(); pdfTask?.destroy(); if (player) { player.pause(); player.removeAttribute('src'); player.load(); } app.classList.remove('library-reading'); });
  app.innerHTML = `${topbar('Материал', '#/library')}<p class="empty">Открываю урок…</p>`;
  const catalog = await CloudLibrary.load();
  const requested = catalog.files.find(f => f.id === id);
  if (!active) return;
  if (!requested) { app.innerHTML = `${topbar('Материал', '#/library')}<p class="empty">Урок не найден.</p>`; return; }
  const file = CloudLibrary.readerFor(catalog, requested);
  const book = catalog.books.find(b => b.id === requested.bookId);
  const tracks = file ? CloudLibrary.companions(catalog, file) : CloudLibrary.companions(catalog, requested);
  const units = CloudLibrary.unitsFor(catalog, file || requested);
  const saved = CloudLibrary.state((file || requested).id);
  let currentUnit = (requested.kind === 'audio' && units.find(u => u.unit === requested.unit)) ||
    units.find(u => u.unit === saved.unit) ||
    [...units].reverse().find(u => u.readerId === file?.id && u.page <= (saved.page || 0)) || units[0];
  let unitTracks = currentUnit?.tracks || [];
  const initialAudio = requested.kind === 'audio' ? requested : unitTracks[0];
  const title = file || requested;
  CloudLibrary.update(title.id, { opened: Date.now() });
  const siblings = catalog.files.filter(f => f.bookId === title.bookId && f.kind === title.kind).sort((a,b) => (a.lesson ?? 0) - (b.lesson ?? 0) || natCmp(a.name,b.name));
  const index = siblings.findIndex(f => f.id === title.id), prev = siblings[index - 1], next = siblings[index + 1];
  app.innerHTML = `${topbar(esc(title.name.replace(/\.[^.]+$/, '')), '#/library/' + title.bookId)}
    <p class="sub">${esc(book.title)}${file?.lesson ? ' · Урок ' + file.lesson : ''}</p>
    <div class="library-reader-layout"><section id="lib-viewer" aria-label="Учебный материал"></section>
    <aside class="library-companion" aria-label="Аудио к уроку"><h2>Материал и аудио</h2>
    ${units.length ? `<label class="field"><span>Урок</span><select id="lib-unit">${units.map(u => `<option value="${esc(u.unit || '')}">${esc(u.section)}${u.lessonTitle ? ' · '+esc(u.lessonTitle) : ''}</option>`).join('')}</select></label>` : ''}
    ${tracks.length ? `<p id="lib-no-audio" class="hint" hidden>Для этого урока аудио пока недоступно.</p><div id="lib-audio-controls"><label class="field"><span>Запись к этому уроку</span><select id="lib-track"></select></label>
      <p id="lib-audio-title" class="library-track-title"></p><audio id="lib-player" controls controlsList="nodownload noremoteplayback" disableRemotePlayback preload="metadata"></audio>
      <div class="seg mt">${[0.75,1,1.25].map(rate => `<button data-lib-rate="${rate}" aria-pressed="${rate===1}">${rate}×</button>`).join('')}<button id="lib-rewind">−5 с</button><button id="lib-loop" aria-pressed="false">Повтор</button></div>
      <div class="two"><button class="btn ghost" id="audio-prev" aria-label="Предыдущая запись">‹ Запись</button><button class="btn ghost" id="audio-next" aria-label="Следующая запись">Запись ›</button></div>
      <label class="setrow"><span>Следующая запись автоматически</span><button class="toggle" id="lib-auto" aria-pressed="${S.settings.autoNext!==false}"></button></label>
      <p id="lib-audio-status" class="hint" role="status">Аудио воспроизводится на этой странице.</p></div>` : '<p class="hint">К этому материалу нет доступной аудиозаписи.</p>'}
    </aside></div><p class="hint">Онлайн-просмотр в приложении. Страница и место в аудио запоминаются.</p>
    <div class="two">${prev ? `<a class="btn ghost" href="${libLink(prev.id)}">‹ Предыдущий материал</a>` : '<span></span>'}${next ? `<a class="btn ghost" href="${libLink(next.id)}">Следующий материал ›</a>` : '<span></span>'}</div>`;
  const viewer = $('#lib-viewer');
  viewer.oncontextmenu = event => event.preventDefault();
  if (tracks.length) {
    player = $('#lib-player');
    player.oncontextmenu = event => event.preventDefault();
    let lastSave = 0;
    player.ontimeupdate = () => { if (Date.now() - lastSave > 4000) { rememberAudio(); lastSave = Date.now(); } };
    player.onpause = rememberAudio;
    const selectAudio = async (track, play = false) => {
      const mine = ++audioSerial;
      rememberAudio(); player.pause(); currentAudio = null;
      player.removeAttribute('src'); player.load();
      currentAudio = track;
      $('#lib-track').value = track.id;
      $('#lib-audio-title').textContent = track.name.replace(/\.mp3$/i, '');
      $('#lib-audio-status').textContent = 'Загрузка аудио…';
      const n = unitTracks.indexOf(track);
      $('#audio-prev').disabled = n === 0; $('#audio-next').disabled = n === unitTracks.length - 1;
      const position = CloudLibrary.state(track.id).pos || 0;
      player.onloadedmetadata = () => {
        if (!active || mine !== audioSerial) return;
        if (position > 0 && position < player.duration - 2) player.currentTime = position;
        $('#lib-audio-status').textContent = 'Слушайте и листайте материал на этой странице.';
      };
      player.onerror = () => { if (active && mine === audioSerial) $('#lib-audio-status').textContent = 'Не удалось загрузить аудио. Выберите запись ещё раз.'; };
      try {
        const url = await CloudLibrary.mediaUrl(track, abort.signal);
        if (!active || mine !== audioSerial) return;
        player.src = url;
        CloudLibrary.update(track.id, { opened: Date.now() });
        if (track.page && file?.id === track.readerId && renderPage) renderPage(track.page);
        if (play) player.play().catch(() => {});
      } catch (_) { if (active && mine === audioSerial) $('#lib-audio-status').textContent = 'Аудио временно недоступно. Проверьте интернет.'; }
    };
    const selectUnit = (unit, play = false, selectedTrack) => {
      rememberAudio(); player.pause(); currentAudio = null; ++audioSerial;
      player.removeAttribute('src'); player.load();
      currentUnit = unit; unitTracks = unit.tracks;
      $('#lib-unit').value = unit.unit || '';
      $('#lib-track').innerHTML = unitTracks.map(t => `<option value="${t.id}">${esc(t.name.replace(/\.mp3$/i,''))}</option>`).join('');
      $('#lib-audio-controls').hidden = !unitTracks.length; $('#lib-no-audio').hidden = !!unitTracks.length;
      CloudLibrary.update(title.id, {unit:unit.unit});
      if (unit.page && file?.id === unit.readerId && renderPage) renderPage(unit.page);
      if (unitTracks.length) selectAudio(selectedTrack || unitTracks[0], play);
    };
    $('#lib-unit').onchange = event => selectUnit(units.find(u => (u.unit || '') === event.target.value));
    $('#lib-track').onchange = event => selectAudio(unitTracks.find(t => t.id === event.target.value), true);
    $('#audio-prev').onclick = () => selectAudio(unitTracks[unitTracks.indexOf(currentAudio) - 1], true);
    $('#audio-next').onclick = () => selectAudio(unitTracks[unitTracks.indexOf(currentAudio) + 1], true);
    player.onended = () => {
      CloudLibrary.update(currentAudio.id, { pos: 0, done: true }); markStudy(); save();
      const nextTrack = unitTracks[unitTracks.indexOf(currentAudio) + 1];
      if (nextTrack && S.settings.autoNext !== false && !player.loop) selectAudio(nextTrack, true);
    };
    $$('[data-lib-rate]').forEach(button => button.onclick = () => { player.playbackRate = Number(button.dataset.libRate); $$('[data-lib-rate]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); });
    $('#lib-rewind').onclick = () => { player.currentTime = Math.max(0, player.currentTime - 5); };
    $('#lib-loop').onclick = event => { player.loop = !player.loop; event.currentTarget.setAttribute('aria-pressed', String(player.loop)); };
    $('#lib-auto').onclick = event => { S.settings.autoNext = S.settings.autoNext === false; save(); event.currentTarget.setAttribute('aria-pressed', String(S.settings.autoNext)); };
    selectUnit(currentUnit, false, initialAudio);
  }
  if (!file || !file.viewSize) { viewer.innerHTML = '<p class="empty">Материал готовится для просмотра в приложении.</p>'; return; }
  viewer.innerHTML = `<div class="pdf-toolbar"><button class="round" id="pdf-prev" aria-label="Предыдущая страница">‹</button><label>Страница <input id="pdf-page" type="number" min="1" value="1" inputmode="numeric" aria-label="Номер страницы"></label><span id="pdf-count">/ …</span><button class="round" id="pdf-next" aria-label="Следующая страница">›</button></div><p id="pdf-message" class="hint" role="status">Загрузка страницы…</p><div class="pdf-paper"><canvas id="pdf-canvas" aria-label="Страница материала"></canvas></div>`;
  try {
    const pdfjs = await import('../vendor/pdfjs/legacy/build/pdf.min.mjs');
    if (!active) return;
    const assets = new URL('vendor/pdfjs/', document.baseURI).href;
    pdfjs.GlobalWorkerOptions.workerSrc = assets + 'legacy/build/pdf.worker.min.mjs';
    const initial = await CloudLibrary.range(file, 0, Math.min(262144, file.viewSize), abort.signal);
    const transport = new pdfjs.PDFDataRangeTransport(file.viewSize, initial, false);
    transport.requestDataRange = (begin, end) => {
      CloudLibrary.range(file, begin, end, abort.signal).then(bytes => { if (active) transport.onDataRange(begin, bytes); }).catch(() => {
        if (active) { $('#pdf-message').textContent = 'Соединение прервалось. Вернитесь к уроку и откройте его снова.'; pdfTask?.destroy(); }
      });
    };
    pdfTask = pdfjs.getDocument({ range: transport, length: file.viewSize, cMapUrl: assets + 'cmaps/', cMapPacked: true, standardFontDataUrl: assets + 'standard_fonts/', wasmUrl: assets + 'wasm/', disableAutoFetch: true, disableStream: true, rangeChunkSize: 262144, isEvalSupported: false });
    const pdfDocument = await pdfTask.promise;
    if (!active) return;
    $('#pdf-count').textContent = '/ ' + pdfDocument.numPages; $('#pdf-page').max = pdfDocument.numPages;
    let generation = 0;
    renderPage = async requestedPage => {
      const mine = ++generation;
      const pageNumber = Math.min(pdfDocument.numPages, Math.max(1, Math.floor(Number(requestedPage) || 1)));
      renderTask?.cancel();
      $('#pdf-page').value = pageNumber;
      $('#pdf-prev').disabled = pageNumber === 1; $('#pdf-next').disabled = pageNumber === pdfDocument.numPages;
      $('#pdf-message').textContent = 'Загрузка страницы…';
      try {
        const page = await pdfDocument.getPage(pageNumber);
        if (!active || mine !== generation) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(240, Math.min(viewer.clientWidth, 1000));
        const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width * ratio });
        const canvas = $('#pdf-canvas');
        canvas.width = viewport.width; canvas.height = viewport.height;
        renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport });
        await renderTask.promise;
        if (!active || mine !== generation) return;
        CloudLibrary.update(file.id, { page: pageNumber });
        $('#pdf-message').textContent = 'Страница запомнена';
      } catch (error) { if (active && mine === generation && error.name !== 'RenderingCancelledException') $('#pdf-message').textContent = 'Не удалось открыть страницу. Попробуйте выбрать её ещё раз.'; }
    };
    $('#pdf-prev').onclick = () => renderPage(Number($('#pdf-page').value) - 1);
    $('#pdf-next').onclick = () => renderPage(Number($('#pdf-page').value) + 1);
    $('#pdf-page').onchange = event => renderPage(event.target.value);
    await renderPage((requested.kind === 'audio' && requested.readerId === file.id && requested.page) || saved.page || (currentUnit?.readerId === file.id && currentUnit.page) || 1);
  } catch (_) { if (active) $('#pdf-message').textContent = 'Не удалось открыть материал. Проверьте интернет и вернитесь к уроку.'; }
}

// User-imported PDFs use the same in-app presentation without a browser PDF toolbar.
async function renderLocalPdf(blob, meta, nav, back, title) {
  let active = true, task, rendering, generation = 0;
  onLeave(() => { active = false; rendering?.cancel(); task?.destroy(); });
  app.innerHTML = `${topbar(title, back)}<div class="pdf-toolbar"><button class="round" id="local-prev" aria-label="Предыдущая страница">‹</button><label>Страница <input id="local-page" type="number" min="1" value="${meta.page || 1}" aria-label="Номер страницы"></label><span id="local-count">/ …</span><button class="round" id="local-next" aria-label="Следующая страница">›</button></div><p id="local-status" class="hint" role="status">Загрузка страницы…</p><div class="pdf-paper"><canvas id="local-canvas" aria-label="Страница материала"></canvas></div>${nav}`;
  $('#local-canvas').oncontextmenu = event => event.preventDefault();
  try {
    const pdfjs = await import('../vendor/pdfjs/legacy/build/pdf.min.mjs');
    if (!active) return;
    const assets = new URL('vendor/pdfjs/', document.baseURI).href;
    pdfjs.GlobalWorkerOptions.workerSrc = assets + 'legacy/build/pdf.worker.min.mjs';
    const data = new Uint8Array(await blob.arrayBuffer());
    if (!active) return;
    task = pdfjs.getDocument({data, cMapUrl:assets+'cmaps/',cMapPacked:true,standardFontDataUrl:assets+'standard_fonts/',wasmUrl:assets+'wasm/',isEvalSupported:false});
    const doc = await task.promise;
    if (!active) return;
    $('#local-count').textContent = '/ '+doc.numPages; $('#local-page').max = doc.numPages;
    const render = async number => {
      const mine = ++generation, n = Math.max(1, Math.min(doc.numPages, Math.floor(Number(number)||1)));
      rendering?.cancel(); $('#local-page').value = n;
      $('#local-prev').disabled = n === 1; $('#local-next').disabled = n === doc.numPages;
      try {
        const page = await doc.getPage(n); if (!active || mine !== generation) return;
        const canvas = $('#local-canvas'), width = Math.max(240, canvas.parentElement.clientWidth);
        const viewport = page.getViewport({scale:width/page.getViewport({scale:1}).width*Math.min(devicePixelRatio||1,2)});
        canvas.width = viewport.width; canvas.height = viewport.height;
        rendering = page.render({canvasContext:canvas.getContext('2d'),viewport}); await rendering.promise;
        if (!active || mine !== generation) return;
        meta.page = n; meta.pos = n; Shelf.update(meta); $('#local-status').textContent = 'Страница запомнена';
      } catch (error) { if (active && mine === generation && error.name !== 'RenderingCancelledException') $('#local-status').textContent = 'Не удалось открыть страницу.'; }
    };
    $('#local-prev').onclick = () => render(Number($('#local-page').value)-1);
    $('#local-next').onclick = () => render(Number($('#local-page').value)+1);
    $('#local-page').onchange = e => render(e.target.value);
    await render(meta.page || 1);
  } catch (_) { if (active) $('#local-status').textContent = 'Не удалось открыть PDF.'; }
}
