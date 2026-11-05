"use strict";
/* One HSK course: official syllabus plus explicitly marked legacy supplements. */
const HSK3 = (() => {
  const ids = ["1", "2", "3", "4", "5", "6", "7-9"];
  const limits = [300, 500, 1000, 2000, 3600, 5400, 11000];
  const pending = new Map(), levels = new Map();
  let unifiedManifest = null;
  const posRu = { 数量: "числ. + счётное сл.", 名: "сущ.", 动: "глаг.", 形: "прил.", 副: "нареч.", 代: "мест.", 数: "числ.", 量: "счётное сл.", 介: "предлог", 连: "союз", 助: "частица", 叹: "междом.", 拟声: "звукоподр.", 区别: "определение", 前缀: "приставка", 后缀: "суффикс" };
  const readPath = url => {
    if (!pending.has(url)) pending.set(url, fetch(url).then(r => {
      if (!r.ok) throw Error(`HSK: ${r.status}`);
      return r.json();
    }).catch(e => { pending.delete(url); throw e; }));
    return pending.get(url);
  };
  const read = name => readPath(`data/hsk3/${name}`);
  const bridge = () => read("legacy-bridge.json");
  const legacy = level => readPath(`data/hsk${level}.json`);
  const isSupplement = row => row[3] === "reading" || row[3] === "extra";
  const supplementId = row => `hsk3-extra-${row[1]}-${String(row[2] + 1).padStart(4, "0")}`;
  const adapt = w => ({ ...w, curriculum: "hsk3", lv: w.level, isSupplement: false,
    posZh: w.pos, pos: (w.pos || "").replace(/数量|拟声|区别|前缀|后缀|[名动形副代数量介连助叹]/g, p => posRu[p]) });
  const supplement = async row => {
    const record = (await legacy(row[1]))[row[2]];
    if (!record || record[0] !== row[0]) throw Error("Не удалось сопоставить дополнительное слово");
    const [hz, py, ru, pos] = record;
    return { id: supplementId(row), hz, py, ru, pos, level: String(row[1]), lv: String(row[1]),
      curriculum: "hsk3", isSupplement: true, ruSource: "existing-hsk", ruScope: "headword",
      officialLabel: hz, additionalLevels: [], number: null, legacyLevel: row[1],
      legacyIndex: row[2], legacyKind: row[3] };
  };
  const manifest = () => {
    if (!unifiedManifest) unifiedManifest = Promise.all([read("manifest.json"), bridge()]).then(([official, old]) => ({
      ...official, version: old.version, officialVersion: official.version,
      totalEntries: old.counts.total, officialEntries: official.totalEntries, supplementEntries: old.counts.supplement,
      levels: official.levels.map(group => {
        const unified = old.levels.find(level => level.id === group.id);
        return { ...group, ...unified, count: unified.totalCount,
          officialCumulativeCount: group.cumulativeCount };
      })
    })).catch(error => { unifiedManifest = null; throw error; });
    return unifiedManifest;
  };
  const level = async id => {
    id = String(id);
    if (!ids.includes(id)) throw Error("Неизвестный уровень HSK");
    if (!levels.has(id)) levels.set(id, Promise.all([read("manifest.json"), bridge()]).then(async ([official, old]) => {
      const group = official.levels.find(l => l.id === id);
      const [entries, additions] = await Promise.all([
        Promise.all(group.files.map(part => read(part.file))),
        Promise.all(old.rows.filter(row => String(row[1]) === id && isSupplement(row)).map(supplement))
      ]);
      return entries.flat().map(adapt).concat(additions);
    }).catch(e => { levels.delete(id); throw e; }));
    return levels.get(id);
  };
  const all = () => Promise.all(ids.map(level)).then(a => a.flat());
  const cumulative = id => {
    const index = ids.indexOf(String(id));
    if (index < 0) return Promise.reject(Error("Неизвестный уровень HSK"));
    return Promise.all(ids.slice(0, index + 1).map(level)).then(a => a.flat());
  };
  const extraRow = async key => {
    const match = /^hsk3-extra-([1-6])-(\d{4})$/.exec(key || "");
    if (!match || Number(match[2]) < 1) return null;
    return (await bridge()).rows.find(row => row[1] === Number(match[1]) && row[2] === Number(match[2]) - 1 && isSupplement(row)) || null;
  };
  const find = async key => {
    if (/^hsk3-extra-/.test(key || "")) {
      const row = await extraRow(key);
      return row ? supplement(row) : null;
    }
    if (!/^hsk3-\d{5}$/.test(key || "")) return null;
    const number = Number(key.slice(5)), index = limits.findIndex(n => number <= n);
    if (number < 1 || index < 0) return null;
    const official = await read("manifest.json");
    const group = official.levels.find(l => l.id === ids[index]);
    const part = group.files.find(f => number >= f.firstNumber && number <= f.lastNumber);
    if (!part) return null;
    const word = (await read(part.file)).find(w => w.id === key);
    return word ? adapt(word) : null;
  };
  const legacyDetails = async key => {
    let rows;
    if (/^hsk3-extra-/.test(key || "")) {
      const row = await extraRow(key); rows = row ? [row] : [];
    } else if (/^hsk3-\d{5}$/.test(key || "")) {
      const number = Number(key.slice(5));
      if (number < 1 || number > 11000) return [];
      rows = (await bridge()).rows.filter(row => row[4].includes(number));
    } else return [];
    return Promise.all(rows.map(async row => {
      const record = (await legacy(row[1]))[row[2]];
      if (!record || record[0] !== row[0]) throw Error("Не удалось загрузить исходное значение слова");
      const [hz, py, ru, pos] = record;
      return { hz, py, ru, pos, legacyLevel: row[1], legacyIndex: row[2], kind: row[3],
        officialNumbers: row[4].slice(), sourceFile: `data/hsk${row[1]}.json` };
    }));
  };
  return { ids, level, all, cumulative, find, bridge, manifest, legacyDetails, exams: () => read("exams.json") };
})();

