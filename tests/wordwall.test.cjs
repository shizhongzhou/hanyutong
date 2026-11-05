'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const WordWall = require('../web/js/wordwall.js');
const P = WordWall.physics;
const body = values => ({ x: 100, y: 100, width: 80, height: 30, angle: 0, vx: 0, vy: 0, omega: 0, fixed: false, ...values });

test('rotated rectangles do not collide just because their bounding boxes overlap', () => {
  const a=body({ width:150,height:10,angle:Math.PI/4 }), b=body({ y:130,width:150,height:10,angle:Math.PI/4 });
  assert.ok(Math.abs(a.y-b.y)<P.extents(a).y+P.extents(b).y);
  assert.equal(P.overlap(a,b),null);
  b.y=105; assert.ok(P.overlap(a,b));
});

test('head-on collision separates bodies and transfers a bounded bounce', () => {
  const a=body({ x:80,width:40,vx:100 }), b=body({ x:115,width:40,vx:-100 });
  assert.equal(P.collide(a,b),true);
  assert.ok(a.vx<0 && b.vx>0);
  assert.ok(Math.abs(a.vx+b.vx)<1e-8);
  for(let i=0;i<5;i++)P.collide(a,b);
  assert.ok(P.overlap(a,b).depth<0.2);
  assert.ok(Math.abs(a.vx)<100 && Math.abs(b.vx)<100);
});

test('a dragged fixed body pushes a moving body but is not displaced', () => {
  const fixed=body({ x:100,fixed:true }), other=body({ x:150,vx:-120 });
  P.collide(fixed,other);
  assert.equal(fixed.x,100); assert.equal(fixed.vx,0); assert.ok(other.x>150);
});

test('falling, rotating bodies remain finite and inside the world through long frames', () => {
  const bodies=[body({ x:70,y:30,angle:0.4,omega:1 }),body({ x:200,y:55,angle:-0.3 }),body({ x:130,y:100 })];
  for(let i=0;i<800;i++)P.step(bodies,320,380,i===40?4:1/60);
  for(const b of bodies) {
    const e=P.extents(b);
    assert.ok(Object.values(b).filter(v=>typeof v==='number').every(Number.isFinite));
    assert.ok(b.x>=e.x-0.01 && b.x<=320-e.x+0.01);
    assert.ok(b.y>=e.y-0.01 && b.y<=380-e.y+0.01);
    assert.ok(b.y>250,'gravity should actually move the words to the bottom');
  }
  const corner=body({ x:1,y:399,angle:0.6,vx:-50,vy:200 });
  P.contain(corner,300,400);const e=P.extents(corner);
  assert.ok(corner.x>=e.x && corner.y<=400-e.y);
  assert.ok(corner.vx>0 && corner.vy<0);
});

test('tilt rejects missing sensor data and maps screen orientation', () => {
  assert.equal(P.tiltGravity(null,0),null); assert.equal(P.tiltGravity(30,NaN),null);
  const portrait=P.tiltGravity(90,0), landscape=P.tiltGravity(90,0,90);
  assert.ok(portrait.y>800 && portrait.x===0);
  assert.ok(landscape.x>800 && Math.abs(landscape.y)<1e-8);
  assert.ok(P.tiltGravity(0,-40).x<0);
  const rolled=P.tiltGravity(45,90);
  assert.ok(Math.abs(rolled.x-rolled.y)<1e-8,'gravity follows a 45 degree screen roll');
});

