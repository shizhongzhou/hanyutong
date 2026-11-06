"use strict";

/* Provider credentials and usage checks live behind the cloud endpoint. */
const HanyuAI = (() => {
  const api = 'https://d5du0ehkavrgcuf0765l.3rspsmhh.apigw.yandexcloud.net/ai';
  const defaults = Object.freeze({ enabled: false, visionEnabled: false, ttsEnabled: false, asrEnabled: false, assessmentEnabled: false, feedbackEnabled: false, maxInputChars: 2000 });
  const count = value => [...String(value || '')].length;
  const clip = (value, length) => [...String(value || '')].slice(0, length).join('');
  const MAX_AUDIO_BYTES = 3 * 1024 * 1024, MAX_RECORDING_MS = 30000, MAX_SPEECH_CHARS = 300;
  const error = code => Object.assign(new Error(code), { code });
  const messages = {
    empty_text: 'Напишите сообщение или сначала распознайте запись.',
    text_too_long: 'Сообщение слишком длинное. Разделите его на несколько частей.',
    invalid_input: 'Проверьте сообщение и попробуйте ещё раз.',
    ai_disabled: 'Собеседник пока недоступен. Попробуйте позже.',
    ai_not_configured: 'Собеседник пока недоступен. Попробуйте позже.',
    chat_disabled: 'Собеседник пока недоступен. Попробуйте позже.',
    chat_unavailable: 'Собеседник сейчас не отвечает. Попробуйте позже.',
    ai_unavailable: 'Собеседник сейчас не отвечает. Попробуйте позже.',
    provider_error: 'Не удалось получить ответ. Попробуйте позже.',
    upstream_error: 'Не удалось получить ответ. Попробуйте позже.',
    provider_busy: 'Сервис сейчас занят. Подождите немного.',
    asr_disabled: 'Распознавание речи пока недоступно. Можно написать сообщение.',
    asr_unavailable: 'Не удалось распознать запись. Попробуйте позже.',
    transcription_unavailable: 'Не удалось распознать запись. Попробуйте позже.',
    tts_disabled: 'Озвучивание пока недоступно.',
    tts_unavailable: 'Не удалось получить озвучивание. Попробуйте позже.',
    speech_unavailable: 'Не удалось получить озвучивание. Попробуйте позже.',
    invalid_audio: 'Не удалось прочитать запись. Запишите короткую фразу ещё раз.',
    audio_too_large: 'Запись слишком большая. Запишите более короткую фразу.',
    audio_unsupported: 'Запись голоса не поддерживается в этом браузере. Можно написать сообщение.',
    microphone_denied: 'Разрешите доступ к микрофону в настройках браузера или напишите сообщение.',
    microphone_unavailable: 'Не удалось включить микрофон. Проверьте его подключение.',
    no_speech: 'Речь не распознана. Произнесите фразу ближе к микрофону.',
    no_text_found: 'Речь не распознана. Произнесите фразу ближе к микрофону.',
    daily_limit: 'Лимит на сегодня исчерпан. Попробуйте завтра.',
    monthly_limit: 'Лимит на этот месяц исчерпан. Попробуйте позже.',
    rate_limit: 'Слишком много запросов. Подождите немного.',
    quota_exceeded: 'Лимит сейчас исчерпан. Попробуйте позже.',
    usage_unavailable: 'Сервис временно недоступен. Попробуйте позже.',
    credentials_unavailable: 'Сервис временно недоступен. Попробуйте позже.',
    not_configured: 'Эта возможность пока недоступна.',
    body_too_large: 'Запрос слишком большой. Сократите сообщение или запись.',
    invalid_response: 'Не удалось получить результат. Попробуйте ещё раз.',
    feedback_disabled: 'Отправка замечаний пока недоступна. Попробуйте позже.',
    feedback_unavailable: 'Не удалось отправить замечание или подтвердить его сохранение. Оно могло уже поступить; повторите позже только при необходимости.',
    feedback_limit: 'Лимит замечаний пока исчерпан. Попробуйте позже.',
    consent_required: 'Подтвердите отправку выбранного вопроса и ответа.',
    assessment_disabled: 'Проверка пока недоступна. Попробуйте позже.',
    timeout: 'Ответ занимает слишком много времени. Попробуйте ещё раз.',
    request_timeout: 'Ответ занимает слишком много времени. Попробуйте ещё раз.',
    offline: 'Нет связи с сервисом. Проверьте интернет и попробуйте ещё раз.'
  };
  function message(err) { return messages[err?.code] || (err?.status === 429 ? messages.rate_limit : err?.status === 413 ? messages.body_too_large : messages.upstream_error); }
  async function request(path, body, signal, fetcher = fetch) {
    if (signal?.aborted) throw error('aborted');
    const controller = new AbortController(), abort = () => controller.abort();
    let timedOut = false;
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, path === '/config' ? 10000 : 75000);
    try {
      const response = await fetcher(api + path, { method: body === undefined ? 'GET' : 'POST',
        credentials: 'omit', cache: 'no-store', headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal });
      let data;
      try { data = await response.json(); } catch (_) { throw error('invalid_response'); }
      if (!response.ok) throw Object.assign(error(typeof data?.error === 'string' ? data.error : 'upstream_error'), { status: response.status });
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw error('invalid_response');
      return data;
    } catch (err) {
      if (signal?.aborted) throw error('aborted');
      if (timedOut) throw error('timeout');
      throw err?.code ? err : error('offline');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  async function config(signal) {
    const data = await request('/config', undefined, signal);
    return { enabled: data.enabled === true, visionEnabled: data.visionEnabled === true, ttsEnabled: data.ttsEnabled === true,
      asrEnabled: data.asrEnabled === true, assessmentEnabled: data.assessmentEnabled === true, feedbackEnabled: data.feedbackEnabled === true,
      maxInputChars: Number.isSafeInteger(data.maxInputChars) && data.maxInputChars > 0 ? Math.min(2000, data.maxInputChars) : 2000 };
  }
  const boundedText = (value, limit) => typeof value === 'string' && count(value) <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) ? value.trim() : '';
  function structuredReply(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const reply = { zh: boundedText(value.zh, 3000), pinyin: boundedText(value.pinyin, 4000), ru: boundedText(value.ru, 5000), explanationRu: boundedText(value.explanationRu, 6000), corrections: [], newWords: [] };
    if (!reply.zh && !reply.ru && !reply.explanationRu) return null;
    for (const item of (Array.isArray(value.corrections) ? value.corrections : []).slice(0, 8)) {
      if (!item || !['grammar', 'word'].includes(item.kind)) continue;
      const correction = { original: boundedText(item.original, 500), corrected: boundedText(item.corrected, 500), explanationRu: boundedText(item.explanationRu, 1500), kind: item.kind };
      if (correction.original && correction.corrected && correction.explanationRu) reply.corrections.push(correction);
    }
    for (const item of (Array.isArray(value.newWords) ? value.newWords : []).slice(0, 2)) {
      if (!item) continue;
      const word = { hz: boundedText(item.hz, 30), py: boundedText(item.py, 150), ru: boundedText(item.ru, 500) };
      if (/\p{Script=Han}/u.test(word.hz) && word.py && word.ru) reply.newWords.push(word);
    }
    return reply;
  }
  let pendingDraft = null;
  function setDraft(text, mode = 'explain') {
    if (typeof text !== 'string' || !text.trim() || count(text) > 20000) return false;
    pendingDraft = { text: text.trim(), mode: mode === 'dialogue' ? 'dialogue' : 'explain' }; return true;
  }
  function takeDraft() { const draft = pendingDraft; pendingDraft = null; return draft; }
  function learningProfile(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const contact = /(?:https?:\/\/|www\.|[^\s@]+@[^\s@]+\.[^\s@]+|\+?\d[\d ().-]{7,}\d)/iu;
    const field = (name, length, limit) => [...new Set((Array.isArray(value[name]) ? value[name] : []).map(item => boundedText(item, limit)).filter(item => item && !contact.test(item)))].slice(0, length);
    const profile = { knownWords: field('knownWords', 40, 20), grammarErrors: field('grammarErrors', 10, 120), toneErrors: field('toneErrors', 10, 60) };
    return Object.values(profile).some(items => items.length) ? profile : undefined;
  }
  async function tasks(signal) {
    const data = await request('/tasks', undefined, signal);
    if (!Array.isArray(data.tasks) || data.tasks.length > 100) throw error('invalid_response');
    return data.tasks.map(task => {
      if (!task || !['writing', 'speaking', 'grammar'].includes(task.mode) || !boundedText(task.id, 100) || !Number.isInteger(task.level) || task.level < 1 || task.level > 9 || !boundedText(task.titleRu, 300) || !boundedText(task.promptRu, 3000) || !Array.isArray(task.criteria) || !task.criteria.length || task.criteria.length > 10 || !Number.isFinite(task.maxScore) || task.maxScore <= 0) throw error('invalid_response');
      const criteria = task.criteria.map(item => {
        if (!item || !boundedText(item.id, 100) || !boundedText(item.labelRu, 300) || !Number.isFinite(item.maxScore) || item.maxScore <= 0) throw error('invalid_response');
        return { id: item.id, labelRu: item.labelRu, maxScore: item.maxScore };
      });
      if (new Set(criteria.map(item => item.id)).size !== criteria.length || Math.abs(criteria.reduce((sum, item) => sum + item.maxScore, 0) - task.maxScore) > 0.000001) throw error('invalid_response');
      return { id: task.id, mode: task.mode, level: task.level, titleRu: task.titleRu, promptZh: boundedText(task.promptZh, 3000), promptRu: task.promptRu, maxScore: task.maxScore, criteria };
    });
  }
  async function assess(task, answer, signal) {
    if (!task || !['writing', 'speaking', 'grammar'].includes(task.mode) || !boundedText(task.id, 100) || !boundedText(answer, 2000)) throw error('invalid_input');
    const result = await request('/assess', { mode: task.mode, taskId: task.id, answer }, signal);
    if (result.taskId !== task.id || result.mode !== task.mode || result.level !== task.level || result.maxScore !== task.maxScore || !Number.isFinite(result.score) || result.score < 0 || result.score > result.maxScore || !boundedText(result.feedbackRu, 6000) || !Array.isArray(result.criteria) || result.criteria.length !== task.criteria.length || result.assessmentScope !== (task.mode === 'speaking' ? 'text_content_only' : 'written_text')) throw error('invalid_response');
    const triple = value => ({ zh: boundedText(value?.zh, 3000), pinyin: boundedText(value?.pinyin, 4000), ru: boundedText(value?.ru, 5000) });
    const criteria = result.criteria.map((item, index) => {
      const expected = task.criteria[index];
      if (!item || item.id !== expected.id || item.maxScore !== expected.maxScore || !Number.isFinite(item.score) || item.score < 0 || item.score > expected.maxScore || !boundedText(item.feedbackRu, 2000)) throw error('invalid_response');
      return { id: expected.id, labelRu: expected.labelRu, maxScore: expected.maxScore, score: item.score, feedbackRu: item.feedbackRu };
    });
    if (Math.abs(criteria.reduce((sum, item) => sum + item.score, 0) - result.score) > 0.000001) throw error('invalid_response');
    return { taskId: task.id, mode: task.mode, level: task.level, score: result.score, maxScore: task.maxScore, criteria,
      feedbackRu: result.feedbackRu, rewrite: triple(result.rewrite), sample: triple(result.sample), noticeRu: boundedText(result.noticeRu, 1000), assessmentScope: result.assessmentScope };
  }
  function contextMessages(history, text, limit = 2000) {
    text = String(text || '').trim();
    if (!text) throw error('empty_text');
    if (count(text) > limit) throw error('text_too_long');
    const pairs = [];
    for (let i = 0; i + 1 < history.length; i += 2) {
      if (history[i]?.role !== 'user' || history[i + 1]?.role !== 'assistant' || typeof history[i].content !== 'string' || typeof history[i + 1].content !== 'string') continue;
      if (count(history[i].content) > 2000) continue;
      const reply = history[i + 1].content;
      const contextReply = count(reply) > 2000 ? clip(reply, 1950) + '\n[Часть предыдущего ответа опущена.]' : reply;
      pairs.push([{ role: 'user', content: history[i].content }, { role: 'assistant', content: contextReply }]);
    }
    while (pairs.length > 5) pairs.shift();
    let size = count(text) + pairs.flat().reduce((sum, item) => sum + count(item.content), 0);
    while (size > 8000 && pairs.length) size -= pairs.shift().reduce((sum, item) => sum + count(item.content), 0);
    return [...pairs.flat(), { role: 'user', content: text }];
  }
  const explanationCache = new Map(), CACHE_TTL_MS = 15 * 60 * 1000, CACHE_MAX_ENTRIES = 20;
  const cloneAnswer = answer => JSON.parse(JSON.stringify(answer));
  function removeExplanation(key) { const entry = explanationCache.get(key); if (entry) clearTimeout(entry.timer); explanationCache.delete(key); }
  function cachedExplanation(key) {
    const now = Date.now();
    for (const [candidate, entry] of explanationCache) if (now - entry.createdAt >= CACHE_TTL_MS || now < entry.createdAt) removeExplanation(candidate);
    const entry = explanationCache.get(key); if (!entry) return null;
    explanationCache.delete(key); explanationCache.set(key, entry); return cloneAnswer(entry.answer);
  }
  function rememberExplanation(key, answer) {
    removeExplanation(key); const entry = { createdAt: Date.now(), answer: cloneAnswer(answer), timer: null };
    entry.timer = setTimeout(() => { if (explanationCache.get(key) === entry) removeExplanation(key); }, CACHE_TTL_MS);
    explanationCache.set(key, entry);
    while (explanationCache.size > CACHE_MAX_ENTRIES) removeExplanation(explanationCache.keys().next().value);
  }
  async function chat(history, text, mode, level, signal, limit = 2000, profile) {
    if (signal?.aborted) throw error('aborted');
    if (!['dialogue', 'explain'].includes(mode) || !Number.isInteger(level) || level < 1 || level > 9) throw error('invalid_input');
    const localProfile = learningProfile(profile);
    const body = { messages: contextMessages(history, text, limit), mode, level, ...(localProfile ? { profile: localProfile } : {}) };
    const cacheKey = mode === 'explain' && history.length === 0 ? JSON.stringify(body) : null;
    if (cacheKey) { const cached = cachedExplanation(cacheKey); if (cached) return cached; }
    const result = await request('/chat', body, signal);
    if (signal?.aborted) throw error('aborted');
    if (typeof result.text !== 'string' || !result.text.trim() || result.text.length > 50000) throw error('invalid_response');
    const answer = { text: result.text, reply: structuredReply(result.reply), truncated: result.truncated === true };
    if (cacheKey && !answer.truncated) rememberExplanation(cacheKey, answer);
    return cloneAnswer(answer);
  }
  async function feedback(prompt, answer, reason, signal) {
    if (!boundedText(prompt, 2000) || !boundedText(answer, 12000) || !['incorrect', 'unclear', 'wrong_level', 'other'].includes(reason)) throw error('invalid_input');
    const result = await request('/feedback', { prompt, answer, reason, consent: true }, signal);
    if (result.ok !== true && result.saved !== true) throw error('invalid_response');
    return result;
  }
  function chineseLines(text) {
    const lines = [], seen = new Set();
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = (raw.match(/[\p{Script=Han}0-9０-９，。！？、；：…“”‘’（）《》「」『』,.!?;:\s]+/gu) || [])
        .map(part => part.trim()).filter(part => /\p{Script=Han}/u.test(part)).join(' ').trim();
      if (!line || count(line) > MAX_SPEECH_CHARS || seen.has(line)) continue;
      seen.add(line); lines.push(line);
      if (lines.length === 8) break;
    }
    return lines;
  }
  function encodeBase64(bytes) {
    let binary = ''; for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(binary);
  }
  function wavFromBuffer(buffer) {
    if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0 || !Number.isFinite(buffer.sampleRate) || buffer.sampleRate < 8000 || !Number.isInteger(buffer.numberOfChannels) || buffer.numberOfChannels < 1 || buffer.numberOfChannels > 8) throw error('invalid_audio');
    const rate = 16000, frames = Math.min(30 * rate, Math.floor(buffer.duration * rate)), data = new ArrayBuffer(44 + frames * 2), view = new DataView(data);
    if (frames < 1) throw error('invalid_audio');
    const write = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
    write(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); write(8, 'WAVE'); write(12, 'fmt '); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, frames * 2, true);
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    if (channels.some(channel => !channel || !channel.length)) throw error('invalid_audio');
    for (let i = 0; i < frames; i++) {
      const position = i * buffer.sampleRate / rate, first = Math.floor(position), fraction = position - first;
      let sample = 0;
      for (const channel of channels) {
        const left = channel[Math.min(first, channel.length - 1)], right = channel[Math.min(first + 1, channel.length - 1)];
        sample += (left + (right - left) * fraction) / channels.length;
      }
      sample = Number.isFinite(sample) ? Math.max(-1, Math.min(1, sample)) : 0;
      view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    }
    return new Uint8Array(data);
  }
  async function prepareRecording(blob) {
    if (!blob || !blob.size) throw error('invalid_audio');
    if (blob.size > MAX_AUDIO_BYTES) throw error('audio_too_large');
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw error('audio_unsupported');
    const context = new AudioContextClass();
    try {
      const decoded = await context.decodeAudioData(await blob.arrayBuffer()), bytes = wavFromBuffer(decoded);
      return { audio: encodeBase64(bytes), mimeType: 'audio/wav', blob: new Blob([bytes], { type: 'audio/wav' }) };
    } catch (err) { throw err?.code ? err : error('invalid_audio'); }
    finally { await context.close().catch(() => {}); }
  }
  async function transcribe(recording, signal) {
    if (!recording || typeof recording.audio !== 'string' || recording.mimeType !== 'audio/wav') throw error('invalid_audio');
    const result = await request('/transcribe', { audio: recording.audio, mimeType: recording.mimeType }, signal);
    if (typeof result.text !== 'string' || result.text.length > 20000) throw error('invalid_response');
    if (!result.text.trim()) throw error('no_speech');
    return { text: result.text };
  }
  async function speech(text, signal) {
    if (!String(text || '').trim() || count(text) > MAX_SPEECH_CHARS) throw error('text_too_long');
    const result = await request('/speech', { text }, signal);
    if (!['audio/wav', 'audio/mpeg'].includes(result.mimeType) || typeof result.audio !== 'string' || !result.audio || result.audio.length > 8 * 1024 * 1024 || result.audio.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(result.audio)) throw error('invalid_response');
    let binary; try { binary = atob(result.audio); } catch (_) { throw error('invalid_response'); }
    if (btoa(binary) !== result.audio) throw error('invalid_response');
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    if ((result.mimeType === 'audio/wav' && (binary.slice(0, 4) !== 'RIFF' || binary.slice(8, 12) !== 'WAVE')) || (result.mimeType === 'audio/mpeg' && binary.slice(0, 3) !== 'ID3' && !(bytes[0] === 255 && (bytes[1] & 224) === 224))) throw error('invalid_response');
    return new Blob([bytes], { type: result.mimeType });
  }
  return { defaults, count, clip, error, message, request, config, structuredReply, setDraft, takeDraft, learningProfile, tasks, assess, contextMessages, chat, feedback, chineseLines, wavFromBuffer, prepareRecording, transcribe, speech, MAX_AUDIO_BYTES, MAX_RECORDING_MS };
})();

