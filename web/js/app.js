"use strict";
/* ========== ХаньюйТун · 汉语熊猫 — китайский для русскоговорящих ========== */

const APP_KEY = "hanyutong-v2";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const h = html => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const app = $("#app");
const DAY = 864e5;
const today = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const plural = (n, one, few, many) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many; };

/* ---------- иконки ---------- */
const ICON = {
  home: '<path d="M3 10.5 12 3l9 7.5M5.3 9v11h5v-6h3.4v6h5V9"/>',
  book: '<path d="M3 4.8c4-1.4 6.7-1.1 9 1.4 2.3-2.5 5-2.8 9-1.4V20c-4-1.4-6.7-1.1-9 1-2.3-2.1-5-2.4-9-1V4.8ZM12 6.2V21"/>',
  review: '<path d="M5.2 7A8 8 0 1 1 4 14M5.2 3v4H1.4M8.7 11.6l2.2 2.2 4.4-4.6"/>',
  user: '<circle cx="12" cy="7.5" r="3.6"/><path d="M4.5 21v-1.5a7.5 7.5 0 0 1 15 0V21"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.7"/><path d="m15.5 15.5 5 5"/>',
  go: '<path d="m9 5 7 7-7 7"/>', back: '<path d="m14.5 4-8 8 8 8"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>', star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8L12 3.5Z"/>',
  speaker: '<path d="M4 9.5v5h4l5 4v-13l-5 4H4Z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4"/>', ear: '<path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5.5 1.6M10 9.5a2 2 0 0 1 4 0"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9.5h8M8 12.5h5"/>', cards: '<rect x="3" y="6" width="13" height="15" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v13"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H3.5A3.5 3.5 0 0 0 7 10M17 6h3.5A3.5 3.5 0 0 1 17 10M12 14v4M8 21h8"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>', bookmark: '<path d="M6 3h12v18l-6-4-6 4V3Z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
  wave: '<path d="M3 12h2M7 8v8M11 5v14M15 8v8M19 10v4M21 12h0"/>', read: '<path d="M4 5h7v14H4zM13 5h7v14h-7z"/><path d="M6.5 9h2M6.5 12h2M15.5 9h2M15.5 12h2"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.6v.4"/>', download: '<path d="M12 4v11M7 10.5l5 5 5-5M4 20h16"/>',
};
const ic = (name, cls = "i") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name] || ""}</svg>`;

/* ---------- оригинальный маскот: панда ---------- */
const PANDA = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="15" cy="15" r="9" fill="#1d1f23"/><circle cx="49" cy="15" r="9" fill="#1d1f23"/><circle cx="32" cy="35" r="23" fill="#fff" stroke="#1d1f23" stroke-width="2.4"/><ellipse cx="22.5" cy="33" rx="6" ry="7.5" transform="rotate(-25 22.5 33)" fill="#1d1f23"/><ellipse cx="41.5" cy="33" rx="6" ry="7.5" transform="rotate(25 41.5 33)" fill="#1d1f23"/><circle cx="23.5" cy="32.5" r="2.2" fill="#fff"/><circle cx="40.5" cy="32.5" r="2.2" fill="#fff"/><ellipse cx="32" cy="42" rx="3.6" ry="2.6" fill="#1d1f23"/><path d="M28.5 46.5q3.5 3 7 0" fill="none" stroke="#1d1f23" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="42" r="3" fill="#f6c9cf" opacity=".8"/><circle cx="47" cy="42" r="3" fill="#f6c9cf" opacity=".8"/></svg>`;
const ART_READ = `<svg viewBox="0 0 160 130" fill="none" stroke="#18191a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="58" cy="30" r="9" fill="#18191a"/><circle cx="96" cy="30" r="9" fill="#18191a"/><circle cx="77" cy="48" r="25" fill="#fff"/><ellipse cx="67" cy="47" rx="5.5" ry="7" transform="rotate(-25 67 47)" fill="#18191a"/><ellipse cx="87" cy="47" rx="5.5" ry="7" transform="rotate(25 87 47)" fill="#18191a"/><path d="M73 58q4 3 8 0"/><path d="M40 112c2-22 15-34 37-34s35 12 37 34" fill="#fff"/><path d="M44 96h66l-8 22H52z" fill="#fff"/><path d="M77 96v22M58 103h12M84 103h12M58 109h9M84 109h9"/><path d="M20 120h120"/><text x="124" y="40" font-family="Noto Sans SC,sans-serif" font-size="17" fill="#18191a" stroke="none">你</text><text x="20" y="60" font-family="Noto Sans SC,sans-serif" font-size="15" fill="#18191a" stroke="none">好</text><path d="M118 52l8-4M26 34l7 3M133 62l6 2"/></svg>`;
const ART_WELCOME = `<svg viewBox="0 0 280 225" fill="none" stroke="#202226" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M33 91C44 49 93 36 137 43c53-18 112 18 113 68 19 49-33 83-81 81-58 16-122-3-138-42-10-21-7-42 2-59Z" fill="#EDF4FD" stroke="none"/><path d="M70 105c22-8 46-8 70 4v84c-24-12-48-12-70-4z" fill="#fff"/><path d="M210 105c-22-8-46-8-70 4v84c24-12 48-12 70-4z" fill="#fff"/><path d="M86 128c14-4 28-3 40 2M86 145c14-4 28-3 40 2M154 130c12-5 26-6 40-2M154 147c12-5 26-6 40-2" stroke="#8aa3c4"/><path d="M96 38h88a10 10 0 0 1 10 10v28a10 10 0 0 1-10 10h-56l-14 12V86H96a10 10 0 0 1-10-10V48a10 10 0 0 1 10-10Z" fill="#fff"/><text x="140" y="72" text-anchor="middle" font-family="Noto Sans SC,sans-serif" font-size="25" font-weight="700" fill="#202226" stroke="none">你好！</text><path d="M60 46l8 7M54 70h11M218 44l-8 8M224 66h-11"/><path d="M228 170l18-48 7 3-18 48-8 5z" fill="#fff"/></svg>`;

/* ---------- состояние ---------- */
const DEFAULT = { v: 2, profile: null, settings: { level: 1, goal: 20, newPerDay: 10, pinyin: true, rate: 0.85 }, srs: {}, book: {}, stats: { answered: 0, correct: 0, days: {} }, day: null, history: [] };
const S = (() => { try { const s = JSON.parse(localStorage.getItem(APP_KEY)); if (s && s.v === 2) return Object.assign(structuredClone(DEFAULT), s, { settings: Object.assign({}, DEFAULT.settings, s.settings) }); } catch (_) {} return structuredClone(DEFAULT); })();
let saveT = 0;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(APP_KEY, JSON.stringify(S)); } catch (_) { toast("Не удалось сохранить прогресс на устройстве"); } }, 120); }
function D() { const t = today(); if (!S.day || S.day.date !== t) S.day = { date: t, correct: 0, answered: 0, learned: 0, reviewed: 0 }; return S.day; }
function markStudy() { const t = today(); S.stats.days[t] = (S.stats.days[t] || 0) + 1; }
function record(ok, hz, lv) {
  const d = D(); d.answered++; S.stats.answered++; if (ok) { d.correct++; S.stats.correct++; } markStudy();
  if (!ok && hz) S.book[hz] = { lv, t: Date.now(), why: "ошибка" };
  save();
}
function streak() { let n = 0; for (let t = Date.now(); S.stats.days[today(t)]; t -= DAY) n++; if (!n && S.stats.days[today(Date.now() - DAY)]) for (let t = Date.now() - DAY; S.stats.days[today(t)]; t -= DAY) n++; return n; }
const studyDays = () => Object.keys(S.stats.days).length;
const accuracy = () => S.stats.answered ? Math.round(S.stats.correct / S.stats.answered * 100) : 0;

/* ---------- данные ---------- */
const cache = {};
function level(lv) {
  if (!cache[lv]) cache[lv] = fetch(`data/hsk${lv}.json`).then(r => { if (!r.ok) throw Error(r.status); return r.json(); })
    .then(a => a.map(([hz, py, ru, pos]) => ({ hz, py, ru, pos, lv: +lv }))).catch(e => { delete cache[lv]; throw e; });
  return cache[lv];
}
const allWords = () => Promise.all([1, 2, 3, 4, 5, 6].map(level)).then(a => a.flat());
const short = ru => ru.split(";")[0].trim();
const plain = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ü/g, "v").toLowerCase().replace(/[^a-zа-яё0-9]/g, "");

/* ---------- интервальное повторение ---------- */
const STEPS = [0, 1, 2, 4, 7, 15, 30, 60, 120];
const known = lv => Object.values(S.srs).filter(x => x.lv === lv && x.b >= 1).length;
function dueList() { const now = Date.now(); return Object.entries(S.srs).filter(([, x]) => x.d <= now).map(([hz, x]) => ({ hz, ...x })); }
function grade(w, ok) {
  const x = S.srs[w.hz] || { b: 0, d: 0, lv: w.lv, r: 0, w: 0, first: Date.now() };
  if (ok) { x.b = Math.min(x.b + 1, STEPS.length - 1); x.r++; x.d = new Date(today()).getTime() + STEPS[x.b] * DAY + 4 * 3600e3; }
  else { x.b = 0; x.w++; x.d = Date.now() + 60e3; }
  S.srs[w.hz] = x; save();
}

/* ---------- озвучивание (системный голос zh-CN) ---------- */
let zhVoice = null;
function pickVoice() { const v = speechSynthesis.getVoices(); zhVoice = v.find(x => /zh[-_]CN/i.test(x.lang)) || v.find(x => /^zh/i.test(x.lang)) || null; }
if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
let speakTok = 0;
function speak(text, el) {
  return new Promise(res => {
    if (!("speechSynthesis" in window)) { toast("Озвучивание не поддерживается этим браузером"); return res(false); }
    if (!zhVoice) pickVoice();
    speechSynthesis.cancel(); const tok = ++speakTok;
    $$(".playing").forEach(e => e.classList.remove("playing")); el && el.classList.add("playing");
    const u = new SpeechSynthesisUtterance(text); u.lang = "zh-CN"; if (zhVoice) u.voice = zhVoice; u.rate = S.settings.rate;
    const done = ok => { if (tok === speakTok) el && el.classList.remove("playing"); res(ok); };
    u.onend = () => done(true); u.onerror = () => done(false);
    speechSynthesis.speak(u);
    if (!zhVoice && !speak.warned) { speak.warned = true; setTimeout(() => { if (!speechSynthesis.getVoices().some(v => /^zh/i.test(v.lang))) toast("На устройстве нет китайского голоса. Установите его в настройках речи системы."); }, 900); }
  });
}
async function speakAll(items) { const tok = speakTok + 1; for (const it of items) { const ok = await speak(it.text, it.el); if (!ok || speakTok !== tok) return; await new Promise(r => setTimeout(r, 250)); } }
const sayBtn = (text, cls = "say") => `<button class="${cls}" data-say="${esc(text)}" aria-label="Прослушать">${ic("speaker")}</button>`;
document.addEventListener("click", e => { const b = e.target.closest("[data-say]"); if (b) { e.preventDefault(); e.stopPropagation(); speak(b.dataset.say, b); } });

