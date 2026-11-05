/* 大БКРС: indexed Russian dictionary. No large dictionary download at startup. */
"use strict";
const Dictionary = (() => {
  const BASE = "data/dictionary/";
  const cache = new Map();
  let manifestP;
  const normalizePinyin = text => text.toLowerCase().replace(/u:|[üǖǘǚǜ]/g, "v").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
  const normalizeRussian = text => text.toLowerCase().replace(/ё/g, "е");
  async function manifest() {
    if (!manifestP) manifestP = fetch(BASE + "manifest.json").then(r => {
      if (!r.ok) throw Error("Не удалось загрузить каталог словаря");
      return r.json();
    }).catch(e => { manifestP = null; throw e; });
    return manifestP;
  }
  async function read(path) {
    const m = await manifest();
    if (!Object.hasOwn(m.files, path)) return null;
    if (cache.has(path)) { const p = cache.get(path); cache.delete(path); cache.set(path, p); return p; }
    const p = fetch(BASE + path + "?v=" + encodeURIComponent(m.version)).then(async r => {
      if (!r.ok) throw Error("Этот раздел словаря ещё не загружен. Подключитесь к интернету и повторите поиск.");
      const bytes = new Uint8Array(await r.arrayBuffer());
      const json = bytes[0] === 31 && bytes[1] === 139 ? fflate.strFromU8(fflate.gunzipSync(bytes)) : new TextDecoder().decode(bytes);
      return JSON.parse(json);
    }).catch(e => { cache.delete(path); throw e; });
    cache.set(path, p);
    // Bound memory on phones. Persistent offline storage is managed by the SW.
    while (cache.size > 24) cache.delete(cache.keys().next().value);
    return p;
  }
  const unpack = a => a ? ({ hz: a[0], py: a[1], ru: a[2], examples: a[3], lv: 0, pos: "", source: "bkrs" }) : null;
  async function records(ids) {
    const m = await manifest(), groups = new Map(), result = new Map();
    for (const id of ids) { const key = Math.floor(id / m.chunkSize); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(id); }
    const jobs = [...groups]; let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
      while (next < jobs.length) {
        const [key, members] = jobs[next++], rows = await read(`entries/${key}.json.gz`);
        for (const id of members) result.set(id, unpack(rows[id % m.chunkSize]));
      }
    }));
    return ids.map(id => result.get(id)).filter(Boolean);
  }
  async function chineseIndex(q) { return q ? (await read(`zh/${q.codePointAt(0).toString(16)}.json.gz`) || []) : []; }
  async function lookup(q) {
    const row = (await chineseIndex(q)).find(r => r[0] === q);
    return row ? (await records([row[1]]))[0] : null;
  }
  async function postings(kind, query) {
    const m = await manifest(), n = kind === "ru" ? 3 : 2;
    const paths = query.length >= n ? [m.indexes[kind][query.slice(0, n)]].filter(Boolean)
      : Object.entries(m.indexes[kind]).filter(([p]) => p.startsWith(query)).map(([, p]) => p);
    const exact = [], prefix = [];
    for (const path of paths) {
      const index = await read(path);
      for (const [term, ids] of Object.entries(index)) {
        if (term === query) { for (const id of ids) exact.push(id); }
        else if (term.startsWith(query)) { for (const id of ids) prefix.push(id); }
      }
    }
    return { exact, prefix };
  }
  async function search(q, limit = 60) {
    q = q.trim(); if (!q) return [];
    if (/\p{Script=Han}/u.test(q)) {
      const rows = (await chineseIndex(q)).filter(r => r[0].startsWith(q));
      return records(rows.slice(0, limit).map(r => r[1]));
    }
    let ids;
    if (/[а-яё]/i.test(q)) {
      const tokens = normalizeRussian(q).match(/[а-я]{3,}/g) || [];
      if (!tokens.length) return [];
      const lists = [];
      for (const token of [...new Set(tokens)]) {
        const p = await postings("ru", token);
        lists.push([...new Set(p.exact.concat(p.prefix))]);
      }
      const rest = lists.slice(1).map(a => new Set(a));
      ids = lists[0].filter(id => rest.every(s => s.has(id)));
    } else {
      const py = normalizePinyin(q); if (!py) return [];
      const p = await postings("py", py);
      ids = p.exact.concat(p.prefix.sort((a, b) => a - b));
    }
    return records([...new Set(ids)].slice(0, limit));
  }
  async function character(c) {
    if ([...c].length !== 1 || !/\p{Script=Han}/u.test(c)) return null;
    const data = await read(`chars/${(c.codePointAt(0) >> 8).toString(16)}.json.gz`);
    return data?.[c] || null;
  }
  return { manifest, lookup, search, character, normalizePinyin, normalizeRussian };
})();