async function pageAI(initialMode) {
  const assessmentPage = ['writing', 'speaking', 'grammar', 'oral'].includes(initialMode);
  const draft = assessmentPage ? null : HanyuAI.takeDraft();
  let active = true, mode = assessmentPage ? (initialMode === 'oral' ? 'speaking' : initialMode) : (draft?.mode || (initialMode === 'explain' ? 'explain' : 'dialogue')), settings = { ...HanyuAI.defaults };
  let loading = true, configured = false, busy = '', revision = 0, audioRevision = 0, micRevision = 0;
  let configController = null, configRevision = 0, history = [], recorder = null, stream = null, recording = null;
  let assessmentTasks = [], selectedTask = null;
  let recordingTimer = null, displayTimer = null, recordStarted = 0, playback = null, playbackUrl = '', clipUrl = '';
  const controllers = new Set(), chineseReplies = [];
  const starters = {
    dialogue: [
      ['Знакомство', 'Давай познакомимся по-китайски. Задавай по одному вопросу, дождись моего ответа и мягко исправляй ошибки.'],
      ['В кафе', 'Давай разыграем заказ напитка в китайском кафе. Ты бариста, а я покупатель. Начни с короткой китайской реплики.'],
      ['Путешествие', 'Потренируем диалог: я спрашиваю дорогу в Китае. Ты прохожий. Говори коротко, по уровню HSK.']
    ],
    explain: [
      ['Разобрать фразу', 'Объясни по-русски фразу 我想学好中文: значения слов, грамматику и когда её можно сказать. Добавь пиньинь и примеры.'],
      ['Похожие слова', 'Объясни по-русски разницу между 会、能 и 可以. Дай понятные примеры с пиньинем и маленькую ситуацию для практики.'],
      ['Проверить фразу', 'Я написал: 我是学习汉语。Объясни по-русски, что здесь исправить и почему. Покажи правильную фразу с пиньинем.']
    ]
  };
  app.innerHTML = `${topbar(assessmentPage ? 'Проверка заданий' : 'AI-собеседник', '#/learn')}<section class="ai-tutor">
    <p class="sub ai-intro">${assessmentPage ? 'Выполните учебное задание и получите разбор по понятным критериям.' : 'Практикуйте китайский: знакомые слова, немного нового и объяснения по-русски.'}</p>
    <nav class="ai-feature-links" aria-label="Практика с AI"><a href="#/assess/writing">Письмо<small>Проверить текст</small></a><a href="#/assess/speaking">Устный ответ<small>Разобрать содержание</small></a><a href="#/pronunciation">Произношение<small>Потренировать тоны</small></a></nav>
    <div class="seg ai-tabs" aria-label="Режим собеседника" ${assessmentPage ? 'hidden' : ''}><button id="ai-dialogue" aria-pressed="${mode === 'dialogue'}">Диалог</button><button id="ai-explain" aria-pressed="${mode === 'explain'}">Объяснение</button></div>
    <div class="seg ai-tabs" aria-label="Вид задания" ${assessmentPage ? '' : 'hidden'}><button id="ai-assess-writing">Письмо</button><button id="ai-assess-speaking">Устный ответ</button><button id="ai-assess-grammar">Грамматика</button></div>
    <div class="ai-settings"><label for="ai-level">Мой уровень <select id="ai-level" aria-label="Уровень китайского">${Array.from({ length: 9 }, (_, i) => `<option value="${i + 1}">HSK ${i + 1}</option>`).join('')}</select></label><button id="ai-reset">Новый разговор</button></div>
    <div id="ai-task-panel" class="ai-task-panel" ${assessmentPage ? '' : 'hidden'}><label for="ai-task">Учебное задание</label><select id="ai-task" aria-label="Выберите задание"></select><div id="ai-task-details"></div><p id="ai-assessment-notice" class="hint"></p></div>
    <div id="ai-service" class="ai-service" role="status">Подключаем собеседника…</div><button id="ai-reconnect" class="ai-reconnect" hidden>Попробовать подключиться снова</button>
    <div id="ai-empty" class="ai-welcome"><span class="ai-welcome-icon">${ic('chat')}</span><h2 id="ai-welcome-title">Начнём разговор?</h2><p id="ai-welcome-note">Выберите ситуацию или напишите свою первую реплику.</p></div>
    <div id="ai-starters" class="ai-starters" aria-label="С чего начать">${[0, 1, 2].map(i => `<button id="ai-starter-${i}"></button>`).join('')}</div>
    <div id="ai-messages" class="ai-messages" role="log" aria-label="Разговор" aria-live="polite" aria-relevant="additions"></div>
    <div class="ai-composer"><label id="ai-input-label" for="ai-input">Ваше сообщение</label><textarea id="ai-input" placeholder="Напишите по-китайски или по-русски…" aria-describedby="ai-count ai-privacy" spellcheck="false"></textarea><div class="ai-composer-bottom"><span>中文 ↔ Русский</span><span id="ai-count">0 / 2 000</span></div></div>
    <div id="ai-mic-panel" class="ai-mic-panel" hidden><div class="ai-mic-actions"><button id="ai-record" class="btn ghost">${ic('mic')} Записать голос</button><button id="ai-stop" class="btn ghost" hidden>Остановить</button><span id="ai-record-time" aria-live="off"></span></div><p class="hint ai-mic-note">До 30 секунд. Запись отправляется в Qwen (Alibaba Cloud) только после нажатия «Распознать запись».</p><div id="ai-recording" class="ai-recording" hidden><audio id="ai-recording-player" controls controlsList="nodownload noremoteplayback" disableRemotePlayback preload="metadata"></audio><div class="ai-recording-actions"><button id="ai-recognize" class="btn ghost">Распознать запись</button><button id="ai-discard">Убрать запись</button></div></div></div>
    <p id="ai-voice-note" class="hint ai-voice-note" hidden>Голосовой ввод пока недоступен. Можно написать сообщение.</p>
    <button id="ai-send" class="btn" disabled>Отправить</button><div id="ai-status" class="ai-status" role="status" aria-live="polite"></div>
    <p id="ai-privacy" class="hint ai-privacy">${assessmentPage ? 'Задание и ваш ответ отправляются в DeepSeek только после нажатия «Проверить ответ». Ответ и разбор хранятся только пока открыт этот экран.' : 'Сообщения отправляются в DeepSeek только после нажатия «Отправить». Вместе с ними передаются до 40 изученных слов и короткие записи об ошибках из учебного профиля на этом устройстве. Новые слова добавляются по вашему выбору; исправления сохраняются в учебном профиле устройства. Сам разговор хранится только пока открыт этот экран.'} Ответы AI могут содержать ошибки.</p>
    <p id="ai-speech-note" class="hint ai-privacy" hidden>Китайские фразы отправляются в Qwen (Alibaba Cloud) для озвучивания только по нажатию на кнопку прослушивания.</p>
    ${assessmentPage ? '' : '<p class="hint ai-privacy">Первое объяснение может оставаться в памяти приложения до 15 минут для повторного обращения. На устройство и в облачную историю оно не записывается.</p>'}
    <p class="hint ai-privacy">Если вы решите сообщить об ошибке AI, выбранные вопрос, ответ и причина будут сохранены в облаке только после отдельного согласия и нажатия «Отправить замечание».</p>
  </section>`;
  const el = id => $('#ai-' + id), input = el('input'), level = el('level'), log = el('messages');
  const status = (text = '', failed = false) => { el('status').textContent = text; el('status').className = 'ai-status' + (failed ? ' is-error' : ''); };
  const controller = () => { const c = new AbortController(); controllers.add(c); return c; };
  const micSupported = () => !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
  function stopPlayback() {
    audioRevision++; if (playback) { playback.pause(); playback.removeAttribute('src'); playback.load?.(); playback = null; }
    if (playbackUrl) URL.revokeObjectURL(playbackUrl); playbackUrl = '';
  }
  function cancel() { revision++; controllers.forEach(c => c.abort()); controllers.clear(); busy = ''; stopPlayback();
    for (const item of history) if (item.feedback?.sending) { item.feedback.sending = false; item.feedback.error = 'Отправка прервана. Замечание могло уже поступить; повторяйте только при необходимости.'; }
  }
  function releaseStream() { if (stream) stream.getTracks().forEach(track => track.stop()); stream = null; }
  function clearRecordTimers() { clearTimeout(recordingTimer); clearInterval(displayTimer); recordingTimer = displayTimer = null; }
  function stopMicrophone(discard = false) {
    if (discard) micRevision++;
    clearRecordTimers(); if (recorder?.state === 'recording') recorder.stop(); releaseStream();
    if (discard) recorder = null;
  }
  function discardRecording() {
    recording = null; el('recording-player').pause(); el('recording-player').removeAttribute('src'); el('recording-player').load?.();
    if (clipUrl) URL.revokeObjectURL(clipUrl); clipUrl = ''; el('recording').hidden = true;
  }
  function refresh() {
    const length = HanyuAI.count(input.value.trim()), valid = length > 0 && length <= settings.maxInputChars;
    el('count').textContent = `${length.toLocaleString('ru-RU')} / ${settings.maxInputChars.toLocaleString('ru-RU')}`;
    el('count').className = length > settings.maxInputChars ? 'is-over-limit' : '';
    el('send').disabled = loading || !!busy || !(assessmentPage ? settings.assessmentEnabled && selectedTask : settings.enabled) || !valid;
    el('send').textContent = busy === 'chat' ? (assessmentPage ? 'Проверяем ответ…' : 'Собеседник отвечает…') : assessmentPage ? 'Проверить ответ' : 'Отправить';
    el('record').disabled = loading || !!busy || !settings.asrEnabled; el('record').hidden = busy === 'record'; el('stop').hidden = busy !== 'record';
    el('recognize').disabled = loading || !!busy || !settings.asrEnabled || !recording; el('recognize').textContent = busy === 'asr' ? 'Распознаём…' : 'Распознать запись';
    for (const { button } of chineseReplies) button.disabled = !!busy || !settings.ttsEnabled;
    el('mic-panel').hidden = !settings.asrEnabled || !micSupported(); el('voice-note').hidden = loading || (settings.asrEnabled && micSupported());
    el('voice-note').textContent = settings.asrEnabled && !micSupported() ? HanyuAI.message({ code: 'audio_unsupported' }) : 'Голосовой ввод пока недоступен. Можно написать сообщение.';
    el('speech-note').hidden = !settings.ttsEnabled;
    el('empty').hidden = assessmentPage || history.length > 0 || busy === 'chat'; el('starters').hidden = assessmentPage || history.length > 0 || busy === 'chat';
    for (let i = 0; i < 3; i++) el('starter-' + i).disabled = !!busy;
  }
  function service() {
    const available = assessmentPage ? settings.assessmentEnabled : settings.enabled;
    el('service').hidden = configured && available;
    el('service').textContent = loading ? 'Подключаем сервис…' : !configured ? 'Не удалось подключиться. Проверьте интернет.' : HanyuAI.message({ code: assessmentPage ? 'assessment_disabled' : 'ai_disabled' });
    el('reconnect').hidden = loading || (configured && available);
  }
  function modeLabels() {
    el('dialogue').setAttribute('aria-pressed', String(mode === 'dialogue')); el('explain').setAttribute('aria-pressed', String(mode === 'explain'));
    for (const kind of ['writing', 'speaking', 'grammar']) el('assess-' + kind).setAttribute('aria-pressed', String(mode === kind));
    if (assessmentPage) {
      el('reset').textContent = 'Начать заново'; el('input-label').textContent = mode === 'speaking' ? 'Текст вашего устного ответа' : 'Ваш ответ по-китайски';
      el('assessment-notice').textContent = mode === 'speaking' ? 'Проверяем содержание распознанного или введённого текста. Произношение, беглость и тоны здесь не оцениваются. Это учебная практика, не официальный балл HSK.' : 'Это учебная проверка по критериям задания, не официальный балл экзамена HSK.';
      return;
    }
    el('welcome-title').textContent = mode === 'explain' ? 'Разберём по шагам' : 'Начнём разговор?';
    el('welcome-note').textContent = mode === 'explain' ? 'Спросите о слове, грамматике или ситуации. Объяснение будет по-русски, с китайскими примерами.' : 'Выберите ситуацию или напишите свою первую реплику.';
    el('input-label').textContent = mode === 'explain' ? 'Что объяснить?' : 'Ваше сообщение';
    for (let i = 0; i < 3; i++) el('starter-' + i).textContent = starters[mode][i][0];
  }
  async function loadConfig() {
    configController?.abort(); const c = new AbortController(), token = ++configRevision; configController = c; loading = true; service(); refresh();
    try { const [next, tasks] = await Promise.all([HanyuAI.config(c.signal), assessmentPage ? HanyuAI.tasks(c.signal) : Promise.resolve([])]); if (!active || token !== configRevision) return; settings = next; assessmentTasks = tasks; configured = true; if (assessmentPage) renderTasks(true); }
    catch (_) { if (!active || token !== configRevision) return; settings = { ...HanyuAI.defaults }; configured = false; }
    finally { if (active && token === configRevision) { loading = false; configController = null; service(); refresh(); renderHistory(); } }
  }
  async function playChinese(text) {
    if (!active || busy || !settings.ttsEnabled) return;
    stopPlayback(); const token = revision, soundToken = audioRevision, c = controller(); busy = 'speech'; status('Подготавливаем озвучивание…'); refresh();
    try {
      const blob = await HanyuAI.speech(text, c.signal); if (!active || token !== revision || soundToken !== audioRevision) return;
      playbackUrl = URL.createObjectURL(blob); playback = new Audio(playbackUrl);
      playback.onended = () => { if (active && soundToken === audioRevision) { stopPlayback(); status(); } };
      playback.onerror = () => { if (active && soundToken === audioRevision) { stopPlayback(); status('Не удалось воспроизвести звук.', true); } };
      await playback.play(); if (active && token === revision && soundToken === audioRevision) status('Слушайте китайскую фразу.');
    } catch (err) { if (active && token === revision && soundToken === audioRevision) { stopPlayback(); status(HanyuAI.message(err), true); } }
    finally { controllers.delete(c); if (active && token === revision) { busy = ''; refresh(); } }
  }
  function node(tag, className, text) {
    const element = document.createElement(tag); element.className = className || ''; if (text !== undefined) element.textContent = text; return element;
  }
  function section(parent, title, text, className = '') {
    if (!text) return;
    const area = node('section', 'ai-reply-section ' + className); area.append(node('h3', 'ai-reply-label', title), node('p', 'ai-message-text', text)); parent.append(area); return area;
  }
  function renderTasks(chooseAvailable = false) {
    if (!assessmentPage) return;
    const kindTasks = assessmentTasks.filter(task => task.mode === mode);
    if (chooseAvailable && !kindTasks.some(task => task.level === Number(level.value)) && kindTasks.length) level.value = String(kindTasks[0].level);
    const available = kindTasks.filter(task => task.level === Number(level.value)), select = el('task'), previous = selectedTask?.id;
    select.replaceChildren();
    for (const task of available) { const option = node('option', '', task.titleRu); option.value = task.id; select.append(option); }
    selectedTask = available.find(task => task.id === previous) || available[0] || null;
    select.disabled = !selectedTask; select.value = selectedTask?.id || '';
    if (!available.length) { const option = node('option', '', 'На этом уровне заданий пока нет'); option.value = ''; select.append(option); }
    renderTaskDetails();
  }
  function renderTaskDetails() {
    const details = el('task-details'); details.replaceChildren(); if (!selectedTask) return;
    section(details, 'Задание', selectedTask.promptRu);
    section(details, '中文', selectedTask.promptZh, 'is-chinese');
    const criteria = node('ul', 'ai-task-criteria');
    for (const criterion of selectedTask.criteria) criteria.append(node('li', '', `${criterion.labelRu} — до ${criterion.maxScore}`));
    details.append(node('p', 'ai-reply-label', `Критерии · максимум ${selectedTask.maxScore}`), criteria);
  }
  function renderStructured(article, item) {
    const reply = item.reply;
    section(article, '中文', reply.zh, 'is-chinese'); section(article, 'Пиньинь', reply.pinyin, 'is-pinyin');
    section(article, 'По-русски', reply.ru); section(article, 'Почему так', reply.explanationRu);
    if (reply.corrections.length) {
      const block = node('section', 'ai-corrections'); block.append(node('h3', 'ai-reply-label', 'Разберём ошибки'));
      for (const correction of reply.corrections) {
        const row = node('div', 'ai-correction'); row.append(node('span', 'ai-correction-kind', correction.kind === 'grammar' ? 'Грамматика' : 'Выбор слова'));
        row.append(node('del', 'ai-original', correction.original), node('p', 'ai-corrected', correction.corrected), node('p', 'ai-message-text', correction.explanationRu)); block.append(row);
      }
      article.append(block);
    }
    if (reply.newWords.length) {
      const block = node('section', 'ai-new-words'); block.append(node('h3', 'ai-reply-label', 'Немного новых слов'));
      item.addedWords ||= new Set();
      for (const word of reply.newWords) {
        const card = node('div', 'ai-new-word'), key = word.hz + '\n' + word.py, button = node('button', 'ai-add-word', item.addedWords.has(key) ? 'В словарике' : '+ В мой словарик'); button.type = 'button';
        card.append(node('b', 'ai-word-hz', word.hz), node('p', 'ai-word-pinyin', word.py), node('p', 'ai-word-ru', word.ru), button);
        button.disabled = item.addedWords.has(key) || typeof HanyuLearning === 'undefined' || typeof HanyuLearning.addWord !== 'function';
        if (typeof HanyuLearning === 'undefined' || typeof HanyuLearning.addWord !== 'function') button.textContent = 'Словарик пока недоступен';
        button.onclick = async () => {
          if (!active || button.disabled || typeof HanyuLearning === 'undefined') return;
          button.disabled = true; const token = revision;
          try { await Promise.resolve(HanyuLearning.addWord({ ...word })); item.addedWords.add(key); if (active && token === revision) button.textContent = 'В словарике'; }
          catch (_) { if (active && token === revision) { button.disabled = false; button.textContent = 'Попробовать ещё раз'; status('Не удалось сохранить слово на устройстве.', true); } }
        };
        block.append(card);
      }
      article.append(block);
    }
  }
  function renderAssessment(article, result) {
    const score = node('div', 'ai-assessment-score'); score.append(node('b', '', `${result.score} / ${result.maxScore}`), node('span', '', 'Учебная оценка по критериям')); article.append(score);
    const criteria = node('div', 'ai-assessment-criteria');
    for (const criterion of result.criteria) { const row = node('section', 'ai-assessment-criterion'); row.append(node('h3', 'ai-reply-label', `${criterion.labelRu} · ${criterion.score} / ${criterion.maxScore}`), node('p', 'ai-message-text', criterion.feedbackRu)); criteria.append(row); }
    article.append(criteria); section(article, 'Что улучшить', result.feedbackRu);
    for (const [key, title] of [['rewrite', 'Исправленный вариант'], ['sample', 'Пример ответа']]) {
      const part = result[key]; if (!part.zh && !part.ru) continue;
      const block = node('section', 'ai-assessment-example'); block.append(node('h3', 'ai-reply-label', title));
      if (part.zh) block.append(node('p', 'ai-message-text is-chinese', part.zh)); if (part.pinyin) block.append(node('p', 'ai-word-pinyin', part.pinyin)); if (part.ru) block.append(node('p', 'ai-message-text', part.ru)); article.append(block);
    }
    article.append(node('p', 'hint', result.assessmentScope === 'text_content_only' ? 'Оценено только содержание текста. Произношение, беглость и тоны не оценивались.' : 'Учебная проверка текста. Это не официальный результат HSK.'));
    if (result.noticeRu) article.append(node('p', 'hint', result.noticeRu));
  }
  function renderFeedback(article, item) {
    item.feedback ||= { open: false, consent: false, reason: 'incorrect', sending: false, sent: false, error: '' };
    const state = item.feedback, area = node('div', 'ai-feedback'), toggle = node('button', 'ai-feedback-toggle', state.sent ? 'Замечание отправлено' : 'Сообщить об ошибке ответа'); toggle.type = 'button';
    toggle.disabled = state.sent || !settings.feedbackEnabled; toggle.setAttribute('aria-expanded', String(state.open)); area.append(toggle);
    if (!settings.feedbackEnabled) area.append(node('p', 'ai-feedback-availability', 'Отправка замечаний пока недоступна.'));
    toggle.onclick = () => { if (!active || busy || toggle.disabled) return; state.open = !state.open; renderHistory(); refresh(); };
    if (state.open && !state.sent) {
      const form = node('div', 'ai-feedback-form'), reasonLabel = node('label', '', 'Что не так?'), reason = node('select', 'ai-feedback-reason'); reason.setAttribute('aria-label', 'Причина замечания');
      for (const [value, label] of [['incorrect', 'Ошибка в содержании'], ['unclear', 'Непонятное объяснение'], ['wrong_level', 'Не подходит по уровню'], ['other', 'Другая проблема']]) { const option = node('option', '', label); option.value = value; reason.append(option); }
      reason.value = state.reason; reason.onchange = () => { state.reason = reason.value; }; reasonLabel.append(reason); form.append(reasonLabel);
      const excerpt = HanyuAI.clip(item.content, 12000); section(form, 'Будет отправлен этот вопрос', item.prompt); section(form, 'Будет отправлен этот ответ', excerpt);
      if (HanyuAI.count(item.content) > 12000) form.append(node('p', 'hint', 'Показаны первые 12 000 символов ответа. Только этот фрагмент попадёт в замечание.'));
      const consentLabel = node('label', 'ai-feedback-consent'), consent = node('input'); consent.type = 'checkbox'; consent.checked = state.consent;
      consentLabel.append(consent, node('span', '', 'Разрешаю сохранить этот вопрос, ответ и причину замечания в облаке для проверки ошибки.')); form.append(consentLabel);
      const send = node('button', 'btn ghost ai-feedback-send', state.sending ? 'Отправляем…' : 'Отправить замечание'); send.type = 'button'; send.disabled = !state.consent || state.sending || !!busy;
      consent.onchange = () => { state.consent = consent.checked === true; send.disabled = !state.consent || state.sending || !!busy; }; form.append(send);
      if (state.error) form.append(node('p', 'ai-status is-error', state.error));
      send.onclick = async () => {
        if (!active || busy || !state.consent || state.sending || state.sent) return;
        cancel(); const token = revision, c = controller(); busy = 'feedback'; state.sending = true; state.error = ''; renderHistory(); refresh();
        try { await HanyuAI.feedback(item.prompt, excerpt, state.reason, c.signal); if (!active || token !== revision) return; state.sent = true; state.open = false; status('Спасибо. Замечание сохранено для проверки.'); }
        catch (err) { if (active && token === revision) state.error = HanyuAI.message(err); }
        finally { controllers.delete(c); if (active && token === revision) { state.sending = false; busy = ''; renderHistory(); refresh(); } }
      };
      area.append(form);
    }
    article.append(area);
  }
  function renderHistory(pendingText = '') {
    log.replaceChildren(); chineseReplies.length = 0;
    const visible = pendingText ? [...history, { role: 'user', content: pendingText }] : history;
    for (const item of visible) {
      const article = document.createElement('article'); article.className = 'ai-message is-' + item.role;
      const who = document.createElement('div'); who.className = 'ai-message-who'; who.textContent = item.role === 'user' ? 'Вы' : 'Собеседник';
      article.append(who);
      if (item.assessment) renderAssessment(article, item.assessment);
      else if (item.reply) renderStructured(article, item);
      else { const text = document.createElement('p'); text.className = 'ai-message-text'; text.textContent = item.content; article.append(text); }
      if (item.truncated) { const notice = document.createElement('p'); notice.className = 'hint'; notice.textContent = 'Ответ сокращён. Попросите продолжить.'; article.append(notice); }
      if (item.role === 'assistant' && settings.ttsEnabled) {
        const speechLines = HanyuAI.chineseLines(item.reply?.zh || (item.assessment ? [item.assessment.rewrite.zh, item.assessment.sample.zh].join('\n') : item.content));
        if (speechLines.length) {
          const group = document.createElement('div'); group.className = 'ai-speech-lines';
          for (const phrase of speechLines) {
            const button = document.createElement('button'); button.className = 'ai-speech-line'; button.type = 'button';
            button.textContent = '▶ ' + phrase; button.setAttribute('aria-label', 'Прослушать: ' + phrase); button.onclick = () => playChinese(phrase);
            chineseReplies.push({ button, phrase }); group.append(button);
          }
          article.append(group);
        }
      }
      if (item.role === 'assistant' && item.prompt && !item.assessment) renderFeedback(article, item);
      log.append(article);
    }
    el('empty').hidden = assessmentPage || visible.length > 0; el('starters').hidden = assessmentPage || visible.length > 0;
  }
  function newConversation(nextMode = mode) {
    cancel(); stopMicrophone(true); discardRecording(); mode = nextMode; history = []; input.value = ''; el('record-time').textContent = ''; modeLabels(); renderHistory(); status(); refresh();
  }
  el('dialogue').onclick = () => { if (!assessmentPage && mode !== 'dialogue') newConversation('dialogue'); };
  el('explain').onclick = () => { if (!assessmentPage && mode !== 'explain') newConversation('explain'); };
  for (const kind of ['writing', 'speaking', 'grammar']) el('assess-' + kind).onclick = () => { if (!assessmentPage || mode === kind) return; newConversation(kind); renderTasks(true); refresh(); };
  el('reset').onclick = () => newConversation();
  level.onchange = () => { newConversation(); if (assessmentPage) renderTasks(); refresh(); }; el('reconnect').onclick = loadConfig;
  el('task').onchange = () => { const task = assessmentTasks.find(task => task.id === el('task').value && task.mode === mode && task.level === Number(level.value)); newConversation(); selectedTask = task || null; renderTaskDetails(); refresh(); };
  for (let i = 0; i < 3; i++) el('starter-' + i).onclick = () => { if (!active || busy || assessmentPage) return; cancel(); input.value = starters[mode][i][1]; status(); refresh(); input.focus(); };
  input.oninput = () => {
    // Typing cancels a pending reply/transcript, but does not stop a recording.
    if (busy !== 'record' && busy !== 'microphone' && busy !== 'prepare') { cancel(); renderHistory(); }
    status(); refresh();
  };
  el('send').onclick = async () => {
    if (!active || busy || !(assessmentPage ? settings.assessmentEnabled && selectedTask : settings.enabled)) return;
    const text = input.value.trim();
    try { HanyuAI.contextMessages(history, text, settings.maxInputChars); } catch (err) { return status(HanyuAI.message(err), true); }
    cancel(); const token = revision, c = controller(); busy = 'chat'; renderHistory(text); status('Собеседник готовит ответ…'); refresh();
    try {
      if (assessmentPage) {
        const result = await HanyuAI.assess(selectedTask, text, c.signal); if (!active || token !== revision) return;
        history = [{ role: 'user', content: text }, { role: 'assistant', content: result.feedbackRu, assessment: result }]; input.value = ''; renderHistory(); status('Разбор готов. Можно написать новый вариант ответа.');
      } else {
        let profile;
        try { if (typeof HanyuLearning !== 'undefined' && typeof HanyuLearning.context === 'function') profile = HanyuAI.learningProfile(await Promise.resolve(HanyuLearning.context())); } catch (_) {}
        if (!active || token !== revision) return;
        const answer = await HanyuAI.chat(history, text, mode, Number(level.value), c.signal, settings.maxInputChars, profile);
        if (!active || token !== revision) return;
        if (answer.reply?.corrections.length && typeof HanyuLearning !== 'undefined' && typeof HanyuLearning.recordCorrections === 'function') {
          try { const saved = HanyuLearning.recordCorrections(answer.reply.corrections); if (saved?.catch) saved.catch(() => {}); } catch (_) {}
        }
        history.push({ role: 'user', content: text }, { role: 'assistant', content: answer.text, reply: answer.reply, prompt: text, truncated: answer.truncated }); input.value = ''; renderHistory(); status('Можно продолжить разговор.');
      }
    } catch (err) { if (active && token === revision) { renderHistory(); status(HanyuAI.message(err), true); } }
    finally { controllers.delete(c); if (active && token === revision) { busy = ''; refresh(); } }
  };
  el('record').onclick = async () => {
    if (!active || busy || !settings.asrEnabled || !micSupported()) return;
    cancel(); discardRecording(); const token = ++micRevision; busy = 'microphone'; status('Разрешите запись с микрофона.'); refresh();
    try {
      const opened = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      if (!active || token !== micRevision) { opened.getTracks().forEach(track => track.stop()); return; }
      stream = opened;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported?.(type));
      const current = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 64000 } : undefined); recorder = current;
      const chunks = []; let bytes = 0, failure = '';
      current.ondataavailable = event => {
        if (token !== micRevision || !active || !event.data?.size) return;
        bytes += event.data.size;
        if (bytes > HanyuAI.MAX_AUDIO_BYTES) { failure = 'audio_too_large'; stopMicrophone(); return; }
        chunks.push(event.data);
      };
      current.onerror = () => { if (!active || token !== micRevision) return; failure = 'microphone_unavailable'; stopMicrophone(); };
      current.onstop = async () => {
        if (!active || token !== micRevision) return; clearRecordTimers(); releaseStream();
        recorder = null; busy = 'prepare'; status('Подготавливаем запись…'); refresh();
        try {
          if (failure) throw HanyuAI.error(failure);
          const prepared = await HanyuAI.prepareRecording(new Blob(chunks, { type: current.mimeType || mimeType || 'audio/webm' }));
          if (!active || token !== micRevision) return;
          recording = prepared; clipUrl = URL.createObjectURL(prepared.blob); el('recording-player').src = clipUrl; el('recording').hidden = false;
          status('Запись готова. Нажмите «Распознать запись», затем проверьте текст перед отправкой.');
        } catch (err) { if (active && token === micRevision) status(HanyuAI.message(err), true); }
        finally { if (active && token === micRevision) { busy = ''; refresh(); } }
      };
      current.start(250); recordStarted = Date.now(); busy = 'record'; el('record-time').textContent = '0 / 30 с'; status('Говорите по-китайски.');
      displayTimer = setInterval(() => { if (active && token === micRevision) el('record-time').textContent = `${Math.min(30, Math.floor((Date.now() - recordStarted) / 1000))} / 30 с`; }, 250);
      recordingTimer = setTimeout(() => { if (active && token === micRevision) stopMicrophone(); }, HanyuAI.MAX_RECORDING_MS); refresh();
    } catch (err) {
      if (!active || token !== micRevision) return; stopMicrophone(true); busy = '';
      status(HanyuAI.message({ code: err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'microphone_denied' : 'microphone_unavailable' }), true); refresh();
    }
  };
  el('stop').onclick = () => stopMicrophone();
  el('discard').onclick = () => { cancel(); stopMicrophone(true); discardRecording(); el('record-time').textContent = ''; status(); refresh(); };
  el('recognize').onclick = async () => {
    if (!active || busy || !recording || !settings.asrEnabled) return;
    cancel(); const token = revision, c = controller(); busy = 'asr'; status('Распознаём запись…'); refresh();
    try {
      const result = await HanyuAI.transcribe(recording, c.signal); if (!active || token !== revision) return;
      input.value = result.text; input.focus(); status(HanyuAI.count(result.text.trim()) > settings.maxInputChars ? 'Текст распознан. Сократите его или отправьте по частям.' : 'Проверьте распознанный текст и нажмите «Отправить».');
    } catch (err) { if (active && token === revision) status(HanyuAI.message(err), true); }
    finally { controllers.delete(c); if (active && token === revision) { busy = ''; refresh(); } }
  };
  onLeave(() => { active = false; configRevision++; configController?.abort(); cancel(); stopMicrophone(true); discardRecording(); history = []; chineseReplies.length = 0; });
  if (draft) { input.value = draft.text; status('Текст перенесён. Проверьте его и нажмите «Отправить» для объяснения.'); }
  modeLabels(); refresh(); await loadConfig();
}

function pageAIAssessment(mode) { return pageAI(mode === 'oral' ? 'speaking' : ['writing', 'speaking', 'grammar'].includes(mode) ? mode : 'writing'); }
