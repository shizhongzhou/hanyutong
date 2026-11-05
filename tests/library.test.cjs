const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const catalog = require('../web/data/library-catalog.json');
const privateCatalog = require('../infra/yandex/function/catalog.json');
const inventory = require('../infra/yandex/source-inventory.json');
const {handler,createHandler,publicCatalog,requestedRange} = require('../infra/yandex/function/index.js');
const source = fs.readFileSync(require.resolve('../web/js/library.js'), 'utf8');
function client(fetch, storage = new Map()) {
  const context = vm.createContext({ fetch, AbortSignal, setTimeout, localStorage: {
    getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v)
  }});
  vm.runInContext(source + '\nthis.library = CloudLibrary;', context);
  return context.library;
}
test('593 source entries and 20 complete reading copies; public catalog omits original locations', () => {
  assert.equal(catalog.books.length, 21); assert.equal(catalog.files.length, 593);
  assert.equal(catalog.totalBytes, 4959124413);
  assert.equal(catalog.files.reduce((s,f) => s+f.size,0),catalog.totalBytes);
  assert.deepEqual(catalog.files.reduce((s,f) => {s[f.kind]=(s[f.kind]||0)+1;return s;},{}),{pdf:29,audio:544,slides:20});
  assert.equal(new Set(catalog.files.map(f=>f.id)).size,593);
  const deferred = new Set(require('../infra/yandex/deferred-files.json').paths);
  assert.equal(deferred.size,40);
  for (const f of inventory.files.filter(f=>!deferred.has(f.path) && !f.name.endsWith('.doc'))) {
    const id='rts-'+crypto.createHash('sha256').update(f.path).digest('hex').slice(0,24);
    const entry=privateCatalog.files.find(x=>x.id===id);
    assert.equal(entry.sha256,f.sha256);assert.equal(entry.size,f.size);
    assert.ok(entry.viewSize>0);
    if (['document','slides'].includes(entry.kind)) {assert.ok(entry.preview.pages>0);assert.equal(entry.preview.size,entry.viewSize);}
  }
  assert.equal(privateCatalog.files.filter(f=>f.preview).length,20);
  for (const b of catalog.books) assert.equal(b.fileCount,catalog.files.filter(f=>f.bookId===b.id).length);
  assert.deepEqual(catalog,publicCatalog(privateCatalog));
  assert.doesNotMatch(JSON.stringify(catalog),/storage\.yandex|disk\.yandex|"key"|"sha256"|"preview"/);
});
test('client falls back to shipped catalog on cloud failure and rejects leaked storage paths', async()=>{
  const calls=[];const library=client(async url=>{calls.push(url);if(url.startsWith('https:'))throw Error('offline');return{ok:true,json:async()=>catalog};});
  assert.equal((await library.load()).totalFiles,593);await library.load();assert.equal(calls.length,2);
  for (const mutate of [d=>d.files[0].key='../secret',d=>d.files[0].size=-1,d=>d.files[0].id=d.files[1].id,d=>d.files[0].lesson=-1]) {
    const bad=structuredClone(catalog);mutate(bad);assert.throws(()=>library.validate(bad));
  }
});
test('audio matches the same book and exact lesson, including lesson 1 versus lesson 10',()=>{
  const library=client(()=>{});
  for (const file of catalog.files.filter(f=>['slides','document'].includes(f.kind)&&f.lesson)) {
    const matched=library.companions(catalog,file);
    for(const audio of matched){assert.equal(audio.lesson,file.lesson);assert.equal(audio.bookId,file.bookId);}
    if(file.bookId==='rts-02'&&file.lesson===11)assert.equal(matched.length,0); // source explicitly deferred
    else assert.ok(matched.length>0,file.id);
  }
  for(const audio of catalog.files.filter(f=>f.kind==='audio')) {
    const reader=library.readerFor(catalog,audio);assert.ok(reader);assert.equal(reader.bookId,audio.bookId);
    if(reader.kind==='slides'||reader.kind==='document')assert.equal(reader.lesson,audio.lesson);
  }
  const readingOnly=catalog.files.find(f=>f.bookId==='rts-11');assert.equal(library.companions(catalog,readingOnly).length,0);
});
test('reading positions survive reopening without touching HSK progress',()=>{
  const storage=new Map([['hanyutong-v2','{"profile":{"nick":"Тест"}}']]);
  client(()=>{},storage).update(catalog.files[0].id,{page:12,pos:40});
  const reopened=client(()=>{},storage);assert.equal(reopened.state(catalog.files[0].id).page,12);assert.equal(reopened.state(catalog.files[0].id).pos,40);
  assert.equal(storage.get('hanyutong-v2'),'{"profile":{"nick":"Тест"}}');
});
test('range parser caps responses and handles suffix, invalid and end-of-file requests',()=>{
  assert.deepEqual(requestedRange(undefined,2000000),[0,1048575]);
  assert.deepEqual(requestedRange('bytes=100-1999999',2000000),[100,1048675]);
  assert.deepEqual(requestedRange('bytes=-10',100),[90,99]);
  assert.deepEqual(requestedRange('bytes=99-',100),[99,99]);
  for(const range of ['bytes=100-','bytes=10-9','bytes=0-1,5-6','bytes=-0','bytes=-','items=0-1','bytes=99999999999999999999-'])assert.equal(requestedRange(range,100),null);
});
test('reading tickets expire, cannot be tampered with or used for another file',async()=>{
  let time=1000000;let calls=0;
  const h=createHandler({secret:()=> 'a'.repeat(64),now:()=>time,fetcher:async(url,opts)=>{calls++;const f=privateCatalog.files.find(f=>url.endsWith((f.preview||f).key));assert.ok(f);assert.equal(opts.headers.Authorization,'Bearer test-cloud-token');const [start,end]=opts.headers.Range.slice(6).split('-').map(Number);return new Response(new Uint8Array(end-start+1),{status:206,headers:{'content-range':`bytes ${start}-${end}/${(f.preview||f).size}`}});}});
  const file=catalog.files.find(f=>f.kind==='slides'), other=catalog.files.find(f=>f.id!==file.id);
  const origin={Origin:'https://shizhongzhou.github.io'};
  const issue=await h({path:'/library/access/'+file.id,httpMethod:'POST',headers:origin});assert.equal(issue.statusCode,200);
  const token=JSON.parse(issue.body).token;
  const event={path:'/library/media/'+file.id,headers:{...origin,Range:'bytes=0-99'},queryStringParameters:{ticket:token}};
  const result=await h(event,{token:{access_token:'test-cloud-token'}});
  assert.equal(result.statusCode,206);assert.equal(Buffer.from(result.body,'base64').length,100);assert.equal(result.headers['Cache-Control'],'private, no-store');assert.equal(result.headers['Content-Disposition'],'inline');
  for(const bad of [{...event,queryStringParameters:{}},{...event,queryStringParameters:{ticket:token+'x'}},{...event,path:'/library/media/'+other.id},{...event,headers:{Origin:'https://attacker.example'}}])assert.ok([401,403].includes((await h(bad)).statusCode));
  time+=3600000;assert.equal((await h(event)).statusCode,401);assert.equal(calls,1);
  assert.equal((await h({path:'/library/access/'+file.id,httpMethod:'POST'})).statusCode,403);
  assert.equal((await h({path:'/library/media/../../private'})).statusCode,404);
});
test('API catalog and health stay available; UI has no file export or offline save',async()=>{
  const result=await handler({httpMethod:'GET',path:'/library/catalog',headers:{Origin:'https://shizhongzhou.github.io'}});
  assert.equal(result.statusCode,200);assert.deepEqual(JSON.parse(result.body),catalog);
  assert.equal(result.headers['Access-Control-Allow-Origin'],'https://shizhongzhou.github.io');
  assert.equal((await handler({httpMethod:'HEAD',path:'/library/catalog'})).body,'');
  assert.equal((await handler({httpMethod:'OPTIONS',path:'/library/catalog'})).statusCode,204);
  assert.equal((await handler({httpMethod:'POST',path:'/library/catalog'})).statusCode,405);
  assert.equal((await handler({path:'/unknown'})).statusCode,404);
  assert.equal(JSON.parse((await handler({path:'/health'})).body).status,'ok');
  assert.doesNotMatch(source,/lib-save|lib-open|download=|target="_blank"|CloudLibrary\.download|createObjectURL/);
  assert.match(source,/controlsList="nodownload noremoteplayback"/);
});
test('recording numbers map to textbook lessons and review sections, not filename order',()=>{
  const library=client(()=>{});
  const audio=(book,n)=>catalog.files.find(f=>f.bookId===book&&f.kind==='audio'&&f.track===n);
  assert.equal(audio('rts-06',2).lesson,1);assert.equal(audio('rts-06',42).lesson,12);
  assert.equal(audio('rts-10',36).page,64);assert.equal(audio('rts-10',69).page,116);assert.equal(audio('rts-10',91).page,144);
  assert.equal(audio('rts-17',4).page,21);assert.equal(audio('rts-14',26).unit,'review-1');assert.equal(audio('rts-14',26).lesson,null);
  const r=library.readerFor(catalog,audio('rts-09',80));
  const groups=library.unitsFor(catalog,r);assert.equal(groups.length,24);
  assert.equal(groups.find(u=>u.lesson===24).tracks.length,0);
  for(const f of catalog.files.filter(f=>f.kind==='audio')) {
    assert.ok(f.unit,f.name);assert.ok(f.track>0,f.name);
    const reader=library.readerFor(catalog,f),units=library.unitsFor(catalog,reader);
    assert.equal(units.flatMap(u=>u.tracks).filter(t=>t.id===f.id).length,1);
    if(f.readerId){assert.equal(reader.id,f.readerId);assert.ok(f.page>=1);}
  }
});
test('removed teaching references cannot obtain a reading ticket',async()=>{
  const removed=Object.keys(require('../infra/yandex/previews.json')).filter(id=>!catalog.files.some(f=>f.id===id));assert.equal(removed.length,14);
  for(const id of removed)assert.equal((await handler({path:'/library/access/'+id,httpMethod:'POST',headers:{Origin:'https://shizhongzhou.github.io'}})).statusCode,404);
  assert.ok(!catalog.files.some(f=>f.kind==='document'));
});
test('interrupted range bodies retry without losing bytes',async()=>{
  const file=catalog.files.find(f=>f.kind==='pdf');let chunks=0;
  const library=client(async url=>url.includes('/access/')?{ok:true,json:async()=>({token:'test',expires:Date.now()/1000+3600})}:{status:206,headers:new Headers({'Content-Range':`bytes 0-99/${file.viewSize}`}),arrayBuffer:async()=>{if(++chunks===1)throw Error('interrupted');return new Uint8Array(100).buffer;}});
  assert.equal((await library.range(file,0,100)).length,100);assert.equal(chunks,2);
});
test('gateway resolves parameterized file paths in payload format 1.0',()=>{
  const spec=fs.readFileSync(require.resolve('../infra/yandex/gateway.yaml'),'utf8');
  assert.equal((spec.match(/type: cloud_functions/g)||[]).length,(spec.match(/payload_format_version: "1.0"/g)||[]).length);
});
