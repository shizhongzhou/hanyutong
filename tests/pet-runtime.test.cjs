const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const runtime = require('../web/assets/red-panda/pet-runtime.js');
function animator() {
  const durations = { Idle: 2, Tap: 2 / 3, Happy: 1.2, TailWag: 1, Walk: 0.8, Sleep: 8 / 3 };
  const events = [], all = [];
  const clip = (name, duration) => ({ name, duration, clone() { return clip(name + ':base', duration); } });
  class Action {
    constructor(c) { this.clip = c; this.weight = 0; this.time = 0; this.enabled = false; this.paused = false; all.push(this); }
    getClip() { return this.clip; }
    stop() { this.enabled = false; return this; }
    reset() { this.time = 0; this.paused = false; this.enabled = true; return this; }
    setLoop(loop) { this.loop = loop; return this; }
    play() { this.enabled = true; return this; }
    setEffectiveWeight(weight) { this.weight = weight; return this; }
  }
  const actions = Object.fromEntries(Object.entries(durations).map(([name, duration]) => [name, new Action(clip(name, duration))]));
  const mixer = { clipAction(c) { return new Action(c); }, update(dt) {
    for (const action of all) if (action.enabled && !action.paused) {
      action.time += dt;
      if (action.time >= action.clip.duration) action.time = action.loop === 'repeat' ? action.time % action.clip.duration : action.clip.duration;
    }
  } };
  const director = runtime.createAnimator({ actions, mixer, repeat: 'repeat', once: 'once', onPhase(name, phase) { events.push({ name, phase }); } });
  const base = all.at(-1);
  const step = seconds => { for (let n = 0; n < Math.round(seconds / 0.01); n++) { director.step(0.01); assert.ok(Math.abs(all.reduce((sum, a) => sum + a.weight, 0) - 1) < 1e-9); } };
  const until = phase => { for (let i = 0; i < 2000 && director.phase !== phase; i++) step(0.01); assert.equal(director.phase, phase); };
  return { director, actions, base, all, events, step, until };
}

test('every short action begins from the same frozen Idle pose and returns to it with normalized real clip blending', () => {
  for (const name of ['Tap', 'Happy', 'TailWag']) {
    const f = animator(); assert.equal(f.base.time, 0); assert.equal(f.base.weight, 1);
    f.director.request(name, { loop: false });
    f.step(0.15); assert.equal(f.director.phase, 'entry'); assert.equal(f.actions[name].time, 0);
    assert.ok(f.base.weight > 0 && f.base.weight < 1); assert.ok(f.actions[name].weight > 0 && f.actions[name].weight < 1);
    f.until('active'); f.until('exit');
    const endpoint = f.actions[name].time; f.step(0.15); assert.equal(f.actions[name].time, endpoint, 'exit holds original final pose while blending');
    f.until('base'); assert.equal(f.base.time, 0); assert.equal(f.base.paused, true); assert.equal(f.base.weight, 1);
    assert.ok(Object.values(f.actions).every(action => action.weight === 0));
  }
});

test('Sleep holds its own full native cycle continuously and wakes through the base before the next reaction', () => {
  const f = animator(); f.director.request('Sleep', { loop: true }); f.until('active');
  f.step(20); assert.equal(f.director.name, 'Sleep'); assert.equal(f.director.phase, 'active'); assert.equal(f.director.sleepWeight, 1);
  assert.equal(f.events.filter(e => e.phase === 'base').length, 0, 'sleep loops must not stand up between breaths');
  f.director.request('Tap', { loop: false }); assert.equal(f.director.phase, 'exit');
  f.step(0.2); assert.ok(f.director.sleepWeight > 0 && f.director.sleepWeight < 1);
  f.until('base'); assert.equal(f.base.time, 0); assert.equal(f.base.weight, 1); assert.equal(f.actions.Tap.time, 0);
  f.until('active'); assert.equal(f.director.name, 'Tap');
});

test('Walk only reports movement during its native active phase and settles to base when stopped', () => {
  const f = animator(); f.director.request('Walk', { loop: true }); assert.equal(f.director.walking, false);
  f.until('active'); assert.equal(f.director.walking, true); f.step(2);
  f.director.request('Idle', { loop: true }); assert.equal(f.director.walking, false);
  f.until('base'); assert.equal(f.base.time, 0); assert.equal(f.base.weight, 1);
  f.until('active'); assert.equal(f.director.name, 'Idle');
});

test('duplicate native wake/play requests do not restart an entry and interrupted completions do not run', () => {
  const f = animator(); let completed = 0;
  f.director.request('Happy', { loop: false, then: () => completed++ }); f.step(0.15);
  f.director.request('Happy', { loop: false }); f.step(0.15); assert.equal(f.director.phase, 'active');
  f.director.request('Sleep', { loop: true }); f.until('base'); f.until('active'); f.step(5);
  assert.equal(completed, 0); assert.equal(f.director.name, 'Sleep');
});