class Target {
  constructor(){this.events=new Map();}
  addEventListener(type,fn){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(fn);}
  removeEventListener(type,fn){this.events.get(type)?.delete(fn);}
  emit(type,values={}){const e={type,detail:1,button:0,pointerId:1,clientX:60,clientY:70,cancelable:true,preventDefault(){this.defaultPrevented=true;},...values};for(const fn of [...(this.events.get(type)||[])])fn(e);return e;}
  count(type){return type?this.events.get(type)?.size||0:[...this.events.values()].reduce((n,s)=>n+s.size,0);}
}
class ClassList {
  constructor(){this.names=new Set();} add(x){this.names.add(x);} remove(x){this.names.delete(x);} contains(x){return this.names.has(x);}
}
class Element extends Target {
  constructor(doc,tag='div'){super();this.ownerDocument=doc;this.tagName=tag.toUpperCase();this.children=[];this.style={position:'',overflow:''};this.classList=new ClassList();this.attributes={};this.clientLeft=0;this.clientTop=0;this.textContent='';this.captures=new Set();}
  setAttribute(k,v){this.attributes[k]=v;}
  appendChild(el){this.children.push(el);el.parent=this;return el;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
  getBoundingClientRect(){return{left:0,top:0,width:this.clientWidth||this.offsetWidth,height:this.clientHeight||this.offsetHeight};}
  get textWidth(){return [...this.textContent].reduce((n,c)=>n+(/\p{Script=Han}/u.test(c)?1:0.58),0)*(parseFloat(this.style.fontSize)||24);}
  get offsetWidth(){return Math.min(parseFloat(this.style.maxWidth)||1000,Math.max(1,this.textWidth));}
  get offsetHeight(){return Math.min(parseFloat(this.style.maxHeight)||1000,Math.ceil(this.textWidth/this.offsetWidth)*(parseFloat(this.style.fontSize)||24)*1.2);}
  setPointerCapture(id){this.captures.add(id);} hasPointerCapture(id){return this.captures.has(id);} releasePointerCapture(id){this.captures.delete(id);}
}
function environment({reduced=false,sensors=false}={}) {
  const win=new Target(),doc=new Target(),media=new Target();let clock=0,id=0;
  media.matches=reduced;win.matchMedia=()=>media;win.getComputedStyle=e=>({position:e.style.position||'static'});
  win.performance={now:()=>clock};win.frames=new Map();win.timers=new Map();win.isSecureContext=true;
  win.requestAnimationFrame=fn=>{const n=++id;win.frames.set(n,fn);return n;};
  win.cancelAnimationFrame=n=>win.frames.delete(n);
  win.setTimeout=(fn,ms)=>{const n=++id;win.timers.set(n,{fn,ms});return n;};
  win.clearTimeout=n=>win.timers.delete(n);
  win.tick=(ms=16)=>{clock+=ms;const next=[...win.frames.values()];win.frames.clear();next.forEach(fn=>fn(clock));};
  win.timeout=()=>{const next=[...win.timers.values()];win.timers.clear();next.forEach(t=>t.fn());};
  win.observers=[];win.ResizeObserver=class{constructor(fn){this.fn=fn;win.observers.push(this);}observe(){this.connected=true;}disconnect(){this.connected=false;}};
  if(sensors)win.DeviceOrientationEvent=function(){};
  doc.defaultView=win;doc.hidden=false;doc.createElement=tag=>new Element(doc,tag);
  const container=new Element(doc);container.clientWidth=390;container.clientHeight=420;
  return{win,doc,media,container};
}
const words=Array.from({length:24},(_,i)=>({hz:`词语${i}`}));

test('mount caps accessible tokens at 18 and never requests motion access automatically', () => {
  const e=environment({sensors:true});let requests=0;
  e.win.DeviceOrientationEvent.requestPermission=()=>{requests++;return Promise.resolve('granted');};
  const c=WordWall.mount({container:e.container,words,label:w=>w.hz});
  assert.equal(e.container.children.length,18);
  assert.ok(e.container.children.every(x=>x.tagName==='BUTTON'&&x.type==='button'&&x.attributes['aria-label']===x.textContent));
  assert.equal(requests,0);assert.equal(e.win.count('deviceorientation'),0);
  assert.equal(e.win.frames.size,1);c.destroy();
});

test('tap and keyboard select; drag and cancelled pointer do not select', () => {
  const e=environment();let chosen=0;
  const c=WordWall.mount({container:e.container,words:words.slice(0,3),onSelect:()=>chosen++});const token=e.container.children[0];
  token.emit('pointerdown');e.win.emit('pointerup');token.emit('click');assert.equal(chosen,1);
  token.emit('pointerdown');e.win.tick(16);e.win.emit('pointermove',{clientX:200,clientY:180});
  assert.ok(token.classList.contains('is-dragging'));
  e.win.emit('pointerup',{clientX:200,clientY:180});token.emit('click');assert.equal(chosen,1);
  token.emit('click',{detail:0});assert.equal(chosen,2,'keyboard remains accessible after dragging');
  token.emit('pointerdown');e.win.emit('pointercancel');token.emit('click');assert.equal(chosen,2);
  c.destroy();
});

test('stickers preserve their dropped position and do not run gravity', () => {
  const e=environment(),c=WordWall.mount({container:e.container,words:words.slice(0,6),mode:'stickers'}),token=e.container.children[0];
  assert.equal(e.win.frames.size,0);
  token.emit('pointerdown');e.win.tick(20);e.win.emit('pointermove',{clientX:180,clientY:120});e.win.emit('pointerup');
  const position=[token.style.left,token.style.top,token.style.transform];
  for(let i=0;i<50;i++)e.win.tick();
  assert.deepEqual([token.style.left,token.style.top,token.style.transform],position);assert.equal(e.win.frames.size,0);
  e.container.clientWidth=240;e.container.clientHeight=260;e.win.emit('resize');
  for(const t of e.container.children)assert.ok(parseFloat(t.style.left)>=-0.01 && parseFloat(t.style.top)>=-0.01);
  c.destroy();
});

test('sticker packing separates measured long rectangles while keeping a loose lower cluster', () => {
  const sizes=[[72,28],[64,30],[120,55],[171,28],[85,25],[214,29],[92,30],[56,29],[156,28],[74,25],[111,32],[85,28],[182,26],[58,27],[94,26],[72,30],[75,27],[107,28]];
  const bodies=sizes.map(([width,height])=>body({width,height}));
  assert.equal(P.placeStickers(bodies,342,430),0);
  for(let i=0;i<bodies.length;i++) {
    const b=bodies[i],e=P.extents(b);
    assert.ok(b.x>=e.x-0.01&&b.x<=342-e.x+0.01&&b.y>=e.y-0.01&&b.y<=430-e.y+0.01);
    for(let j=i+1;j<bodies.length;j++)assert.equal(P.overlap(b,bodies[j]),null,`overlap ${i}/${j}`);
  }
  assert.ok(bodies.filter(b=>b.y>430/2).length>=12);
  assert.ok(new Set(bodies.map(b=>b.angle)).size>5,'retain scattered rotations');
});

test('phone stickers fit Chinese and long Russian labels and keep dragged positions across remeasurement', () => {
  const e=environment();e.container.clientWidth=342;e.container.clientHeight=430;
  const labels=['不客气','不要','老师','пожалуйста, не волнуйтесь','谢谢','до свидания','преподаватель','学生','младшая сестра','再见','русский язык','同学','старший брат','一起','в воскресенье','朋友','время занятия','你好'];
  const c=WordWall.mount({container:e.container,words:labels,mode:'stickers'});
  const tokens=e.container.children;
  const bounds=tokens.map(t=>body({x:parseFloat(t.style.left)+t.offsetWidth/2,y:parseFloat(t.style.top)+t.offsetHeight/2,width:t.offsetWidth,height:t.offsetHeight,angle:parseFloat(t.style.transform.slice(7))}));
  for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++)assert.equal(P.overlap(bounds[i],bounds[j]),null,`${labels[i]} overlaps ${labels[j]}`);
  assert.equal(e.win.frames.size,0);
  const fontSizes=tokens.map(t=>parseFloat(t.style.fontSize));assert.ok(Math.max(...fontSizes)/Math.min(...fontSizes)>1.8);
  const token=tokens[0];token.emit('pointerdown');e.win.emit('pointermove',{clientX:180,clientY:100});e.win.emit('pointerup');
  const dropped=[token.style.left,token.style.top,token.style.transform,token.style.fontSize];
  e.win.emit('resize');e.media.emit('change',{matches:true});
  assert.deepEqual([token.style.left,token.style.top,token.style.transform,token.style.fontSize],dropped);
  assert.equal(e.win.frames.size,0);c.destroy();
});