/* ---------- общие элементы ---------- */
function toast(msg) { $$(".toast").forEach(t => t.remove()); const t = h(`<div class="toast" role="status">${esc(msg)}</div>`); document.body.append(t); setTimeout(() => t.remove(), 2800); }
const topbar = (title, back = "#/home") => `<div class="topbar"><a class="round" href="${back}" aria-label="Назад">${ic("back")}</a><h1>${title}</h1></div>`;
const row = (href, icon, title, small) => `<a href="${href}"><span class="ic">${ic(icon)}</span><span class="t"><b>${title}</b>${small ? `<small>${small}</small>` : ""}</span>${ic("go", "i go")}</a>`;
const starBtn = w => `<button class="star" data-star="${esc(w.hz)}" data-lv="${w.lv}" aria-pressed="${!!S.book[w.hz]}" aria-label="В мой словарик">${ic("star")}</button>`;
document.addEventListener("click", e => { const b = e.target.closest("[data-star]"); if (!b) return; const hz = b.dataset.star; if (S.book[hz]) delete S.book[hz]; else S.book[hz] = { lv: +b.dataset.lv, t: Date.now(), why: "добавлено" }; b.setAttribute("aria-pressed", String(!!S.book[hz])); save(); toast(S.book[hz] ? "Добавлено в мой словарик" : "Убрано из словарика"); });
const wordRow = w => `<div class="word"><a class="h zh" href="#/word/${encodeURIComponent(w.hz)}">${esc(w.hz)}</a><a class="m" href="#/word/${encodeURIComponent(w.hz)}"><div class="py">${esc(w.py)}${w.pos ? `<span class="tag">${esc(w.pos)}</span>` : ""}</div><div>${esc(w.ru)}</div></a>${starBtn(w)}${sayBtn(w.hz)}</div>`;
const greeting = () => { const hr = new Date().getHours(); return hr < 5 ? "Доброй ночи" : hr < 12 ? "Доброе утро" : hr < 18 ? "Добрый день" : "Добрый вечер"; };
const lvName = lv => `HSK ${lv} · ${LEVELS[lv].title}`;
let leaveFns = [];
const onLeave = fn => leaveFns.push(fn);