test('still mode can immediately restore the exact base pose without a timer or partial transition', () => {
  const f = animator(); f.director.request('Happy', { loop: false }); f.until('active'); f.step(0.5);
  f.director.resetToBase(); assert.equal(f.director.phase, 'base'); assert.equal(f.base.time, 0); assert.equal(f.base.weight, 1);
  assert.ok(Object.values(f.actions).every(action => action.weight === 0)); assert.equal(f.director.airborne, false);
  f.director.step(0); assert.equal(f.director.phase, 'base');
});

function modelFixture() {
  const data = fs.readFileSync(path.join(__dirname, '../web/assets/red-panda/red_panda.glb'));
  const length = data.readUInt32LE(12), model = JSON.parse(data.toString('utf8', 20, 20 + length)), bin = 28 + length;
  function attribute(index) {
    const a = model.accessors[index], view = model.bufferViews[a.bufferView], size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
    const bytes = [5126, 5125].includes(a.componentType) ? 4 : a.componentType === 5121 ? 1 : 2, array = [];
    for (let i = 0; i < a.count; i++) for (let c = 0; c < size; c++) {
      const at = bin + (view.byteOffset || 0) + (a.byteOffset || 0) + i * (view.byteStride || size * bytes) + c * bytes;
      array.push(a.componentType === 5126 ? data.readFloatLE(at) : bytes === 4 ? data.readUInt32LE(at) : bytes === 1 ? data.readUInt8(at) : data.readUInt16LE(at));
    }
    return { count: a.count, array, getX: i => array[i * size], getY: i => array[i * size + 1], getZ: i => array[i * size + 2], setXYZW(i, ...values) { array.splice(i * size, 4, ...values); } };
  }
  const at = model.meshes[0].primitives[0].attributes;
  const mesh = { isSkinnedMesh: true, userData: {}, geometry: { attributes: { position: attribute(at.POSITION), skinIndex: attribute(at.JOINTS_0), skinWeight: attribute(at.WEIGHTS_0) },
    index: attribute(model.meshes[0].primitives[0].indices), setIndex(array) { this.index = { array, count: array.length, getX: i => array[i] }; } },
    skeleton: { bones: model.skins[0].joints.map(index => ({ name: model.nodes[index].name })) } };
  return { mesh, model: { traverse(fn) { fn(mesh); } } };
}

test('only the 22 verified misbound whisker tip vertices change, preserving geometry and all other skin weights', () => {
  const f = modelFixture(), attrs = f.mesh.geometry.attributes;
  const indices = [...attrs.skinIndex.array], weights = [...attrs.skinWeight.array], positions = [...attrs.position.array];
  assert.equal(runtime.repairModel(f.model), true);
  const changed = [];
  for (let i = 0; i < attrs.skinIndex.count; i++) {
    const from = i * 4, after = attrs.skinWeight.array.slice(from, from + 4);
    if (after.some((w, c) => w !== weights[from + c]) || attrs.skinIndex.array.slice(from, from + 4).some((j, c) => j !== indices[from + c])) changed.push(i);
    assert.ok(Math.abs(after.reduce((a, b) => a + b, 0) - 1) < 1e-6);
  }
  assert.deepEqual(changed, Array.from({ length: 22 }, (_, i) => 9741 + i));
  assert.deepEqual(attrs.position.array, positions);
  assert.equal(runtime.repairModel(f.model), false, 'patch is idempotent');
  const other = modelFixture(); other.mesh.skeleton.bones[85].name = 'unrelated-bone';
  assert.equal(runtime.repairModel(other.model), false, 'a different model is not patched by index');
});

test('only the verified dangling central fur flap is omitted; all four paw surfaces and vertex positions remain intact', () => {
  const f = modelFixture(), before = [...f.mesh.geometry.index.array], position = f.mesh.geometry.attributes.position;
  assert.equal(runtime.repairModel(f.model), true);
  const after = f.mesh.geometry.index.array;
  assert.equal(before.length - after.length, 280 * 3);
  const kept = new Set();
  for (let i = 0; i < after.length; i += 3) kept.add(after.slice(i, i + 3).join(','));
  assert.equal(kept.has(before.slice(10735 * 3, 10735 * 3 + 3).join(',')), false, 'the visible hook triangle is removed');
  let preservedPawFaces = 0;
  for (let i = 0; i < before.length; i += 3) {
    const face = before.slice(i, i + 3);
    if (!kept.has(face.join(','))) {
      for (const vertex of face) {
        assert.ok(Math.abs(position.getX(vertex)) < 0.08, 'outer legs must not be removed');
        assert.ok(position.getY(vertex) > 0.13 && position.getY(vertex) < 0.25);
        assert.ok(position.getZ(vertex) < -0.14);
      }
    }
    if (face.some(vertex => position.getY(vertex) < 0.035)) {
      assert.ok(kept.has(face.join(',')), 'every original paw surface is preserved'); preservedPawFaces++;
    }
  }
  assert.ok(preservedPawFaces > 1000);
});