test('mounted cloud visibly falls between animation frames and resumes after visibility changes', () => {
  const e=environment(),c=WordWall.mount({container:e.container,words:['学习'],mode:'cloud'}),token=e.container.children[0];
  const start=parseFloat(token.style.top);for(let i=0;i<25;i++)e.win.tick();
  assert.ok(parseFloat(token.style.top)>start+30,'the live module must render gravity, not only schedule frames');
  e.doc.hidden=true;e.doc.emit('visibilitychange');const paused=token.style.top;
  for(let i=0;i<10;i++)e.win.tick();assert.equal(token.style.top,paused);assert.equal(e.win.frames.size,0);
  e.doc.hidden=false;e.doc.emit('visibilitychange');e.win.tick();assert.notEqual(token.style.top,paused);assert.equal(e.win.frames.size,1);c.destroy();
});

test('reduced motion is static and draggable; preference changes stop an active animation', async () => {
  const e=environment({reduced:true,sensors:true});let calls=0;e.win.DeviceOrientationEvent.requestPermission=()=>{calls++;return Promise.resolve('granted');};
  const c=WordWall.mount({container:e.container,words});assert.equal(e.win.frames.size,0);
  assert.equal(await c.enableTilt(),false);assert.equal(calls,0);
  const token=e.container.children[0],before=token.style.left;token.emit('pointerdown');e.win.emit('pointermove',{clientX:200,clientY:100});e.win.emit('pointerup');assert.notEqual(token.style.left,before);
  e.media.matches=false;e.media.emit('change',{matches:false});assert.equal(e.win.frames.size,1);
  e.media.matches=true;e.media.emit('change',{matches:true});assert.equal(e.win.frames.size,0);c.destroy();
});

