'use strict';
// Local repairs are restricted to verified skin-weight mistakes in the original
// asset. A verified dangling fur flap is omitted from the draw index; vertex
// positions, textures, animation tracks and bone transforms stay unchanged.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HanyuPetRuntime = api;
})(typeof window === 'object' ? window : globalThis, () => {
  // Original index topology: the isolated central under-tail flap and its tiny
  // attached fur edges. No paw, outer thigh, tail surface or body component.
  const danglingFurFaces = [9718,9721,9722,9723,9724,9725,9727,9728,9729,9730,9731,9732,9733,9734,9735,9736,9737,9738,9739,9740,9741,9742,9743,9744,9745,9746,9748,9749,9750,9751,9752,9753,9755,9756,9765,9766,9767,9768,9769,9770,9771,9772,9773,9774,9775,9776,9777,9778,9780,9781,9782,9783,9784,9785,9786,9787,9788,9789,9790,9791,9792,9793,9794,9795,9796,9797,9798,9799,9800,9801,9802,10322,10410,10411,10412,10414,10415,10416,10417,10515,10516,10517,10518,10519,10520,10521,10522,10523,10524,10525,10526,10527,10528,10529,10530,10531,10532,10533,10534,10535,10536,10537,10538,10539,10540,10541,10542,10543,10544,10545,10546,10547,10548,10549,10550,10551,10552,10553,10554,10555,10556,10557,10558,10559,10560,10561,10562,10563,10564,10565,10566,10567,10568,10569,10570,10571,10701,10702,10703,10704,10705,10706,10707,10708,10709,10710,10711,10712,10713,10714,10715,10716,10717,10718,10719,10720,10721,10722,10723,10724,10725,10726,10727,10728,10729,10730,10731,10732,10733,10734,10735,10736,10737,10738,10739,10740,10741,10742,10743,10744,10745,10746,10747,10748,10993,11149,11151,11455,11456,11458,11459,11461,11463,11464,11465,11466,11467,11468,11469,11470,11471,11472,11473,11474,11475,11477,11478,11713,11714,11927,11928,11929,11930,11931,11932,11933,11934,11935,11936,11937,11938,11939,11940,11941,12045,12046,12047,12048,12049,12050,12051,12052,12053,12054,12055,12056,12057,12058,12059,12060,12061,12062,12063,12064,12065,12066,12067,12068,12069,12070,12071,12072,12073,12074,12075,12076,12077,12078,12079,12080,12081,12082,12083,12084,12085,12086,12087,12088,12877,12878,12879,12880,12881,12882,12883,12884,12885,12886,12887,12888];
  function repairModel(model) {
    let repaired = false;
    model.traverse(mesh => {
      if (!mesh.isSkinnedMesh || mesh.userData.hanyuWeightsRepaired) return;
      const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
      const bones = mesh.skeleton.bones, index = mesh.geometry.index;
      const name = index => bones[index]?.userData?.name || bones[index]?.name;
      if (position.count !== 42398 || skinIndex.count !== 42398 || skinWeight.count !== 42398 ||
          index?.count !== 130773 || index.getX(10735 * 3) !== 10614 || index.getX(10735 * 3 + 1) !== 11824 ||
          name(85) !== 'DEF-chin.R' || name(88) !== 'DEF-jaw.R.001' || name(117) !== 'DEF-lip.B.R') return;
      // The same whisker root has normal chin/jaw/lip binding, but its 22 tip
      // vertices were accidentally assigned 100% to the left front middle toe.
      for (let i = 9741; i <= 9762; i++) {
        if (name(skinIndex.getX(i)) !== 'DEF-f_middle.002.L' || skinWeight.getX(i) < 0.999) return;
      }
      const sum = skinWeight.getX(9763) + skinWeight.getY(9763) + skinWeight.getZ(9763);
      for (let i = 9741; i <= 9762; i++) {
        skinIndex.setXYZW(i, 85, 88, 117, 0);
        skinWeight.setXYZW(i, skinWeight.getX(9763) / sum, skinWeight.getY(9763) / sum, skinWeight.getZ(9763) / sum, 0);
      }
      const omitted = new Set(danglingFurFaces), kept = [];
      for (let i = 0; i < index.count; i += 3) if (!omitted.has(i / 3)) kept.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
      mesh.geometry.setIndex(kept);
      skinIndex.needsUpdate = true; skinWeight.needsUpdate = true;
      mesh.userData.hanyuWeightsRepaired = true; repaired = true;
    });
    return repaired;
  }

  function createAnimator({ actions, mixer, repeat, once, onPhase = () => {} }) {
    const base = mixer.clipAction(actions.Idle.getClip().clone());
    const all = [...Object.values(actions), base];
    const weights = new Map(all.map(action => [action, 0]));
    for (const action of all) action.stop();
    base.reset().setLoop(repeat, Infinity).play(); base.paused = true; base.time = 0;
    base.setEffectiveWeight(1); weights.set(base, 1);
    let phase = 'base', current = null, pending = null, blend = null, hold = 0, completion = null;
    function weight(action, value) { weights.set(action, value); action.setEffectiveWeight(value); }
    function prepare(action, loop) {
      action.reset().setLoop(loop ? repeat : once, loop ? Infinity : 1).play();
      action.clampWhenFinished = !loop; action.paused = true; action.time = 0; weight(action, 0);
    }
    function toBase(callback = null) {
      for (const action of all) if (weights.get(action) > 0) action.paused = true;
      base.paused = true; base.time = 0;
      blend = { start: new Map(weights), target: base, elapsed: 0, duration: 0.4 };
      phase = 'exit'; completion = callback;
    }
    function enter(request) {
      pending = null; current = request;
      prepare(actions[request.name], request.loop);
      blend = { start: new Map(weights), target: actions[request.name], elapsed: 0, duration: request.name === 'Sleep' ? 0.6 : 0.3 };
      phase = 'entry'; onPhase(request.name, phase);
    }
    function request(name, options = {}) {
      if (!actions[name]) return false;
      if (pending?.name === name || (phase === 'entry' && current?.name === name)) return true;
      const next = { name, loop: options.loop === true, then: typeof options.then === 'function' ? options.then : null };
      completion = null; pending = next;
      if (phase === 'base' && hold <= 0) enter(next);
      else if (phase !== 'exit' && phase !== 'base') toBase();
      return true;
    }
    function step(dt) {
      dt = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, 0.05));
      if (blend) {
        blend.elapsed += dt;
        const p = Math.min(1, blend.elapsed / blend.duration), t = p * p * (3 - 2 * p);
        for (const action of all) weight(action, (blend.start.get(action) || 0) * (1 - t) + (action === blend.target ? t : 0));
        if (p >= 1) {
          const entering = phase === 'entry'; blend = null;
          if (entering) { phase = 'active'; actions[current.name].paused = false; onPhase(current.name, phase); }
          else { phase = 'base'; current = null; hold = 0.15; onPhase('Idle', phase); }
        }
      } else if (phase === 'base') {
        hold = Math.max(0, hold - dt);
        if (hold === 0) {
          if (completion) { const callback = completion; completion = null; callback(); }
          if (phase === 'base') enter(pending || { name: 'Idle', loop: true, then: null });
        }
      }
      mixer.update(dt);
      if (phase === 'active' && !current.loop && actions[current.name].time >= actions[current.name].getClip().duration - 1e-6) toBase(current.then);
    }
    function resetToBase() {
      pending = null; completion = null; blend = null; current = null; phase = 'base'; hold = 0.15;
      for (const action of all) { action.paused = true; weight(action, action === base ? 1 : 0); }
      base.time = 0; onPhase('Idle', 'base'); mixer.update(0);
    }
    return { request, step, resetToBase,
      get phase() { return phase; }, get name() { return current?.name || 'Idle'; },
      get walking() { return phase === 'active' && current?.name === 'Walk'; },
      get sleepWeight() { return weights.get(actions.Sleep) || 0; },
      get airborne() { return phase === 'active' && current?.name === 'Happy'; }
    };
  }
  return Object.freeze({ repairModel, createAnimator });
});