const h3Tasks = n => `${n} ${plural(n, "задание", "задания", "заданий")}`;
const h3Label = id => String(id).replace("-", "–");
const h3Url = (id, view = "vocab") => `#/hsk3/${id}/${view}`;
const h3Norm = value => String(value || "").normalize("NFD").replace(/u\u0308|u:/gi, "v").replace(/\p{M}/gu, "").toLocaleLowerCase("ru-RU");
const h3Learned = words => words.filter(w => wordProgress(w)?.b >= 1).length;
const h3Visual = v => v ? `<div class="hsk3-visual" role="img" aria-label="${esc(v.altRu || "Иллюстрация")}">${esc(v.emoji || "")}</div>` : "";

async function pageHSK3(id, view = "vocab") {
  const routeHash = location.hash;
  app.innerHTML = `${topbar("HSK", "#/stages")}<p class="empty">Загрузка курса…</p>`;
  const manifest = await HSK3.manifest();
  if (location.hash !== routeHash) return;
  if (!id) {
    app.innerHTML = `${topbar("HSK · единый курс 1–9", "#/stages")}
      <div class="card-blue hsk3-intro"><p class="kicker">Единый курс</p><h2>11 295 словарных карточек.<br>От первого шага — к сложным темам.</h2><p class="sub">11 000 записей официальной программы и 295 дополнительных слов. Русские значения, карточки и все типы заданий — в одном курсе.</p></div>
      <p class="hint">В каждой группе — слова официальной программы и дополнения прежнего курса. Дополнения сохранены на прежнем учебном этапе; это не официальное присвоение уровня HSK. Уровни 7–9 имеют общий список и один экзамен.</p>
      <div class="library-books">${manifest.levels.map(l => `<a class="library-book" href="${h3Url(l.id)}"><span class="library-number">${h3Label(l.id)}</span><div><h3>HSK · ${h3Label(l.id)}</h3><p>${l.count.toLocaleString("ru-RU")} карточек · ${l.officialCount.toLocaleString("ru-RU")} по программе + ${l.supplementCount} дополнительных</p></div>${ic("go")}</a>`).join("")}</div>
      <div class="box"><h3>О программе</h3><p class="hint">Словарь: новая программа HSK, опубликованная в ноябре 2025 года. Общий запуск HSK 3.0 объявлен на 13 декабря 2026 года; формат конкретной сессии уточняйте в экзаменационном центре. Это не список из стандарта 2021 года.</p><p class="hint">Русские значения взяты из учебного словаря приложения и 大БКРС. Это словарные толкования, а не официальный перевод программы. Для разных значений одного слова показана полная словарная статья; отдельные строки программы сохранены.</p><a class="btn small ghost" href="https://www.chinesetest.cn/HSK" target="_blank" rel="noopener">Официальная информация HSK</a></div>`;
    return;
  }
  if (!HSK3.ids.includes(id)) { location.hash = "#/hsk3"; return; }
  S.settings.curriculum = "hsk3"; S.settings.hsk3Level = id; save();
  const meta = manifest.levels.find(l => l.id === id);
  if (view === "exam") return h3Exam(id);
  const words = await HSK3.level(id);
  if (location.hash !== routeHash) return;
  if (view === "study") return h3Study(id, words);
  if (view === "quiz") return h3Quiz(id, words);
  return h3Vocab(id, words, meta);
}