test('tilt resolves only after valid data, and denied or absent sensors fall back cleanly', async () => {
  const e=environment({sensors:true}),statuses=[];let requests=0;e.win.DeviceOrientationEvent.requestPermission=()=>{requests++;return Promise.resolve('granted');};
  const c=WordWall.mount({container:e.container,words,onMotionStatus:s=>statuses.push(s)});
  const pending=c.enableTilt();assert.equal(requests,1);await Promise.resolve();
  e.win.emit('deviceorientation',{beta:null,gamma:null});assert.equal(e.win.timers.size,1);
  e.win.emit('deviceorientation',{beta:75,gamma:20});assert.equal(await pending,true);
  assert.equal(e.win.timers.size,0);assert.equal(await c.enableTilt(),true);assert.equal(requests,1);assert.ok(statuses.includes('enabled'));c.destroy();
  const absent=environment({sensors:true}),a=WordWall.mount({container:absent.container,words});const noData=a.enableTilt();absent.win.timeout();assert.equal(await noData,false);assert.equal(absent.win.count('deviceorientation'),0);a.destroy();
  const denied=environment({sensors:true});denied.win.DeviceOrientationEvent.requestPermission=()=>Promise.resolve('denied');
  const d=WordWall.mount({container:denied.container,words});assert.equal(await d.enableTilt(),false);assert.equal(denied.win.count('deviceorientation'),0);d.destroy();
  const desktop=environment(),f=WordWall.mount({container:desktop.container,words});assert.equal(await f.enableTilt(),false);f.destroy();
});

test('destroy removes animation, timers, observers, DOM and every owned listener', async () => {
  const e=environment({sensors:true}),c=WordWall.mount({container:e.container,words});const tokens=[...e.container.children];
  const pending=c.enableTilt();assert.ok(e.win.count()>0&&e.win.frames.size===1&&e.win.timers.size===1);
  c.destroy();assert.equal(await pending,false);c.destroy();
  assert.equal(e.win.frames.size,0);assert.equal(e.win.timers.size,0);assert.equal(e.win.count(),0);assert.equal(e.doc.count(),0);assert.equal(e.media.count(),0);
  assert.ok(e.win.observers.every(o=>!o.connected));assert.ok(tokens.every(t=>t.count()===0));assert.equal(e.container.children.length,0);
  assert.equal(e.container.style.position,'');assert.equal(e.container.style.overflow,'');assert.equal(await c.enableTilt(),false);
});

test('permission resolving after destroy cannot attach a sensor listener', async () => {
  const e=environment({sensors:true});let resolvePermission;
  e.win.DeviceOrientationEvent.requestPermission=()=>new Promise(resolve=>{resolvePermission=resolve;});
  const c=WordWall.mount({container:e.container,words}),pending=c.enableTilt();c.destroy();assert.equal(await pending,false);
  resolvePermission('granted');await Promise.resolve();assert.equal(e.win.count(),0);assert.equal(e.win.timers.size,0);
});

test('remount destroys the previous instance and visibility pauses rendering', () => {
  const e=environment(),first=WordWall.mount({container:e.container,words}),old=[...e.container.children];
  const second=WordWall.mount({container:e.container,words:words.slice(0,4)});
  assert.equal(e.container.children.length,4);assert.ok(old.every(t=>t.count()===0));assert.equal(e.win.frames.size,1);
  first.destroy();assert.equal(e.container.children.length,4);
  e.doc.hidden=true;e.doc.emit('visibilitychange');assert.equal(e.win.frames.size,0);
  e.doc.hidden=false;e.doc.emit('visibilitychange');assert.equal(e.win.frames.size,1);second.destroy();assert.equal(e.win.count(),0);
});

test('an obsolete permission request cannot replace a later sensor subscription', async () => {
  const e=environment({sensors:true}),resolvers=[];
  e.win.DeviceOrientationEvent.requestPermission=()=>new Promise(resolve=>resolvers.push(resolve));
  const c=WordWall.mount({container:e.container,words});
  const first=c.enableTilt();e.media.emit('change',{matches:true});assert.equal(await first,false);
  e.media.emit('change',{matches:false});const second=c.enableTilt();
  resolvers[0]('granted');await Promise.resolve();assert.equal(e.win.count('deviceorientation'),0);
  resolvers[1]('granted');await Promise.resolve();assert.equal(e.win.count('deviceorientation'),1);
  e.win.emit('deviceorientation',{beta:70,gamma:10});assert.equal(await second,true);
  c.destroy();assert.equal(e.win.count(),0);
});

test('an empty word wall does not keep requesting animation frames', () => {
  const e=environment(),c=WordWall.mount({container:e.container,words:[]});
  assert.equal(e.win.frames.size,0);c.destroy();
});
