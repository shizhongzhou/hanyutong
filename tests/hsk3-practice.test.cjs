'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../web/data/hsk3/exams.json'), 'utf8'));
const types = data.levels.flatMap(l => l.sections.flatMap(s => s.types));
const examples = types.flatMap(t => t.examples);
const hanCount = s => (String(s).match(/\p{Script=Han}/gu) || []).length;
const russian = s => typeof s === 'string' && /[а-яё]/i.test(s);

test('new written exam counts and times match CTI 2025-12 tables, not HSK 2.0', () => {
  assert.deepEqual(data.levels.map(l => l.id), ['1', '2', '3', '4', '5', '6', '7-9']);
  assert.deepEqual(data.levels.slice(0, 6).map(l => l.writtenQuestionCount), [40, 60, 70, 70, 72, 82]);
  assert.deepEqual(data.levels.slice(0, 6).map(l => l.writtenDurationMinutes), [40, 60, 83, 85, 110, 125]);
  const expected = [
    [[20,12],[20,20]], [[25,17],[25,25],[10,10]],
    [[30,23],[30,30],[10,20],[15,15]], [[32,20],[32,30],[6,25],[5,20]],
    [[35,25],[35,35],[2,40],[5,23]], [[40,30],[40,40],[2,45],[5,23]],
    [[40,33],[40,50],[2,55],[4,42],[5,20]]
  ];
  for (const [i, l] of data.levels.entries()) {
    assert.deepEqual(l.sections.map(s => [s.questionCount,s.durationMinutes]), expected[i]);
    assert.equal(l.questionCount, l.sections.reduce((n,s) => n+s.questionCount,0));
    for (const s of l.sections) assert.equal(s.questionCount,s.types.reduce((n,t) => n+t.questionCount,0), `${l.id}/${s.id}`);
  }
});

test('speaking is absent at 1–2, separately required at 3–6, integrated at 7–9', () => {
  for (const l of data.levels.slice(0, 2)) {
    assert.equal(l.speakingRequired, false);
    assert.equal(l.sections.some(s => s.id==='speaking'), false);
  }
  for (const l of data.levels.slice(2,6)) {
    assert.equal(l.speakingRequired,true); assert.equal(l.speakingIntegrated,false);
    const oral=l.sections.find(s => s.id==='speaking');
    assert.deepEqual(oral.types.map(t=>t.questionCount), l.id==='3'?[8,5,2]:[2,1,2]);
    assert.deepEqual(oral.types.map(t=>t.preparationSecondsPerQuestion || 0), l.id==='3'?[0,0,180]:[0,180,210]);
    assert.equal(oral.types.reduce((n,t)=>n+(t.preparationSecondsPerQuestion || 0)*t.questionCount,0),oral.preparationMinutes*60);
    assert.ok(russian(oral.preparationNoteRu));
  }
  const advanced=data.levels[6];
  assert.equal(advanced.speakingIntegrated,true);
  assert.equal(advanced.questionCount,91); assert.equal(advanced.durationMinutes,200);
  assert.equal(advanced.objectiveQuestionCount,60); assert.equal(advanced.subjectiveQuestionCount,31);
  for (const [kind,count] of [['objective',60],['subjective',31]])
    assert.equal(advanced.sections.flatMap(s=>s.types).filter(t=>t.scoring===kind).reduce((n,t)=>n+t.questionCount,0),count);
});

test('all official parts have original, usable Russian-guided practice', () => {
  assert.equal(types.length,74); assert.equal(examples.length,75);
  assert.equal(new Set(types.map(t=>t.id)).size,types.length);
  assert.equal(new Set(examples.map(e=>e.id)).size,examples.length);
  for (const t of types) {
    assert.ok(russian(t.titleRu),t.id); assert.ok(russian(t.descriptionRu),t.id);
    assert.ok(t.questionCount>0 && t.examples.length>0,t.id);
  }
  for (const e of examples) {
    assert.equal(e.origin,'original',e.id);
    assert.ok(russian(e.promptRu) && russian(e.explanationRu),e.id);
    assert.ok(e.promptZh,e.id);
    assert.ok(['choice','text','self-assess'].includes(e.kind),e.id);
    if(e.kind==='choice') {
      assert.ok(e.options.length>=3,e.id); assert.ok(Number.isInteger(e.answerIndex),e.id);
      assert.ok(e.answerIndex>=0 && e.answerIndex<e.options.length,e.id);
      for(const o of e.options) assert.ok(o.zh || o.visual,e.id);
    } else if(e.kind==='text') {
      assert.ok(e.acceptedAnswers.length>0 && e.acceptedAnswers.every(x=>typeof x==='string'&&x.trim()),e.id);
    } else {
      assert.ok(e.answerZh,e.id); assert.ok(e.selfCheckRu.length>=2,e.id);
      assert.ok(e.selfCheckRu.every(russian),e.id);
      assert.equal(e.answerIndex,undefined,e.id); assert.equal(e.acceptedAnswers,undefined,e.id);
    }
  }
});

test('extended sample answers satisfy their stated character limits', () => {
  for(const e of examples) {
    if(e.minimumHanCharacters) assert.ok(hanCount(e.answerZh)>=e.minimumHanCharacters,`${e.id}: ${hanCount(e.answerZh)}`);
    if(e.maximumHanCharacters) assert.ok(hanCount(e.answerZh)<=e.maximumHanCharacters,e.id);
  }
  assert.equal(examples.find(e=>e.id==='7-9-w2-example-1').minimumHanCharacters,600);
  assert.equal(examples.find(e=>e.id==='6-w1-example-1').minimumHanCharacters,150);
});

test('picture and chart types have actual visual material; listening has a script', () => {
  let visualTypes=0;
  for(const t of types) {
    const isPicture=/图片|看图/.test(t.titleZh);
    if(isPicture) {
      visualTypes++;
      for(const e of t.examples) assert.ok(e.visual || e.visualSequence || e.options?.some(o=>o.visual),e.id);
    }
  }
  assert.equal(visualTypes,14);
  for(const l of data.levels) for(const t of l.sections.find(s=>s.id==='listening').types)
    for(const e of t.examples) assert.ok(e.audioTextZh,e.id);
  assert.equal(examples.find(e=>e.id==='5-w1-example-1').visualSequence.length,4);
  for(const e of examples.filter(e=>e.chart)) {
    assert.ok(e.chart.headers.length>=2 && e.chart.rows.length>0,e.id);
    assert.ok(e.chart.rows.every(r=>r.length===e.chart.headers.length),e.id);
  }
  assert.deepEqual(examples.find(e=>e.id==='7-9-l1-example-1').options.map(o=>o.zh),['√','×','〇']);
});

test('sources and scoring distinguish current exams from older samples and practice', () => {
  assert.match(data.practiceNoticeRu,/авторские/i);
  assert.match(data.scoringNoticeRu,/не переводится/i);
  const ids=new Set(data.sources.map(s=>s.id));
  for(const l of data.levels) {
    assert.ok(l.sources.every(id=>ids.has(id)),l.id);
    assert.ok(russian(l.scoringRu),l.id);
  }
  assert.ok(data.sources.some(s=>s.url==='https://www.chinesetest.cn/HSK/7-9'));
  assert.ok(data.sources.some(s=>s.url==='https://hsk-sample-1409982902.cos.ap-beijing.myqcloud.com/HSK3.0.zip'));
  assert.match(data.levels[6].scoringRu,/IRT/);
  assert.match(data.levels[6].noteRu,/98/);
});
