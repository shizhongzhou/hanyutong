"use strict";

/* Local, isolated-syllable pitch practice. No speech recognition or network.
 * YIN: de Cheveigné & Kawahara (2002), doi:10.1121/1.1458024.
 * These conservative shape heuristics are not a validated pronunciation test.
 * ASR text cannot supply pronunciation grades or missing word timestamps:
 * https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference
 * https://github.com/QwenLM/Qwen3-ASR#forcedaligner-usage
 * HSK capabilities, not an automated pronunciation scoring formula:
 * https://www.chinesetest.cn/HSK (linked HSK 3.0 Competency Profile)
 */
const HanyuPronunciation = (() => {
  const RATE = 8000, FRAME = 512, HOP = 80, MAX_SECONDS = 5;
  const SYLLABLES = Object.freeze([
    { tone: 1, han: '妈', pinyin: 'mā', meaning: 'мама', name: 'Первый · ровный', tip: 'Держите голос ровно, в удобной верхней части своего диапазона.' },
    { tone: 2, han: '麻', pinyin: 'má', meaning: 'конопля; онемевший', name: 'Второй · восходящий', tip: 'Плавно поднимайте голос от средней высоты к верхней.' },
    { tone: 3, han: '马', pinyin: 'mǎ', meaning: 'лошадь', name: 'Третий · нисходяще-восходящий', tip: 'Для отдельного слога опустите голос, затем поднимите. Не напрягайте горло.' },
    { tone: 4, han: '骂', pinyin: 'mà', meaning: 'ругать', name: 'Четвёртый · нисходящий', tip: 'Начните выше и уверенно опустите голос.' },
    { tone: 5, han: '吗', pinyin: 'ma', meaning: 'вопросительная частица', name: 'Нейтральный · лёгкий', tip: 'Лёгкий тон короткий и без ударения. Его высота зависит от предыдущего слога; отдельно он не оценивается.' }
  ]);
  const median = numbers => { const a = numbers.slice().sort((x, y) => x - y), i = a.length >> 1; return a.length ? a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2 : 0; };
  const quantile = (numbers, q) => { const a = numbers.slice().sort((x, y) => x - y); return a[Math.floor((a.length - 1) * q)] || 0; };
  const insufficient = (reason, extra = {}) => ({ status: 'insufficient_evidence', reason, detectedTone: null, contour: [], ...extra });

  // Area averaging before decimation reduces high-frequency aliasing. PCM is
  // never stretched or amplitude-normalized to make it resemble a target.
  function resample(samples, sampleRate) {
    const size = Math.floor(samples.length * RATE / sampleRate), output = new Float32Array(size), ratio = sampleRate / RATE;
    for (let i = 0; i < size; i++) {
      const start = i * ratio, end = (i + 1) * ratio;
      let sum = 0;
      for (let j = Math.floor(start); j < Math.min(samples.length, Math.ceil(end)); j++) sum += samples[j] * (Math.min(end, j + 1) - Math.max(start, j));
      output[i] = sum / ratio;
    }
    return output;
  }

  function yin(frame, sampleRate = RATE) {
    const minLag = Math.ceil(sampleRate / 500), maxLag = Math.floor(sampleRate / 65), window = frame.length - maxLag;
    if (window < maxLag) return null;
    const normalized = new Float64Array(maxLag + 1); normalized[0] = 1;
    let cumulative = 0;
    for (let lag = 1; lag <= maxLag; lag++) {
      let difference = 0;
      for (let j = 0; j < window; j++) { const delta = frame[j] - frame[j + lag]; difference += delta * delta; }
      cumulative += difference;
      normalized[lag] = cumulative > 1e-12 ? difference * lag / cumulative : 1;
    }
    let lag = minLag;
    for (; lag < maxLag; lag++) if (normalized[lag] < .15) {
      while (lag < maxLag && normalized[lag + 1] < normalized[lag]) lag++;
      break;
    }
    if (lag === maxLag || normalized[lag] > .15) return null;
    const left = normalized[lag - 1], center = normalized[lag], right = normalized[lag + 1];
    const divisor = left - 2 * center + right;
    const adjustment = divisor > 0 ? Math.max(-.5, Math.min(.5, .5 * (left - right) / divisor)) : 0;
    const hz = sampleRate / (lag + adjustment);
    return hz >= 65 && hz <= 500 ? { hz, confidence: 1 - center } : null;
  }

  function expectedContour(tone) {
    if (tone === 5) return [];
    const points = Array.from({ length: 31 }, (_, i) => {
      const x = i / 30;
      return { x, semitones: tone === 1 ? 0 : tone === 2 ? 6 * x - 3 : tone === 3 ? x < .5 ? 1 - 10 * x : -4 + 14 * (x - .5) : 4 - 8 * x };
    });
    const center = median(points.map(point => point.semitones));
    return points.map(point => ({ x: point.x, semitones: point.semitones - center }));
  }

  function classify(contour) {
    const values = contour.map(p => p.semitones), count = values.length, edge = Math.max(3, Math.floor(count * .18));
    const start = median(values.slice(0, edge)), end = median(values.slice(-edge)), delta = end - start;
    const range = quantile(values, .9) - quantile(values, .1);
    let upward = 0, downward = 0;
    for (let i = 1; i < count; i++) {
      const change = values[i] - values[i - 1];
      if (change > 0) upward += change; else downward -= change;
    }
    if (range < 1.8 && Math.abs(delta) < 1.2 && upward + downward < 4) return 1;
    if (delta > 2.5 && downward < 1.8 && range > 2.3) return 2;
    if (delta < -3 && upward < 1.8 && range > 2.8) return 4;
    const middleStart = Math.floor(count * .25), middleEnd = Math.ceil(count * .75);
    let minimum = middleStart;
    for (let i = middleStart; i < middleEnd; i++) if (values[i] < values[minimum]) minimum = i;
    const bottom = median(values.slice(Math.max(0, minimum - 1), minimum + 2));
    if (start - bottom > 1.8 && end - bottom > 2.5 && minimum / (count - 1) >= .25 && minimum / (count - 1) <= .75 &&
        downward + upward < (start - bottom) + (end - bottom) + 3) return 3;
    return null;
  }

  function analyze(samples, sampleRate, expectedTone) {
    if (![1, 2, 3, 4, 5].includes(expectedTone)) return insufficient('invalid_tone');
    if (expectedTone === 5) return { status: 'not_assessed', reason: 'neutral_tone', expectedTone, detectedTone: null, contour: [] };
    if (!samples || typeof samples.length !== 'number' || !Number.isInteger(samples.length) ||
        !Number.isFinite(sampleRate) || sampleRate < RATE || sampleRate > 96000 || samples.length < sampleRate * .2 || samples.length > sampleRate * MAX_SECONDS) return insufficient('invalid_audio');
    let clipped = 0, energy = 0;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      if (!Number.isFinite(sample) || Math.abs(sample) > 1.001) return insufficient('invalid_audio');
      if (Math.abs(sample) >= .985) clipped++;
      energy += sample * sample;
    }
    if (clipped / samples.length > .01) return insufficient('clipping');
    if (Math.sqrt(energy / samples.length) < .005) return insufficient('silence');
    const pcm = resample(samples, sampleRate), frames = [];
    for (let offset = 0; offset + FRAME <= pcm.length; offset += HOP) {
      const frame = pcm.subarray(offset, offset + FRAME);
      let mean = 0, square = 0;
      for (const value of frame) { mean += value; square += value * value; }
      const rms = Math.sqrt(Math.max(0, square / FRAME - (mean / FRAME) ** 2));
      frames.push({ frame, rms, time: (offset + FRAME / 2) / RATE });
    }
    const maximum = Math.max(0, ...frames.map(f => f.rms));
    if (maximum < .012) return insufficient('too_quiet');
    const energyThreshold = Math.max(.009, maximum * .12);
    const energetic = frames.filter(frame => frame.rms >= energyThreshold), voiced = [];
    for (const frame of energetic) { const pitch = yin(frame.frame); if (pitch) voiced.push({ time: frame.time, ...pitch }); }
    if (voiced.length < 20 || voiced.length / Math.max(1, energetic.length) < .65) return insufficient('unclear_pitch');
    const durationSeconds = voiced.at(-1).time - voiced[0].time;
    if (durationSeconds < .25) return insufficient('too_short');
    if (durationSeconds > 1.8) return insufficient('one_syllable_only');
    let jumps = 0;
    for (let i = 1; i < voiced.length; i++) {
      if (voiced[i].time - voiced[i - 1].time > .11) return insufficient('separated_syllables');
      if (Math.abs(12 * Math.log2(voiced[i].hz / voiced[i - 1].hz)) > 3) jumps++;
    }
    if (jumps > 1 || voiced.length / (durationSeconds / (HOP / RATE) + 1) < .8) return insufficient('unstable_pitch');
    const semitones = voiced.map(point => 12 * Math.log2(point.hz));
    const smoothed = semitones.map((_, i) => median(semitones.slice(Math.max(0, i - 2), i + 3)));
    const center = median(smoothed);
    const contour = voiced.map((point, i) => ({ x: (point.time - voiced[0].time) / durationSeconds, semitones: smoothed[i] - center }));
    // Resample only for shape comparison; the plotted curve retains measured
    // frame positions, including gaps. No alignment to words is inferred.
    const bins = Array.from({ length: 25 }, (_, i) => {
      const x = i / 24, closest = contour.reduce((a, b) => Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a);
      return { x, semitones: closest.semitones };
    });
    const detectedTone = classify(bins), result = { expectedTone, detectedTone, contour, durationSeconds,
      pitchMedianHz: 2 ** (center / 12), periodicity: median(voiced.map(p => p.confidence)) };
    if (!detectedTone) return insufficient('ambiguous_shape', result);
    return { status: detectedTone === expectedTone ? 'similar_shape' : 'different_shape', reason: 'practice_estimate', ...result };
  }

  const reasons = {
    clipping: 'Запись перегружена. Отодвиньте микрофон и говорите чуть тише.',
    silence: 'Голос почти не слышен. Проверьте микрофон и попробуйте снова.',
    too_quiet: 'Голос слишком тихий. Поднесите микрофон немного ближе.',
    unclear_pitch: 'Не удалось выделить устойчивую высоту голоса. Попробуйте в тихом месте, без музыки.',
    too_short: 'Слог слишком короткий для сравнения. Спокойно произнесите один «ма» примерно за полсекунды.',
    one_syllable_only: 'Произнесите только один слог, без фразы и повторов: примерно 0,5–1 секунду.',
    separated_syllables: 'В записи несколько отдельных звуков или пауза. Произнесите один слог один раз.',
    unstable_pitch: 'Высота голоса определяется неустойчиво. Попробуйте без шёпота, скрипа и фоновых звуков.',
    ambiguous_shape: 'Контур получился неоднозначным. Сравните линии и повторите один слог; вывод пока делать рано.',
    invalid_audio: 'Не удалось прочитать короткую запись. Попробуйте ещё раз.',
    invalid_tone: 'Выберите один из четырёх тонов.',
    neutral_tone: 'Нейтральный тон зависит от соседнего слога. Для него здесь нет оценки.'
  };
  function feedback(result) {
    if (result.status === 'similar_shape') return `Форма линии похожа на ${result.expectedTone}-й тон. Это подсказка о движении голоса, а не проверка правильности всего произношения.`;
    if (result.status === 'different_shape') return `Сейчас движение голоса больше похоже на ${result.detectedTone}-й тон. Для ${result.expectedTone}-го: ${SYLLABLES[result.expectedTone - 1].tip}`;
    return reasons[result.reason] || reasons.unclear_pitch;
  }
  return { analyze, yin, expectedContour, feedback, SYLLABLES, MAX_SECONDS };
})();

