"use strict";
/* ========== ХаньюйТун · 汉语熊 — китайский для русскоговорящих ========== */

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
  translate: '<path d="M3 5h12M9 3v2M5 5c1 5 4 8 9 10M13 5c-1 5-4 8-9 10M13 21l4-10 4 10M14.5 17h5"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3V7Z"/><circle cx="12" cy="13" r="4"/>',
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

/* ---------- иллюстрация знакомства ---------- */
const ART_WELCOME = `<svg viewBox="0 0 280 225" fill="none" stroke="#202226" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M33 91C44 49 93 36 137 43c53-18 112 18 113 68 19 49-33 83-81 81-58 16-122-3-138-42-10-21-7-42 2-59Z" fill="#EDF4FD" stroke="none"/><path d="M70 105c22-8 46-8 70 4v84c-24-12-48-12-70-4z" fill="#fff"/><path d="M210 105c-22-8-46-8-70 4v84c24-12 48-12 70-4z" fill="#fff"/><path d="M86 128c14-4 28-3 40 2M86 145c14-4 28-3 40 2M154 130c12-5 26-6 40-2M154 147c12-5 26-6 40-2" stroke="#8aa3c4"/><path d="M96 38h88a10 10 0 0 1 10 10v28a10 10 0 0 1-10 10h-56l-14 12V86H96a10 10 0 0 1-10-10V48a10 10 0 0 1 10-10Z" fill="#fff"/><text x="140" y="72" text-anchor="middle" font-family="Noto Sans SC,sans-serif" font-size="25" font-weight="700" fill="#202226" stroke="none">你好！</text><path d="M60 46l8 7M54 70h11M218 44l-8 8M224 66h-11"/><path d="M228 170l18-48 7 3-18 48-8 5z" fill="#fff"/></svg>`;

/* ---------- состояние ---------- */
const DEFAULT = { v: 2, profile: null, settings: { level: 1, curriculum: "hsk2", hsk3Level: "1", goal: 20, newPerDay: 10, pinyin: true, rate: 0.85, homeFeatures: null }, srs: {}, book: {}, stats: { answered: 0, correct: 0, days: {} }, day: null, history: [] };
const S = (() => { try { const s = JSON.parse(localStorage.getItem(APP_KEY)); if (s && s.v === 2) return Object.assign(structuredClone(DEFAULT), s, { settings: Object.assign({}, DEFAULT.settings, s.settings) }); } catch (_) {} return structuredClone(DEFAULT); })();
let saveT = 0;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(APP_KEY, JSON.stringify(S)); } catch (_) { toast("Не удалось сохранить прогресс на устройстве"); } }, 120); }
function D() { const t = today(); if (!S.day || S.day.date !== t) S.day = { date: t, correct: 0, answered: 0, learned: 0, reviewed: 0 }; return S.day; }
function markStudy() { const t = today(); S.stats.days[t] = (S.stats.days[t] || 0) + 1; }
function record(ok, key, lv, word) {
  const d = D(); d.answered++; S.stats.answered++; if (ok) { d.correct++; S.stats.correct++; } markStudy();
  if (!ok && key) {
    key = canonicalKey(key);
    const snapshot = word ? studyWord(word) : bookmarkRecord(key)?.word || progressRecord(key)?.word;
    S.book[key] = { lv: snapshot?.lv ?? lv, t: Date.now(), why: "ошибка", ...(snapshot ? { word: snapshot } : {}) };
  }
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
// Keep old storage keys as a backup while one canonical card is shown to learners.
const legacyAliases = new Map(Object.entries(S.unifiedLegacyAliases || {})), legacyMetadata = new Map(), canonicalWords = new Map();
let unifiedCourseLoading = null;
const canonicalKey = key => legacyAliases.get(key) || key;
const wordKey = w => w.curriculum === "hsk3" || (w.source === "ai" && /^ai:/.test(w.id)) ? w.id : canonicalKey(w.hz);
function progressRecord(key) {
  key = canonicalKey(key);
  if (S.srs[key]) return S.srs[key];
  for (const [old, id] of legacyAliases) if (id === key && S.srs[old]) return S.srs[old];
  return null;
}
const wordProgress = w => progressRecord(wordKey(w));
function bookmarkRecord(key) {
  key = canonicalKey(key);
  if (S.book[key]) return S.book[key];
  for (const [old, id] of legacyAliases) if (id === key && S.book[old]) return S.book[old];
  return null;
}
const bookmarkKeys = () => [...new Set(Object.keys(S.book).map(canonicalKey))];
function progressEntries() {
  const entries = new Map();
  for (const [oldKey, value] of Object.entries(S.srs)) {
    const key = canonicalKey(oldKey);
    if (!entries.has(key) || oldKey === key) entries.set(key, { ...value, key, sourceKey: oldKey, hz: value.word?.hz || legacyMetadata.get(oldKey)?.hz || oldKey });
  }
  return [...entries.values()];
}
function studyWord(word) {
  if (word.source === "ai" && /^ai:/.test(word.id)) return word;
  if (word.curriculum === "hsk3") { canonicalWords.set(word.id, word); return word; }
  const key = canonicalKey(word.hz), meta = legacyMetadata.get(word.hz);
  if (key === word.hz) return word;
  const cached = canonicalWords.get(key) || S.srs[key]?.word || S.book[key]?.word;
  if (cached?.curriculum === "hsk3") return cached;
  if (!meta) return word;
  return { ...word, id: key, curriculum: "hsk3", level: meta.level, lv: meta.level, isSupplement: meta.kind === "reading" || meta.kind === "extra" };
}
function ensureUnifiedCourse() {
  if (typeof HSK3.bridge !== "function") return Promise.resolve(false);
  if (unifiedCourseLoading) return unifiedCourseLoading;
  unifiedCourseLoading = (async () => {
    const bridge = await HSK3.bridge();
    let upper = 0;
    const bands = bridge.levels.map(group => ({ id: group.id, upper: upper += group.officialCount }));
    for (const [hz, legacyLevel, legacyIndex, kind, officialNumbers] of bridge.rows) {
      const numbered = kind === "exact" || kind === "senses";
      const key = numbered ? `hsk3-${String(officialNumbers[0]).padStart(5, "0")}` : `hsk3-extra-${legacyLevel}-${String(legacyIndex + 1).padStart(4, "0")}`;
      const lv = numbered ? bands.find(group => officialNumbers[0] <= group.upper)?.id : String(legacyLevel);
      legacyAliases.set(hz, key); legacyMetadata.set(hz, { hz, key, level: lv, legacyLevel, kind });
    }
    if (S.unifiedCourseVersion === bridge.version) return true;
    const oldKeys = [...new Set([...Object.keys(S.srs), ...Object.keys(S.book)])].filter(key => legacyAliases.has(key));
    S.unifiedLegacyAliases = { ...S.unifiedLegacyAliases, ...Object.fromEntries(oldKeys.map(key => [key, canonicalKey(key)])) };
    if (!S.legacyProgressBackup) {
      S.legacyProgressBackup = { version: bridge.version, savedAt: Date.now(), settings: structuredClone(S.settings),
        srs: Object.fromEntries(oldKeys.filter(key => S.srs[key]).map(key => [key, structuredClone(S.srs[key])])),
        book: Object.fromEntries(oldKeys.filter(key => S.book[key]).map(key => [key, structuredClone(S.book[key])])) };
      save();
    }
    let complete = true, cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, oldKeys.length) }, async () => {
      while (cursor < oldKeys.length) {
        const old = oldKeys[cursor++], key = canonicalKey(old);
        if ((!S.srs[old] || S.srs[key]) && (!S.book[old] || S.book[key])) continue;
        try {
          const word = await HSK3.find(key);
          if (!word?.ru || !word.hz) throw Error("Missing unified word");
          canonicalWords.set(key, word);
          if (S.srs[old] && !S.srs[key]) S.srs[key] = { ...structuredClone(S.srs[old]), lv: word.lv, curriculum: "hsk3", word };
          if (S.book[old] && !S.book[key]) S.book[key] = { ...structuredClone(S.book[old]), lv: word.lv, word };
        } catch (_) { complete = false; }
      }
    }));
    if (complete) {
      if (S.settings.curriculum !== "hsk3") S.settings.hsk3Level = String(Math.min(6, Math.max(1, Number(S.settings.level) || 1)));
      S.settings.curriculum = "hsk3"; S.unifiedCourseVersion = bridge.version;
    }
    save();
    return complete;
  })().catch(() => false).then(complete => { if (!complete) unifiedCourseLoading = null; return complete; });
  return unifiedCourseLoading;
}
const hsk3Selected = () => S.settings.curriculum === "hsk3";
const hsk3Level = () => {
  const value = !S.unifiedCourseVersion && S.settings.curriculum !== "hsk3" ? S.settings.level : S.settings.hsk3Level;
  return ["1", "2", "3", "4", "5", "6", "7-9"].includes(String(value)) ? String(value) : "1";
};
const levelLabel = lv => String(lv).replace("7-9", "7–9");
const wordLabel = word => { const w = studyWord(word); return w.source === "ai" ? "Из диалога с AI" : w.curriculum === "hsk3" ? `${w.isSupplement || w.official === false ? "Дополнительно · этап" : "HSK ·"} ${levelLabel(w.level ?? w.lv)}` : w.lv ? "Учебное слово" : "Большой словарь"; };
const currentCourseName = () => `HSK · ${levelLabel(hsk3Level())}`;
const coursePath = view => `#/hsk3/${hsk3Level()}/${view}`;
const short = ru => ru.split(/[;\n]/)[0].trim();
const plain = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ü/g, "v").toLowerCase().replace(/[^a-zа-яё0-9]/g, "");

/* ---------- интервальное повторение ---------- */
const STEPS = [0, 1, 2, 4, 7, 15, 30, 60, 120];
const known = lv => Object.values(S.srs).filter(x => x.curriculum !== "hsk3" && x.word?.curriculum !== "hsk3" && x.lv === lv && x.b >= 1).length;
function dueList() { const now = Date.now(); return progressEntries().filter(x => x.d <= now); }
function grade(w, ok) {
  w = studyWord(w);
  const key = wordKey(w), x = S.srs[key] || { ...(wordProgress(w) || { b: 0, d: 0, lv: w.lv, r: 0, w: 0, first: Date.now() }) };
  if (ok) { x.b = Math.min(x.b + 1, STEPS.length - 1); x.r++; x.d = new Date(today()).getTime() + STEPS[x.b] * DAY + 4 * 3600e3; }
  else { x.b = 0; x.w++; x.d = Date.now() + 60e3; }
  if (w.curriculum === "hsk3") { x.curriculum = "hsk3"; x.lv = w.lv; x.word = w; }
  else if (!w.lv && w.source) x.word = w;
  S.srs[key] = x; save();
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
const topbar = (title, back = "#/home") => `<div class="topbar"><a class="round" href="${esc(typeof HanyuNavigation === "undefined" ? back : HanyuNavigation.backHref(back))}" data-nav-back="${esc(back)}" aria-label="Назад">${ic("back")}</a><h1>${title}</h1></div>`;
const replaceRoute = hash => typeof HanyuNavigation === "undefined" ? location.replace(hash) : HanyuNavigation.replace(hash);
document.addEventListener("click", event => {
  const link = event.target.closest("[data-nav-back]");
  if (!link || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || typeof HanyuNavigation === "undefined") return;
  event.preventDefault(); HanyuNavigation.back(link.dataset.navBack);
});
const row = (href, icon, title, small) => `<a href="${href}"><span class="ic">${ic(icon)}</span><span class="t"><b>${title}</b>${small ? `<small>${small}</small>` : ""}</span>${ic("go", "i go")}</a>`;
const starBtn = w => `<button class="star" data-star="${esc(wordKey(w))}" data-lv="${esc(w.lv)}" aria-pressed="${!!bookmarkRecord(wordKey(w))}" aria-label="В мой словарик">${ic("star")}</button>`;
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-star]"); if (!b || b.disabled) return;
  const key = canonicalKey(b.dataset.star); b.disabled = true;
  try {
    if (bookmarkRecord(key)) { for (const old of Object.keys(S.book)) if (canonicalKey(old) === key) delete S.book[old]; }
    else {
      const word = await findWord(key);
      if (!word || word.missing) throw Error("Сначала загрузите словарную статью");
      S.book[key] = { lv: word.lv, t: Date.now(), why: "добавлено", word };
    }
    $$('[data-star]').filter(x => canonicalKey(x.dataset.star) === key).forEach(x => x.setAttribute("aria-pressed", String(!!bookmarkRecord(key))));
    save(); toast(bookmarkRecord(key) ? "Добавлено в мой словарик" : "Убрано из словарика");
  } catch (err) { toast(err.message); } finally { b.disabled = false; }
});
const wordRow = w => `<div class="word"><a class="h zh" href="#/word/${encodeURIComponent(wordKey(w))}">${esc(w.hz)}</a><a class="m" href="#/word/${encodeURIComponent(wordKey(w))}"><div class="py">${esc(w.py)}${w.pos ? `<span class="tag">${esc(w.pos)}</span>` : ""}${w.lv ? `<span class="tag">${esc(wordLabel(w))}</span>` : w.source === "bkrs" ? '<span class="tag">大БКРС</span>' : ""}</div><div class="word-summary">${esc(w.ru)}</div></a>${w.missing ? "" : starBtn(w)}${sayBtn(w.hz)}</div>`;
const greeting = () => { const hr = new Date().getHours(); return hr < 5 ? "Доброй ночи" : hr < 12 ? "Доброе утро" : hr < 18 ? "Добрый день" : "Добрый вечер"; };
const lvName = lv => `HSK 2.0 · ${lv} · ${LEVELS[lv].title}`;
let leaveFns = [];
const onLeave = fn => leaveFns.push(fn);
const activeView = () => {
  let active = true; const hash = location.hash;
  onLeave(() => { active = false; });
  return () => active && location.hash === hash;
};