function h3Header(id, active) {
  return `${topbar(`HSK · ${h3Label(id)}`, "#/stages")}<nav class="hsk3-nav" aria-label="Разделы курса HSK">${[["vocab", "Слова"], ["study", "Карточки"], ["quiz", "Тест слов"], ["exam", "Типы заданий"]].map(([key, label]) => `<a href="${h3Url(id, key)}" ${key === active ? 'aria-current="page"' : ""}>${label}</a>`).join("")}</nav>`;
}

function h3Vocab(id, initial, meta) {
  let words = initial, query = "", page = 0, serial = 0, alive = true;
  const size = 40;
  onLeave(() => { alive = false; serial++; });
  app.innerHTML = `${h3Header(id, "vocab")}<p class="sub">${meta.count.toLocaleString("ru-RU")} карточек · ${meta.cumulativeCount.toLocaleString("ru-RU")} с предыдущими этапами</p>
    <p class="hint">${meta.officialCount.toLocaleString("ru-RU")} слов официальной программы + ${meta.supplementCount} дополнительных. Дополнительные слова и варианты чтения сохранены на прежнем учебном этапе; этот этап не является их официальным уровнем HSK.</p>
    <label class="field"><span>Список слов</span><select id="h3-scope"><option value="new">Только слова этого этапа</option>${id !== "1" ? '<option value="all">Включая предыдущие этапы</option>' : ""}</select></label>
    <label class="search">${ic("search")}<input id="h3-search" placeholder="汉字 · pinyin · русский перевод" aria-label="Поиск по словарю HSK" autocomplete="off" spellcheck="false"></label>
    <p class="hint" id="h3-count" aria-live="polite"></p><div id="h3-words"></div><div class="two" id="h3-pages"></div>`;
  const input = $("#h3-search"), count = $("#h3-count"), container = $("#h3-words"), paging = $("#h3-pages"), scope = $("#h3-scope");
  function draw() {
    const q = h3Norm(query).trim().replace(/([a-z])[1-5](?=\b|[a-z])/g, "$1");
    const list = q ? words.filter(w => h3Norm(`${w.hz} ${w.py} ${w.py.replace(/\s/g, "")} ${w.ru}`).includes(q)) : words;
    const pages = Math.max(1, Math.ceil(list.length / size)); page = Math.min(page, pages - 1);
    count.textContent = `Найдено: ${list.length.toLocaleString("ru-RU")} · выучено: ${h3Learned(words)} / ${words.length.toLocaleString("ru-RU")} · страница ${page + 1} / ${pages}`;
    container.innerHTML = list.length ? list.slice(page * size, (page + 1) * size).map(w => `<div class="hsk3-word">${wordRow(w)}<p class="hint">${w.isSupplement ? `Дополнительное слово · учебный этап ${h3Label(w.level)}` : `№ ${w.number} · HSK ${h3Label(w.level)}`}${w.officialLabel !== w.hz ? ` · запись в программе: <span class="zh">${esc(w.officialLabel)}</span>` : ""}${w.additionalLevels?.length ? ` · дополнительные части речи на уровнях HSK ${w.additionalLevels.map(h3Label).join(", ")}` : ""}</p></div>`).join("") : '<p class="empty">Ничего не найдено. Попробуйте другую форму слова.</p>';
    paging.innerHTML = `<button class="btn ghost" id="h3-prev" ${!page ? "disabled" : ""}>‹ Назад</button><button class="btn ghost" id="h3-next" ${page + 1 >= pages ? "disabled" : ""}>Дальше ›</button>`;
    $("#h3-prev").onclick = () => { page--; draw(); input.scrollIntoView({ block: "start" }); };
    $("#h3-next").onclick = () => { page++; draw(); input.scrollIntoView({ block: "start" }); };
  }
  input.oninput = () => { query = input.value; page = 0; draw(); };
  scope.onchange = async () => {
    const token = ++serial; count.textContent = "Загрузка списка…";
    try { const next = scope.value === "all" ? await HSK3.cumulative(id) : initial;
      if (!alive || token !== serial) return; words = next; page = 0; draw();
    } catch (_) { if (alive && token === serial) { count.textContent = "Не удалось загрузить предыдущие уровни. Повторите выбор при подключении к интернету."; scope.value = "new"; } }
  };
  draw();
}