/* ========== страницы ========== */
function pageWelcome() {
  let lv = S.settings.level;
  app.innerHTML = `<section class="welcome"><div class="top"><span class="wordmark">ZH<span>·</span></span><span class="ed">Русский · 中文</span></div>
    <div class="art">${ART_WELCOME}</div><p class="kicker" style="margin-top:14px">每天说一点中文</p>
    <h1>Каждый день —<br><u>немного китайского.</u></h1><p class="sub">Услышать фразу, запомнить слово, сказать в ответ.<br>От первого «你好» до свободного разговора — без спешки.</p>
    <div class="lvnote">HSK 1 — HSK 6 · шаг за шагом</div>
    <label class="field" style="text-align:left"><span>Как к вам обращаться?</span><input id="nick" maxlength="20" placeholder="Например, Анна" autocomplete="given-name"></label>
    <div class="field" style="text-align:left"><span>С какого уровня начать?</span><div class="lvpick">${[1, 2, 3, 4, 5, 6].map(n => `<button data-lv="${n}" aria-pressed="${n === lv}"><b>HSK ${n}</b>${LEVELS[n].title}</button>`).join("")}</div></div>
    <button class="btn" id="go">Начать ${ic("go")}</button><p class="hint mt">Прогресс хранится на этом устройстве. В профиле можно сделать резервную копию.</p></section>`;
  $$(".lvpick button").forEach(b => b.onclick = () => { lv = +b.dataset.lv; $$(".lvpick button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); });
  $("#go").onclick = () => { S.profile = { nick: $("#nick").value.trim() || "друг", created: Date.now() }; S.settings.level = lv; save(); location.hash = "#/home"; };
}

async function pageHome() {
  const lv = S.settings.level, d = D(), due = dueList().length, goal = S.settings.goal, pct = Math.min(100, d.correct / goal * 100);
  const wk = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"], now = new Date(), mon = new Date(now); mon.setDate(now.getDate() - (now.getDay() + 6) % 7);
  const week = wk.map((n, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); const t = today(x.getTime()); return `<span class="${t === today() ? "today" : ""} ${S.stats.days[t] ? "done" : ""}">${n}<b>${x.getDate()}</b></span>`; }).join("");
  app.innerHTML = `<section class="page"><div class="greet intro"><div><p class="kicker">${greeting()}</p><h1>${esc(S.profile.nick)},<br>сегодня тоже немного <span class="zh">中文</span>.</h1></div><a class="pill" href="#/levels">HSK ${lv} ${ic("go")}</a></div>
    <div class="week">${week}</div>
    <div class="card-blue"><p class="kicker">每天一点</p><h2>Понемногу каждый день.</h2><p class="sub">${lvName(lv)}</p><div class="art">${ART_READ}</div>
      <div class="prog"><div class="row"><span>Цель на сегодня — верных ответов</span><b>${d.correct} / ${goal}</b></div><div class="bar"><i style="width:${pct}%"></i></div></div>
      <a class="btn" href="#/study/${lv}">${d.correct >= goal ? "Цель выполнена — ещё немного" : "Продолжить"} ${ic("go")}</a></div>
    <div class="section"><h2>План на сегодня</h2><a href="#/plan">Настроить ›</a></div>
    <div class="list">${row("#/review", "review", "Повторить знакомое", due ? `${due} ${plural(due, "слово ждёт", "слова ждут", "слов ждут")} повторения` : "Повторение и мой словарик")}
    ${row(`#/study/${lv}`, "book", "Выучить новое", `HSK ${lv} · новые слова карточками`)}
    ${row(`#/quiz/${lv}`, "check", "Ежедневный тест", `Сегодня верных ответов: ${d.correct}`)}</div>
    <div class="tiles"><a href="#/dict">${ic("search")}Словарь</a><a href="#/book">${ic("bookmark")}Мой словарик</a><a href="#/stats">${ic("chart")}Статистика</a></div>
    <div class="section"><h2>Понемногу, но регулярно.</h2></div>
    <div class="stats"><div><b>${studyDays()}</b><small>дней учёбы</small></div><div><b>${accuracy()}%</b><small>точность</small></div><div><b>${S.stats.correct}</b><small>верных ответов</small></div></div>
    <div class="section"><h2>Фраза дня</h2><a href="#/dialogues">Все диалоги ›</a></div><div id="pod"></div></section>`;
  const pool = SENTENCES.filter(s => s.lv <= Math.max(lv, 1)); const s = pool[(new Date().getDate() * 7) % pool.length];
  $("#pod").innerHTML = `<div class="sent"><div class="zh">${esc(s.zh)}</div><div class="py">${esc(s.py)}</div><div class="ru">${esc(s.ru)}</div><button class="btn small ghost" data-say="${esc(s.zh)}">${ic("speaker")} Прослушать</button></div>`;
}

function pageLearn() {
  const lv = S.settings.level, total = LEVELS[lv].words, k = known(lv);
  app.innerHTML = `<section class="page"><div class="intro"><p class="kicker">Ваш учебный маршрут</p><h1>Шаг за шагом —<br>говорить больше.</h1><p class="sub">От тонов и звуков — к собственным фразам.</p></div>
    <a class="card-blue" href="#/level/${lv}" style="display:block"><div style="display:flex;justify-content:space-between"><b style="font-size:19px">HSK ${lv} · ${LEVELS[lv].title}</b>${ic("go")}</div><p class="sub" style="max-width:none">${LEVELS[lv].desc}</p>
      <div class="prog"><div class="row"><span>Выучено слов уровня</span><span>${k} / ${total}</span></div><div class="bar"><i style="width:${k / total * 100}%"></i></div></div></a>
    <div class="section"><h2>С чего начать?</h2><a href="#/levels">Выбрать уровень ›</a></div>
    <div class="steps"><a href="#/pinyin" class="${k < 10 ? "cur" : ""}"><span class="n">01</span><span class="t"><b>Услышать звуки китайского</b><small>Пиньинь · четыре тона · инициали и финали</small></span>${ic("go", "i go")}</a>
      <a href="#/study/${lv}" class="${k >= 10 && k < 60 ? "cur" : ""}"><span class="n">02</span><span class="t"><b>Узнать слова во фразе</b><small>Лексика HSK ${lv} · карточки · части речи</small></span>${ic("go", "i go")}</a>
      <a href="#/dialogues"><span class="n">03</span><span class="t"><b>Понять на слух и ответить</b><small>Диалоги · аудирование · повторение вслух</small></span>${ic("go", "i go")}</a>
      <a href="#/reading"><span class="n">04</span><span class="t"><b>Прочитать текст, написать фразу</b><small>Чтение · письмо</small></span>${ic("go", "i go")}</a></div>
    <div class="section"><h2>Отдельные тренировки</h2></div>
    <div class="grid2"><a href="#/grammar"><span class="ic">${ic("pen")}</span><b>Грамматика</b><small>Конструкции на примерах</small></a>
      <a href="#/listen/${lv}"><span class="ic">${ic("ear")}</span><b>Аудирование</b><small>Сначала слушать, потом смотреть</small></a>
      <a href="#/shadow"><span class="ic">${ic("mic")}</span><b>Повторение вслух</b><small>Слушайте и повторяйте фразу</small></a>
      <a href="#/write/${lv}"><span class="ic">${ic("read")}</span><b>Письмо</b><small>Наберите слово пиньинем или иероглифами</small></a>
      <a href="#/shelf"><span class="ic">${ic("book")}</span><b>Мои учебники</b><small>PDF и аудио к урокам</small></a>
      <a href="#/hanzi/${lv}"><span class="ic">${ic("pen")}</span><b>Иероглифы</b><small>Пишите по порядку черт</small></a>
      <a href="#/cloud/${lv}"><span class="ic">${ic("layers")}</span><b>Облако слов</b><small>Слова уровня по частоте</small></a>
      <a href="#/tones"><span class="ic">${ic("wave")}</span><b>Тренажёр тонов</b><small>Угадайте тон на слух</small></a>
      <a href="#/exam/${lv}"><span class="ic">${ic("trophy")}</span><b>Подготовка к HSK</b><small>Пробный тест с таймером</small></a></div>
    <div class="list mt">${row("#/shelf", "book", "Мои учебники", "Road to Success и другие книги · PDF и аудио")}${row("#/levels", "layers", "Уровни курса", "HSK 1 – HSK 6 и ваш прогресс")}</div></section>`;
}

function pageReview() {
  const due = dueList(), lv = S.settings.level, bk = Object.keys(S.book).length;
  app.innerHTML = `<section class="page"><div class="intro"><p class="kicker">Повторение</p><h1>Знакомое —<br>начинается со второй встречи.</h1><p class="sub">Сначала повторите то, что пора освежить.</p></div>
    <div class="card-blue"><p class="kicker">Ждут повторения</p><div style="font-size:54px;font-weight:750;letter-spacing:-2px">${due.length}</div>
      <p class="sub" style="max-width:none">${due.length ? "Слова, у которых подошёл срок. Займёт пару минут." : `Пока ничего не ждёт. Можно выучить ${S.settings.newPerDay} новых слов или открыть свой словарик.`}</p>
      <a class="btn" href="${due.length ? "#/study/review" : `#/study/${lv}`}">${due.length ? "Начать повторение" : "Учить новые слова"} ${ic("go")}</a></div>
    <div class="section"><h2>С чего начать?</h2></div>
    <div class="list">${row(`#/study/${lv}`, "cards", "Карточки", "Новые и знакомые слова · «помню / не помню»")}
      ${row(`#/pairs/${lv}`, "layers", "Игра «Найди пару»", "Иероглиф ↔ перевод на скорость")}
      ${row(`#/cloud/${lv}`, "wave", "Облако слов", "Крупнее — чаще встречается")}
      ${row(`#/hanzi/${lv}`, "pen", "Пишем иероглифы", "Знакомые слова по порядку черт")}
      ${row("#/book", "bookmark", "Мой словарик", bk ? `${bk} ${plural(bk, "слово", "слова", "слов")} · ошибки и отмеченные` : "Отмечайте слова звёздочкой")}
      ${row("#/study/book", "review", "Повторить словарик", "Карточки только из моего словаря")}
      ${row("#/grammar", "pen", "Повторить грамматику", "Примеры к каждой конструкции")}</div>
    <p class="hint mt">Честно отмечайте, помните ли слово, — это полезнее, чем ответить идеально с первого раза.</p></section>`;
}

function pageMe() {
  const days = studyDays(), bk = Object.keys(S.book).length;
  app.innerHTML = `<section class="page"><div style="display:flex;align-items:center;gap:16px;margin:4px 0 8px"><span style="width:84px;height:84px;border-radius:50%;background:var(--glaze);display:flex;align-items:center;justify-content:center">${PANDA.replace("<svg", '<svg style="width:64px;height:64px"')}</span>
      <div style="flex:1"><div style="font-size:23px;font-weight:750">${esc(S.profile.nick)}</div><div class="muted">${lvName(S.settings.level)}</div><a class="muted" href="#/settings">Настройки ›</a></div></div>
    <div class="box"><h3>Мои данные</h3><div class="stats"><div><b>${days}</b><small>дней учёбы</small></div><div><b>${accuracy()}%</b><small>точность</small></div><div><b>${streak()}</b><small>дней подряд</small></div></div></div>
    <div class="box list" style="padding:4px 20px">${row("#/stats", "clock", "История занятий", "Последние 14 дней")}${row("#/book", "bookmark", "Мой словарик", `${bk} ${plural(bk, "слово", "слова", "слов")}`)}${row("#/plan", "target", "Учебный план", `Цель: ${S.settings.goal} ответов в день`)}${row("#/levels", "layers", "Уровни", "Переключить уровень HSK")}${row("#/shelf", "book", "Мои учебники", "Книги и аудио на устройстве")}</div>
    <div class="box list" style="padding:4px 20px">${row("#/settings", "gear", "Настройки", "Голос, пиньинь, резервная копия")}${row("#/about", "info", "О приложении и данных", "Источники словаря и лицензии")}</div></section>`;
}

/* ---------- карточки (учить / повторять) ---------- */
async function pageStudy(arg) {
  app.innerHTML = `<p class="empty">Загрузка…</p>`;
  let queue = [], title = "";
  if (arg === "review") { const due = dueList(); const words = await allWords(); const m = new Map(words.map(w => [w.hz, w])); queue = shuffle(due.map(x => m.get(x.hz)).filter(Boolean)).slice(0, 40); title = "Повторение"; }
  else if (arg === "book") { const words = await allWords(); const m = new Map(words.map(w => [w.hz, w])); queue = shuffle(Object.keys(S.book).map(k => m.get(k)).filter(Boolean)).slice(0, 30); title = "Мой словарик"; }
  else { const lv = +arg || S.settings.level; const words = await level(lv); const now = Date.now();
    const due = words.filter(w => S.srs[w.hz] && S.srs[w.hz].d <= now); const fresh = words.filter(w => !S.srs[w.hz]).slice(0, Math.max(0, S.settings.newPerDay - D().learned));
    queue = shuffle(due).slice(0, 20).concat(fresh); title = `HSK ${lv} · карточки`; }
  if (!queue.length) { app.innerHTML = `${topbar(title, "#/review")}<div class="empty"><b>${arg === "book" ? "Словарик пуст" : "На сегодня всё!"}</b>${arg === "book" ? "Сюда попадают ошибки из тестов и слова со звёздочкой." : "Новых слов на сегодня больше нет, повторять пока нечего. Загляните завтра или пройдите тест."}<br><a class="btn small" href="#/quiz/${S.settings.level}">Пройти тест</a></div>`; return; }
  const total = queue.length; let done = 0, shown = false;
  function draw() {
    const w = queue[0]; if (!w) return finish();
    const isNew = !S.srs[w.hz]; shown = false;
    app.innerHTML = `${topbar(title, "#/review")}<div class="qhead"><div class="bar"><i style="width:${done / total * 100}%"></i></div><span class="muted">${done}/${total}</span></div>
      <div class="stack"><div class="flash" id="card"><span class="meta">HSK ${w.lv}${isNew ? " · новое" : ""}</span><div style="position:absolute;top:10px;right:10px;display:flex">${starBtn(w)}</div>
        <div class="big zh">${esc(w.hz)}</div><div class="py ${S.settings.pinyin || shown ? "" : "hid"}" id="py">${esc(w.py)}</div><div class="ru hid" id="ru">${esc(w.ru)}</div>${sayBtn(w.hz)}</div></div>
      <div id="act"><button class="btn" id="show">Показать перевод</button></div>`;
    speak(w.hz, $("#card .say"));
    $("#show").onclick = reveal; $("#card").onclick = e => { if (!e.target.closest("button")) reveal(); };
  }
  function reveal() {
    if (shown) return; shown = true; const w = queue[0];
    $("#py").classList.remove("hid"); $("#ru").classList.remove("hid");
    $("#act").innerHTML = `<div class="two"><button class="btn ghost" id="no">Не помню</button><button class="btn" id="yes">Помню ${ic("check")}</button></div>`;
    $("#no").onclick = () => { if (!S.srs[w.hz]) D().learned++; grade(w, false); record(false, null); queue.push(queue.shift()); draw(); };
    $("#yes").onclick = () => { if (!S.srs[w.hz]) D().learned++; else D().reviewed++; grade(w, true); record(true); queue.shift(); done++; draw(); };
  }
  function finish() { app.innerHTML = `${topbar(title, "#/review")}<div class="result"><div style="width:110px;margin:0 auto">${PANDA}</div><div class="score">${total}</div><p>${plural(total, "карточка пройдена", "карточки пройдены", "карточек пройдено")}. Отличная работа!</p>
      <a class="btn" href="#/quiz/${S.settings.level}">Закрепить тестом ${ic("go")}</a><a class="btn ghost" href="#/home">На главную</a></div>`; }
  draw();
}

/* ---------- тесты: обычный, аудирование, экзамен ---------- */
async function pageQuiz(lv, mode = "mix") {
  lv = +lv || S.settings.level; app.innerHTML = `<p class="empty">Загрузка…</p>`;
  const words = await level(lv); const exam = mode === "exam", N = exam ? 20 : 10;
  const seen = words.filter(w => S.srs[w.hz]); const base = seen.length >= 8 ? shuffle(seen.concat(shuffle(words).slice(0, 6))) : shuffle(words.slice(0, Math.min(words.length, 120)));
  const qs = [...new Set(base)].slice(0, N).map((w, i) => {
    const types = mode === "listen" ? ["listen"] : exam ? ["zh2ru", "ru2zh", "listen", "py"] : ["zh2ru", "ru2zh", "listen", "py", "zh2ru"];
    const type = types[i % types.length]; const others = shuffle(words.filter(x => x.hz !== w.hz && short(x.ru) !== short(w.ru))).slice(0, 3);
    return { w, type, opts: shuffle([w, ...others]) };
  });
  let k = 0, right = 0, t0 = Date.now(), timer = 0; const wrongs = [];
  const back = exam ? "#/learn" : mode === "listen" ? "#/learn" : "#/home";
  const ttl = exam ? `Пробный HSK ${lv}` : mode === "listen" ? `Аудирование · HSK ${lv}` : `Тест · HSK ${lv}`;
  if (exam) { timer = setInterval(() => { const s = Math.max(0, 600 - (Date.now() - t0) / 1e3 | 0); const el = $("#tm"); if (el) el.textContent = `${s / 60 | 0}:${String(s % 60).padStart(2, "0")}`; if (!s) { clearInterval(timer); finish(); } }, 500); onLeave(() => clearInterval(timer)); }
  function draw() {
    const q = qs[k]; if (!q) return finish(); const w = q.w;
    const prompt = { zh2ru: ["Что означает это слово?", `<div class="big zh">${esc(w.hz)}</div>`], ru2zh: ["Как это по-китайски?", `<div class="mid">${esc(short(w.ru))}</div>`],
      listen: ["Послушайте и выберите слово", `<button class="rec" style="margin:4px auto" data-say="${esc(w.hz)}" aria-label="Прослушать">${ic("speaker")}</button>`], py: ["Выберите правильный пиньинь", `<div class="big zh">${esc(w.hz)}</div>`] }[q.type];
    const opt = o => q.type === "zh2ru" ? `<button class="opt" data-hz="${esc(o.hz)}">${esc(short(o.ru))}</button>` : q.type === "py" ? `<button class="opt" data-hz="${esc(o.hz)}" style="text-align:center;font-size:18px">${esc(o.py)}</button>`
      : `<button class="opt zhopt" data-hz="${esc(o.hz)}">${esc(o.hz)}${q.type === "listen" ? "" : ""}</button>`;
    app.innerHTML = `${topbar(ttl, back)}<div class="qhead"><div class="bar"><i style="width:${k / qs.length * 100}%"></i></div><span class="muted">${exam ? `<span id="tm">10:00</span> · ` : ""}${k + 1}/${qs.length}</span></div>
      <div class="qcard"><div class="q">${prompt[0]}</div>${prompt[1]}</div><div class="opts">${q.opts.map(opt).join("")}</div><div id="fb"></div>`;
    if (q.type === "listen") speak(w.hz, $(".qcard .rec"));
    $$(".opt").forEach(b => b.onclick = () => {
      if ($(".opt.right")) return; const ok = b.dataset.hz === w.hz;
      $$(".opt").forEach(x => { if (x.dataset.hz === w.hz) x.classList.add("right"); }); if (!ok) { b.classList.add("wrong"); wrongs.push(w); } else right++;
      record(ok, w.hz, w.lv); if (S.srs[w.hz]) grade(w, ok);
      $("#fb").innerHTML = `<div class="fb ${ok ? "ok" : "no"}">${ok ? "Верно!" : "Не совсем."} <b class="zh">${esc(w.hz)}</b> ${esc(w.py)} — ${esc(w.ru)}</div><button class="btn" id="next">${k + 1 < qs.length ? "Дальше" : "Результат"} ${ic("go")}</button>`;
      if (q.type !== "listen") speak(w.hz);
      $("#next").onclick = () => { k++; draw(); };
    });
  }
  function finish() {
    clearInterval(timer); const pct = Math.round(right / qs.length * 100);
    S.history.unshift({ t: Date.now(), kind: ttl, score: `${right}/${qs.length}` }); S.history = S.history.slice(0, 50); save();
    app.innerHTML = `${topbar(ttl, back)}<div class="result"><div class="score">${pct}%</div><p>Верно ${right} из ${qs.length}${exam ? ` · время ${Math.round((Date.now() - t0) / 1e3 / 60 * 10) / 10} мин` : ""}</p>
      ${wrongs.length ? `<div style="text-align:left" class="mt"><div class="kicker">Ошибки — добавлены в словарик</div>${wrongs.map(wordRow).join("")}</div>` : `<p>Без ошибок! 太棒了！</p>`}
      <button class="btn" id="again">Ещё раз</button><a class="btn ghost" href="${back}">Готово</a></div>`;
    $("#again").onclick = () => pageQuiz(lv, mode);
  }
  draw();
}

/* ---------- письмо ---------- */
async function pageWrite(lv) {
  lv = +lv || S.settings.level; const words = shuffle(await level(lv)).slice(0, 10); let k = 0, right = 0;
  function draw() {
    const w = words[k]; if (!w) { app.innerHTML = `${topbar("Письмо", "#/learn")}<div class="result"><div class="score">${right}/${words.length}</div><p>Отличная практика!</p><button class="btn" id="again">Ещё раз</button></div>`; $("#again").onclick = () => pageWrite(lv); return; }
    app.innerHTML = `${topbar(`Письмо · HSK ${lv}`, "#/learn")}<div class="qhead"><div class="bar"><i style="width:${k / words.length * 100}%"></i></div><span class="muted">${k + 1}/${words.length}</span></div>
      <div class="qcard"><div class="q">Напишите по-китайски (иероглифами или пиньинем, тоны можно цифрами)</div><div class="mid">${esc(w.ru)}</div>${sayBtn(w.hz)}</div>
      <label class="field"><input id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="например: nihao, ni3hao или 你好"></label><button class="btn" id="chk">Проверить</button><div id="fb"></div>`;
    const inp = $("#ans"); inp.focus(); inp.onkeydown = e => { if (e.key === "Enter") $("#chk").click(); };
    $("#chk").onclick = () => {
      const a = inp.value.trim(); if (!a) return;
      const ok = a === w.hz || plain(a.replace(/[1-5]/g, "")) === plain(w.py);
      if (ok) right++; record(ok, w.hz, w.lv);
      $("#fb").innerHTML = `<div class="fb ${ok ? "ok" : "no"}">${ok ? "Верно!" : "Правильно так:"} <b class="zh" style="font-size:20px">${esc(w.hz)}</b> ${esc(w.py)}</div><button class="btn" id="next">Дальше ${ic("go")}</button>`;
      $("#chk").remove(); speak(w.hz); $("#next").onclick = () => { k++; draw(); };
    };
  }
  draw();
}

/* ---------- пиньинь и тоны ---------- */
function pagePinyin() {
  app.innerHTML = `${topbar("Звуки и тоны", "#/learn")}<p class="sub" style="margin-top:-6px">Пиньинь — запись китайского произношения латиницей. Каждый слог имеет тон, и тон меняет смысл слова.</p>
    <div class="section"><h2>Четыре тона</h2><a href="#/tones">Тренажёр ›</a></div><div class="tones">${TONES.map(t => `<button class="tone" data-say="${t.ex[0]}"><span class="mk">${t.mark}</span><span><b>${t.name}</b><small>${t.desc}</small><small><span class="zh">${t.ex[0]}</span> ${t.ex[1]} — ${t.ex[2]}</small></span></button>`).join("")}</div>
    <div class="section"><h2>Инициали (согласные)</h2></div><div class="chips">${INITIALS.map(([p, z, d]) => `<button class="chip" data-say="${z}" title="${esc(d)}"><b>${p}</b><small class="zh">${z}</small></button>`).join("")}</div>
    <p class="hint">Нажмите на звук, чтобы услышать пример. Подсказки: ${INITIALS.slice(11, 18).map(([p, , d]) => `<b>${p}</b> — ${d}`).join("; ")}.</p>
    <div class="section"><h2>Финали (гласные)</h2></div><div class="chips">${FINALS.map(([p, z, d]) => `<button class="chip" data-say="${z}" title="${esc(d)}"><b>${p}</b><small class="zh">${z}</small></button>`).join("")}</div>
    <div class="box"><h3>Изменение тонов</h3><p class="hint" style="margin:0">Два третьих тона подряд: первый читается как второй — <span class="zh">你好</span> nǐ hǎo звучит «ní hǎo».<br><span class="zh">不</span> перед четвёртым тоном становится вторым: <span class="zh">不是</span> bú shì.<br><span class="zh">一</span> перед четвёртым — второй тон (<span class="zh">一个</span> yí ge), перед остальными — четвёртый (<span class="zh">一天</span> yì tiān).</p></div>
    <a class="btn" href="#/tones">Потренировать тоны ${ic("go")}</a></section>`;
}
function pageTones() {
  const qs = shuffle(TONE_DRILL).slice(0, 12); let k = 0, right = 0;
  const toneOf = s => { const m = s.normalize("NFD").match(/[̄́̌̀]/); return m ? { "̄": 1, "́": 2, "̌": 3, "̀": 4 }[m[0]] : 0; };
  function draw() {
    const q = qs[k]; if (!q) { app.innerHTML = `${topbar("Тренажёр тонов", "#/pinyin")}<div class="result"><div class="score">${right}/${qs.length}</div><p>${right >= 10 ? "Прекрасный слух!" : "Тоны приходят с практикой — повторите ещё раз."}</p><button class="btn" id="again">Ещё раз</button></div>`; $("#again").onclick = pageTones; return; }
    const t = toneOf(q[0]); const base = q[0].normalize("NFD").replace(/[̀-ͯ]/g, "");
    app.innerHTML = `${topbar("Тренажёр тонов", "#/pinyin")}<div class="qhead"><div class="bar"><i style="width:${k / qs.length * 100}%"></i></div><span class="muted">${k + 1}/${qs.length}</span></div>
      <div class="qcard"><div class="q">Какой тон у слога «${base}»?</div><button class="rec" data-say="${q[1]}">${ic("speaker")}</button></div>
      <div class="opts" style="grid-template-columns:1fr 1fr">${[1, 2, 3, 4].map(n => `<button class="opt" data-t="${n}" style="text-align:center"><b style="font-size:22px">${["ā", "á", "ǎ", "à"][n - 1]}</b><br><small>${TONES[n - 1].name}</small></button>`).join("")}</div><div id="fb"></div>`;
    speak(q[1], $(".rec"));
    $$(".opt").forEach(b => b.onclick = () => { if ($(".opt.right")) return; const ok = +b.dataset.t === t; if (ok) right++; else b.classList.add("wrong"); $(`.opt[data-t="${t}"]`).classList.add("right"); record(ok);
      $("#fb").innerHTML = `<div class="fb ${ok ? "ok" : "no"}">${ok ? "Верно!" : "Это был другой тон."} <b class="zh">${q[1]}</b> ${q[0]}</div><button class="btn" id="next">Дальше ${ic("go")}</button>`; $("#next").onclick = () => { k++; draw(); }; });
  }
  draw();
}

/* ---------- грамматика, диалоги, чтение ---------- */
function pageGrammar(id) {
  if (id) { const g = GRAMMAR.find(x => x.id === id); if (!g) return pageGrammar();
    app.innerHTML = `${topbar(g.title, "#/grammar")}<span class="pill">HSK ${g.lv}</span><p style="font-size:15px;line-height:1.75">${esc(g.rule)}</p>
      <div class="section"><h2>Примеры</h2><button class="muted" id="all">${ic("speaker")}</button></div><div class="dlg">${g.ex.map(e => `<div class="line" data-say="${esc(e[0])}"><div><div class="zh">${esc(e[0])}</div><div class="py">${esc(e[1])}</div><div class="ru">${esc(e[2])}</div></div></div>`).join("")}</div>`;
    $("#all").onclick = () => speakAll($$(".dlg .line").map(el => ({ el, text: el.dataset.say }))); return; }
  app.innerHTML = `${topbar("Грамматика", "#/learn")}<p class="sub" style="margin-top:-6px">Главные конструкции HSK 1–4 с примерами и озвучкой.</p>
    ${[1, 2, 3, 4].map(lv => `<div class="section"><h2>HSK ${lv}</h2></div><div class="list">${GRAMMAR.filter(g => g.lv === lv).map(g => row(`#/grammar/${g.id}`, "pen", g.title, esc(g.ex[0][0]))).join("")}</div>`).join("")}`;
}
function linesView(lines, kind) {
  const hp = !S.settings.pinyin;
  return `<div class="seg" role="group"><button aria-pressed="${!hp}" id="tp">Пиньинь</button><button aria-pressed="true" id="tr">Перевод</button><button id="play">${ic("speaker")} Слушать всё</button></div>
    <div class="dlg ${hp ? "hide-py" : ""}" id="dlg">${lines.map(l => `<div class="line" data-say="${esc(l.zh)}">${kind === "dlg" ? `<span class="who ${l.who}">${l.who}</span>` : ""}<div><div class="zh">${esc(l.zh)}</div><div class="py opt-py">${esc(l.py)}</div><div class="ru opt-ru">${esc(l.ru)}</div></div></div>`).join("")}</div>`;
}
function bindLines() {
  const d = $("#dlg");
  $("#tp").onclick = e => { d.classList.toggle("hide-py"); e.currentTarget.setAttribute("aria-pressed", String(!d.classList.contains("hide-py"))); };
  $("#tr").onclick = e => { d.classList.toggle("hide-ru"); e.currentTarget.setAttribute("aria-pressed", String(!d.classList.contains("hide-ru"))); };
  $("#play").onclick = () => speakAll($$(".line", d).map(el => ({ el, text: el.dataset.say })));
}
function pageDialogues(id) {
  if (id) { const g = DIALOGUES.find(x => x.id === id); if (!g) return pageDialogues();
    app.innerHTML = `${topbar(g.title, "#/dialogues")}${linesView(g.lines.map(([who, zh, py, ru]) => ({ who, zh, py, ru })), "dlg")}<p class="hint">Нажмите на реплику, чтобы услышать её. Скройте перевод и попробуйте понять на слух.</p><a class="btn" href="#/shadow/${g.id}">Повторить вслух ${ic("mic")}</a>`;
    bindLines(); return; }
  app.innerHTML = `${topbar("Диалоги", "#/learn")}<p class="sub" style="margin-top:-6px">Короткие сценки из жизни: знакомство, кафе, магазин, дорога.</p>
    ${[1, 2, 3].map(lv => `<div class="section"><h2>HSK ${lv}</h2></div><div class="list">${DIALOGUES.filter(g => g.lv === lv).map(g => row(`#/dialogue/${g.id}`, "chat", g.title, esc(g.lines[0][1]))).join("")}</div>`).join("")}`;
}
function pageReading(id) {
  if (id) { const g = READINGS.find(x => x.id === id); if (!g) return pageReading();
    app.innerHTML = `${topbar(g.title, "#/reading")}${linesView(g.text.map(([zh, py, ru]) => ({ zh, py, ru })), "read")}<div class="box"><h3>Вопрос к тексту</h3><p style="margin:0 0 6px">${esc(g.q[0])}</p><div class="opts">${g.q[1].map((o, i) => `<button class="opt" data-i="${i}">${esc(o)}</button>`).join("")}</div></div>`;
    bindLines();
    $$(".box .opt").forEach(b => b.onclick = () => { if ($(".box .right")) return; const ok = +b.dataset.i === g.q[2]; record(ok); $(`.box .opt[data-i="${g.q[2]}"]`).classList.add("right"); if (!ok) b.classList.add("wrong"); toast(ok ? "Верно!" : "Перечитайте текст ещё раз"); });
    return; }
  app.innerHTML = `${topbar("Чтение", "#/learn")}<p class="sub" style="margin-top:-6px">Небольшие тексты с пиньинем, переводом и вопросом на понимание.</p><div class="list">${READINGS.map(g => row(`#/reading/${g.id}`, "read", `${g.title} · HSK ${g.lv}`, esc(g.text[0][0]))).join("")}</div>
    <div class="list mt">${row(`#/write/${S.settings.level}`, "pen", "Письмо", "Напишите слово по переводу")}</div>`;
}

/* ---------- повторение вслух ---------- */
function pageShadow(id) {
  const src = id ? (DIALOGUES.find(d => d.id === id)?.lines || []).map(l => ({ zh: l[1], py: l[2], ru: l[3] })) : shuffle(SENTENCES.filter(s => s.lv <= Math.max(2, S.settings.level))).slice(0, 8);
  let k = 0, rec = null, chunks = [], url = null; const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  onLeave(() => { try { rec && rec.state === "recording" && rec.stop(); } catch (_) {} });
  function draw() {
    const s = src[k]; if (!s) { app.innerHTML = `${topbar("Повторение вслух", "#/learn")}<div class="result"><div style="width:110px;margin:0 auto">${PANDA}</div><p>Все фразы пройдены. 说得很好！</p><a class="btn" href="#/learn">Готово</a></div>`; return; }
    app.innerHTML = `${topbar("Повторение вслух", id ? `#/dialogue/${id}` : "#/learn")}<div class="qhead"><div class="bar"><i style="width:${k / src.length * 100}%"></i></div><span class="muted">${k + 1}/${src.length}</span></div>
      <div class="sent"><div class="zh">${esc(s.zh)}</div><div class="py">${esc(s.py)}</div><div class="ru">${esc(s.ru)}</div><button class="btn small ghost" data-say="${esc(s.zh)}">${ic("speaker")} Оригинал</button></div>
      <button class="rec" id="rec" aria-label="Записать">${ic("mic")}</button><p class="center muted" id="st">Послушайте и нажмите, чтобы повторить</p><div id="res" class="center"></div>
      <div class="two"><button class="btn ghost" id="prev" ${k ? "" : "disabled"}>Назад</button><button class="btn" id="next">Дальше ${ic("go")}</button></div>`;
    speak(s.zh, $(".sent .say") || $(".sent [data-say]"));
    $("#prev").onclick = () => { k--; draw(); }; $("#next").onclick = () => { k++; draw(); };
    $("#rec").onclick = () => toggle(s);
  }
  async function toggle(s) {
    const b = $("#rec"), st = $("#st");
    if (rec && rec.state === "recording") { rec.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { st.textContent = "Запись голоса не поддерживается в этом браузере"; return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); chunks = []; rec = new MediaRecorder(stream);
      rec.ondataavailable = e => chunks.push(e.data);
      rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); b.classList.remove("on"); if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType }));
        $("#res").innerHTML = `<audio controls src="${url}" style="width:100%;margin-top:8px"></audio>`; st.textContent = "Сравните с оригиналом"; markStudy(); save(); };
      rec.start(); b.classList.add("on"); st.textContent = "Запись… нажмите ещё раз, чтобы остановить";
      if (SR) { const r = new SR(); r.lang = "zh-CN"; r.interimResults = false; r.onresult = e => { const said = e.results[0][0].transcript; const clean = x => x.replace(/[，。！？、,.!?\s]/g, "");
        const a = clean(s.zh), g = clean(said); let m = 0; for (const c of g) if (a.includes(c)) m++; const pct = Math.round(Math.min(1, m / a.length) * 100);
        $("#res").insertAdjacentHTML("afterbegin", `<div class="fb ${pct >= 70 ? "ok" : "no"}">Распознано: <span class="zh">${esc(said)}</span> · совпадение ${pct}%</div>`); }; r.onerror = () => {}; try { r.start(); } catch (_) {} }
    } catch (_) { st.textContent = "Нет доступа к микрофону. Разрешите его в настройках браузера."; }
  }
  if (!src.length) return pageDialogues(); draw();
}

/* ---------- списки, словарь, словарик ---------- */
async function pageLevel(lv) {
  lv = +lv || 1; app.innerHTML = `${topbar(`HSK ${lv} · слова`, "#/learn")}<p class="empty">Загрузка…</p>`;
  const words = await level(lv); let f = "all";
  app.innerHTML = `${topbar(`HSK ${lv} · ${LEVELS[lv].title}`, "#/learn")}<p class="sub" style="margin-top:-6px">${words.length} слов · выучено ${known(lv)} · порядок по частотности</p>
    <div class="seg mt"><button aria-pressed="true" data-f="all">Все</button><button data-f="new">Новые</button><button data-f="known">Изученные</button></div><div id="wl"></div>
    <a class="btn" href="#/study/${lv}" style="position:sticky;bottom:96px">Учить карточками ${ic("go")}</a>`;
  const draw = () => { const list = words.filter(w => f === "all" || (f === "new" ? !S.srs[w.hz] : S.srs[w.hz])); $("#wl").innerHTML = list.length ? list.map(wordRow).join("") : `<div class="empty">Здесь пока пусто</div>`; };
  $$(".seg button").forEach(b => b.onclick = () => { f = b.dataset.f; $$(".seg button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); draw(); });
  draw();
}
async function searchWords(q) {
  q = q.trim(); if (!q) return []; const words = await allWords(); const p = plain(q.replace(/[1-5]/g, ""));
  const cyr = /[а-яё]/i.test(q), hz = /[一-鿿]/.test(q); const score = w => {
    if (hz) return w.hz === q ? 0 : w.hz.startsWith(q) ? 1 : w.hz.includes(q) ? 2 : 9;
    if (cyr) { const r = w.ru.toLowerCase(), ql = q.toLowerCase(); return r.split(/[;,] ?/).some(x => x.trim() === ql) ? 0 : r.startsWith(ql) ? 1 : new RegExp(`(^|[^а-яё])${ql.replace(/[.*+?^${}()|[\]\\]/g, "")}`).test(r) ? 2 : r.includes(ql) ? 3 : 9; }
    const pp = plain(w.py); return pp === p ? 0 : pp.startsWith(p) ? 1 : 9; };
  return words.map(w => [score(w), w]).filter(x => x[0] < 9).sort((a, b) => a[0] - b[0] || a[1].lv - b[1].lv).slice(0, 60).map(x => x[1]);
}
function pageDict() {
  const recent = (S.recent || []);
  app.innerHTML = `${topbar("Словарь", "#/home")}<label class="search">${ic("search")}<input id="q" placeholder="你好 · nihao · привет" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
    <p class="hint">Поиск по иероглифам, пиньиню (без тонов) и русскому переводу среди 5000 слов HSK 1–6.</p><div id="res">${recent.length ? `<div class="section"><h2>Недавние</h2><button class="muted" id="clr">Очистить</button></div><div class="chips">${recent.map(r => `<button class="chip" data-q="${esc(r)}"><b class="zh" style="font-size:15px">${esc(r)}</b></button>`).join("")}</div>` : ""}</div>`;
  const q = $("#q"); let t = 0;
  const run = async () => { const v = q.value; const r = await searchWords(v); if (q.value !== v) return;
    $("#res").innerHTML = v.trim() ? (r.length ? r.map(w => wordRow(w).replace("</div><div>", `<span class="tag">HSK ${w.lv}</span></div><div>`)).join("") : `<div class="empty"><b>Ничего не найдено</b>Словарь охватывает лексику HSK 1–6.</div>`) : "";
    if (r[0] && v.trim()) { S.recent = [r[0].hz, ...(S.recent || []).filter(x => x !== r[0].hz)].slice(0, 12); save(); } };
  q.oninput = () => { clearTimeout(t); t = setTimeout(run, 220); };
  $$("[data-q]").forEach(b => b.onclick = () => { q.value = b.dataset.q; run(); });
  const c = $("#clr"); if (c) c.onclick = () => { S.recent = []; save(); pageDict(); };
  const pre = sessionStorage.getItem("dictQ"); if (pre) { sessionStorage.removeItem("dictQ"); q.value = pre; run(); } else q.focus();
}
async function pageBook() {
  const keys = Object.keys(S.book);
  app.innerHTML = `${topbar("Мой словарик", "#/review")}${keys.length ? "" : `<div class="empty"><b>Словарик пуст</b>Сюда попадают слова, в которых вы ошиблись, и слова со звёздочкой.<br><a class="btn small" href="#/level/${S.settings.level}">Открыть слова HSK ${S.settings.level}</a></div>`}<div id="wl"></div>`;
  if (!keys.length) return; const words = await allWords(); const m = new Map(words.map(w => [w.hz, w]));
  const list = keys.map(k => m.get(k)).filter(Boolean).sort((a, b) => S.book[b.hz].t - S.book[a.hz].t);
  $("#wl").innerHTML = `<p class="sub" style="margin-top:-6px">${list.length} ${plural(list.length, "слово", "слова", "слов")}</p>${list.map(wordRow).join("")}<a class="btn" href="#/study/book">Повторить карточками ${ic("go")}</a>`;
}

/* ---------- уровни, статистика, план, настройки ---------- */
function pageLevels() {
  app.innerHTML = `${topbar("Уровни курса", "#/learn")}<p class="sub" style="margin-top:-6px">Лексика по стандарту HSK 2.0 — около 5000 слов. Выберите текущий уровень.</p>
    <div class="list">${[1, 2, 3, 4, 5, 6].map(lv => `<button class="row" data-lv="${lv}"><span class="ic" style="${lv === S.settings.level ? "background:var(--ink);color:#fff" : ""}"><b style="font-size:13px">${lv}</b></span><span class="t"><b>HSK ${lv} · ${LEVELS[lv].title}</b><small>${LEVELS[lv].desc} · выучено ${known(lv)}/${LEVELS[lv].words}</small></span>${lv === S.settings.level ? ic("check", "i go") : ic("go", "i go")}</button>`).join("")}</div>`;
  $$("[data-lv]").forEach(b => b.onclick = () => { S.settings.level = +b.dataset.lv; save(); toast(`Текущий уровень: HSK ${b.dataset.lv}`); pageLevels(); });
}
function pageStats() {
  const days = [...Array(14)].map((_, i) => { const t = today(Date.now() - (13 - i) * DAY); return [t, S.stats.days[t] || 0]; }); const mx = Math.max(1, ...days.map(d => d[1]));
  const lvRows = [1, 2, 3, 4, 5, 6].map(lv => `<div class="setrow"><span>HSK ${lv}</span><span class="muted">${known(lv)} / ${LEVELS[lv].words}</span></div>`).join("");
  app.innerHTML = `${topbar("Статистика", "#/me")}<div class="box"><h3>Последние 14 дней</h3><div class="chart">${days.map(([t, n]) => `<div class="${n ? "on" : ""}" style="height:${n / mx * 100}%" title="${t}: ${n}"><span>${+t.slice(8)}</span></div>`).join("")}</div><p class="hint" style="margin-top:26px">Сегодня: ${D().answered} ответов, ${D().correct} верных · новых слов ${D().learned}</p></div>
    <div class="box"><h3>Всего</h3><div class="stats"><div><b>${S.stats.answered}</b><small>ответов</small></div><div><b>${accuracy()}%</b><small>точность</small></div><div><b>${Object.keys(S.srs).length}</b><small>слов в работе</small></div></div></div>
    <div class="box"><h3>Слова по уровням</h3>${lvRows}</div>
    <div class="box"><h3>Последние тесты</h3>${S.history.length ? S.history.slice(0, 10).map(x => `<div class="setrow"><span>${esc(x.kind)}<small>${new Date(x.t).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></span><b>${x.score}</b></div>`).join("") : `<p class="hint">Пока нет пройденных тестов.</p>`}</div>`;
}
function pagePlan() {
  app.innerHTML = `${topbar("Учебный план", "#/home")}<label class="field"><span>Цель на день — верных ответов</span><select id="goal">${[10, 20, 30, 50, 80].map(n => `<option ${n === S.settings.goal ? "selected" : ""}>${n}</option>`).join("")}</select></label>
    <label class="field"><span>Новых слов в день</span><select id="np">${[5, 10, 15, 20, 30].map(n => `<option ${n === S.settings.newPerDay ? "selected" : ""}>${n}</option>`).join("")}</select></label>
    <p class="hint mt">10 новых слов в день — это около 3600 слов в год. Лучше меньше, но каждый день.</p><button class="btn" id="ok">Сохранить</button>`;
  $("#ok").onclick = () => { S.settings.goal = +$("#goal").value; S.settings.newPerDay = +$("#np").value; save(); toast("План сохранён"); location.hash = "#/home"; };
}
function pageSettings() {
  const st = S.settings;
  app.innerHTML = `${topbar("Настройки", "#/me")}<label class="field"><span>Имя</span><input id="nick" maxlength="20" value="${esc(S.profile.nick)}"></label>
    <div class="setrow"><span>Показывать пиньинь сразу<small>На карточках и в диалогах</small></span><button class="toggle" id="py" aria-pressed="${st.pinyin}" aria-label="Пиньинь"></button></div>
    <div class="setrow"><span>Скорость речи<small>Системный голос zh-CN</small></span><div class="seg" style="margin:0;width:190px">${[0.6, 0.85, 1].map(r => `<button data-rate="${r}" aria-pressed="${r === st.rate}">${r === 1 ? "1×" : r + "×"}</button>`).join("")}</div></div>
    <div class="setrow"><span>Проверить голос</span><button class="say" data-say="你好，欢迎学习中文！">${ic("speaker")}</button></div>
    <div class="section"><h2>Резервная копия</h2></div><p class="hint" style="margin-top:0">Прогресс хранится только на этом устройстве. Скопируйте код, чтобы перенести его на другое устройство.</p>
    <div class="two" style="margin-top:6px"><button class="btn ghost" id="exp">Скопировать код</button><button class="btn ghost" id="imp">Вставить код</button></div>
    <div class="section"><h2>Сброс</h2></div><button class="btn ghost" id="reset" style="color:var(--bad)">Удалить весь прогресс</button>`;
  $("#nick").onchange = e => { S.profile.nick = e.target.value.trim() || "друг"; save(); toast("Имя сохранено"); };
  $("#py").onclick = e => { st.pinyin = !st.pinyin; e.currentTarget.setAttribute("aria-pressed", String(st.pinyin)); save(); };
  $$("[data-rate]").forEach(b => b.onclick = () => { st.rate = +b.dataset.rate; $$("[data-rate]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); save(); speak("你好"); });
  $("#exp").onclick = () => sheetCode(true); $("#imp").onclick = () => sheetCode(false);
  $("#reset").onclick = () => { if (prompt('Чтобы удалить весь прогресс, введите слово «удалить»') === "удалить") { localStorage.removeItem(APP_KEY); location.hash = "#/welcome"; location.reload(); } };
}
function sheetCode(exp) {
  const code = "HYT2:" + btoa(unescape(encodeURIComponent(JSON.stringify(S))));
  const sh = h(`<div class="sheet" role="dialog" aria-modal="true"><div class="in" style="position:relative"><button class="round x" aria-label="Закрыть">${ic("close")}</button><h2>${exp ? "Код прогресса" : "Перенос прогресса"}</h2>
    <p class="hint">${exp ? "Сохраните этот код или вставьте его на другом устройстве." : "Вставьте код, скопированный на другом устройстве. Текущий прогресс будет заменён."}</p>
    <label class="field"><textarea id="code" ${exp ? "readonly" : ""}>${exp ? code : ""}</textarea></label><button class="btn" id="go">${exp ? "Скопировать" : "Восстановить"}</button></div></div>`);
  document.body.append(sh); const close = () => sh.remove(); $(".x", sh).onclick = close; sh.onclick = e => { if (e.target === sh) close(); };
  $("#go", sh).onclick = async () => {
    if (exp) { try { await navigator.clipboard.writeText(code); toast("Код скопирован"); } catch (_) { $("#code", sh).select(); document.execCommand("copy"); toast("Код скопирован"); } return; }
    try { const t = $("#code", sh).value.trim(); if (!t.startsWith("HYT2:")) throw 0; const data = JSON.parse(decodeURIComponent(escape(atob(t.slice(5))))); if (data.v !== 2 || !data.profile) throw 0; localStorage.setItem(APP_KEY, JSON.stringify(data)); location.hash = "#/home"; location.reload(); }
    catch (_) { toast("Код не подходит — скопируйте его полностью"); }
  };
}
function pageAbout() {
  app.innerHTML = `${topbar("О приложении", "#/me")}<div style="width:96px;margin:0 auto">${PANDA}</div><h2 class="center" style="margin:6px 0 0">汉语熊猫 · ХаньюйТун</h2><p class="center muted">Китайский для русскоговорящих · версия 1.0</p>
    <div class="box"><h3>Словарь</h3><p class="hint" style="margin:0">Список слов HSK 1–6, пиньинь и части речи — <a href="https://github.com/drkameleon/complete-hsk-vocabulary" style="text-decoration:underline">complete-hsk-vocabulary</a> (MIT), основан на данных CC-CEDICT (CC BY-SA 4.0). Русские переводы, диалоги, тексты и объяснения грамматики написаны для этого приложения; переводы краткие и не проверены носителем — сообщайте о неточностях.</p></div>
    <div class="box"><h3>Порядок черт</h3><p class="hint" style="margin:0">Анимация и проверка черт — <a href="https://github.com/chanind/hanzi-writer" style="text-decoration:underline">Hanzi Writer</a> (MIT); данные черт — Make Me a Hanzi, Arphic Public License (текст лицензии: strokes/ARPHICPL.TXT).</p></div>
    <div class="box"><h3>Озвучивание</h3><p class="hint" style="margin:0">Используется встроенный китайский голос вашего устройства (zh-CN). Если звука нет, установите китайский голос в системных настройках речи.</p></div>
    <div class="box"><h3>Данные</h3><p class="hint" style="margin:0">Аккаунт не нужен. Весь прогресс хранится в браузере на этом устройстве; для переноса используйте код в настройках. После первого открытия приложение работает без интернета.</p></div>`;
}

/* ---------- кнопка «Спросить панду» ---------- */
function pandaSheet() {
  const sh = h(`<div class="sheet" role="dialog" aria-modal="true" aria-label="Спросить панду"><div class="in" style="position:relative"><button class="round x" aria-label="Закрыть">${ic("close")}</button>
    <div style="display:flex;gap:12px;align-items:center"><span style="width:48px">${PANDA}</span><div><h2>Спросить панду</h2><div class="muted">Найду слово в словаре HSK</div></div></div>
    <label class="search mt">${ic("search")}<input id="pq" placeholder="Например: спасибо или xiexie" autocomplete="off"></label><div id="pr" style="max-height:46vh;overflow:auto"></div></div></div>`);
  document.body.append(sh); const close = () => sh.remove(); $(".x", sh).onclick = close; sh.onclick = e => { if (e.target === sh) close(); };
  const q = $("#pq", sh); q.focus(); let t = 0;
  q.oninput = () => { clearTimeout(t); t = setTimeout(async () => { const r = (await searchWords(q.value)).slice(0, 8); $("#pr", sh).innerHTML = q.value.trim() ? (r.length ? r.map(wordRow).join("") + `<a class="btn small ghost" href="#/dict" id="more">Открыть словарь</a>` : `<p class="hint mt">Такого слова нет в словаре HSK. Попробуйте другую форму слова.</p>`) : "";
    const m = $("#more", sh); if (m) m.onclick = () => { sessionStorage.setItem("dictQ", q.value); close(); }; }, 200); };
}

/* ---------- иероглифы: порядок черт (Hanzi Writer, данные Make Me a Hanzi / Arphic PL) ---------- */
let hwP = null;
const loadHW = () => hwP || (hwP = new Promise((res, rej) => { if (window.HanziWriter) return res(); const s = document.createElement("script"); s.src = "vendor/hanzi-writer.min.js"; s.onload = res; s.onerror = () => { hwP = null; rej(Error("hw")); }; document.head.append(s); }));
const charLoader = (c, onLoad, onErr) => fetch(`strokes/${encodeURIComponent(c)}.json`).then(r => { if (!r.ok) throw Error(r.status); return r.json(); }).then(onLoad).catch(onErr);
const HW_OPTS = { padding: 6, strokeColor: "#18191a", radicalColor: "#536e94", outlineColor: "#e1e8f1", drawingColor: "#536e94", highlightColor: "#9ab6dd", strokeAnimationSpeed: 1.2, delayBetweenStrokes: 160, showCharacter: false, charDataLoader: charLoader };
const isHan = c => /[一-鿿]/.test(c);
const gridSVG = size => `<svg width="${size}" height="${size}" style="position:absolute;inset:0" aria-hidden="true"><g stroke="#e8eef6" stroke-dasharray="4 4"><line x1="0" y1="0" x2="${size}" y2="${size}"/><line x1="${size}" y1="0" x2="0" y2="${size}"/><line x1="${size / 2}" y1="0" x2="${size / 2}" y2="${size}"/><line x1="0" y1="${size / 2}" x2="${size}" y2="${size / 2}"/></g></svg>`;
const charBox = (id, size) => `<div style="position:relative;width:${size}px;height:${size}px;border:1px solid var(--line);border-radius:18px;background:#fff;overflow:hidden">${gridSVG(size)}<div id="${id}" style="position:relative"></div></div>`;

async function findWord(hz) { const all = await allWords(); return all.find(w => w.hz === hz); }
async function pageWord(hz) {
  hz = decodeURIComponent(hz || ""); let w = await findWord(hz);
  if (!w && hz && [...hz].every(isHan)) { w = { hz, py: "", ru: "Нет в списке HSK 1–6", pos: "", lv: 0 }; }
  if (!w) { app.innerHTML = `${topbar("Слово", "#/dict")}<div class="empty"><b>Слово не найдено</b>Его нет в словаре HSK 1–6.</div>`; return; }
  const chars = [...w.hz].filter(isHan); const ex = SENTENCES.filter(s => s.zh.includes(w.hz)).slice(0, 4);
  const parts = chars.length > 1 ? (await allWords()).filter(x => x.hz.length === 1 && chars.includes(x.hz)) : [];
  const srs = S.srs[w.hz]; const size = chars.length > 2 ? 92 : chars.length === 2 ? 130 : 170;
  app.innerHTML = `${topbar("Слово", history.length > 1 ? "javascript:history.back()" : "#/dict")}
    <div class="center"><div style="display:flex;gap:10px;justify-content:center">${chars.map((c, i) => charBox(`hw${i}`, size)).join("")}</div>
      <div class="py" style="font-size:22px;margin-top:14px">${esc(w.py)}</div><div style="font-size:17px;font-weight:600;margin-top:6px">${esc(w.ru)}</div>
      <div class="muted" style="margin-top:6px">${w.lv ? "HSK " + w.lv : "вне HSK"}${w.pos ? " · " + esc(w.pos) : ""}${srs ? ` · ${srs.b >= 3 ? "хорошо знаю" : srs.b >= 1 ? "изучаю" : "трудное"}` : " · ещё не изучено"}</div>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:12px">${sayBtn(w.hz)}${w.lv ? starBtn(w) : ""}<button class="say" id="anim" aria-label="Показать порядок черт">${ic("pen")}</button></div></div>
    <a class="btn" href="#/hanzi/w/${encodeURIComponent(w.hz)}">Написать иероглиф${chars.length > 1 ? "ы" : ""} ${ic("pen")}</a>
    ${parts.length ? `<div class="section"><h2>Иероглифы в слове</h2></div>${parts.map(wordRow).join("")}` : ""}
    <div class="section"><h2>Примеры</h2></div>${ex.length ? `<div class="dlg">${ex.map(s => `<div class="line" data-say="${esc(s.zh)}"><div><div class="zh">${esc(s.zh)}</div><div class="py">${esc(s.py)}</div><div class="ru">${esc(s.ru)}</div></div></div>`).join("")}</div>` : `<p class="hint">В учебных текстах пока нет примеров с этим словом.</p>`}`;
  try { await loadHW(); } catch (_) { return; }
  const ws = chars.map((c, i) => HanziWriter.create(`hw${i}`, c, { ...HW_OPTS, width: size - 2, height: size - 2, showCharacter: true }));
  const play = async () => { for (const x of ws) { x.hideCharacter(); } for (const x of ws) await x.animateCharacter(); };
  $("#anim").onclick = play; setTimeout(play, 300);
}

/* тренировка письма иероглифов */
async function pageHanzi(arg, hzArg) {
  let list;
  if (arg === "w") { const hz = decodeURIComponent(hzArg || ""); const w = await findWord(hz) || ([...hz].every(isHan) && hz ? { hz, py: "", ru: hz, lv: 0 } : null); list = w ? [w] : []; }
  else { const lv = +arg || S.settings.level; const words = await level(lv); const learned = words.filter(w => S.srs[w.hz]);
    list = shuffle(learned.length >= 6 ? learned : words.slice(0, 40)).slice(0, 6); }
  const back = arg === "w" ? `#/word/${encodeURIComponent(hzArg)}` : "#/learn";
  if (!list.length) { app.innerHTML = `${topbar("Иероглифы", back)}<div class="empty"><b>Нечего писать</b></div>`; return; }
  try { await loadHW(); } catch (_) { app.innerHTML = `${topbar("Иероглифы", back)}<div class="empty"><b>Не удалось загрузить</b>Проверьте подключение.</div>`; return; }
  let k = 0, ci = 0, total = 0, mistakes = 0, hint = false, writer = null;
  const size = Math.min(300, window.innerWidth - 60);
  function draw() {
    const w = list[k]; if (!w) return finish(); const chars = [...w.hz].filter(isHan); const c = chars[ci];
    app.innerHTML = `${topbar("Пишем иероглифы", back)}<div class="qhead"><div class="bar"><i style="width:${k / list.length * 100}%"></i></div><span class="muted">${k + 1}/${list.length}</span></div>
      <div class="center"><div style="font-size:16px;font-weight:600">${esc(short(w.ru))}</div><div class="py" style="font-size:18px">${esc(w.py)}</div>
        <div style="display:flex;justify-content:center;gap:6px;margin:8px 0 12px">${chars.map((x, i) => `<span class="zh" style="font-size:26px;${i < ci ? "" : "color:#c9d3df"}">${i < ci ? x : "□"}</span>`).join("")}</div>
        <div style="display:flex;justify-content:center">${charBox("hwq", size)}</div><p class="muted" id="st">Пишите пальцем или мышью по порядку черт</p></div>
      <div class="two"><button class="btn ghost" id="hint">${hint ? "Скрыть контур" : "Показать контур"}</button><button class="btn ghost" id="demo">Как писать ${ic("pen")}</button></div>`;
    writer = HanziWriter.create("hwq", c, { ...HW_OPTS, width: size - 2, height: size - 2, showOutline: hint, showHintAfterMisses: 2 });
    const start = () => writer.quiz({ leniency: 1.2,
      onMistake: () => { mistakes++; $("#st").textContent = "Не та черта — попробуйте ещё раз"; },
      onCorrectStroke: d => { $("#st").textContent = `Черта ${d.strokeNum + 1} из ${d.strokeNum + 1 + d.strokesRemaining}`; },
      onComplete: d => { total++; $("#st").textContent = d.totalMistakes ? `Готово, ошибок: ${d.totalMistakes}` : "Отлично, без ошибок!"; speak(c); markStudy(); save();
        setTimeout(() => { ci++; if (ci >= chars.length) { ci = 0; k++; record(true); } draw(); }, 900); } });
    start();
    $("#hint").onclick = () => { hint = !hint; hint ? writer.showOutline() : writer.hideOutline(); $("#hint").textContent = hint ? "Скрыть контур" : "Показать контур"; };
    $("#demo").onclick = async () => { writer.cancelQuiz(); await writer.animateCharacter(); writer.hideCharacter(); start(); };
  }
  function finish() { app.innerHTML = `${topbar("Пишем иероглифы", back)}<div class="result"><div style="width:110px;margin:0 auto">${PANDA}</div><div class="score">${total}</div><p>${plural(total, "иероглиф написан", "иероглифа написано", "иероглифов написано")} · ошибок в чертах: ${mistakes}</p>
      ${arg === "w" ? `<a class="btn" href="${back}">К слову</a>` : `<button class="btn" id="again">Ещё 6 слов</button>`}<a class="btn ghost" href="#/learn">Готово</a></div>`; const a = $("#again"); if (a) a.onclick = () => pageHanzi(arg); }
  onLeave(() => { try { writer && writer.cancelQuiz(); } catch (_) {} });
  draw();
}

/* ---------- игры: «Найди пару» и облако слов ---------- */
async function pagePairs(lv) {
  lv = +lv || S.settings.level; const words = await level(lv); const pool = words.filter(w => S.srs[w.hz]); const src = shuffle(pool.length >= 6 ? pool : words.slice(0, 60)).slice(0, 6);
  let sel = null, left = src.length, miss = 0; const t0 = Date.now();
  const cards = shuffle([...src.map(w => ({ k: w.hz, t: w.hz, zh: true })), ...src.map(w => ({ k: w.hz, t: short(w.ru) }))]);
  app.innerHTML = `${topbar(`Найди пару · HSK ${lv}`, "#/review")}<p class="sub" style="margin-top:-6px">Соедините иероглиф с переводом.</p>
    <div class="grid2" id="pg" style="grid-template-columns:1fr 1fr 1fr;gap:8px">${cards.map((c, i) => `<button class="opt ${c.zh ? "zhopt" : ""}" data-i="${i}" style="min-height:78px;padding:8px;text-align:center;font-size:${c.zh ? 22 : 13}px">${esc(c.t)}</button>`).join("")}</div><div id="fb"></div>`;
  $$("#pg .opt").forEach(b => b.onclick = () => {
    const c = cards[+b.dataset.i]; if (b.disabled) return;
    if (c.zh) speak(c.t);
    if (!sel) { sel = b; b.style.borderColor = "var(--ink)"; return; }
    if (sel === b) { sel.style.borderColor = ""; sel = null; return; }
    const a = cards[+sel.dataset.i];
    if (a.k === c.k && a.zh !== c.zh) { [sel, b].forEach(x => { x.classList.add("right"); x.disabled = true; x.style.opacity = ".55"; x.style.borderColor = ""; }); left--; record(true);
      if (!left) $("#fb").innerHTML = `<div class="result" style="padding:20px 0"><div class="score">${Math.round((Date.now() - t0) / 1000)} c</div><p>Все пары найдены${miss ? `, промахов: ${miss}` : " без промахов"}!</p><button class="btn" id="again">Ещё раз</button></div>`, $("#again").onclick = () => pagePairs(lv); }
    else { miss++; record(false, c.zh ? c.k : a.k, lv); [sel, b].forEach(x => { x.classList.add("wrong"); setTimeout(() => { x.classList.remove("wrong"); x.style.borderColor = ""; }, 500); }); }
    sel = null;
  });
}
async function pageCloud(lv) {
  lv = +lv || S.settings.level; const words = (await level(lv)).slice(0, 60);
  app.innerHTML = `${topbar(`Облако слов · HSK ${lv}`, "#/review")}<p class="sub" style="margin-top:-6px">Чем чаще слово встречается, тем оно крупнее. Нажмите — услышите и увидите перевод. Выученные слова светлее.</p>
    <div id="cl" style="display:flex;flex-wrap:wrap;gap:6px 12px;justify-content:center;align-items:center;padding:18px 4px;border:1px solid var(--line);border-radius:24px;margin-top:14px;background:var(--glaze2)">${shuffle(words.map((w, i) => ({ w, i }))).map(({ w, i }) => `<button class="zh" data-hz="${esc(w.hz)}" style="font-size:${Math.round(34 - i * 0.33)}px;line-height:1.3;color:${S.srs[w.hz]?.b >= 2 ? "#9ab6dd" : "#18191a"};transform:rotate(${(Math.random() * 10 - 5).toFixed(1)}deg)">${esc(w.hz)}</button>`).join("")}</div>
    <div id="cw" class="mt"></div>`;
  const m = new Map(words.map(w => [w.hz, w]));
  $$("#cl button").forEach(b => b.onclick = () => { const w = m.get(b.dataset.hz); speak(w.hz); $("#cw").innerHTML = wordRow(w); });
}

/* ---------- «Мои учебники»: локальная полка (IndexedDB, файлы не покидают устройство) ---------- */
const Shelf = (() => {
  let dbP = null;
  const db = () => dbP || (dbP = new Promise((res, rej) => { const r = indexedDB.open("hanyu-shelf", 1); r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("files", { keyPath: "id" }); d.createObjectStore("blobs"); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = async (stores, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(stores, mode); let out; Promise.resolve(fn(t)).then(v => out = v); t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return {
    list: () => tx(["files"], "readonly", t => req(t.objectStore("files").getAll())),
    get: id => tx(["files"], "readonly", t => req(t.objectStore("files").get(id))),
    blob: id => tx(["blobs"], "readonly", t => req(t.objectStore("blobs").get(id))),
    put: (meta, blob) => tx(["files", "blobs"], "readwrite", t => { t.objectStore("files").put(meta); if (blob) t.objectStore("blobs").put(blob, meta.id); }),
    update: meta => tx(["files"], "readwrite", t => { t.objectStore("files").put(meta); }),
    remove: ids => tx(["files", "blobs"], "readwrite", t => { ids.forEach(id => { t.objectStore("files").delete(id); t.objectStore("blobs").delete(id); }); }),
  };
})();
const KIND = f => /\.pdf$/i.test(f.name) || f.type === "application/pdf" ? "pdf" : /^audio\//.test(f.type) || /\.(mp3|m4a|wav|ogg|aac|flac|wma)$/i.test(f.name) ? "audio" : /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif)$/i.test(f.name) ? "image" : /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm)$/i.test(f.name) ? "video" : /\.(txt|md)$/i.test(f.name) ? "text" : null;
const fmtSize = b => b > 1e9 ? (b / 1e9).toFixed(1) + " ГБ" : b > 1e6 ? (b / 1e6).toFixed(1) + " МБ" : Math.max(1, Math.round(b / 1e3)) + " КБ";
const natCmp = (a, b) => a.localeCompare(b, "ru", { numeric: true, sensitivity: "base" });
const KIND_IC = { pdf: "book", audio: "speaker", image: "layers", video: "wave", text: "read" };
const KIND_RU = { pdf: "PDF", audio: "аудио", image: "изображение", video: "видео", text: "текст" };

async function importFiles(fileList, onProgress) {
  const files = [...fileList].filter(f => KIND(f) && !f.name.startsWith(".")); let done = 0, bytes = 0;
  try { await navigator.storage?.persist?.(); } catch (_) {}
  for (const f of files) {
    const path = (f.webkitRelativePath || f.name).split("/"); const name = path.pop();
    // книга = первая папка внутри выбранной (или сама выбранная папка)
    const book = path.length >= 2 ? path[1] : path[0] || "Без папки"; const sub = path.slice(2).join(" / ");
    const id = `${path.join("/")}/${name}|${f.size}`;
    await Shelf.put({ id, name, book, sub, kind: KIND(f), size: f.size, type: f.type, added: Date.now(), pos: 0, done: false }, f);
    done++; bytes += f.size; onProgress && onProgress(done, files.length, bytes);
  }
  return { count: files.length, bytes };
}

async function pageShelf(bookArg) {
  const book = bookArg ? decodeURIComponent(bookArg) : null;
  app.innerHTML = `${topbar(book || "Мои учебники", book ? "#/shelf" : "#/learn")}<p class="empty">Загрузка…</p>`;
  let items = []; try { items = await Shelf.list(); } catch (_) { app.innerHTML = `${topbar("Мои учебники", "#/learn")}<div class="empty"><b>Хранилище недоступно</b>Браузер запретил локальное хранение (например, приватный режим).</div>`; return; }
  if (book) {
    const files = items.filter(x => x.book === book).sort((a, b) => natCmp(a.sub + "/" + a.name, b.sub + "/" + b.name));
    const groups = {}; files.forEach(f => (groups[f.sub || ""] ||= []).push(f));
    app.innerHTML = `${topbar(esc(book), "#/shelf")}<p class="sub" style="margin-top:-6px">${files.length} ${plural(files.length, "файл", "файла", "файлов")} · ${fmtSize(files.reduce((s, f) => s + f.size, 0))}</p>
      ${Object.keys(groups).sort(natCmp).map(g => `${g ? `<div class="section"><h2 style="font-size:14px">${esc(g)}</h2></div>` : ""}<div class="list">${groups[g].map(f => `<a href="#/file/${encodeURIComponent(f.id)}"><span class="ic">${ic(KIND_IC[f.kind])}</span><span class="t"><b style="word-break:break-word">${esc(f.name.replace(/\.[^.]+$/, ""))}</b><small>${KIND_RU[f.kind]} · ${fmtSize(f.size)}${f.pos ? f.kind === "audio" ? ` · остановились на ${Math.floor(f.pos / 60)}:${String(Math.floor(f.pos % 60)).padStart(2, "0")}` : " · открывали" : ""}${f.done ? " · ✓" : ""}</small></span>${ic("go", "i go")}</a>`).join("")}</div>`).join("")}
      <button class="btn ghost" id="del" style="color:var(--bad)">Удалить эту книгу с устройства</button>`;
    $("#del").onclick = async () => { if (!confirm(`Удалить «${book}» с этого устройства?`)) return; await Shelf.remove(files.map(f => f.id)); toast("Книга удалена"); location.hash = "#/shelf"; };
    return;
  }
  const books = {}; items.forEach(f => { const b = books[f.book] ||= { n: 0, size: 0, pdf: 0, audio: 0, last: 0 }; b.n++; b.size += f.size; b[f.kind] = (b[f.kind] || 0) + 1; b.last = Math.max(b.last, f.opened || 0); });
  const names = Object.keys(books).sort(natCmp); const total = items.reduce((s, f) => s + f.size, 0);
  let est = ""; try { const e = await navigator.storage?.estimate?.(); if (e?.quota) est = ` · доступно ещё ≈ ${fmtSize(Math.max(0, e.quota - e.usage))}`; } catch (_) {}
  const recent = items.filter(f => f.opened).sort((a, b) => b.opened - a.opened)[0];
  app.innerHTML = `${topbar("Мои учебники", "#/learn")}<p class="sub" style="margin-top:-6px">Добавьте свои учебники — PDF, аудио, картинки. Файлы хранятся только на этом устройстве и никуда не загружаются.</p>
    ${recent ? `<a class="card-blue" href="#/file/${encodeURIComponent(recent.id)}" style="display:block;margin-top:16px"><p class="kicker">Продолжить</p><b style="font-size:17px;word-break:break-word">${esc(recent.name.replace(/\.[^.]+$/, ""))}</b><p class="sub" style="max-width:none">${esc(recent.book)}</p></a>` : ""}
    <div class="two"><label class="btn" style="cursor:pointer">${ic("download")} Папку<input type="file" id="fdir" webkitdirectory directory multiple hidden></label><label class="btn ghost" style="cursor:pointer">Файлы<input type="file" id="ffiles" multiple accept=".pdf,audio/*,image/*,video/*,.txt,.md,.mp3,.m4a,.wav" hidden></label></div>
    <p class="hint">Совет: распакуйте скачанный архив и выберите общую папку (например, «Road to Success») — каждая вложенная папка станет отдельной книгой. На iPhone выбирайте файлы через «Файлы».</p><div id="imp"></div>
    ${names.length ? `<div class="section"><h2>Книги</h2><span class="muted">${names.length} · ${fmtSize(total)}${est}</span></div><div class="list">${names.map(n => { const b = books[n]; return `<a href="#/shelf/${encodeURIComponent(n)}"><span class="ic">${ic("book")}</span><span class="t"><b style="word-break:break-word">${esc(n)}</b><small>${[b.pdf ? `PDF: ${b.pdf}` : "", b.audio ? `аудио: ${b.audio}` : "", b.image ? `картинок: ${b.image}` : "", b.video ? `видео: ${b.video}` : ""].filter(Boolean).join(" · ")} · ${fmtSize(b.size)}</small></span>${ic("go", "i go")}</a>`; }).join("")}</div>`
      : `<div class="empty"><b>Полка пока пуста</b>Нажмите «Папку», чтобы добавить учебники.</div>`}`;
  const onPick = async e => {
    const fl = e.target.files; if (!fl || !fl.length) return; const box = $("#imp");
    box.innerHTML = `<div class="box"><b>Добавляю…</b><div class="bar mt"><i id="ib" style="width:0"></i></div><p class="hint" id="it"></p></div>`;
    try { const r = await importFiles(fl, (d, n, b) => { $("#ib").style.width = d / n * 100 + "%"; $("#it").textContent = `${d} из ${n} · ${fmtSize(b)}`; });
      toast(r.count ? `Добавлено ${r.count} ${plural(r.count, "файл", "файла", "файлов")}` : "Подходящих файлов не найдено (PDF, аудио, изображения, видео)"); pageShelf(); }
    catch (err) { box.innerHTML = `<div class="notice">Не хватило места на устройстве или браузер остановил запись. Добавьте книги по частям. (${esc(err?.name || err)})</div>`; }
  };
  $("#fdir").onchange = onPick; $("#ffiles").onchange = onPick;
}

async function pageFile(idArg) {
  const id = decodeURIComponent(idArg || ""); const meta = await Shelf.get(id); const blob = meta && await Shelf.blob(id);
  if (!meta || !blob) { app.innerHTML = `${topbar("Файл", "#/shelf")}<div class="empty"><b>Файл не найден</b>Возможно, он был удалён с устройства.</div>`; return; }
  meta.opened = Date.now(); Shelf.update(meta);
  const back = `#/shelf/${encodeURIComponent(meta.book)}`; const url = URL.createObjectURL(blob); onLeave(() => setTimeout(() => URL.revokeObjectURL(url), 60e3));
  const siblings = (await Shelf.list()).filter(f => f.book === meta.book && f.kind === meta.kind).sort((a, b) => natCmp(a.sub + "/" + a.name, b.sub + "/" + b.name));
  const i = siblings.findIndex(f => f.id === id), prev = siblings[i - 1], next = siblings[i + 1];
  const nav = `<div class="two">${prev ? `<a class="btn ghost" href="#/file/${encodeURIComponent(prev.id)}">‹ Назад</a>` : "<span></span>"}${next ? `<a class="btn ghost" href="#/file/${encodeURIComponent(next.id)}">Дальше ›</a>` : "<span></span>"}</div>`;
  const title = esc(meta.name.replace(/\.[^.]+$/, ""));
  if (meta.kind === "pdf") {
    app.innerHTML = `${topbar(title, back)}<p class="muted" style="margin-top:-8px">${esc(meta.book)}${meta.sub ? " · " + esc(meta.sub) : ""}</p>
      <iframe src="${url}#page=${meta.page || 1}" title="${title}" style="width:100%;height:68vh;border:1px solid var(--line);border-radius:18px;background:#f5f6f8"></iframe>
      <a class="btn" href="${url}" target="_blank" rel="noopener">Открыть на весь экран</a>
      <label class="field"><span>Запомнить страницу</span><input id="pg" type="number" min="1" inputmode="numeric" value="${meta.page || ""}" placeholder="номер страницы"></label>${nav}`;
    $("#pg").onchange = e => { meta.page = +e.target.value || 1; meta.pos = meta.page; Shelf.update(meta); toast("Страница сохранена"); };
  } else if (meta.kind === "audio" || meta.kind === "video") {
    const tag = meta.kind === "audio" ? "audio" : "video";
    app.innerHTML = `${topbar(title, back)}<p class="muted" style="margin-top:-8px">${esc(meta.book)}${meta.sub ? " · " + esc(meta.sub) : ""}</p>
      ${tag === "audio" ? `<div class="card-blue center" style="padding:26px 18px"><div style="width:96px;margin:0 auto 10px">${PANDA}</div><b style="word-break:break-word">${title}</b></div>` : ""}
      <${tag} id="pl" src="${url}" controls preload="metadata" style="width:100%;margin-top:16px;${tag === "video" ? "border-radius:18px;background:#000" : ""}"></${tag}>
      <div class="seg mt">${[0.75, 1, 1.25].map(r => `<button data-r="${r}" aria-pressed="${r === 1}">${r}×</button>`).join("")}<button id="rw">−5 с</button><button id="loop" aria-pressed="false">Повтор</button></div>
      <label class="setrow"><span>Автоматически следующий трек</span><button class="toggle" id="auto" aria-pressed="${S.settings.autoNext !== false}"></button></label>${nav}`;
    const pl = $("#pl"); pl.addEventListener("loadedmetadata", () => { if (meta.pos && meta.pos < pl.duration - 3) pl.currentTime = meta.pos; }, { once: true });
    let t = 0; pl.ontimeupdate = () => { if (Date.now() - t > 4000) { t = Date.now(); meta.pos = pl.currentTime; Shelf.update(meta); } };
    pl.onended = () => { meta.pos = 0; meta.done = true; Shelf.update(meta); markStudy(); save(); if (S.settings.autoNext !== false && next && !pl.loop) location.hash = `#/file/${encodeURIComponent(next.id)}`; };
    $$("[data-r]").forEach(b => b.onclick = () => { pl.playbackRate = +b.dataset.r; $$("[data-r]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); });
    $("#rw").onclick = () => { pl.currentTime = Math.max(0, pl.currentTime - 5); };
    $("#loop").onclick = e => { pl.loop = !pl.loop; e.currentTarget.setAttribute("aria-pressed", String(pl.loop)); };
    $("#auto").onclick = e => { S.settings.autoNext = S.settings.autoNext === false; e.currentTarget.setAttribute("aria-pressed", String(S.settings.autoNext)); save(); };
    onLeave(() => { meta.pos = pl.currentTime; Shelf.update(meta); pl.pause(); });
    pl.play().catch(() => {});
  } else if (meta.kind === "image") {
    app.innerHTML = `${topbar(title, back)}<img src="${url}" alt="${title}" style="width:100%;border-radius:18px;border:1px solid var(--line)">${nav}`;
  } else {
    const txt = await blob.text(); app.innerHTML = `${topbar(title, back)}<div class="box zh" style="white-space:pre-wrap;line-height:1.9;font-size:17px">${esc(txt)}</div>${nav}`;
  }
}

/* ========== маршрутизация ========== */
const ROUTES = {
  welcome: pageWelcome, home: pageHome, learn: pageLearn, review: pageReview, me: pageMe,
  study: pageStudy, quiz: lv => pageQuiz(lv), listen: lv => pageQuiz(lv, "listen"), exam: lv => pageQuiz(lv, "exam"), write: pageWrite,
  pinyin: pagePinyin, tones: pageTones, grammar: pageGrammar, dialogues: () => pageDialogues(), dialogue: pageDialogues, reading: pageReading, shadow: pageShadow,
  level: pageLevel, levels: pageLevels, word: pageWord, hanzi: pageHanzi, pairs: pagePairs, cloud: pageCloud, shelf: pageShelf, file: pageFile, dict: pageDict, book: pageBook, stats: pageStats, plan: pagePlan, settings: pageSettings, about: pageAbout,
};
const TAB = { shelf: "learn", file: "learn", pairs: "review", cloud: "review", word: "home", home: "home", learn: "learn", review: "review", me: "me", study: "review", book: "review", quiz: "home", dict: "home", stats: "me", plan: "home", settings: "me", about: "me" };
async function route() {
  leaveFns.forEach(f => { try { f(); } catch (_) {} }); leaveFns = []; if ("speechSynthesis" in window) speechSynthesis.cancel();
  $$(".sheet").forEach(s => s.remove());
  let [name, arg, arg2] = (location.hash.replace(/^#\/?/, "") || "home").split("/");
  if (!S.profile && name !== "welcome") { location.replace("#/welcome"); return; }
  if (S.profile && name === "welcome") name = "home";
  const fn = ROUTES[name] || pageHome; const bare = name === "welcome";
  $("#appbar").hidden = bare; $("#tabbar").hidden = bare; $("#fab").hidden = bare || ["study", "quiz", "listen", "exam", "write", "tones", "shadow", "hanzi", "pairs", "file"].includes(name);
  const tab = TAB[name] || "learn"; $$("#tabbar a").forEach(a => a.toggleAttribute("aria-current", a.dataset.tab === tab));
  window.scrollTo(0, 0);
  try { await fn(arg, arg2); } catch (e) { console.error(e); app.innerHTML = `${topbar("Ошибка")}<div class="empty"><b>Не удалось загрузить</b>Проверьте подключение к интернету и попробуйте снова.<br><button class="btn small" onclick="location.reload()">Обновить</button></div>`; }
  document.title = name === "home" ? "汉语熊猫 · Китайский каждый день" : `${$("h1")?.textContent || "汉语熊猫"} · 汉语熊猫`;
}
window.addEventListener("hashchange", route);
$("#fab").onclick = pandaSheet;
$("#brand-mark").innerHTML = PANDA; $("#fab .face").innerHTML = PANDA;
route();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
