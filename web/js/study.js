"use strict";

/* One study surface for the comprehensive course, saved words and due reviews. */
const StudyDeck = {
  normalizePinyin(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/u\u0308|u:/g, "v").replace(/\p{M}/gu, "").replace(/[1-5\s'’\-·]/g, "");
  },
  matches(word, answer) {
    const input = String(answer || "").trim();
    if (!input) return false;
    if (input.replace(/[。.!！?？\s]/g, "") === word.hz.replace(/\s/g, "")) return true;
    return /^[a-züǖǘǚǜāáǎàēéěèīíǐìōóǒòūúǔùńňǹḿ\s1-5:'’\-·]+$/iu.test(input) && !!word.py &&
      word.py.split(/\s*[/／]\s*/u).some(reading => this.normalizePinyin(input) === this.normalizePinyin(reading));
  },
  clue(word) {
    // Dictionary articles also contain Chinese examples and reading headings.
    // Keep those on the answer side, never in the prompt used to recall a word.
    const headings = new Set(["сущ", "существительное", "гл", "глаг", "глагол", "прил", "прилагательное", "нареч", "наречие", "мест", "местоим", "местоимение", "числ", "числительное", "счетное", "счётное", "сч", "слово", "сл", "союз", "предлог", "частица", "междом", "междометие", "и", "или"]);
    const lines = String(word.ru || "").split(/\r?\n/u).map(raw => {
      const text = raw.replace(/^\s*(?:[IVX]+\b[.)]?\s*)?(?:\d+[.)]\s*)?/u, "")
        .replace(/[\p{Script=Han}\p{Script=Latin}\p{M}]+/gu, " ")
        .replace(/\(\s*\)|\[\s*\]/g, "").replace(/\s+/g, " ")
        .replace(/^[\s.,;:/—–-]+|[\s,;:/—–-]+$/g, "").trim();
      const terms = text.toLowerCase().match(/[а-яё]+/gu) || [];
      return { text, example: /^\s*\p{Script=Han}/u.test(raw), heading: terms.every(term => headings.has(term)) };
    }).filter(line => /[а-яё]/iu.test(line.text));
    const text = (lines.find(line => !line.example && !line.heading) || lines.find(line => !line.heading) || lines[0])?.text || "Русское значение пока недоступно.";
    if (text.length <= 220) return text;
    return text.slice(0, 217).replace(/\s+\S*$/u, "").replace(/[\s,;:]+$/u, "") + "…";
  },
  create(words, key) {
    let items = [...new Map(words.map(w => [key(w), w])).values()];
    return {
      get current() { return items[0] || null; }, get length() { return items.length; },
      list: () => items.slice(),
      skip() { if (items.length > 1) items.push(items.shift()); },
      remove(word) { items = items.filter(w => key(w) !== key(word)); },
      retry(word) { items = items.filter(w => key(w) !== key(word)); items.push(word); },
      reset(words) { items = [...new Map(words.map(w => [key(w), w])).values()]; }
    };
  }
};