function h3Study(id, words) {
  const due = words.filter(w => wordProgress(w)?.d <= Date.now());
  const fresh = words.filter(w => !wordProgress(w)).slice(0, Math.max(0, S.settings.newPerDay - D().learned));
  const queue = shuffle(due).slice(0, 20).concat(fresh);
  return runStudySession({ queue, words, curriculum: "hsk3", level: id,
    title: `HSK · ${h3Label(id)}`, backHref: "#/stages", quizHref: h3Url(id, "quiz"), mode: "learn" });
}

function h3Quiz(id, words) {
  // A full dictionary article can begin with a reading heading or a different sense.
  // Only short teaching definitions with an unambiguous syllabus entry make quiz answers.
  const occurrences = new Map(); words.forEach(w => occurrences.set(w.hz, (occurrences.get(w.hz) || 0) + 1));
  const usable = words.filter(w => w.ruSource === "existing-hsk" && w.officialLabel === w.hz && occurrences.get(w.hz) === 1 && /[а-яё]/i.test(short(w.ru)));
  const qs = shuffle(usable).slice(0, 10).map((w, i) => {
    const type = i % 2 ? "ru2zh" : "zh2ru", seen = new Set([type === "ru2zh" ? w.hz : short(w.ru)]);
    const others = shuffle(usable).filter(x => {
      const key = type === "ru2zh" ? x.hz : short(x.ru);
      if (x.hz === w.hz || seen.has(key)) return false; seen.add(key); return true;
    }).slice(0, 3);
    return { w, type, opts: shuffle([w, ...others]) };
  });
  let index = 0, right = 0, finished = false, active = true;
  onLeave(() => { active = false; });
  function draw() {
    if (!active) return;
    const q = qs[index];
    if (!q) {
      if (finished) return; finished = true;
      S.history.unshift({ t: Date.now(), kind: `HSK · ${h3Label(id)} · слова`, score: `${right}/${qs.length}` }); S.history = S.history.slice(0, 50); save();
      app.innerHTML = `${h3Header(id, "quiz")}<div class="result"><div class="score">${right}/${qs.length}</div><p>Это тренировка слов, не экзаменационная оценка HSK.</p><p>Ошибки сохранены в словарике для повторения.</p><button class="btn" id="h3-again">Ещё 10 слов</button><a class="btn ghost" href="${h3Url(id, "exam")}">Официальные типы заданий</a></div>`;
      $("#h3-again").onclick = () => h3Quiz(id, words); return;
    }
    let locked = false;
    app.innerHTML = `${h3Header(id, "quiz")}<p class="hint">Тест по словам с кратким учебным переводом. Полный список доступен в карточках.</p><div class="qhead"><div class="bar"><i style="width:${index / qs.length * 100}%"></i></div><span>${index + 1}/${qs.length}</span></div><div class="qcard"><p>${q.type === "zh2ru" ? "Выберите значение слова" : "Выберите слово по-китайски"}</p><div class="${q.type === "zh2ru" ? "big zh" : "hsk3-prompt"}">${esc(q.type === "zh2ru" ? q.w.hz : short(q.w.ru))}</div></div>
      <div class="opts">${q.opts.map((w, i) => `<button class="opt ${q.type === "ru2zh" ? "zhopt" : ""}" data-h3-answer="${i}">${esc(q.type === "zh2ru" ? short(w.ru) : w.hz)}</button>`).join("")}</div><div id="h3-feedback" aria-live="polite"></div>`;
    $$("[data-h3-answer]").forEach(button => button.onclick = () => {
      if (locked || !active) return; locked = true;
      const ok = q.opts[Number(button.dataset.h3Answer)].id === q.w.id;
      $$("[data-h3-answer]").forEach(b => { b.disabled = true; if (q.opts[Number(b.dataset.h3Answer)].id === q.w.id) b.classList.add("right"); });
      if (ok) right++; else button.classList.add("wrong");
      if (!wordProgress(q.w)) D().learned++;
      grade(q.w, ok); record(ok, q.w.id, q.w.lv, q.w);
      $("#h3-feedback").innerHTML = `<div class="fb ${ok ? "ok" : "no"}"><b>${ok ? "Верно!" : "Правильный ответ:"} <span class="zh">${esc(q.w.hz)}</span></b><p>${esc(q.w.py)}</p><p class="entry-definition">${esc(q.w.ru)}</p>${sayBtn(q.w.hz)}</div><button class="btn" id="h3-continue">${index + 1 < qs.length ? "Дальше" : "Результат"}</button>`;
      $("#h3-continue").onclick = () => { index++; draw(); };
    });
  }
  draw();
}