/* ========== страницы ========== */
function pageWelcome() {
  let lv = "1";
  app.innerHTML = `<section class="welcome"><div class="top"><span class="wordmark">ZH<span>·</span></span><span class="ed">Русский · 中文</span></div>
    <div class="art">${ART_WELCOME}</div><p class="kicker" style="margin-top:14px">每天说一点中文</p>
    <h1>Каждый день —<br><u>немного китайского.</u></h1><p class="sub">Услышать фразу, запомнить слово, сказать в ответ.<br>От первого «你好» до свободного разговора — без спешки.</p>
    <div class="lvnote">HSK 3.0 · уровни 1–6 и 7–9</div>
    <label class="field" style="text-align:left"><span>Как к вам обращаться?</span><input id="nick" maxlength="20" placeholder="Например, Анна" autocomplete="given-name"></label>
    <div class="field" style="text-align:left"><span>С какого уровня начать?</span><div class="lvpick">${["1", "2", "3", "4", "5", "6", "7-9"].map(n => `<button data-lv="${n}" aria-pressed="${n === lv}"><b>HSK ${levelLabel(n)}</b>${n === "7-9" ? "Высший этап" : LEVELS[n].title}</button>`).join("")}</div></div>
    <button class="btn" id="go">Начать ${ic("go")}</button><p class="hint mt">Прогресс хранится на этом устройстве. В профиле можно сделать резервную копию.</p></section>`;
  $$(".lvpick button").forEach(b => b.onclick = () => { lv = b.dataset.lv; $$(".lvpick button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); });
  $("#go").onclick = () => { S.profile = { nick: $("#nick").value.trim() || "друг", created: Date.now() }; S.settings.curriculum = "hsk3"; S.settings.hsk3Level = lv; save(); location.hash = "#/home"; };
}

/* Home shortcuts point only to features that already exist. IDs, not URLs, are saved. */
const HOME_FEATURE_GROUPS = [
  ["translate", "Понять и перевести"], ["ai", "Практика с AI"],
  ["words", "Слова и HSK"], ["practice", "Навыки языка"], ["personal", "Моя учёба"]
];
const HOME_FEATURES = [
  { id: "translate", group: "translate", label: "Перевод", detail: "Китайский ↔ русский", icon: "translate", tone: "blue", href: "#/translate" },
  { id: "photo", group: "translate", label: "По фото", detail: "Распознать и перевести", icon: "camera", tone: "violet", href: "#/translate/photo" },
  { id: "dict", group: "translate", label: "Словарь", detail: "Слова и значения", icon: "search", tone: "mint", href: "#/dict" },
  { id: "ai-chat", group: "ai", label: "AI-диалог и разбор", detail: "Разговор и объяснения по-русски", icon: "chat", tone: "blue", href: "#/ai" },
  { id: "assessment", group: "ai", label: "Проверка заданий", detail: "Письмо, устный ответ и грамматика", icon: "check", tone: "peach", href: "#/assess/writing" },
  { id: "pronunciation", group: "ai", label: "Мои тоны", detail: "Мелодика отдельного слога", icon: "wave", tone: "rose", href: "#/pronunciation" },
  { id: "study", group: "words", label: "Карточки", detail: "Учить слова своего этапа", icon: "cards", tone: "peach", href: () => coursePath("study") },
  { id: "vocab", group: "words", label: "Слова HSK", detail: "Словарь выбранного этапа", icon: "book", tone: "blue", href: () => coursePath("vocab") },
  { id: "stages", group: "words", label: "Этапы HSK", detail: "Выбрать уровень курса", icon: "layers", tone: "violet", href: "#/stages" },
  { id: "review", group: "words", label: "Повторение", detail: "Вернуться к знакомому", icon: "review", tone: "mint", href: "#/review" },
  { id: "book", group: "words", label: "Мой словарик", detail: "Сохранённые слова", icon: "bookmark", tone: "rose", href: "#/book" },
  { id: "quiz", group: "words", label: "Тест слов", detail: "Проверить значения", icon: "check", tone: "peach", href: () => coursePath("quiz") },
  { id: "exam", group: "words", label: "Задания HSK", detail: "Форматы и упражнения", icon: "trophy", tone: "blue", href: () => coursePath("exam") },
  { id: "pinyin", group: "practice", label: "Пиньинь", detail: "Звуки и четыре тона", icon: "wave", tone: "violet", href: "#/pinyin" },
  { id: "tones", group: "practice", label: "Слушать тоны", detail: "Различать их на слух", icon: "ear", tone: "mint", href: "#/tones" },
  { id: "grammar", group: "practice", label: "Грамматика", detail: "Правила и примеры", icon: "pen", tone: "peach", href: "#/grammar" },
  { id: "dialogues", group: "practice", label: "Диалоги", detail: "Ситуации из жизни", icon: "chat", tone: "rose", href: "#/dialogues" },
  { id: "reading", group: "practice", label: "Чтение", detail: "Короткие тексты", icon: "read", tone: "blue", href: "#/reading" },
  { id: "shadow", group: "practice", label: "Повторять вслух", detail: "Слушать, записывать, сравнивать", icon: "mic", tone: "violet", href: "#/shadow" },
  { id: "listen", group: "practice", label: "Аудирование", detail: "Узнавать слова на слух", icon: "ear", tone: "peach", href: () => `#/listen/${S.settings.level}` },
  { id: "write", group: "practice", label: "Написать слово", detail: "Тренировка по памяти", icon: "read", tone: "mint", href: () => `#/write/${S.settings.level}` },
  { id: "hanzi", group: "practice", label: "Порядок черт", detail: "Как пишутся иероглифы", icon: "pen", tone: "rose", href: () => `#/hanzi/${S.settings.level}` },
  { id: "pairs", group: "practice", label: "Найди пару", detail: "Слова и их значения", icon: "layers", tone: "blue", href: () => `#/pairs/${S.settings.level}` },
  { id: "library", group: "personal", label: "Курс китайского · 汉语课程", detail: "Учебники и аудио к урокам", icon: "book", tone: "mint", href: "#/library" },
  { id: "shelf", group: "personal", label: "Моя полка", detail: "Книги на устройстве", icon: "read", tone: "peach", href: "#/shelf" },
  { id: "ai-profile", group: "personal", label: "Мои подсказки", detail: "Что повторить с AI", icon: "target", tone: "violet", href: "#/ai-profile" },
  { id: "stats", group: "personal", label: "Прогресс", detail: "Мои занятия и результаты", icon: "chart", tone: "blue", href: "#/stats" },
  { id: "plan", group: "personal", label: "План занятий", detail: "Выбрать цель на день", icon: "clock", tone: "rose", href: "#/plan" }
];
const HOME_DEFAULT_FEATURES = ["translate", "photo", "dict", "study", "ai-chat", "pronunciation", "assessment", "stages", "library"];
const HOME_FEATURE_INDEX = new Map(HOME_FEATURES.map(feature => [feature.id, feature]));
const HOME_FEATURE_ALIASES = Object.freeze({ "ai-explain": "ai-chat", writing: "assessment", speaking: "assessment", "grammar-check": "assessment" });
const canonicalHomeFeatureID = id => typeof id === "string" && Object.hasOwn(HOME_FEATURE_ALIASES, id) ? HOME_FEATURE_ALIASES[id] : id;
for (const [oldID, id] of Object.entries(HOME_FEATURE_ALIASES)) HOME_FEATURE_INDEX.set(oldID, HOME_FEATURE_INDEX.get(id));
function normalizeHomeFeatures(ids) {
  return [...new Set((Array.isArray(ids) ? ids : HOME_DEFAULT_FEATURES).map(canonicalHomeFeatureID))].filter(id => typeof id === "string" && HOME_FEATURE_INDEX.has(id)).slice(0, 9);
}
const homeFeatureIDs = () => normalizeHomeFeatures(S.settings.homeFeatures);
const homeFeatureHref = feature => typeof feature.href === "function" ? feature.href() : feature.href;
const homeFeatureIcon = feature => `<span class="home-feature-icon home-tone-${feature.tone}">${ic(feature.icon)}</span>`;
const homeShortcut = feature => `<a class="home-shortcut" href="${esc(homeFeatureHref(feature))}">${homeFeatureIcon(feature)}<span>${esc(feature.label)}</span></a>`;

function pageHome(mode) {
  if (mode === "ai") return pageAI("home");
  app.innerHTML = `<section class="page home-page">
    <nav class="home-switch" aria-label="Режим главной страницы"><a href="#/home" aria-current="page">Классический</a><a href="#/home/ai">С AI <span aria-hidden="true">✦</span></a></nav>
    <div class="home-hero">
      <h1 class="home-hero-title zh">汉语熊</h1></div>
    <div class="home-composer-shell"><div id="home-pet" class="home-pet" role="group" aria-label="Питомец — красная панда"></div>
    <form class="home-composer" id="home-composer"><label class="home-composer-label" for="home-input">中文 ⇄ Русский</label>
      <textarea id="home-input" rows="1" maxlength="4000" aria-describedby="home-input-help home-input-error" placeholder="Введите слово или фразу"></textarea>
      <div class="home-composer-tools"><div class="home-input-options"><a href="#/translate/photo" aria-label="Перевести по фото" title="Перевести по фото">${ic("camera")}</a><a href="#/ai" aria-label="Открыть диалог с записью голоса" title="Открыть диалог с записью голоса">${ic("mic")}</a></div>
        <button type="submit" class="home-submit">Перевести<span>${ic("go")}</span></button></div></form>
    <div class="home-composer-note"><span id="home-input-help">Можно проверить текст перед отправкой.</span><span id="home-input-count">0 / 2000</span></div>
    <p class="home-input-error" id="home-input-error" role="status" hidden></p></div>
    <nav class="home-shortcuts" aria-label="Быстрый доступ">${homeFeatureIDs().map(id => homeShortcut(HOME_FEATURE_INDEX.get(id))).join("")}<a class="home-shortcut home-all-features" href="#/features"><span class="home-feature-icon home-tone-neutral"><span class="home-grid-icon" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span><span>Все функции</span></a></nav>
    </section>`;
  const input = $("#home-input"), error = $("#home-input-error");
  const updateInput = () => {
    const count = [...input.value.trim()].length;
    $("#home-input-count").textContent = `${count} / 2000`;
    input.setAttribute("aria-invalid", String(count > 2000));
    error.hidden = count <= 2000;
    error.textContent = count > 2000 ? "До 2000 знаков за один раз. Сократите текст." : "";
  };
  input.oninput = updateInput;
  $("#home-composer").onsubmit = event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || [...text].length > 2000) {
      error.hidden = false; error.textContent = text ? "До 2000 знаков за один раз. Сократите текст." : "Сначала введите слово или фразу.";
      input.setAttribute("aria-invalid", "true"); input.focus(); return;
    }
    try {
      HanyuTranslate.setDraft(text); location.hash = "#/translate";
    } catch (_) { error.hidden = false; error.textContent = "Не удалось открыть текст. Обновите страницу и попробуйте снова."; }
  };
  if (typeof HomePet !== "undefined" && typeof HomePet.mount === "function") {
    try { HomePet.mount({ container: $("#home-pet"), boundary: $("#home-composer") }); } catch (_) {}
  }
}

function pageFeatures(mode) {
  const editing = mode === "edit";
  let selected = homeFeatureIDs();
  const render = (message = "") => {
    const favoriteMarkup = selected.map((id, index) => {
      const feature = HOME_FEATURE_INDEX.get(id);
      return `<li id="feature-favorite-${id}">${homeFeatureIcon(feature)}<span class="feature-favorite-label">${esc(feature.label)}</span><div class="feature-order-actions"><button type="button" data-feature-move="${id}" data-direction="up" ${index === 0 ? "disabled" : ""} aria-label="${esc(feature.label)}: переместить раньше">↑</button><button type="button" data-feature-move="${id}" data-direction="down" ${index === selected.length - 1 ? "disabled" : ""} aria-label="${esc(feature.label)}: переместить позже">↓</button><button type="button" data-feature-toggle="${id}" aria-label="Убрать ${esc(feature.label)} с главной">${ic("close")}</button></div></li>`;
    }).join("");
    app.innerHTML = `<section class="page features-page" id="features-page">${topbar(editing ? "Моя главная" : "Все функции", editing ? "#/features" : "#/home")}
      <p class="features-intro">${editing ? "Выберите до 9 функций. Стрелками можно изменить их порядок на главной." : "Всё для вашего китайского — выберите, чем заняться."}</p>
      <section class="features-favorites"><div class="home-shortcut-heading"><h2>На главной <span class="features-count">${selected.length} / 9</span></h2>${editing ? "" : '<a href="#/features/edit">Изменить</a>'}</div>
        ${selected.length ? editing ? `<ol class="feature-favorites-list">${favoriteMarkup}</ol>` : `<nav class="features-grid features-favorite-grid" aria-label="На главной">${selected.map(id => homeShortcut(HOME_FEATURE_INDEX.get(id))).join("")}</nav>` : '<p class="features-empty">Пока нет ярлыков. Добавьте нужные функции из списка ниже.</p>'}
        ${editing ? '<div class="features-edit-actions"><a href="#/features" class="features-cancel">Отмена</a><button type="button" id="features-done">Готово</button></div>' : ""}
      </section><p class="feature-edit-message" role="status" id="feature-edit-message" ${message ? "" : "hidden"}>${esc(message)}</p>
      ${HOME_FEATURE_GROUPS.map(([group, title]) => {
        const available = HOME_FEATURES.filter(feature => feature.group === group && !selected.includes(feature.id));
        return available.length ? `<section class="feature-group"><h2>${title}</h2><div class="features-grid">${available.map(feature => {
        const content = `${homeFeatureIcon(feature)}<b>${esc(feature.label)}</b><small>${esc(feature.detail)}</small>`;
        return editing ? `<button type="button" class="feature-catalog-card" data-feature-toggle="${feature.id}" aria-pressed="${selected.includes(feature.id)}" aria-label="${selected.includes(feature.id) ? "Убрать" : "Добавить"} ${esc(feature.label)} ${selected.includes(feature.id) ? "с главной" : "на главную"}"><span class="feature-selection" aria-hidden="true">${selected.includes(feature.id) ? ic("check") : "+"}</span>${content}</button>` : `<a class="feature-catalog-card" href="${esc(homeFeatureHref(feature))}">${content}</a>`;
      }).join("")}</div></section>` : "";
      }).join("")}</section>`;
    if (!editing) return;
    $("#features-done").onclick = () => { S.settings.homeFeatures = normalizeHomeFeatures(selected); save(); location.hash = "#/features"; };
    $("#features-page").onclick = event => {
      const toggle = event.target.closest("[data-feature-toggle]"), move = event.target.closest("[data-feature-move]");
      if (toggle) {
        const id = canonicalHomeFeatureID(toggle.dataset.featureToggle);
        if (!HOME_FEATURE_INDEX.has(id)) return;
        const fromFavorites = !!event.target.closest(".feature-favorites-list"), previousIndex = selected.indexOf(id);
        if (selected.includes(id)) selected = selected.filter(value => value !== id);
        else if (selected.length >= 9) { $("#feature-edit-message").hidden = false; $("#feature-edit-message").textContent = "Можно выбрать до 9 функций. Сначала уберите одну из выбранных."; return; }
        else selected.push(id);
        render();
        if (fromFavorites) {
          const nextID = selected[Math.min(Math.max(previousIndex, 0), selected.length - 1)];
          (nextID ? $(`#feature-favorite-${nextID} [data-feature-toggle]`) : $("#features-done"))?.focus();
        } else (selected.includes(id) ? $(`#feature-favorite-${id} [data-feature-toggle]`) : $(`.feature-catalog-card[data-feature-toggle="${id}"]`))?.focus();
      } else if (move && !move.disabled) {
        const index = selected.indexOf(move.dataset.featureMove), next = index + (move.dataset.direction === "up" ? -1 : 1);
        if (index < 0 || next < 0 || next >= selected.length) return;
        [selected[index], selected[next]] = [selected[next], selected[index]];
        render();
        const direction = next === 0 ? "down" : next === selected.length - 1 ? "up" : move.dataset.direction;
        $(`[data-feature-move="${move.dataset.featureMove}"][data-direction="${direction}"]`)?.focus();
      }
    };
  };
  render();
}

function pageLearn() {
  const lv = hsk3Level(), count = progressEntries().filter(x => String(x.word?.level ?? legacyMetadata.get(x.sourceKey)?.level ?? x.lv) === lv && x.b >= 1).length;
  app.innerHTML = `<section class="page"><div class="intro"><p class="kicker">Ваш учебный маршрут</p><h1>Китайский шаг за шагом</h1><p class="sub">Единый курс: слова, грамматика, диалоги, чтение и практика экзамена.</p></div>
    <a class="card-blue" href="${coursePath("study")}" style="display:block"><h2>${currentCourseName()}</h2><p class="sub">Выучено карточек: ${count}</p><span>Продолжить учиться ${ic("go")}</span></a>
    <div class="section"><h2>Слова и экзамен</h2><a href="#/stages">Выбрать этап ›</a></div>
    <div class="list">${row(coursePath("vocab"), "book", "Все слова этапа", "Пиньинь и русские значения")}${row(coursePath("quiz"), "check", "Тренировка слов", "Китайские слова и русские значения")}${row(coursePath("exam"), "trophy", "Форматы заданий HSK", "Структура экзамена и учебные упражнения")}</div>
    <div class="section"><h2>Практика с AI</h2></div>
    <div class="list mt">${row("#/ai", "chat", "AI-диалог и разбор", "Разговор по-китайски и объяснения по-русски")}${row("#/assess/writing", "check", "Проверка заданий", "Письмо, устный ответ и грамматика — выберите внутри")}${row("#/pronunciation", "wave", "Мои тоны", "Записать слог и увидеть движение голоса")}</div><div class="section"><h2>Практика языка</h2></div><p class="hint">Занимайтесь произношением, разбирайте грамматику и используйте слова в разговоре.</p>
    <div class="grid2"><a href="#/pinyin"><span class="ic">${ic("wave")}</span><b>Пиньинь и тоны</b></a><a href="#/grammar"><span class="ic">${ic("pen")}</span><b>Грамматика</b></a><a href="#/dialogues"><span class="ic">${ic("chat")}</span><b>Диалоги</b></a><a href="#/reading"><span class="ic">${ic("read")}</span><b>Чтение</b></a><a href="#/shadow"><span class="ic">${ic("mic")}</span><b>Повторение вслух</b></a><a href="#/tones"><span class="ic">${ic("ear")}</span><b>Тренажёр тонов</b></a></div>
    <div class="section"><h2>Закрепить навыки</h2></div><div class="grid2"><a href="#/listen/${S.settings.level}"><span class="ic">${ic("ear")}</span><b>Слушать слова</b></a><a href="#/write/${S.settings.level}"><span class="ic">${ic("read")}</span><b>Написать слово</b></a><a href="#/hanzi/${S.settings.level}"><span class="ic">${ic("pen")}</span><b>Порядок черт</b></a><a href="#/pairs/${S.settings.level}"><span class="ic">${ic("layers")}</span><b>Найди пару</b></a></div>
    <div class="list mt">${row("#/library", "book", "Курс китайского · 汉语课程", "Учебники и аудио к урокам")}${row("#/shelf", "book", "Мои учебники", "Книги и аудио на устройстве")}</div></section>`;
}

function pageReview() {
  const due = dueList(), bk = bookmarkKeys().length;
  app.innerHTML = `<section class="page"><div class="intro"><p class="kicker">Повторение</p><h1>Знакомое —<br>начинается со второй встречи.</h1><p class="sub">Сначала повторите то, что пора освежить.</p></div>
    <div class="card-blue"><p class="kicker">Ждут повторения</p><div style="font-size:54px;font-weight:750;letter-spacing:-2px">${due.length}</div>
      <p class="sub" style="max-width:none">${due.length ? "Слова, у которых подошёл срок. Займёт пару минут." : `Пока ничего не ждёт. Можно выучить ${S.settings.newPerDay} новых слов или открыть свой словарик.`}</p>
      <a class="btn" href="${due.length ? "#/study/review" : coursePath("study")}">${due.length ? "Начать повторение" : "Учить новые слова"} ${ic("go")}</a></div>
    <div class="section"><h2>С чего начать?</h2></div>
    <div class="list">${row(coursePath("study"), "cards", "Карточки", `${currentCourseName()} · «помню / не помню»`)}
      ${row(coursePath("quiz"), "check", "Тренировка слов", "Проверить значения слов")}
      ${row("#/book", "bookmark", "Мой словарик", bk ? `${bk} ${plural(bk, "слово", "слова", "слов")} · ошибки и отмеченные` : "Отмечайте слова звёздочкой")}
      ${row("#/study/book", "review", "Повторить словарик", "Карточки только из моего словаря")}
      ${row("#/grammar", "pen", "Повторить грамматику", "Примеры к каждой конструкции")}</div>
    <p class="hint mt">Честно отмечайте, помните ли слово, — это полезнее, чем ответить идеально с первого раза.</p></section>`;
}

function pageMe() {
  const days = studyDays(), bk = bookmarkKeys().length;
  app.innerHTML = `<section class="page"><div class="profile-heading" style="margin:4px 0 14px">
      <div style="flex:1"><div style="font-size:23px;font-weight:750">${esc(S.profile.nick)}</div><div class="muted">${currentCourseName()}</div><a class="muted" href="#/settings">Настройки ›</a></div></div>
    <div class="box"><h3>Мои данные</h3><div class="stats"><div><b>${days}</b><small>дней учёбы</small></div><div><b>${accuracy()}%</b><small>точность</small></div><div><b>${streak()}</b><small>дней подряд</small></div></div></div>
    <div class="box list" style="padding:4px 20px">${row("#/ai-profile", "chart", "Учебный профиль AI", "Изученные слова и частые ошибки")}${row("#/stats", "clock", "История занятий", "Последние 14 дней")}${row("#/book", "bookmark", "Мой словарик", `${bk} ${plural(bk, "слово", "слова", "слов")}`)}${row("#/plan", "target", "Учебный план", `Цель: ${S.settings.goal} ответов в день`)}${row("#/stages", "layers", "Этап курса", "Единый курс HSK · уровни 1–6 и 7–9")}${row("#/shelf", "book", "Мои учебники", "Книги и аудио на устройстве")}</div>
    <div class="box list" style="padding:4px 20px">${row("#/settings", "gear", "Настройки", "Голос, пиньинь, резервная копия")}${row("#/about", "info", "О приложении и данных", "Источники словаря и лицензии")}</div></section>`;
}

/* ---------- карточки (учить / повторять) ---------- */
async function pageStudy(arg) {
  const routeHash = location.hash;
  app.innerHTML = `<p class="empty">Загрузка карточек…</p>`;
  await ensureUnifiedCourse();
  if (location.hash !== routeHash) return;
  let queue, words = [], title, mode = "learn", stage = hsk3Level();
  if (arg === "review") {
    queue = (await Promise.all(shuffle(dueList()).slice(0, 40).map(entry => findWord(entry.key)))).filter(Boolean);
    title = "Повторение"; mode = "review";
  } else if (arg === "book") {
    queue = (await Promise.all(shuffle(bookmarkKeys()).slice(0, 30).map(findWord))).filter(Boolean);
    title = "Мой словарик"; mode = "book";
  } else {
    if (["1", "2", "3", "4", "5", "6", "7-9"].includes(String(arg))) stage = String(arg);
    words = await HSK3.level(stage);
    const due = words.filter(word => wordProgress(word)?.d <= Date.now());
    const fresh = words.filter(word => !wordProgress(word)).slice(0, Math.max(0, S.settings.newPerDay - D().learned));
    queue = shuffle(due).slice(0, 20).concat(fresh); title = `HSK · ${levelLabel(stage)}`;
    if (location.hash !== routeHash) return;
    S.settings.curriculum = "hsk3"; S.settings.hsk3Level = stage; save();
  }
  if (location.hash !== routeHash) return;
  return runStudySession({ queue, words: words.length ? words : queue, curriculum: "hsk3", level: stage, title,
    backHref: mode === "learn" ? "#/learn" : "#/review", quizHref: `#/hsk3/${stage}/quiz`, mode });
}

/* ---------- тесты: обычный, аудирование, экзамен ---------- */
async function pageQuiz(lv, mode = "mix") {
  const isActive = activeView();
  lv = +lv || S.settings.level; app.innerHTML = `<p class="empty">Загрузка…</p>`;
  const words = await level(lv); const exam = mode === "exam", N = exam ? 20 : 10;
  if (!isActive()) return;
  const seen = words.filter(w => wordProgress(w)); const base = seen.length >= 8 ? shuffle(seen.concat(shuffle(words).slice(0, 6))) : shuffle(words.slice(0, Math.min(words.length, 120)));
  const qs = [...new Set(base)].slice(0, N).map((w, i) => {
    const types = mode === "listen" ? ["listen"] : exam ? ["zh2ru", "ru2zh", "listen", "py"] : ["zh2ru", "ru2zh", "listen", "py", "zh2ru"];
    const type = types[i % types.length]; const others = shuffle(words.filter(x => x.hz !== w.hz && short(x.ru) !== short(w.ru))).slice(0, 3);
    return { w, type, opts: shuffle([w, ...others]) };
  });
  let k = 0, right = 0, t0 = Date.now(), timer = 0; const wrongs = [];
  const back = exam ? "#/learn" : mode === "listen" ? "#/learn" : "#/home";
  const ttl = exam ? `Слова на время · блок ${lv}` : mode === "listen" ? `Аудирование · блок ${lv}` : `Тест слов · блок ${lv}`;
  if (exam) { timer = setInterval(() => { const s = Math.max(0, 600 - (Date.now() - t0) / 1e3 | 0); const el = $("#tm"); if (el) el.textContent = `${s / 60 | 0}:${String(s % 60).padStart(2, "0")}`; if (!s) { clearInterval(timer); finish(); } }, 500); onLeave(() => clearInterval(timer)); }
  function draw() {
    if (!isActive()) return;
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
      record(ok, wordKey(w), w.lv, w); if (wordProgress(w)) grade(w, ok);
      $("#fb").innerHTML = `<div class="fb ${ok ? "ok" : "no"}">${ok ? "Верно!" : "Не совсем."} <b class="zh">${esc(w.hz)}</b> ${esc(w.py)} — ${esc(w.ru)}</div><button class="btn" id="next">${k + 1 < qs.length ? "Дальше" : "Результат"} ${ic("go")}</button>`;
      if (q.type !== "listen") speak(w.hz);
      $("#next").onclick = () => { k++; draw(); };
    });
  }
  function finish() {
    if (!isActive()) return;
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
  const isActive = activeView();
  lv = +lv || S.settings.level; const words = shuffle(await level(lv)).slice(0, 10); let k = 0, right = 0;
  if (!isActive()) return;
  function draw() {
    const w = words[k]; if (!w) { app.innerHTML = `${topbar("Письмо", "#/learn")}<div class="result"><div class="score">${right}/${words.length}</div><p>Отличная практика!</p><button class="btn" id="again">Ещё раз</button></div>`; $("#again").onclick = () => pageWrite(lv); return; }
    app.innerHTML = `${topbar(`Письмо · блок ${lv}`, "#/learn")}<div class="qhead"><div class="bar"><i style="width:${k / words.length * 100}%"></i></div><span class="muted">${k + 1}/${words.length}</span></div>
      <div class="qcard"><div class="q">Напишите по-китайски (иероглифами или пиньинем, тоны можно цифрами)</div><div class="mid">${esc(w.ru)}</div>${sayBtn(w.hz)}</div>
      <label class="field"><input id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="например: nihao, ni3hao или 你好"></label><button class="btn" id="chk">Проверить</button><div id="fb"></div>`;
    const inp = $("#ans"); inp.focus(); inp.onkeydown = e => { if (e.key === "Enter") $("#chk").click(); };
    $("#chk").onclick = () => {
      const a = inp.value.trim(); if (!a) return;
      const ok = a === w.hz || plain(a.replace(/[1-5]/g, "")) === plain(w.py);
      if (ok) right++; record(ok, wordKey(w), w.lv, w);
      $("#fb").innerHTML = `<div class="fb ${ok ? "ok" : "no"}">${ok ? "Верно!" : "Правильно так:"} <b class="zh" style="font-size:20px">${esc(w.hz)}</b> ${esc(w.py)}</div><button class="btn" id="next">Дальше ${ic("go")}</button>`;
      $("#chk").remove(); speak(w.hz); $("#next").onclick = () => { k++; draw(); };
    };
  }
  draw();
}