function runStudySession(options) {
  const sourceWords = options.words || options.queue || [];
  const deck = StudyDeck.create(options.queue || [], wordKey);
  const initialCount = deck.length, cleanups = [], delayed = new Set();
  const palette = ["blue", "mint", "yellow", "coral", "lavender"];
  let active = true, screen = "main", flipped = false, busy = false, turn = 0, cardIndex = 0, learned = 0, correct = 0;
  let mode = ["cards", "cloud", "stickers", "meaning"].includes(S.settings.studyView) ? S.settings.studyView : "cards";
  let wall = null, currentRecall = null, surfaceCleanups = [], searchSerial = 0;
  let fontStep = Math.max(0, Math.min(2, Number(S.settings.studyFont) || 0));
  const progress = word => typeof wordProgress === "function" ? wordProgress(word) : S.srs[wordKey(word)];
  const taskAfter = (fn, ms) => { const id = setTimeout(() => { delayed.delete(id); if (active) fn(); }, ms); delayed.add(id); return id; };
  const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const stageName = options.mode === "learn" ? `HSK · ${String(options.level || S.settings.hsk3Level || "1").replace("-", "–")}` : options.mode === "book" ? "Мой словарик" : "Повторение";
  const wave = '<svg viewBox="0 0 26 26" aria-hidden="true"><rect x="2" y="10" width="3" height="7" rx="1.5"/><rect x="7" y="6" width="3" height="15" rx="1.5"/><rect x="12" y="3" width="3" height="21" rx="1.5"/><rect x="17" y="7" width="3" height="13" rx="1.5"/><rect x="22" y="9" width="3" height="9" rx="1.5"/></svg>';
  function listen(target, event, handler, opts) { target.addEventListener(event, handler, opts); cleanups.push(() => target.removeEventListener(event, handler, opts)); }
  function clearSurface() { wall?.destroy(); wall = null; surfaceCleanups.forEach(fn => fn()); surfaceCleanups = []; turn++; searchSerial++; }
  function cleanup() {
    if (!active) return; active = false; clearSurface(); delayed.forEach(clearTimeout); delayed.clear(); cleanups.forEach(fn => fn());
    document.body.classList.remove("study-immersive"); app.classList.remove("study-app"); app.style.removeProperty("--study-viewport-height");
    app.style.removeProperty("--study-font-scale"); closeOverlay();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }
  onLeave(cleanup);
  document.body.classList.add("study-immersive"); app.classList.add("study-app");
  $("#appbar").hidden = true; $("#tabbar").hidden = true; $("#fab").hidden = true;
  const viewport = () => { if (active) app.style.setProperty("--study-viewport-height", `${window.visualViewport?.height || window.innerHeight}px`); };
  if (window.visualViewport) listen(window.visualViewport, "resize", viewport);
  listen(window, "resize", viewport); viewport();
  function applyFont() { app.style.setProperty("--study-font-scale", String([1, 1.12, 1.24][fontStep])); }
  applyFont();

  function counts() {
    const list = deck.list();
    return { fresh: list.filter(w => !progress(w)).length, due: list.filter(w => !!progress(w)).length };
  }
  function dateText() { return new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" }); }
  function countText(compact = false) {
    const c = counts();
    return compact ? `💡 ${c.fresh} новых · ${c.due} к повторению` : `Сегодня ещё <span class="study-bulb">💡</span> <b>${c.fresh}</b> ${plural(c.fresh, "новое слово", "новых слова", "новых слов")}<br><span class="study-review-mark">☷</span> <b>${c.due}</b> ${plural(c.due, "слово", "слова", "слов")} к повторению`;
  }
  function week() {
    const now = new Date(), start = new Date(now); start.setDate(now.getDate() - (now.getDay() + 6) % 7);
    return `<div class="study-week" aria-label="Ваша неделя">${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i); const key = today(d.getTime()), n = S.stats.days[key] || 0;
      return `<div class="${key === today() ? "is-today" : ""}" ${key === today() ? 'aria-current="date"' : ""}><small>${day}</small><b>${d.getDate()}</b><span class="study-day-dots" aria-label="${n ? "Было занятие" : "Нет занятий"}">${n ? '<i></i><i></i>' : ""}</span></div>`;
    }).join("")}</div>`;
  }
  function tabs() {
    const wallMode = mode === "cloud" || mode === "stickers";
    return `<div class="study-mode-row"><nav class="study-modes" aria-label="Режим изучения"><button data-study-mode="cards" class="${mode === "cards" ? "is-selected" : ""}" aria-pressed="${mode === "cards"}">Карточки</button>${wallMode ? `<div class="study-wall-modes"><button data-study-mode="cloud" class="${mode === "cloud" ? "is-selected" : ""}" aria-pressed="${mode === "cloud"}">Облако</button><button data-study-mode="stickers" class="${mode === "stickers" ? "is-selected" : ""}" aria-pressed="${mode === "stickers"}">Стикеры</button></div>` : '<button data-study-mode="cloud" aria-pressed="false">Стена слов</button>'}<button data-study-mode="meaning" class="${mode === "meaning" ? "is-selected" : ""}" aria-pressed="${mode === "meaning"}">По смыслу</button></nav><button class="study-font" id="study-font" aria-label="Размер текста" title="Размер текста">Aa</button></div>`;
  }
  function footer() { return `<footer class="study-bottom"><button class="study-wave" id="study-sound" aria-label="Прослушать слово">${wave}</button>${mode === "cards" && deck.current ? '<button class="study-skip" id="study-next" aria-label="Следующее слово">Дальше ↑</button>' : '<span></span>'}<button class="study-search" id="study-search" aria-label="Найти слово">${ic("search")}</button></footer>`; }
  function bindFooter(word) {
    $("#study-sound").onclick = () => { const w = word || currentRecall || deck.current || sourceWords[0]; if (w) speak(w.hz, $("#study-sound")); };
    $("#study-search").onclick = showSearch;
  }
  function main() {
    if (!active) return; clearSurface(); screen = "main"; currentRecall = null; flipped = false; busy = false;
    app.innerHTML = `<section class="study-layout"><header class="study-header"><div class="study-date-row"><span>${esc(dateText())}</span><button class="study-settings" id="study-settings" aria-label="Настройки обучения">${ic("gear")}</button></div><h1 class="study-heading">${countText()}</h1>${week()}<button class="study-stage" id="study-stage">${esc(stageName)} <span>Выбрать этап</span>${ic("go")}</button>${tabs()}</header><div class="study-surface" id="study-surface"></div>${footer()}</section>`;
    $("#study-settings").onclick = showSettings;
    $("#study-stage").onclick = () => { location.hash = "#/stages"; };
    $("#study-font").onclick = () => { fontStep = (fontStep + 1) % 3; S.settings.studyFont = fontStep; save(); applyFont(); };
    $$("[data-study-mode]").forEach(b => b.onclick = () => { mode = b.dataset.studyMode; S.settings.studyView = mode; save(); main(); });
    bindFooter();
    if (mode === "cards") { drawCard(); const b = $("#study-next"); if (b) b.onclick = advanceCard; }
    else if (mode === "meaning") drawMeaning();
    else drawWall();
  }
  function updateCounters() { const el = $(".study-heading"); if (el) el.innerHTML = countText(); }
  function introduce(word) {
    const key = wordKey(word); if (progress(word)) return false;
    S.srs[key] = { b: 0, d: Date.now() + DAY, lv: word.lv, r: 0, w: 0, first: Date.now(), introduced: true, word, ...(word.curriculum ? { curriculum: word.curriculum } : {}) };
    D().learned++; learned++; markStudy(); save(); return true;
  }
  function finish() {
    const container = $("#study-surface");
    container.innerHTML = `<div class="study-done"><span class="study-done-mark">✓</span><h2>${initialCount ? "На сегодня всё" : "Можно продолжить"}</h2><p>${initialCount ? `Новых слов: ${learned}. Верных ответов: ${correct}.` : "Сейчас нет запланированных карточек. Выберите другой этап или повторите знакомое."}</p><button class="btn" id="study-extra">Ещё 10 слов</button><a class="btn ghost" href="#/stages">Выбрать этап</a><a class="study-return" href="#/learn">К курсу</a></div>`;
    $("#study-extra").onclick = () => { deck.reset(shuffle(sourceWords).slice(0, 10)); cardIndex = 0; main(); };
  }
  function drawCard() {
    const word = deck.current, container = $("#study-surface"); if (!word) return finish();
    const review = !!progress(word), color = palette[cardIndex % palette.length];
    const label = review ? "Вспомните слово" : "Новое слово";
    container.innerHTML = `<div class="study-deck"><div class="study-card-under second ${palette[(cardIndex + 2) % palette.length]}"></div><div class="study-card-under first ${palette[(cardIndex + 1) % palette.length]}"></div><div class="study-card ${color}" id="study-card" role="button" tabindex="0" aria-label="${review ? "Вспомнить слово по переводу" : "Показать перевод"}"><span class="study-card-type">${label}</span><span class="study-drag-hint" aria-hidden="true">Следующее слово</span><div class="study-card-copy ${review ? "is-clue" : "is-hanzi zh"}" id="study-card-copy">${esc(review ? StudyDeck.clue(word) : word.hz)}</div><div class="study-card-foot" id="study-card-foot">${review ? "Нажмите на карточку и вспомните слово" : "Нажмите, чтобы посмотреть перевод"}</div></div><div class="study-card-star">${starBtn(word)}</div></div>`;
    const card = $("#study-card"), token = turn; let drag = null, suppressClick = false;
    function activate() {
      if (!active || busy || token !== turn) return;
      if (review) return recall(word);
      flipped = !flipped; card.classList.toggle("is-flipped", flipped);
      $("#study-card-copy").className = `study-card-copy ${flipped ? "is-definition" : "is-hanzi zh"}`;
      $("#study-card-copy").innerHTML = flipped ? `<span class="study-back-hanzi zh">${esc(word.hz)}</span><span class="py">${esc(word.py)}</span><div class="study-card-definition">${esc(word.ru)}</div>` : esc(word.hz);
      $("#study-card-foot").textContent = flipped ? "Проведите вверх, чтобы перейти дальше" : "Нажмите, чтобы посмотреть перевод";
      card.setAttribute("aria-label", flipped ? "Перевернуть карточку" : "Показать перевод");
    }
    card.onclick = e => { if (e?.target?.closest(".study-card-definition")) return; if (suppressClick) { suppressClick = false; return; } activate(); };
    card.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); } else if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); advanceCard(); } };
    card.onpointerdown = e => {
      if (e.button !== 0 || busy || e.target.closest(".study-card-definition")) return;
      drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0, id: e.pointerId }; card.setPointerCapture?.(e.pointerId);
    };
    card.onpointermove = e => {
      if (!drag || e.pointerId !== drag.id || !active || token !== turn) return;
      drag.dx = e.clientX - drag.x; drag.dy = e.clientY - drag.y;
      if (Math.hypot(drag.dx, drag.dy) > 8) { card.classList.add("is-dragging"); card.style.transform = `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx / 18}deg)`; }
    };
    const release = (e, cancel) => {
      if (!drag || e.pointerId !== drag.id) return;
      const movement = Math.hypot(drag.dx, drag.dy); suppressClick = movement > 8;
      drag = null; card.classList.remove("is-dragging");
      if (!cancel && movement > 75) advanceCard(); else { card.style.transform = ""; if (cancel) suppressClick = true; }
    };
    card.onpointerup = e => release(e, false); card.onpointercancel = e => release(e, true);
    surfaceCleanups.push(() => { card.onclick = card.onkeydown = card.onpointerdown = card.onpointermove = card.onpointerup = card.onpointercancel = null; });
    if (S.settings.studyAutoSpeak && !review) speak(word.hz);
  }
  function advanceCard() {
    if (!active || screen !== "main" || mode !== "cards" || busy || !deck.current) return;
    busy = true; const word = deck.current, revealed = flipped, token = turn;
    const card = $("#study-card"); if (card) { card.classList.add("is-exiting"); card.style.transform = "translate(-35px,-150px) rotate(-9deg)"; }
    taskAfter(() => {
      if (token !== turn) return;
      if (revealed && !progress(word)) { introduce(word); deck.remove(word); } else deck.skip();
      cardIndex++; main();
    }, reducedMotion() ? 0 : 180);
  }
  function wallLabel(word, index) {
    if (!progress(word) || index % 4 === 0) return word.hz;
    const clean = StudyDeck.clue(word).split(";")[0];
    return clean.length > 45 ? clean.slice(0, 42).trim() + "…" : clean;
  }
  function drawWall() {
    const container = $("#study-surface");
    container.innerHTML = `<div class="study-wall" id="study-wall" aria-label="${mode === "cloud" ? "Облако слов с гравитацией" : "Слова-стикеры, которые можно перетаскивать"}"></div>${mode === "cloud" ? '<button class="study-tilt" id="study-tilt">Наклон телефона</button>' : '<p class="study-wall-hint">Перетащите слово · нажмите, чтобы вспомнить</p>'}`;
    const selected = [...new Map([...deck.list(), ...sourceWords].map(w => [wordKey(w), w])).values()].slice(0, 18);
    if (!selected.length) return finish();
    const engine = window.WordWall;
    if (!engine) { container.innerHTML = '<p class="empty">Не удалось открыть стену слов. Обновите страницу.</p>'; return; }
    wall = engine.mount({ container: $("#study-wall"), words: selected, mode, label: wallLabel, onSelect: w => { if (active) recall(w); }, onMotionStatus: status => {
      const b = $("#study-tilt"); if (!b) return;
      b.textContent = status === "enabled" ? "Наклон включён" : status === "requesting" ? "Подключение…" : status === "denied" || status === "unavailable" ? "Можно двигать слова пальцем" : status === "reduced-motion" ? "Движение уменьшено · слова можно двигать" : "Наклон телефона";
      b.disabled = status === "requesting" || status === "enabled";
    } });
    const tilt = $("#study-tilt"); if (tilt) tilt.onclick = () => wall?.enableTilt();
  }
  function drawMeaning() {
    const box = $("#study-surface");
    box.innerHTML = `<div class="study-meaning"><h2>Найдите слово по смыслу</h2><p>Ищите в русских значениях выбранного этапа.</p><label class="search">${ic("search")}<input id="study-meaning-input" placeholder="Например: время, учёба, радость" aria-label="Смысл или русское значение"></label><div class="study-meaning-chips">${["время", "учёба", "радость"].map(x => `<button data-meaning="${x}">${x}</button>`).join("")}</div><div id="study-meaning-results" aria-live="polite"></div></div>`;
    const input = $("#study-meaning-input"), output = $("#study-meaning-results");
    const groups = { "учёба": ["учёба", "учеб", "учить", "учени", "обуч", "урок", "образован", "изуч"], "время": ["время", "минут", "час", "день", "недел", "временн"], "радость": ["радост", "радова", "счаст", "весёл", "весел", "доволь"] };
    const search = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { output.innerHTML = ""; return; }
      const needles = groups[q] || [q], matches = sourceWords.filter(w => needles.some(n => w.ru.toLowerCase().includes(n))).slice(0, 30);
      renderSearchResults(output, matches, "В этом этапе не найдено. Попробуйте другое русское слово.");
    };
    input.oninput = search;
    $$("[data-meaning]").forEach(b => b.onclick = () => { input.value = b.dataset.meaning; search(); });
  }
  function renderSearchResults(container, words, emptyMessage) {
    container.innerHTML = words.length ? words.map((w, i) => `<button class="study-word-result" data-study-result="${i}"><span class="zh">${esc(w.hz)}</span><span><b class="py">${esc(w.py)}</b><small>${esc(w.ru)}</small></span></button>`).join("") : `<p class="hint">${emptyMessage}</p>`;
    $$('[data-study-result]', container).forEach(b => b.onclick = () => { closeOverlay(); recall(words[Number(b.dataset.studyResult)]); });
  }
  function recall(word) {
    if (!active) return; clearSurface(); screen = "recall"; currentRecall = word; busy = false;
    const token = turn, hadProgress = !!progress(word); let answered = false;
    app.innerHTML = `<section class="study-recall-layout"><header class="study-recall-header"><small>${esc(dateText())}</small><p>${countText(true)}</p><div><button class="study-back" id="study-back" aria-label="Назад к карточкам">${ic("back")}</button><span>Вспомните слово</span>${starBtn(word)}</div></header><div class="study-recall-content"><p class="study-recall-instruction">Вспомните китайское слово по значению:</p><div class="study-recall-clue">${esc(StudyDeck.clue(word))}</div><div class="study-recall-feedback" id="study-recall-feedback" aria-live="polite"></div></div><form class="study-recall-form" id="study-recall-form"><div class="study-letter-slots" aria-hidden="true">${[...word.hz].filter(c => /\p{Script=Han}/u.test(c)).slice(0, 12).map(() => '<i></i>').join("")}</div><label class="study-answer-label"><span class="sr-only">Слово по-китайски или пиньинь</span><input id="study-answer" placeholder="Иероглифы или пиньинь" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done"></label><div class="study-recall-actions"><button class="study-submit" id="study-submit" disabled>Проверить</button><button type="button" class="study-forgot" id="study-forgot">Не помню</button><button type="button" class="study-recall-sound" id="study-recall-sound" aria-label="Прослушать слово">${wave}</button></div></form></section>`;
    $("#study-back").onclick = main;
    const input = $("#study-answer"), submit = $("#study-submit"), forgot = $("#study-forgot");
    input.oninput = () => { submit.disabled = !input.value.trim() || answered; };
    $("#study-recall-sound").onclick = () => speak(word.hz, $("#study-recall-sound"));
    function answer(ok) {
      if (answered || !active || token !== turn) return; answered = true; input.readOnly = true; input.blur(); submit.disabled = true; forgot.disabled = true;
      if (!hadProgress) { D().learned++; learned++; } else D().reviewed++;
      grade(word, ok); record(ok, wordKey(word), word.lv, word);
      if (ok) { correct++; deck.remove(word); } else deck.retry(word);
      $("#study-recall-feedback").innerHTML = `<div class="${ok ? "is-correct" : "is-incorrect"}"><b>${ok ? "Верно!" : "Вот это слово"}</b><strong class="zh">${esc(word.hz)}</strong><p class="py">${esc(word.py)}</p><details class="study-answer-definition"><summary>Полное значение</summary><div>${esc(word.ru)}</div></details><p>${ok ? "Вернёмся к нему в следующем повторении." : "Оно ещё раз появится в этой тренировке."}</p></div>`;
      $("#study-recall-form").innerHTML = '<button class="study-submit study-recall-next" id="study-recall-next">Дальше</button>';
      $("#study-recall-next").onclick = e => { e.preventDefault(); main(); };
    }
    $("#study-recall-form").onsubmit = e => { e.preventDefault(); if (input.value.trim()) answer(StudyDeck.matches(word, input.value)); };
    forgot.onclick = () => answer(false);
  }
  function closeOverlay() { document.querySelector(".study-overlay")?.remove(); searchSerial++; }
  function overlay(title, body) {
    closeOverlay();
    const el = h(`<div class="study-overlay"><section class="study-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="study-sheet-title"><h2>${esc(title)}</h2><button id="study-close-sheet" aria-label="Закрыть">${ic("close")}</button></div>${body}</section></div>`);
    document.body.append(el); $("#study-close-sheet", el).onclick = closeOverlay; el.onclick = e => { if (e.target === el) closeOverlay(); };
    return el;
  }
  function showSettings() {
    const el = overlay("Как учиться", `<a class="study-setting-link" href="#/stages">${ic("layers")} Выбрать этап ${esc(stageName)}</a><label class="study-setting-label">Новых слов в день<select id="study-daily">${[5, 10, 15, 20, 30, 50].map(n => `<option value="${n}" ${n === S.settings.newPerDay ? "selected" : ""}>${n}</option>`).join("")}</select></label><label class="study-setting-check"><span>Произносить новые слова автоматически</span><input type="checkbox" id="study-autospeak" ${S.settings.studyAutoSpeak ? "checked" : ""}></label><p class="hint">Наклон включается кнопкой на стене слов. На компьютере слова можно перетаскивать.</p><a class="btn" href="#/learn">К курсу</a><button class="btn ghost" id="study-settings-done">Готово</button>`);
    $("#study-daily", el).onchange = e => { S.settings.newPerDay = Number(e.target.value); save(); };
    $("#study-autospeak", el).onchange = e => { S.settings.studyAutoSpeak = e.target.checked; save(); };
    $("#study-settings-done", el).onclick = () => {
      closeOverlay();
      if (options.mode === "learn") {
        const remaining = Math.max(0, S.settings.newPerDay - D().learned), due = deck.list().filter(w => progress(w));
        deck.reset(due.concat(sourceWords.filter(w => !progress(w)).slice(0, remaining))); main();
      }
    };
  }
  function showSearch() {
    const el = overlay("Найти слово", '<label class="search">'+ic("search")+'<input id="study-lookup" placeholder="汉字 · pinyin · русский перевод" aria-label="Найти слово в полном курсе" autocomplete="off"></label><div id="study-lookup-results" class="study-lookup-results" aria-live="polite"></div>');
    const input = $("#study-lookup", el), output = $("#study-lookup-results", el); let timer;
    input.oninput = () => { clearTimeout(timer); const token = ++searchSerial, q = input.value.trim();
      if (!q) { output.innerHTML = ""; return; }
      output.innerHTML = '<p class="hint">Ищем…</p>';
      timer = taskAfter(async () => {
        try {
          const all = await HSK3.all(); if (!active || token !== searchSerial || !el.isConnected) return;
          const norm = value => StudyDeck.normalizePinyin(value).toLowerCase(); const needle = norm(q);
          const results = all.filter(w => w.hz.includes(q) || norm(w.py).includes(needle) || w.ru.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
          renderSearchResults(output, results, "Ничего не найдено. Попробуйте другое написание.");
        } catch (_) { if (active && token === searchSerial) output.innerHTML = '<p class="hint">Для полного поиска нужен интернет. Открытые карточки остаются доступны.</p>'; }
      }, 180);
    };
    input.focus();
  }
  listen(document, "keydown", e => { if (e.key === "Escape") { if (document.querySelector(".study-overlay")) closeOverlay(); else if (screen === "recall") main(); } });
  main();
  return { destroy: cleanup, recall, getCurrent: () => deck.current, getMode: () => mode };
}