async function h3Exam(id) {
  const routeHash = location.hash, data = await HSK3.exams();
  if (location.hash !== routeHash) return;
  const exam = data.levels.find(x => x.id === id);
  if (!exam) throw Error("Нет описания экзамена");
  let timer = null, active = true;
  onLeave(() => { active = false; clearInterval(timer); });
  const stopTimer = () => { clearInterval(timer); timer = null; };
  const totalTypes = exam.sections.reduce((n, s) => n + s.types.length, 0);
  function overview() {
    stopTimer();
    app.innerHTML = `${h3Header(id, "exam")}<div class="card-blue hsk3-intro"><p class="kicker">Структура экзамена</p><h2>${totalTypes} типов заданий</h2><p class="sub">${h3Tasks(exam.writtenQuestionCount ?? exam.questionCount)}${exam.speakingRequired && !exam.speakingIntegrated ? " в письменной части" : ""} · ${exam.writtenDurationMinutes ?? exam.durationMinutes ?? "—"} мин${exam.speakingIntegrated ? " · единый экзамен, 5 навыков" : exam.speakingRequired ? " · устная часть отдельно" : ""}</p></div><p class="hint">Ниже — все типы заданий и авторские учебные примеры. Это не полный официальный вариант и не прогноз балла. Для аудирования используется голос вашего устройства.</p><p class="hint">${esc(data.visualNoticeRu || "")}</p>
      ${exam.timingRu ? `<p class="hint">${esc(exam.timingRu)}</p>` : ""}${exam.scoringRu ? `<p class="notice">${esc(exam.scoringRu)}</p>` : ""}
      ${exam.sections.map((section, si) => `<section class="hsk3-section"><div class="section"><h2>${esc(section.titleRu)}</h2><span class="muted">${h3Tasks(section.questionCount)}${section.durationMinutes ? ` · ${section.durationMinutes} мин` : ""}</span></div>${section.preparationNoteRu ? `<p class="hint">${esc(section.preparationNoteRu)}</p>` : ""}<div class="list">${section.types.map((type, ti) => `<button class="row" data-h3-type="${si}:${ti}"><span class="ic">${ic(section.id.includes("listen") ? "ear" : section.id.includes("speak") ? "mic" : section.id.includes("writ") ? "pen" : "read")}</span><span class="t"><b>${esc(type.titleRu)}</b><small>${esc(type.descriptionRu)}</small><small>${h3Tasks(type.questionCount)} на экзамене · примеров: ${type.examples.length}</small></span>${ic("go", "i go")}</button>`).join("")}</div></section>`).join("")}
      <div class="box"><h3>Источники и версия</h3><p class="hint">${esc(data.edition || "Новая программа HSK")} · проверено ${esc(data.verifiedOn || "")}</p><p class="hint">Структура сверена по официальным материалам Chinese Testing International. Для уровней 7–9 действует общий экзамен; результат определяет уровень.</p>${exam.noteRu ? `<p class="hint">${esc(exam.noteRu)}</p>` : ""}<a class="btn small ghost" href="https://www.chinesetest.cn/HSK" target="_blank" rel="noopener">Сведения организатора</a></div>`;
    $$("[data-h3-type]").forEach(b => b.onclick = () => { const [si, ti] = b.dataset.h3Type.split(":").map(Number); exercise(si, ti, 0); });
  }
  function exercise(si, ti, ei) {
    if (!active) return; stopTimer();
    const section = exam.sections[si], type = section.types[ti], example = type.examples[ei];
    let answered = false, elapsed = 0, started = 0;
    const chart = example.chart ? `<div class="hsk3-table"><table><thead><tr>${example.chart.headers.map(hd => `<th>${esc(hd)}</th>`).join("")}</tr></thead><tbody>${example.chart.rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : "";
    app.innerHTML = `${h3Header(id, "exam")}<button class="btn small ghost" id="h3-types">‹ Все типы заданий</button><div class="section"><h2>${esc(type.titleRu)}</h2><span class="muted">${ei + 1}/${type.examples.length}</span></div><p class="sub">${esc(type.descriptionRu)}</p><p class="hint">Авторский пример · ${esc(section.titleRu)}</p>
      <div class="box hsk3-example"><p>${esc(example.promptRu)}</p>${example.promptZh ? `<p class="zh hsk3-prompt">${esc(example.promptZh)}</p>` : ""}${example.promptPinyin ? `<p class="py">${esc(example.promptPinyin)}</p>` : ""}${h3Visual(example.visual)}${example.visualSequence ? `<div class="hsk3-sequence">${example.visualSequence.map((v, i) => `<div><span class="hint">${i + 1}</span>${h3Visual(v)}</div>`).join("")}</div>` : ""}${chart}
      ${example.audioTextZh ? `<button class="btn ghost" data-say="${esc(example.audioTextZh)}">${ic("speaker")} Прослушать задание</button><p class="hint">Синтез речи устройства · учебный пример.</p><details class="hsk3-transcript"><summary>Показать текст записи</summary><p class="zh">${esc(example.audioTextZh)}</p></details>` : ""}</div>
      ${example.kind === "choice" ? `<div class="opts">${example.options.map((option, i) => `<button class="opt" data-h3-choice="${i}"><span class="hsk3-option-letter">${String.fromCharCode(65 + i)}</span>${h3Visual(option.visual)}<span class="zh">${esc(option.zh || "")}</span>${option.pinyin ? `<span class="py">${esc(option.pinyin)}</span>` : ""}${option.ru ? `<span>${esc(option.ru)}</span>` : ""}</button>`).join("")}</div>` : `<label class="field"><span>${section.id.includes("speak") ? "Заметки для ответа (необязательно)" : "Ваш ответ"}</span><textarea id="h3-answer" rows="5" placeholder="${section.id.includes("translat") ? "Введите перевод…" : "请在这里写…"}" autocomplete="off" spellcheck="false"></textarea></label><button class="btn" id="h3-check">${example.kind === "text" ? "Проверить" : "Показать пример и критерии"}</button>`}
      ${example.kind === "self-assess" ? '<div class="two"><button class="btn ghost" id="h3-clock">Начать отсчёт</button><output class="hsk3-clock" id="h3-time" aria-label="Время ответа">0:00</output></div>' : ""}<div id="h3-result" aria-live="polite"></div>`;
    $("#h3-types").onclick = overview;
    const clockButton = $("#h3-clock");
    if (clockButton) clockButton.onclick = () => {
      if (timer) { elapsed += Date.now() - started; stopTimer(); clockButton.textContent = "Продолжить отсчёт"; }
      else { started = Date.now(); clockButton.textContent = "Пауза"; timer = setInterval(() => { const s = Math.floor((elapsed + Date.now() - started) / 1000); $("#h3-time").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }, 250); }
    };
    const reveal = (ok, selected) => {
      if (answered || !active) return; answered = true; stopTimer();
      if (clockButton) clockButton.disabled = true;
      if (typeof ok === "boolean") record(ok); else { markStudy(); save(); }
      const options = $$("[data-h3-choice]"); options.forEach(b => { b.disabled = true; if (Number(b.dataset.h3Choice) === example.answerIndex) b.classList.add("right"); });
      if (selected && !ok) selected.classList.add("wrong");
      const check = $("#h3-check"); if (check) check.disabled = true;
      const answerInput = $("#h3-answer"); if (answerInput) answerInput.readOnly = true;
      const ref = example.answerZh || example.acceptedAnswers?.[0] || example.options?.[example.answerIndex]?.zh || "";
      const checks = Array.isArray(example.selfCheckRu) ? example.selfCheckRu : example.selfCheckRu ? [example.selfCheckRu] : [];
      $("#h3-result").innerHTML = `<div class="fb ${ok === false ? "no" : "ok"}"><b>${ok === true ? "Верно!" : ok === false ? "Сравните с ответом" : "Пример ответа и самопроверка"}</b>${ref ? `<p class="zh hsk3-prompt">${esc(ref)}</p>` : ""}<p>${esc(example.explanationRu)}</p>${checks.length ? `<ul>${checks.map(c => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}${example.kind === "self-assess" ? '<p class="hint">Развёрнутый ответ не оценивается автоматически. Сравните смысл, структуру и языковые ошибки; при подготовке к экзамену попросите преподавателя проверить работу.</p>' : ""}</div>${ei + 1 < type.examples.length ? '<button class="btn" id="h3-next-example">Следующий пример</button>' : ""}<button class="btn ghost" id="h3-back-types">К типам заданий</button>`;
      $("#h3-back-types").onclick = overview;
      const next = $("#h3-next-example"); if (next) next.onclick = () => exercise(si, ti, ei + 1);
    };
    $$("[data-h3-choice]").forEach(b => b.onclick = () => reveal(Number(b.dataset.h3Choice) === example.answerIndex, b));
    const check = $("#h3-check");
    if (check) check.onclick = () => {
      if (example.kind !== "text") return reveal(null);
      const value = $("#h3-answer").value.trim(); if (!value) { $("#h3-answer").focus(); return; }
      const normalize = text => String(text).replace(/[\s，。！？、,.!?；;“”"'：:]/g, "");
      const answers = example.acceptedAnswers || [example.answerZh];
      reveal(answers.some(answer => normalize(answer) === normalize(value)));
    };
    window.scrollTo(0, 0);
  }
  overview();
}