async function pageAIPronunciation(initialTone) {
  let active = true, generation = 0, tone = /^[1-5]$/.test(String(initialTone)) ? +initialTone : 1;
  let recording = false, waiting = false, processing = false, stream = null, recorder = null, audioContext = null;
  let stopTimer = null, clockTimer = null, analysisTimer = null, started = 0, playbackUrl = '';
  app.innerHTML = `${topbar('Произношение · тоны', '#/learn')}<section class="pronunciation">
    <p class="sub">Один слог — одно движение голоса. Запишите «ма» и сравните свою линию с ориентиром.</p>
    <div class="pron-tone-tabs" role="group" aria-label="Выберите тон">${HanyuPronunciation.SYLLABLES.map(item => `<button type="button" id="pron-tone-${item.tone}" aria-pressed="${item.tone === tone}"><b>${item.pinyin}</b><small>${item.tone < 5 ? item.tone + '-й тон' : 'Лёгкий'}</small></button>`).join('')}</div>
    <div class="pron-sample card-blue"><div id="pron-han" class="zh"></div><div id="pron-pinyin"></div><p id="pron-meaning"></p><h2 id="pron-name"></h2><p id="pron-tip"></p></div>
    <figure class="pron-chart"><svg id="pron-plot" viewBox="0 0 600 260" role="img" aria-label="Контур высоты голоса. Пунктир — учебный ориентир; сплошная линия появится после записи."></svg><figcaption><span class="pron-legend-target">Пунктир · ориентир</span><span class="pron-legend-voice">Сплошная · ваш голос</span></figcaption></figure>
    <p class="hint">По горизонтали — время слога, по вертикали — изменение высоты в полутонах относительно середины вашего голоса. Ориентир условный: диапазон у каждого свой.</p>
    <div class="pron-record-actions"><button id="pron-record" class="btn">${ic('mic')} Записать один слог</button><button id="pron-stop" class="btn ghost" hidden>Остановить и сравнить</button><button id="pron-cancel" class="btn ghost" hidden>Отменить</button><span id="pron-time" aria-live="off"></span></div>
    <p id="pron-status" class="pron-status" role="status" aria-live="polite"></p>
    <audio id="pron-playback" controls controlsList="nodownload noremoteplayback" disableRemotePlayback hidden></audio>
    <div id="pron-result" class="pron-result" role="status" aria-live="polite" hidden><h3 id="pron-result-title"></h3><p id="pron-feedback"></p></div>
    <div class="box"><h3>Что показывает тренажёр</h3><p class="hint">Это приблизительное сравнение формы тона отдельного слога. Оно не определяет, какой звук или иероглиф вы произнесли, и не проверяет согласные, гласные, ударение или беглость. Ровная линия сама по себе не подтверждает высокий первый тон. Баллы HSK не выставляются.</p><p class="hint">В речи тоны меняются: например, 你好 произносится с изменением первого третьего тона. Такие сочетания здесь не оцениваются. Для третьего тона показан полный контур отдельного слога; в связной речи он часто короче.</p></div>
    <p class="hint pron-privacy">Микрофон включается только по кнопке. До 5 секунд; анализ выполняется на устройстве без отправки аудио. Запись исчезает при выходе с этого экрана. Результат упражнения может сохраняться в вашем учебном профиле на этом устройстве; сама запись не сохраняется.</p>
  </section>`;
  const el = id => $('#pron-' + id), buttons = HanyuPronunciation.SYLLABLES.map(item => el('tone-' + item.tone));
  const player = el('playback');
  const setStatus = text => { if (active) el('status').textContent = text; };
  const plot = result => {
    const actual = result?.contour || [], target = HanyuPronunciation.expectedContour(tone);
    const spread = Math.max(6, ...actual.map(point => Math.abs(point.semitones) + 1));
    const point = value => `${(55 + value.x * 520).toFixed(2)},${(120 - value.semitones / spread * 95).toFixed(2)}`;
    const ticks = [-4, 0, 4].map(n => `<line x1="55" x2="575" y1="${120 - n / spread * 95}" y2="${120 - n / spread * 95}" class="pron-grid"/><text x="42" y="${125 - n / spread * 95}" text-anchor="end">${n > 0 ? '+' : ''}${n}</text>`).join('');
    el('plot').innerHTML = `${ticks}<text x="55" y="248">Начало</text><text x="575" y="248" text-anchor="end">Конец</text>${target.length ? `<polyline points="${target.map(point).join(' ')}" class="pron-target"/>` : '<text x="300" y="125" text-anchor="middle">Для лёгкого тона нет отдельного контура</text>'}${actual.length ? `<polyline points="${actual.map(point).join(' ')}" class="pron-actual"/>` : ''}`;
    el('plot').setAttribute('aria-label', actual.length ? `Сравнение контура. ${HanyuPronunciation.feedback(result)}` : 'Пунктир показывает условный контур выбранного тона. Запись пока не сделана.');
  };
  function clearPlayback() {
    player.pause(); player.removeAttribute('src'); player.load(); player.hidden = true;
    if (playbackUrl) URL.revokeObjectURL(playbackUrl); playbackUrl = '';
  }
  function controls() {
    const busy = waiting || recording || processing;
    buttons.forEach(button => { button.disabled = busy; });
    el('record').disabled = busy || tone === 5; el('record').hidden = recording;
    el('stop').hidden = !recording; el('cancel').hidden = !waiting && !recording;
  }
  function releaseCapture() {
    clearTimeout(stopTimer); clearInterval(clockTimer); clearTimeout(analysisTimer); stopTimer = null; clockTimer = null; analysisTimer = null;
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
    recording = false; waiting = false;
    if (active) { el('time').textContent = ''; controls(); }
  }
  function cancel() {
    generation++;
    if (recorder && recorder.state !== 'inactive') { recorder.onstop = null; recorder.ondataavailable = null; try { recorder.stop(); } catch (_) {} }
    recorder = null; processing = false; releaseCapture(); setStatus('Запись отменена.');
  }
  function stop() {
    if (!recording || !recorder) return;
    recording = false; processing = true;
    clearTimeout(stopTimer); clearInterval(clockTimer);
    try { recorder.stop(); } catch (_) { cancel(); setStatus('Не удалось завершить запись. Попробуйте снова.'); return; }
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    controls(); setStatus('Сравниваем движение голоса на устройстве…');
  }
  async function start() {
    if (!active || waiting || recording || processing || tone === 5) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined' || !Context) { setStatus('Этот браузер не поддерживает запись. Откройте приложение в современном браузере с доступом к микрофону.'); return; }
    const revision = ++generation, selectedTone = tone;
    waiting = true; controls(); clearPlayback(); el('result').hidden = true; plot(); setStatus('Разрешите микрофон. Произнесите один слог после начала записи.');
    let acquired = null, decoder = null;
    try {
      decoder = new Context(); audioContext = decoder;
      await decoder.resume();
      if (!active || revision !== generation) { await decoder.close().catch(() => {}); return; }
      acquired = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      if (!active || revision !== generation) { acquired.getTracks().forEach(track => track.stop()); await decoder.close().catch(() => {}); return; }
      stream = acquired; const chunks = []; let bytes = 0;
      const currentRecorder = new MediaRecorder(stream); recorder = currentRecorder;
      currentRecorder.ondataavailable = event => {
        if (!active || revision !== generation || !event.data?.size) return;
        bytes += event.data.size;
        if (bytes > 2 * 1024 * 1024) { cancel(); setStatus('Запись слишком большая. Попробуйте более короткий слог.'); return; }
        chunks.push(event.data);
        if (recording && Date.now() - started >= HanyuPronunciation.MAX_SECONDS * 1000) stop();
      };
      currentRecorder.onerror = () => { if (active && revision === generation) { cancel(); setStatus('Микрофон прервал запись. Попробуйте снова.'); } };
      currentRecorder.onstop = async () => {
        if (!active || revision !== generation) return;
        recording = false; processing = true; clearTimeout(stopTimer); clearInterval(clockTimer);
        stream?.getTracks().forEach(track => track.stop()); stream = null; controls();
        try {
          const blob = new Blob(chunks, { type: currentRecorder.mimeType || chunks[0]?.type || 'audio/webm' });
          chunks.length = 0;
          let ownAnalysisTimer;
          const decoded = await Promise.race([
            blob.arrayBuffer().then(buffer => decoder.decodeAudioData(buffer)),
            new Promise((_, reject) => { ownAnalysisTimer = setTimeout(() => reject(Error('decode_timeout')), 10000); analysisTimer = ownAnalysisTimer; })
          ]);
          clearTimeout(ownAnalysisTimer); if (analysisTimer === ownAnalysisTimer) analysisTimer = null;
          if (!active || revision !== generation) return;
          if (!Number.isFinite(decoded.duration) || decoded.duration > 5.5 || decoded.numberOfChannels < 1 || decoded.numberOfChannels > 2) throw Error('invalid_audio');
          const count = Math.min(decoded.length, Math.floor(decoded.sampleRate * HanyuPronunciation.MAX_SECONDS)), pcm = new Float32Array(count);
          for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
            const input = decoded.getChannelData(channel);
            for (let i = 0; i < count; i++) pcm[i] += input[i] / decoded.numberOfChannels;
          }
          const result = HanyuPronunciation.analyze(pcm, decoded.sampleRate, selectedTone);
          pcm.fill(0);
          playbackUrl = URL.createObjectURL(blob); player.src = playbackUrl; player.hidden = false;
          el('result').hidden = false; el('result').dataset.state = result.status;
          el('result-title').textContent = result.status === 'similar_shape' ? 'Похожее движение голоса' : result.status === 'different_shape' ? 'Попробуйте другое движение' : 'Недостаточно данных для вывода';
          el('feedback').textContent = HanyuPronunciation.feedback(result); plot(result);
          setStatus('Готово. Послушайте свою запись и попробуйте ещё раз.');
          if (typeof HanyuLearning !== 'undefined' && typeof HanyuLearning.recordTone === 'function') {
            try { Promise.resolve(HanyuLearning.recordTone({ expectedTone: selectedTone, detectedTone: result.detectedTone, status: result.status, durationSeconds: result.durationSeconds || 0 })).catch(() => {}); } catch (_) { /* Practice feedback remains available if progress storage is full. */ }
          }
        } catch (_) { if (active && revision === generation) setStatus('Не удалось прочитать запись. Попробуйте ещё раз.'); }
        finally { if (active && revision === generation) { processing = false; recorder = null; releaseCapture(); } }
      };
      currentRecorder.start(200); waiting = false; recording = true; started = Date.now(); controls();
      setStatus('Запись идёт. Произнесите один «ма», затем нажмите «Остановить».');
      stopTimer = setTimeout(stop, HanyuPronunciation.MAX_SECONDS * 1000);
      clockTimer = setInterval(() => { if (active && recording) el('time').textContent = `${Math.min(5, (Date.now() - started) / 1000).toFixed(1)} / 5 с`; }, 100);
    } catch (error) {
      acquired?.getTracks().forEach(track => track.stop());
      if (!active || revision !== generation) { await decoder?.close().catch(() => {}); return; }
      releaseCapture(); setStatus(error?.name === 'NotAllowedError' ? 'Разрешите микрофон в настройках браузера и попробуйте снова.' : 'Не удалось включить микрофон. Проверьте его подключение.');
    }
  }
  function select(value) {
    if (!active || waiting || recording || processing) return;
    tone = value; const sample = HanyuPronunciation.SYLLABLES[value - 1];
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i + 1 === value)));
    for (const field of ['han', 'pinyin', 'meaning', 'name', 'tip']) el(field).textContent = sample[field];
    clearPlayback(); el('result').hidden = true; setStatus(value === 5 ? sample.tip : 'Запишите один слог один раз. После него остановите запись.'); controls(); plot();
  }
  buttons.forEach((button, i) => { button.onclick = () => select(i + 1); });
  el('record').onclick = start; el('stop').onclick = stop; el('cancel').onclick = cancel;
  player.oncontextmenu = event => event.preventDefault();
  const hide = () => { if (document.hidden && (waiting || recording)) { cancel(); setStatus('Запись отменена: экран был скрыт.'); } };
  document.addEventListener?.('visibilitychange', hide);
  onLeave(() => { active = false; cancel(); clearPlayback(); document.removeEventListener?.('visibilitychange', hide); });
  select(tone);
}

if (typeof module !== 'undefined' && module.exports) module.exports = HanyuPronunciation;