/* ---------- пиньинь и тоны ---------- */
function pagePinyin() {
  const spellingExamples = examples => `<div class="chips">${examples.map(([hz, py, ru]) => `<button type="button" class="chip" data-say="${esc(hz)}" aria-label="Прослушать ${esc(hz)}, ${esc(py)} — ${esc(ru)}"><b class="zh">${esc(hz)}</b><small lang="zh-Latn">${esc(py)}</small><br><small>${esc(ru)}</small></button>`).join("")}</div>`;
  app.innerHTML = `${topbar("Звуки и тоны", "#/learn")}<p class="sub" style="margin-top:-6px">Пиньинь — запись китайского произношения латиницей. Каждый слог имеет тон, и тон меняет смысл слова.</p>
    <div class="section"><h2>Четыре тона</h2><a href="#/tones">Тренажёр ›</a></div><div class="tones">${TONES.map(t => `<button class="tone" data-say="${t.ex[0]}"><span class="mk">${t.mark}</span><span><b>${t.name}</b><small>${t.desc}</small><small><span class="zh">${t.ex[0]}</span> ${t.ex[1]} — ${t.ex[2]}</small></span></button>`).join("")}</div>
    <div class="section"><h2>Инициали (согласные)</h2></div><div class="chips">${INITIALS.map(([p, z, d]) => `<button class="chip" data-say="${z}" title="${esc(d)}"><b>${p}</b><small class="zh">${z}</small></button>`).join("")}</div>
    <p class="hint">Нажмите на звук, чтобы услышать пример. Подсказки: ${INITIALS.slice(11, 18).map(([p, , d]) => `<b>${p}</b> — ${d}`).join("; ")}.</p>
    <div class="section"><h2>Финали — окончания слога</h2><span class="muted">${FINALS.length} примеров</span></div>
    <p class="hint">Финаль — часть слога после начальной согласной: гласный или сочетание звуков, иногда с носовым окончанием. Нажмите, чтобы услышать целый китайский слог-пример. Под каждым сочетанием указаны иероглиф и пиньинь с тоном.</p>
    <div class="chips">${FINALS.map(([p, z, d, py, ru]) => `<button type="button" class="chip" data-final="${esc(p)}" data-say="${esc(z)}" title="${esc(d)} ${esc(ru)}" aria-label="Финаль ${esc(p)}. ${esc(d)} Пример ${esc(z)}, ${esc(py)} — ${esc(ru)}"><b>${esc(p)}</b><small class="zh">${esc(z)}</small> <small lang="zh-Latn">${esc(py)}</small></button>`).join("")}</div>
    <p class="hint">В -n кончик языка касается верхних дёсен. В -ng работает задняя часть языка; отдельное «г» не произносится. После zh, ch, sh, r, z, c, s буква i обозначает иной звук, чем в yī: слушайте, например, 是 shì и 四 sì в разделе инициалей.</p>
    <div class="box"><h3>Почему ju, qu, xu читаются с ü?</h3><p>Для ü удерживайте язык как при «и», а губы округлите как при «у». Это один гласный, не русское сочетание «йу».</p>
      <p>После <b>j, q, x</b> две точки над ü опускаются только на письме: <b>j + ü → ju, q + ü → qu, x + ü → xu</b>. Звук остаётся ü, а не u. То же правило действует в <b>jue / que / xue, juan / quan / xuan, jun / qun / xun</b>.</p>
      ${spellingExamples(UMLAUT_EXAMPLES.slice(0, 6))}
      <p>После <b>n и l</b> точки сохраняются: <b>nǚ</b>, <b>lǜ</b>. Сравните <b>lǜ</b> и <b>lù</b>: это разные гласные и разные слова.</p>${spellingExamples(UMLAUT_EXAMPLES.slice(6, 9))}
      <p>Без начальной согласной ü оформляется через <b>y</b>, без точек: <b>ü → yu, üe → yue, üan → yuan, ün → yun</b>. Это правило написания; yu не превращается в русское «йу».</p>${spellingExamples(UMLAUT_EXAMPLES.slice(9))}</div>
    <div class="box"><h3>Короткие написания iu, ui, un</h3><p>После начальной согласной <b>iou → iu</b> (牛 niú), <b>uei → ui</b> (水 shuǐ), <b>uen → un</b> (春 chūn). Сочетание остаётся одним слогом.</p><p class="hint" style="margin-bottom:0">Не путайте: в <b>jun, qun, xun</b> написание un передаёт финаль <b>ün</b>, поскольку после j/q/x точки ü не пишутся.</p></div>
    <div class="box"><h3>Изменение тонов</h3><p class="hint" style="margin:0">Два третьих тона подряд: первый читается как второй — <span class="zh">你好</span> nǐ hǎo звучит «ní hǎo».<br><span class="zh">不</span> перед четвёртым тоном становится вторым: <span class="zh">不是</span> bú shì.<br><span class="zh">一</span> перед четвёртым тоном обычно становится вторым (<span class="zh">一半</span> yí bàn), перед первым, вторым и третьим — четвёртым (<span class="zh">一天</span> yì tiān). В порядковых числительных сохраняется yī: <span class="zh">第一</span> dì yī.</p></div>
    <a class="btn" href="#/tones">Потренировать тоны ${ic("go")}</a></section>`;
}
const PINYIN_TONE_MARKS = ["\u0304", "\u0301", "\u030c", "\u0300"];
function toneSyllableBase(value) {
  if (typeof value !== "string" || value.length > 32) throw Error("invalid_tone_syllable");
  // Remove only tone accents: the diaeresis in ü is part of the vowel.
  const base = value.trim().normalize("NFD").replace(/[\u0304\u0301\u030c\u0300]/g, "").normalize("NFC")
    .replace(/u:/gi, match => match[0] === "U" ? "Ü" : "ü").replace(/v/gi, letter => letter === "V" ? "Ü" : "ü").replace(/[0-5]$/, "");
  if (!/^[a-züê]+$/i.test(base)) throw Error("invalid_tone_syllable");
  return base;
}
function toneSyllable(value, tone) {
  if (!Number.isInteger(tone) || tone < 1 || tone > 4) throw Error("invalid_tone_number");
  const base = toneSyllableBase(value), lower = base.toLowerCase();
  let at = lower.indexOf("a");
  if (at < 0) at = lower.search(/[eê]/);
  if (at < 0 && lower.includes("ou")) at = lower.indexOf("o");
  // With no a/e or ou, mark the last vowel: liu → liú, gui → guǐ.
  if (at < 0) for (let i = base.length - 1; i >= 0; i--) if (/[iouü]/.test(lower[i])) { at = i; break; }
  // Syllabic interjections (not currently in TONE_DRILL) use m/n as nucleus.
  if (at < 0 && /^(?:m|hm)$/.test(lower)) at = lower.indexOf("m");
  if (at < 0 && /^(?:n|ng|hng)$/.test(lower)) at = lower.indexOf("n");
  if (at < 0) throw Error("invalid_tone_syllable");
  return (base.slice(0, at + 1) + PINYIN_TONE_MARKS[tone - 1] + base.slice(at + 1)).normalize("NFC");
}
function toneDrillQuestion(entry) {
  if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !/^\p{Script=Han}$/u.test(entry[1])) throw Error("invalid_tone_question");
  const accents = entry[0].normalize("NFD").match(/[\u0304\u0301\u030c\u0300]/g) || [];
  const digit = entry[0].trim().match(/([0-5])$/), markedTone = accents.length === 1 ? PINYIN_TONE_MARKS.indexOf(accents[0]) + 1 : 0;
  const tone = digit ? +digit[1] : markedTone;
  if (accents.length > 1 || tone < 1 || tone > 4 || markedTone && markedTone !== tone) throw Error("invalid_tone_question");
  const base = toneSyllableBase(entry[0]), options = [1, 2, 3, 4].map(n => toneSyllable(base, n));
  return { base, tone, options, pinyin: options[tone - 1], hanzi: entry[1] };
}
function pageTones() {
  const qs = shuffle(TONE_DRILL.map(toneDrillQuestion)).slice(0, 12); let k = 0, right = 0;
  function draw() {
    const q = qs[k]; if (!q) { app.innerHTML = `${topbar("Тренажёр тонов", "#/pinyin")}<div class="result"><div class="score">${right}/${qs.length}</div><p>${right >= 10 ? "Прекрасный слух!" : "Тоны приходят с практикой — повторите ещё раз."}</p><button class="btn" id="again">Ещё раз</button></div>`; $("#again").onclick = pageTones; return; }
    const t = q.tone, base = q.base;
    app.innerHTML = `${topbar("Тренажёр тонов", "#/pinyin")}<div class="qhead"><div class="bar"><i style="width:${k / qs.length * 100}%"></i></div><span class="muted">${k + 1}/${qs.length}</span></div>
      <div class="qcard"><div class="q">Какой тон у слога «${esc(base)}»?</div><button class="rec" data-say="${esc(q.hanzi)}" aria-label="Прослушать слог ${esc(base)}">${ic("speaker")}</button></div>
      <div class="opts" style="grid-template-columns:1fr 1fr">${q.options.map((pinyin, i) => `<button class="opt" data-t="${i + 1}" aria-label="${esc(pinyin)} — ${TONES[i].name}" style="text-align:center"><b lang="zh-Latn" style="font-size:22px">${esc(pinyin)}</b><br><small>${TONES[i].name}</small></button>`).join("")}</div><div id="fb"></div>`;
    speak(q.hanzi, $(".rec"));
    $$(".opt").forEach(b => b.onclick = () => { if ($(".opt.right")) return; const ok = +b.dataset.t === t; if (ok) right++; else b.classList.add("wrong"); $(`.opt[data-t="${t}"]`).classList.add("right"); record(ok);
      $("#fb").innerHTML = `<div class="fb ${ok ? "ok" : "no"}">${ok ? "Верно!" : "Это был другой тон."} <b class="zh">${esc(q.hanzi)}</b> ${esc(q.pinyin)}</div><button class="btn" id="next">Дальше ${ic("go")}</button>`; $("#next").onclick = () => { k++; draw(); }; });
  }
  draw();
}

/* ---------- грамматика, диалоги, чтение ---------- */
function pageGrammar(id) {
  if (id) { const g = GRAMMAR.find(x => x.id === id); if (!g) return pageGrammar();
    app.innerHTML = `${topbar(g.title, "#/grammar")}<span class="pill">Практика · блок ${g.lv}</span><p style="font-size:15px;line-height:1.75">${esc(g.rule)}</p>
      <div class="section"><h2>Примеры</h2><button class="muted" id="all">${ic("speaker")}</button></div><div class="dlg">${g.ex.map(e => `<div class="line" data-say="${esc(e[0])}"><div><div class="zh">${esc(e[0])}</div><div class="py">${esc(e[1])}</div><div class="ru">${esc(e[2])}</div></div></div>`).join("")}</div>`;
    $("#all").onclick = () => speakAll($$(".dlg .line").map(el => ({ el, text: el.dataset.say }))); return; }
  app.innerHTML = `${topbar("Грамматика", "#/learn")}<p class="sub" style="margin-top:-6px">Полезные конструкции с русскими объяснениями, примерами и озвучкой. От простых предложений к более сложным.</p>
    ${[1, 2, 3, 4].map(lv => `<div class="section"><h2>Практика · блок ${lv}</h2></div><div class="list">${GRAMMAR.filter(g => g.lv === lv).map(g => row(`#/grammar/${g.id}`, "pen", g.title, esc(g.ex[0][0]))).join("")}</div>`).join("")}`;
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
    ${[1, 2, 3].map(lv => `<div class="section"><h2>Практика · блок ${lv}</h2></div><div class="list">${DIALOGUES.filter(g => g.lv === lv).map(g => row(`#/dialogue/${g.id}`, "chat", g.title, esc(g.lines[0][1]))).join("")}</div>`).join("")}`;
}
function pageReading(id) {
  if (id) { const g = READINGS.find(x => x.id === id); if (!g) return pageReading();
    app.innerHTML = `${topbar(g.title, "#/reading")}${linesView(g.text.map(([zh, py, ru]) => ({ zh, py, ru })), "read")}<div class="box"><h3>Вопрос к тексту</h3><p style="margin:0 0 6px">${esc(g.q[0])}</p><div class="opts">${g.q[1].map((o, i) => `<button class="opt" data-i="${i}">${esc(o)}</button>`).join("")}</div></div>`;
    bindLines();
    $$(".box .opt").forEach(b => b.onclick = () => { if ($(".box .right")) return; const ok = +b.dataset.i === g.q[2]; record(ok); $(`.box .opt[data-i="${g.q[2]}"]`).classList.add("right"); if (!ok) b.classList.add("wrong"); toast(ok ? "Верно!" : "Перечитайте текст ещё раз"); });
    return; }
  app.innerHTML = `${topbar("Чтение", "#/learn")}<p class="sub" style="margin-top:-6px">Небольшие тексты с пиньинем, переводом и вопросом на понимание.</p><div class="list">${READINGS.map(g => row(`#/reading/${g.id}`, "read", `${g.title} · практика ${g.lv}`, esc(g.text[0][0]))).join("")}</div>
    <div class="list mt">${row(`#/write/${S.settings.level}`, "pen", "Письмо", "Напишите слово по переводу")}</div>`;
}

/* ---------- повторение вслух ---------- */
function pageShadow(id) {
  const src = id ? (DIALOGUES.find(d => d.id === id)?.lines || []).map(l => ({ zh: l[1], py: l[2], ru: l[3] })) : shuffle(SENTENCES.filter(s => s.lv <= Math.max(2, S.settings.level))).slice(0, 8);
  let k = 0, rec = null, chunks = [], url = null; const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  onLeave(() => { try { rec && rec.state === "recording" && rec.stop(); } catch (_) {} });
  function draw() {
    const s = src[k]; if (!s) { app.innerHTML = `${topbar("Повторение вслух", "#/learn")}<div class="result"><p>Все фразы пройдены. 说得很好！</p><a class="btn" href="#/learn">Готово</a></div>`; return; }
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
function pageLevel(lv) {
  const stage = ["1", "2", "3", "4", "5", "6", "7-9"].includes(String(lv)) ? String(lv) : hsk3Level();
  replaceRoute(`#/hsk3/${stage}/vocab`);
}

async function searchHskWords(q) {
  q = q.trim(); if (!q) return [];
  await ensureUnifiedCourse();
  const results = await Promise.allSettled([allWords(), HSK3.all()]);
  const words = results.flatMap(r => r.status === "fulfilled" ? r.value : []);
  const cyr = /[а-яё]/i.test(q), hz = /\p{Script=Han}/u.test(q); const score = w => {
    if (hz) return w.hz === q ? 0 : w.hz.startsWith(q) ? 1 : w.hz.includes(q) ? 2 : 9;
    if (cyr) { const r = w.ru.toLowerCase(), ql = q.toLowerCase(); return r.split(/[;,] ?/).some(x => x.trim() === ql) ? 0 : r.startsWith(ql) ? 1 : new RegExp(`(^|[^а-яё])${ql.replace(/[.*+?^${}()|[\]\\]/g, "")}`).test(r) ? 2 : r.includes(ql) ? 3 : 9; }
    const pp = Dictionary.normalizePinyin(w.py), query = Dictionary.normalizePinyin(q); return !query ? 9 : pp === query ? 0 : pp.startsWith(query) ? 1 : 9; };
  const preferred = w => (w.curriculum === "hsk3") === hsk3Selected() ? 0 : 1;
  const matches = new Map();
  for (const word of words) {
    const rank = score(word); if (rank >= 9) continue;
    const item = studyWord(word), key = wordKey(item), previous = matches.get(key);
    if (!previous || rank < previous[0] || (rank === previous[0] && word.curriculum === "hsk3")) matches.set(key, [rank, item]);
  }
  return [...matches.values()].sort((a, b) => a[0] - b[0] || preferred(a[1]) - preferred(b[1]) || parseInt(a[1].lv, 10) - parseInt(b[1].lv, 10)).slice(0, 60).map(x => x[1]);
}
async function searchWords(q) {
  const local = await searchHskWords(q);
  let extended;
  try { extended = await Dictionary.search(q); }
  catch (error) { return { words: local, error: error.message }; }
  const merged = new Map(local.map(w => [wordKey(w), w])), headwords = new Set(local.map(w => w.hz));
  for (const w of extended) if (!headwords.has(w.hz)) { merged.set(wordKey(w), w); headwords.add(w.hz); }
  const words = [...merged.values()];
  if (/\p{Script=Han}/u.test(q)) words.sort((a, b) => Number(b.hz === q) - Number(a.hz === q));
  return { words: words.slice(0, 60), error: "" };
}
function pageDict() {
  const recent = (S.recent || []);
  app.innerHTML = `${topbar("Словарь", "#/home")}<div class="chips" style="margin-bottom:16px"><a class="chip" href="#/translate">${ic("translate")} Перевести текст</a><a class="chip" href="#/translate/photo">${ic("camera")} По фото</a></div><label class="search">${ic("search")}<input id="q" placeholder="你好 · nihao · привет" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
    <p class="hint" id="dict-count">Китайско-русский словарь · единый курс HSK и 大БКРС</p>
    <p class="hint">Китайское слово или его начало, пиньинь с тонами или без, русский перевод (от 3 букв). Нажмите на слово: полное объяснение, примеры, сведения об иероглифах.</p>
    <p class="hint">Разделы загружаются по мере поиска. Для нового раздела нужен интернет; открытые разделы и сохранённые карточки доступны офлайн.</p><div id="res" aria-live="polite">${recent.length ? `<div class="section"><h2>Недавние</h2><button class="muted" id="clr">Очистить</button></div><div class="chips">${recent.map(r => `<button class="chip" data-q="${esc(r)}"><b class="zh" style="font-size:15px">${esc(r)}</b></button>`).join("")}</div>` : ""}</div>`;
  const q = $("#q"), results = $("#res"), count = $("#dict-count"); let t = 0, serial = 0;
  Dictionary.manifest().then(m => { if (count.isConnected) count.textContent = `${m.entries.toLocaleString("ru-RU")} статей 大БКРС · ${m.charactersWithRussian.toLocaleString("ru-RU")} отдельных иероглифов с русским объяснением · единый курс HSK`; }).catch(() => {});
  const run = async () => { const v = q.value.trim(), token = ++serial;
    if (!v) { results.innerHTML = ""; return; }
    results.innerHTML = '<p class="hint">Ищем в словаре…</p>';
    const result = await searchWords(v), r = result.words; if (token !== serial || !q.isConnected || q.value.trim() !== v) return;
    results.innerHTML = (result.error ? `<div class="notice">${esc(result.error)}<button class="btn small ghost" id="retry-search">Повторить поиск</button></div>` : "") +
      (r.length ? r.map(wordRow).join("") + (r.length === 60 ? '<p class="hint">Показаны первые 60 результатов. Уточните запрос.</p>' : "")
      : `<div class="empty"><b>${result.error ? "Раздел недоступен" : "Ничего не найдено"}</b>Попробуйте другую форму или китайское написание.</div>`) +
      ([...v].length === 1 && isHan(v) ? `<a class="btn ghost" href="#/word/${encodeURIComponent(v)}">Сведения об иероглифе ${esc(v)}</a>` : "");
    const retry = $("#retry-search"); if (retry) retry.onclick = run;
    if (r[0] && v.trim()) { S.recent = [r[0].hz, ...(S.recent || []).filter(x => x !== r[0].hz)].slice(0, 12); save(); } };
  q.oninput = () => { clearTimeout(t); t = setTimeout(run, 220); };
  onLeave(() => { clearTimeout(t); serial++; });
  $$("[data-q]").forEach(b => b.onclick = () => { q.value = b.dataset.q; run(); });
  const c = $("#clr"); if (c) c.onclick = () => { S.recent = []; save(); pageDict(); };
  const pre = sessionStorage.getItem("dictQ"); if (pre) { sessionStorage.removeItem("dictQ"); q.value = pre; run(); } else q.focus();
}
async function pageBook() {
  const keys = bookmarkKeys();
  app.innerHTML = `${topbar("Мой словарик", "#/review")}${keys.length ? "" : `<div class="empty"><b>Словарик пуст</b>Сюда попадают слова, в которых вы ошиблись, и слова со звёздочкой.<br><a class="btn small" href="${coursePath("vocab")}">Открыть слова ${currentCourseName()}</a></div>`}<div id="wl"></div>`;
  if (!keys.length) return; const container = $("#wl");
  const list = (await Promise.all(keys.map(findWord))).filter(Boolean).sort((a, b) => bookmarkRecord(wordKey(b)).t - bookmarkRecord(wordKey(a)).t);
  if (container.isConnected) container.innerHTML = `<p class="sub" style="margin-top:-6px">${list.length} ${plural(list.length, "слово", "слова", "слов")}</p>${list.map(wordRow).join("")}<a class="btn" href="#/study/book">Повторить карточками ${ic("go")}</a>`;
}

/* ---------- уровни, статистика, план, настройки ---------- */
async function pageStages() {
  const routeHash = location.hash;
  app.innerHTML = `${topbar("Выберите этап", "#/learn")}<p class="empty">Загрузка этапов…</p>`;
  const manifest = await HSK3.manifest();
  if (location.hash !== routeHash) return;
  app.innerHTML = `${topbar("Выберите этап", "#/learn")}<p class="sub">Один курс от первых слов до свободного общения. Ваши изученные слова и повторения сохраняются при смене этапа.</p>
    <div class="list">${manifest.levels.map(stage => `<button class="row" data-stage="${esc(stage.id)}" aria-pressed="${stage.id === hsk3Level()}"><span class="ic"><b>${levelLabel(stage.id)}</b></span><span class="t"><b>HSK ${levelLabel(stage.id)}</b><small>${(stage.officialCount ?? stage.count).toLocaleString("ru-RU")} слов программы${stage.supplementCount ? ` + ${stage.supplementCount} дополнительных` : ""} · ${stage.cumulativeCount.toLocaleString("ru-RU")} с предыдущими этапами</small></span>${stage.id === hsk3Level() ? ic("check", "i go") : ic("go", "i go")}</button>`).join("")}</div>
    <p class="hint mt">Уровни 7–9 используют общий словарь и единый экзамен. Для каждого этапа доступны карточки, слова и типы заданий.</p>`;
  $$("[data-stage]").forEach(button => button.onclick = () => {
    S.settings.curriculum = "hsk3"; S.settings.hsk3Level = button.dataset.stage;
    save(); location.hash = coursePath("study");
  });
}
function pageLevels() { return pageStages(); }

function pageStats() {
  const days = [...Array(14)].map((_, i) => { const t = today(Date.now() - (13 - i) * DAY); return [t, S.stats.days[t] || 0]; }); const mx = Math.max(1, ...days.map(d => d[1]));
  const progress = progressEntries();
  const lvRows = ["1", "2", "3", "4", "5", "6", "7-9"].map(lv => `<div class="setrow"><span>HSK ${levelLabel(lv)}</span><span class="muted">${progress.filter(entry => String(entry.word?.level ?? legacyMetadata.get(entry.sourceKey)?.level ?? entry.lv) === lv && entry.b >= 1).length}</span></div>`).join("");
  app.innerHTML = `${topbar("Статистика", "#/me")}<div class="box"><h3>Последние 14 дней</h3><div class="chart">${days.map(([t, n]) => `<div class="${n ? "on" : ""}" style="height:${n / mx * 100}%" title="${t}: ${n}"><span>${+t.slice(8)}</span></div>`).join("")}</div><p class="hint" style="margin-top:26px">Сегодня: ${D().answered} ответов, ${D().correct} верных · новых слов ${D().learned}</p></div>
    <div class="box"><h3>Всего</h3><div class="stats"><div><b>${S.stats.answered}</b><small>ответов</small></div><div><b>${accuracy()}%</b><small>точность</small></div><div><b>${progress.length}</b><small>карточек в работе</small></div></div></div>
    <div class="box"><h3>Выучено по этапам</h3>${lvRows}</div>
    <div class="box"><h3>Последние тесты</h3>${S.history.length ? S.history.slice(0, 10).map(x => `<div class="setrow"><span>${esc(x.kind)}<small>${new Date(x.t).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit" })}</small></span><b>${x.score}</b></div>`).join("") : `<p class="hint">Пока нет пройденных тестов.</p>`}</div>`;
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
  app.innerHTML = `${topbar("О приложении", "#/me")}<h2 class="center" style="margin:6px 0 0">汉语熊</h2><p class="center muted">Китайский для русскоговорящих · версия 1.5</p>
    <div class="box"><h3>Словарь</h3><p class="hint" style="margin:0">Дополнительные учебные слова, пиньинь и части речи — <a href="https://github.com/drkameleon/complete-hsk-vocabulary" style="text-decoration:underline">complete-hsk-vocabulary</a> (MIT), основан на данных CC-CEDICT (CC BY-SA 4.0). Русские переводы, диалоги, тексты и объяснения грамматики написаны для этого приложения; переводы краткие и не проверены носителем — сообщайте о неточностях.</p></div>
    <div class="box"><h3>Большой словарь и иероглифы</h3><p class="hint">Полные русские толкования и словарные примеры: <a href="https://bkrs.info/p47">大БКРС</a>, снимок 5 ноября 2026 года. Источник разрешает свободное использование баз в любых целях. Сохраняются статьи с китайским написанием и русским толкованием. Это слова, иероглифы, имена, термины и словосочетания, а не исчерпывающий список всех слов китайского языка.</p><p class="hint">Ключи, число черт, чтения и варианты: <a href="https://www.unicode.org/reports/tr38/">Unicode Unihan 17.0.0</a>, <a href="data/UNICODE-LICENSE.txt">Unicode License v3</a>. Распаковка данных: fflate 0.8.2 (<a href="vendor/fflate-LICENSE.txt">MIT</a>). <a href="data/DICTIONARY-SOURCES.txt">Описание источников и преобразований</a>.</p><p class="hint">Пояснения простыми словами и ролевые ситуации написаны для приложения. Они не являются цитатами из словаря.</p></div>
    <div class="box"><h3>Порядок черт</h3><p class="hint" style="margin:0">Анимация и проверка черт — <a href="https://github.com/chanind/hanzi-writer" style="text-decoration:underline">Hanzi Writer</a> (MIT); данные черт — Make Me a Hanzi, Arphic Public License (текст лицензии: strokes/ARPHICPL.TXT).</p></div>
    <div class="box"><h3>Озвучивание</h3><p class="hint">В карточках и учебных упражнениях используется китайский голос устройства (zh-CN). Если звука нет, установите китайский голос в системных настройках речи.</p><p class="hint">У AI-собеседника озвучивание китайских фраз и распознавание записи работают через Qwen, когда эти возможности подключены. Запись ограничена 30 секундами; распознанный текст можно исправить перед отправкой. Звук не отправляется и не воспроизводится автоматически.</p></div>
    <div class="box"><h3>Учебная оценка</h3><p class="hint">Проверка письма и устного ответа — приблизительная учебная оценка по критериям задания, а не официальный балл HSK. Устный ответ оценивается по тексту. Тренажёр тонов сравнивает движение голоса в одном слоге на устройстве; он не проверяет полное произношение или беглость.</p></div><div class="box"><h3>AI и перевод</h3><p class="hint">Сообщения и предыдущие реплики текущего разговора отправляются в DeepSeek после нажатия «Отправить». Фотографии отправляются в Yandex AI Studio для распознавания после нажатия «Распознать текст»; перевод текста выполняет Yandex Translate. При распознавании записи и озвучивании выбранной фразы звук или текст обрабатывает Qwen в Alibaba Cloud.</p><p class="hint">Разговор доступен только пока открыт его экран; переводы, фотографии и записи не сохраняются. На устройстве остаются выбранные вами новые слова и категории исправлений. До 40 изученных слов и короткие записи об ошибках передаются с новым сообщением, чтобы подобрать сложность. Только с отдельного согласия выбранный фрагмент плохого ответа и вопрос отправляются разработчику в частное хранилище Yandex. Эти функции требуют интернета. Ответы AI могут содержать ошибки — проверяйте важные сведения.</p></div>
    <div class="box"><h3>HSK 3.0</h3><p class="hint" style="margin:0">Новый словарь, структура уровней и форматы заданий доступны в <a href="#/hsk3" style="text-decoration:underline">разделе HSK 3.0</a>. Источники и границы покрытия указаны там. Учебные упражнения не выдают официальный результат экзамена.</p></div>
    <div class="box"><h3>Данные</h3><p class="hint" style="margin:0">Аккаунт не нужен. Прогресс хранится в браузере; для переноса используйте код в настройках. Курс HSK доступен офлайн после первого открытия. Большой словарь загружается по разделам: офлайн доступны уже открытые разделы и сохранённые карточки. Браузер может освободить кеш при нехватке места.</p></div>`;
}

/* ---------- иероглифы: порядок черт (Hanzi Writer, данные Make Me a Hanzi / Arphic PL) ---------- */
let hwP = null;
const loadHW = () => hwP || (hwP = new Promise((res, rej) => { if (window.HanziWriter) return res(); const s = document.createElement("script"); s.src = "vendor/hanzi-writer.min.js"; s.onload = res; s.onerror = () => { hwP = null; rej(Error("hw")); }; document.head.append(s); }));
const charLoader = (c, onLoad, onErr) => fetch(`strokes/${encodeURIComponent(c)}.json`).then(r => { if (!r.ok) throw Error(r.status); return r.json(); }).then(onLoad).catch(onErr);
const HW_OPTS = { padding: 6, strokeColor: "#18191a", radicalColor: "#536e94", outlineColor: "#e1e8f1", drawingColor: "#536e94", highlightColor: "#9ab6dd", strokeAnimationSpeed: 1.2, delayBetweenStrokes: 160, showCharacter: false, charDataLoader: charLoader };
const isHan = c => /^\p{Script=Han}$/u.test(c);
const gridSVG = size => `<svg width="${size}" height="${size}" style="position:absolute;inset:0" aria-hidden="true"><g stroke="#e8eef6" stroke-dasharray="4 4"><line x1="0" y1="0" x2="${size}" y2="${size}"/><line x1="${size}" y1="0" x2="0" y2="${size}"/><line x1="${size / 2}" y1="0" x2="${size / 2}" y2="${size}"/><line x1="0" y1="${size / 2}" x2="${size}" y2="${size / 2}"/></g></svg>`;
const charBox = (id, size) => `<div style="position:relative;width:${size}px;height:${size}px;border:1px solid var(--line);border-radius:18px;background:#fff;overflow:hidden">${gridSVG(size)}<div id="${id}" style="position:relative"></div></div>`;

async function findWord(key) {
  const id = canonicalKey(key), snapshot = bookmarkRecord(id)?.word || progressRecord(id)?.word;
  if (snapshot?.source === "ai" && /^ai:/.test(snapshot.id)) return studyWord(snapshot);
  if (snapshot?.curriculum === "hsk3") return studyWord(snapshot);
  if (id !== key || !/^\p{Script=Han}+$/u.test(key)) {
    const modern = await HSK3.find(id).catch(() => null);
    if (modern) return studyWord(modern);
  }
  if (snapshot) return studyWord(snapshot);
  const oldKey = legacyMetadata.has(key) ? key : [...legacyAliases].find(([, target]) => target === id)?.[0];
  const hz = oldKey || key;
  let hsk;
  try { hsk = (await allWords()).find(w => w.hz === hz); }
  catch (error) { if (snapshot) return studyWord(snapshot); throw error; }
  return hsk ? studyWord(hsk) : await Dictionary.lookup(hz);
}
async function pageWord(key) {
  key = decodeURIComponent(key || ""); const routeHash = location.hash;
  app.innerHTML = `${topbar("Слово", "#/dict")}<p class="empty">Загрузка статьи…</p>`;
  let w = await findWord(key), article = w?.source === "bkrs" ? w : null, loadError = "";
  if (!article) { try { article = await Dictionary.lookup(w?.hz || key); } catch (e) { loadError = e.message; } }
  if (!w && article) w = article;
  if (!w && key && [...key].every(isHan)) w = { hz: key, py: "", ru: "Русское толкование пока отсутствует в подключённом словаре.", lv: 0, missing: true };
  if (location.hash !== routeHash) return;
  if (!w) { app.innerHTML = `${topbar("Слово", "#/dict")}<div class="empty"><b>Слово не найдено</b>Попробуйте другое написание.</div>`; return; }
  let teachingDefinitions = [];
  if (typeof HSK3.legacyDetails === "function") {
    try {
      const details = await HSK3.legacyDetails(wordKey(w)), seen = new Set([`${w.py}|${w.ru}`]);
      teachingDefinitions = details.filter(detail => { const key = `${detail.py}|${detail.ru}`; if (!detail.ru || seen.has(key)) return false; seen.add(key); return true; });
    } catch (_) {}
  }
  const chars = [...new Set([...w.hz].filter(isHan))], ex = SENTENCES.filter(s => s.zh.includes(w.hz)).slice(0, 4);
  let metadata = null, available = "";
  try { const m = await Dictionary.manifest(); available = m.strokeCharacters; metadata = await Dictionary.character(w.hz); } catch (_) {}
  if (location.hash !== routeHash) return;
  const srs = wordProgress(w), scenario = WORD_SCENARIOS[w.hz];
  const knownStrokes = chars.filter(c => available.includes(c));
  const variantLinks = value => [...(value || "")].map(c => `<a class="chip zh" href="#/word/${encodeURIComponent(c)}">${esc(c)}</a>`).join(" ");
  const radicals = metadata?.radical?.split(" ").map(r => { const match = r.match(/^(\d+)(\'*)\.(-?\d+)$/); return match ? `${String.fromCodePoint(0x2f00 + Number(match[1]) - 1)} (${match[1]}${match[2] ? ", упрощённая форма" : ""}; дополнительных черт: ${match[3]})` : r; }).join("; ");
  app.innerHTML = `${topbar("Слово", "#/dict")}
    <div class="center"><h2 class="entry-headword zh">${esc(w.hz)}</h2>
      <div class="py" style="font-size:22px">${esc(w.py || article?.py || metadata?.py || "")}</div>
      <div class="muted mt">${esc(wordLabel(w))}${srs ? ` · ${srs.b >= 3 ? "хорошо знаю" : "изучаю"}` : ""}</div>
      <div class="entry-actions">${sayBtn(w.hz)}${w.missing ? "" : starBtn(w)}</div></div>
    ${loadError ? `<p class="notice">${esc(loadError)}</p>` : ""}
    ${scenario ? `<div class="box"><h3>Объяснение простыми словами</h3><p class="entry-definition">${esc(scenario.explanation)}</p><a class="btn ghost" href="#/scenario/${encodeURIComponent(w.hz)}">Разыграть ситуацию ${ic("chat")}</a></div>` : ""}
    ${w.lv ? `<div class="box"><h3>Значение · ${esc(wordLabel(w))}</h3><p class="entry-definition">${esc(w.ru)}</p></div>` : ""}
    ${teachingDefinitions.length ? `<div class="box"><h3>Учебные значения</h3>${teachingDefinitions.map(detail => `<p class="py">${esc(detail.py)}</p><p class="entry-definition">${esc(detail.ru)}</p>`).join("")}</div>` : ""}
    <div class="box"><h3>${article ? "Полное объяснение · 大БКРС" : "Значение"}</h3><div class="entry-definition">${esc(article?.ru || w.ru)}</div>
      ${article ? '<p class="hint">Источник: <a href="https://bkrs.info/p47" target="_blank" rel="noopener">大БКРС</a>. Толкование и примеры сохранены из словарной статьи.</p>' : ""}</div>
    ${metadata ? `<div class="box"><h3>Об иероглифе</h3><dl class="char-facts"><dt>Ключ (радикал)</dt><dd>${esc(radicals || "Не указан")}</dd><dt>Число черт</dt><dd>${esc(metadata.strokes || "Не указано")}</dd><dt>Чтение в Unihan</dt><dd>${esc(metadata.py || "Не указано")}</dd><dt>Код Unicode</dt><dd>U+${w.hz.codePointAt(0).toString(16).toUpperCase()}</dd></dl>
      ${metadata.simplified ? `<p>Упрощённая форма: ${variantLinks(metadata.simplified)}</p>` : ""}${metadata.traditional ? `<p>Традиционная форма: ${variantLinks(metadata.traditional)}</p>` : ""}<p class="hint">Unicode Unihan 17.0.0. Возможны несколько нормативных вариантов подсчёта черт и ключей.</p></div>` : ""}
    ${chars.length > 1 ? `<div class="section"><h2>Иероглифы в слове</h2></div><div class="chips">${chars.map(c => `<a class="chip zh" href="#/word/${encodeURIComponent(c)}"><b>${esc(c)}</b></a>`).join("")}</div>` : ""}
    <div class="section"><h2>Примеры и употребление</h2></div>
    ${ex.map(s => `<div class="sent"><div class="zh">${esc(s.zh)}</div><div class="py">${esc(s.py)}</div><div class="ru">${esc(s.ru)}</div>${sayBtn(s.zh)}</div>`).join("")}
    ${(article?.examples || []).map(s => `<div class="box entry-definition">${esc(s)}</div>`).join("")}
    ${!ex.length && !article?.examples?.length ? '<p class="hint">В этой статье пока нет отдельных примеров. Примеры внутри толкования, если они есть, показаны выше.</p>' : ""}
    ${DIALOGUES.filter(d => d.lines.some(l => l[1].includes(w.hz))).map(d => `<a class="btn ghost" href="#/dialogue/${d.id}">${ic("chat")} ${esc(d.title)}</a>`).join("")}
    <div class="section"><h2>Порядок черт</h2></div>
    ${knownStrokes.length ? `<div class="stroke-grid">${knownStrokes.map((c, i) => `<div>${charBox(`hw${i}`, 130)}<a href="#/hanzi/w/${encodeURIComponent(c)}" class="btn small ghost">Написать ${esc(c)}</a></div>`).join("")}</div><button class="btn ghost" id="anim">Показать порядок черт</button>` : '<p class="hint">Для этих иероглифов анимация пока не подключена.</p>'}`;
  if (!knownStrokes.length) return;
  try { await loadHW(); } catch (_) { return; }
  if (location.hash !== routeHash) return;
  const ws = knownStrokes.map((c, i) => HanziWriter.create(`hw${i}`, c, { ...HW_OPTS, width: 128, height: 128, showCharacter: true }));
  let active = true; onLeave(() => { active = false; ws.forEach(x => x.cancelQuiz()); });
  $("#anim").onclick = async () => { for (const x of ws) { if (!active) break; await x.animateCharacter(); } };
}

function pageScenario(arg) {
  const hz = decodeURIComponent(arg || ""), scene = WORD_SCENARIOS[hz];
  if (!scene) { location.hash = "#/dict"; return; }
  const line = a => `<div class="sent"><div class="zh">${esc(a[0])}</div><div class="py">${esc(a[1])}</div><div class="ru">${esc(a[2])}</div>${sayBtn(a[0])}</div>`;
  app.innerHTML = `${topbar("Ситуация · " + esc(hz), "#/word/" + encodeURIComponent(hz))}<div class="box"><h3>Ваша задача</h3><p>${esc(scene.situation)}</p></div><p class="kicker">Собеседник</p>${line(scene.partner)}
    <label class="field"><span>Ваш ответ: произнесите вслух или напишите</span><textarea id="role-answer" rows="3" placeholder="Попробуйте ответить по-китайски…"></textarea></label>
    <button class="btn" id="role-show">Показать пример ответа</button><div id="role-result"></div><p class="hint">Самостоятельная ролевая практика. Свой ответ сравните с образцом; автоматической оценки здесь нет.</p>`;
  $("#role-show").onclick = () => { $("#role-result").innerHTML = `<p class="kicker mt">Один из возможных ответов</p>${line(scene.answer)}<div class="box"><h3>Почему так</h3><p>${esc(scene.note)}</p></div>`; $("#role-show").disabled = true; };
}

/* тренировка письма иероглифов */
async function pageHanzi(arg, hzArg) {
  const isActive = activeView();
  let list;
  if (arg === "w") { const hz = decodeURIComponent(hzArg || ""); const w = await findWord(hz) || ([...hz].every(isHan) && hz ? { hz, py: "", ru: hz, lv: 0 } : null); list = w ? [w] : []; }
  else { const lv = +arg || S.settings.level; const words = await level(lv); const learned = words.filter(w => wordProgress(w));
    list = shuffle(learned.length >= 6 ? learned : words.slice(0, 40)).slice(0, 6); }
  const back = arg === "w" ? `#/word/${encodeURIComponent(hzArg)}` : "#/learn";
  if (!isActive()) return;
  if (!list.length) { app.innerHTML = `${topbar("Иероглифы", back)}<div class="empty"><b>Нечего писать</b></div>`; return; }
  try { await loadHW(); } catch (_) { if (isActive()) app.innerHTML = `${topbar("Иероглифы", back)}<div class="empty"><b>Не удалось загрузить</b>Проверьте подключение.</div>`; return; }
  if (!isActive()) return;
  let k = 0, ci = 0, total = 0, mistakes = 0, hint = false, writer = null;
  const size = Math.min(300, window.innerWidth - 60);
  function draw() {
    if (!isActive()) return;
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
        setTimeout(() => { if (!isActive()) return; ci++; if (ci >= chars.length) { ci = 0; k++; record(true); } draw(); }, 900); } });
    start();
    $("#hint").onclick = () => { hint = !hint; hint ? writer.showOutline() : writer.hideOutline(); $("#hint").textContent = hint ? "Скрыть контур" : "Показать контур"; };
    $("#demo").onclick = async () => { writer.cancelQuiz(); await writer.animateCharacter(); if (!isActive()) return; writer.hideCharacter(); start(); };
  }
  function finish() { app.innerHTML = `${topbar("Пишем иероглифы", back)}<div class="result"><div class="score">${total}</div><p>${plural(total, "иероглиф написан", "иероглифа написано", "иероглифов написано")} · ошибок в чертах: ${mistakes}</p>
      ${arg === "w" ? `<a class="btn" href="${back}">К слову</a>` : `<button class="btn" id="again">Ещё 6 слов</button>`}<a class="btn ghost" href="#/learn">Готово</a></div>`; const a = $("#again"); if (a) a.onclick = () => pageHanzi(arg); }
  onLeave(() => { try { writer && writer.cancelQuiz(); } catch (_) {} });
  draw();
}

/* ---------- игры: «Найди пару» и облако слов ---------- */
async function pagePairs(lv) {
  const isActive = activeView();
  lv = +lv || S.settings.level; const words = await level(lv); const pool = words.filter(w => wordProgress(w)); const src = shuffle(pool.length >= 6 ? pool : words.slice(0, 60)).slice(0, 6);
  if (!isActive()) return;
  let sel = null, left = src.length, miss = 0; const t0 = Date.now();
  const cards = shuffle([...src.map(w => ({ k: w.hz, t: w.hz, zh: true })), ...src.map(w => ({ k: w.hz, t: short(w.ru) }))]);
  app.innerHTML = `${topbar(`Найди пару · блок ${lv}`, "#/review")}<p class="sub" style="margin-top:-6px">Соедините иероглиф с переводом.</p>
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
  const isActive = activeView();
  lv = +lv || S.settings.level; const words = (await level(lv)).slice(0, 60);
  if (!isActive()) return;
  app.innerHTML = `${topbar(`Облако слов · блок ${lv}`, "#/review")}<p class="sub" style="margin-top:-6px">Чем чаще слово встречается, тем оно крупнее. Нажмите — услышите и увидите перевод. Выученные слова светлее.</p>
    <div id="cl" style="display:flex;flex-wrap:wrap;gap:6px 12px;justify-content:center;align-items:center;padding:18px 4px;border:1px solid var(--line);border-radius:24px;margin-top:14px;background:var(--glaze2)">${shuffle(words.map((w, i) => ({ w, i }))).map(({ w, i }) => `<button class="zh" data-hz="${esc(w.hz)}" style="font-size:${Math.round(34 - i * 0.33)}px;line-height:1.3;color:${wordProgress(w)?.b >= 2 ? "#9ab6dd" : "#18191a"};transform:rotate(${(Math.random() * 10 - 5).toFixed(1)}deg)">${esc(w.hz)}</button>`).join("")}</div>
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
  const isActive = activeView();
  const book = bookArg ? decodeURIComponent(bookArg) : null;
  app.innerHTML = `${topbar(book || "Мои учебники", book ? "#/shelf" : "#/learn")}<p class="empty">Загрузка…</p>`;
  let items = []; try { items = await Shelf.list(); } catch (_) { if (isActive()) app.innerHTML = `${topbar("Мои учебники", "#/learn")}<div class="empty"><b>Хранилище недоступно</b>Браузер запретил локальное хранение (например, приватный режим).</div>`; return; }
  if (!isActive()) return;
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
  if (!isActive()) return;
  const recent = items.filter(f => f.opened).sort((a, b) => b.opened - a.opened)[0];
  app.innerHTML = `${topbar("Мои учебники", "#/learn")}<div class="list">${row("#/library", "book", "Курс китайского · 汉语课程", "Готовая библиотека: учебники и аудио")}</div><p class="sub">Добавьте свои учебники — PDF, аудио, картинки. Добавленные здесь файлы хранятся только на этом устройстве и никуда не загружаются.</p>
    ${recent ? `<a class="card-blue" href="#/file/${encodeURIComponent(recent.id)}" style="display:block;margin-top:16px"><p class="kicker">Продолжить</p><b style="font-size:17px;word-break:break-word">${esc(recent.name.replace(/\.[^.]+$/, ""))}</b><p class="sub" style="max-width:none">${esc(recent.book)}</p></a>` : ""}
    <div class="two"><label class="btn" style="cursor:pointer">${ic("download")} Папку<input type="file" id="fdir" webkitdirectory directory multiple hidden></label><label class="btn ghost" style="cursor:pointer">Файлы<input type="file" id="ffiles" multiple accept=".pdf,audio/*,image/*,video/*,.txt,.md,.mp3,.m4a,.wav" hidden></label></div>
    <p class="hint">Совет: распакуйте скачанный архив и выберите общую папку с учебниками — каждая вложенная папка станет отдельной книгой. На iPhone выбирайте файлы через «Файлы».</p><div id="imp"></div>
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
  const isActive = activeView();
  const id = decodeURIComponent(idArg || ""); const meta = await Shelf.get(id); const blob = meta && await Shelf.blob(id);
  if (!isActive()) return;
  if (!meta || !blob) { app.innerHTML = `${topbar("Файл", "#/shelf")}<div class="empty"><b>Файл не найден</b>Возможно, он был удалён с устройства.</div>`; return; }
  meta.opened = Date.now(); Shelf.update(meta);
  const back = `#/shelf/${encodeURIComponent(meta.book)}`; const url = URL.createObjectURL(blob); onLeave(() => setTimeout(() => URL.revokeObjectURL(url), 60e3));
  const siblings = (await Shelf.list()).filter(f => f.book === meta.book && f.kind === meta.kind).sort((a, b) => natCmp(a.sub + "/" + a.name, b.sub + "/" + b.name));
  if (!isActive()) return;
  const i = siblings.findIndex(f => f.id === id), prev = siblings[i - 1], next = siblings[i + 1];
  const nav = `<div class="two">${prev ? `<a class="btn ghost" href="#/file/${encodeURIComponent(prev.id)}">‹ Назад</a>` : "<span></span>"}${next ? `<a class="btn ghost" href="#/file/${encodeURIComponent(next.id)}">Дальше ›</a>` : "<span></span>"}</div>`;
  const title = esc(meta.name.replace(/\.[^.]+$/, ""));
  if (meta.kind === "pdf") {
    await renderLocalPdf(blob, meta, nav, back, title);
  } else if (meta.kind === "audio" || meta.kind === "video") {
    const tag = meta.kind === "audio" ? "audio" : "video";
    app.innerHTML = `${topbar(title, back)}<p class="muted" style="margin-top:-8px">${esc(meta.book)}${meta.sub ? " · " + esc(meta.sub) : ""}</p>
      ${tag === "audio" ? `<div class="card-blue center" style="padding:26px 18px"><b style="word-break:break-word">${title}</b></div>` : ""}
      <${tag} id="pl" src="${url}" controls controlsList="nodownload noremoteplayback" disableRemotePlayback preload="metadata" style="width:100%;margin-top:16px;${tag === "video" ? "border-radius:18px;background:#000" : ""}"></${tag}>
      <div class="seg mt">${[0.75, 1, 1.25].map(r => `<button data-r="${r}" aria-pressed="${r === 1}">${r}×</button>`).join("")}<button id="rw">−5 с</button><button id="loop" aria-pressed="false">Повтор</button></div>
      <label class="setrow"><span>Автоматически следующий трек</span><button class="toggle" id="auto" aria-pressed="${S.settings.autoNext !== false}"></button></label>${nav}`;
    const pl = $("#pl"); pl.oncontextmenu = e => e.preventDefault(); pl.addEventListener("loadedmetadata", () => { if (meta.pos && meta.pos < pl.duration - 3) pl.currentTime = meta.pos; }, { once: true });
    let t = 0; pl.ontimeupdate = () => { if (Date.now() - t > 4000) { t = Date.now(); meta.pos = pl.currentTime; Shelf.update(meta); } };
    pl.onended = () => { meta.pos = 0; meta.done = true; Shelf.update(meta); markStudy(); save(); if (S.settings.autoNext !== false && next && !pl.loop) location.hash = `#/file/${encodeURIComponent(next.id)}`; };
    $$("[data-r]").forEach(b => b.onclick = () => { pl.playbackRate = +b.dataset.r; $$("[data-r]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); });
    $("#rw").onclick = () => { pl.currentTime = Math.max(0, pl.currentTime - 5); };
    $("#loop").onclick = e => { pl.loop = !pl.loop; e.currentTarget.setAttribute("aria-pressed", String(pl.loop)); };
    $("#auto").onclick = e => { S.settings.autoNext = S.settings.autoNext === false; e.currentTarget.setAttribute("aria-pressed", String(S.settings.autoNext)); save(); };
    onLeave(() => { meta.pos = pl.currentTime; Shelf.update(meta); pl.pause(); });
    pl.play().catch(() => {});
  } else if (meta.kind === "image") {
    app.innerHTML = `${topbar(title, back)}<img src="${url}" alt="${title}" style="width:100%;border-radius:18px;border:1px solid var(--line)" draggable="false">${nav}`;
    $("#app img").oncontextmenu = e => e.preventDefault();
  } else {
    const txt = await blob.text(); if (!isActive()) return;
    app.innerHTML = `${topbar(title, back)}<div class="box zh" style="white-space:pre-wrap;line-height:1.9;font-size:17px">${esc(txt)}</div>${nav}`;
  }
}

/* ========== маршрутизация ========== */
const ROUTES = {
  hsk3: (lv, view) => pageHSK3(lv, view), stages: pageStages,
  library: id => pageLibrary(id), libfile: id => pageLibraryFile(id),
  ai: arg => pageAI(arg), assess: arg => pageAIAssessment(arg), pronunciation: arg => pageAIPronunciation(arg), "ai-profile": () => pageAILearning(),
  translate: arg => pageTranslate(arg), welcome: pageWelcome, home: arg => pageHome(arg), features: arg => pageFeatures(arg), learn: pageLearn, review: pageReview, me: pageMe,
  study: pageStudy, quiz: lv => pageQuiz(lv), listen: lv => pageQuiz(lv, "listen"), exam: lv => pageQuiz(lv, "exam"), write: pageWrite,
  pinyin: pagePinyin, tones: pageTones, grammar: pageGrammar, dialogues: () => pageDialogues(), dialogue: pageDialogues, reading: pageReading, shadow: pageShadow,
  level: pageLevel, levels: pageLevels, word: pageWord, scenario: pageScenario, hanzi: pageHanzi, pairs: pagePairs, cloud: pageCloud, shelf: pageShelf, file: pageFile, dict: pageDict, book: pageBook, stats: pageStats, plan: pagePlan, settings: pageSettings, about: pageAbout,
};
const TAB = { ai: "learn", assess: "learn", pronunciation: "learn", "ai-profile": "me", translate: "translate", shelf: "learn", file: "learn", pairs: "learn", cloud: "learn", word: "home", home: "home", features: "home", learn: "learn", review: "learn", me: "me", study: "learn", book: "learn", quiz: "home", dict: "search", stats: "me", plan: "home", settings: "me", about: "me" };
let routeRevision = 0;
async function route() {
  const revision = ++routeRevision, routeHash = location.hash;
  const navigation = typeof HanyuNavigation === "undefined" ? null : HanyuNavigation;
  const visit = navigation?.begin(routeHash);
  const isCurrentRoute = () => revision === routeRevision && location.hash === routeHash;
  if (typeof HomePet !== "undefined" && typeof HomePet.unmount === "function") { try { HomePet.unmount(); } catch (_) {} }
  leaveFns.forEach(f => { try { f(); } catch (_) {} }); leaveFns = []; if ("speechSynthesis" in window) speechSynthesis.cancel();
  $$(".sheet").forEach(s => s.remove());
  let [name, arg, arg2] = (location.hash.replace(/^#\/?/, "") || "home").split("/");
  if (!S.profile && name !== "welcome") { replaceRoute("#/welcome"); return; }
  if (S.profile && name === "welcome") name = "home";
  if (S.profile) await ensureUnifiedCourse();
  if (!isCurrentRoute()) return;
  const fn = ROUTES[name] || pageHome; const bare = name === "welcome";
  $("#appbar").hidden = bare || name === "home"; $("#tabbar").hidden = bare;
  const legacyFab = $("#fab"); if (legacyFab) legacyFab.hidden = true;
  const tab = TAB[name] || "learn"; $$("#tabbar a").forEach(a => {
    if (a.dataset.tab === tab) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  if (!navigation) window.scrollTo(0, 0);
  try { await fn(arg, arg2); } catch (e) {
    if (!isCurrentRoute()) return;
    console.error(e); app.innerHTML = `${topbar("Ошибка")}<div class="empty"><b>Не удалось загрузить</b>Проверьте подключение к интернету и попробуйте снова.<br><button class="btn small" onclick="location.reload()">Обновить</button></div>`;
  }
  if (!isCurrentRoute()) return;
  navigation?.finish(visit, app);
  document.title = name === "home" ? "汉语熊 · Китайский каждый день" : `${$("h1")?.textContent || "汉语熊"} · 汉语熊`;
}
window.addEventListener("hashchange", route);
window.addEventListener("popstate", () => { if (typeof HanyuNavigation !== "undefined" && HanyuNavigation.isSameRouteTraversal()) route(); });
const legacyFab = $("#fab"); if (legacyFab) { legacyFab.hidden = true; legacyFab.innerHTML = ""; }
route();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
