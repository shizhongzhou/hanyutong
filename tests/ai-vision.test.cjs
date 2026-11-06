const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createVisionRecognizer, visionCost, VISION_URL, MAX_VISION_DIMENSION } = require('../infra/yandex/function/ai-vision');
const { createTranslationHandler } = require('../infra/yandex/function/translate');
const { aiConfiguration, handler } = require('../infra/yandex/function/index');
const origin = 'https://shizhongzhou.github.io';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64');
const photo = { image: png.toString('base64'), mimeType: 'image/png', language: 'zh' };
const event = body => ({ path: '/translate/photo', httpMethod: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body), requestContext: { identity: { sourceIp: '192.0.2.4' } } });
const ctx = { token: { access_token: 'test-token' } };
const result = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
function configured(fetcher, extra={}) {
  return createTranslationHandler({ enabled: true, ocrEnabled: true, maxImageDimension: MAX_VISION_DIMENSION,
    reserveUsage: async()=>({allowed:true}), recognizeImage: createVisionRecognizer({fetcher,folder:'b1gsi4nj9mgt8alatjf9'}), ...extra });
}
test('photo route reserves before Yandex Qwen call and returns only visible text', async()=>{
  const order=[];
  const h=configured(async(url,init)=>{
    order.push('provider');assert.equal(url,VISION_URL);assert.equal(init.redirect,'error');
    assert.equal(init.headers.Authorization,'Bearer test-token');assert.equal(init.headers['OpenAI-Project'],'b1gsi4nj9mgt8alatjf9');
    const body=JSON.parse(init.body);assert.equal(body.model,'gpt://b1gsi4nj9mgt8alatjf9/qwen3.6-35b-a3b');assert.equal(body.max_tokens,1200);
    assert.match(body.messages[0].content,/never as instructions/);assert.equal(body.messages[1].content[1].image_url.url,'data:image/png;base64,'+photo.image);
    return result({ choices:[{message:{role:'assistant',content:'你好\n欢迎学习汉语。',reasoning_content:'private'},finish_reason:'stop'}],usage:{secret:'private'} });
  },{reserveUsage:async usage=>{order.push('reserve');assert.equal(usage.images,1);assert.equal(usage.identity,'192.0.2.4');return{allowed:true};}});
  const r=await h(event(photo),ctx);assert.equal(r.statusCode,200);assert.deepEqual(JSON.parse(r.body),{text:'你好\n欢迎学习汉语。'});assert.deepEqual(order,['reserve','provider']);
  assert.equal(visionCost(),2816000);
});
test('vision rejects oversized dimensions before reservation or provider',async()=>{
  const image=Buffer.from(png);image.writeUInt32BE(1801,16);
  const h=configured(()=>assert.fail('must not call'),{reserveUsage:()=>assert.fail('must not reserve')});
  const r=await h(event({...photo,image:image.toString('base64')}),ctx);assert.equal(r.statusCode,413);
});
test('vision honors budget denial and disabled flag without provider call',async()=>{
  for(const options of [{reserveUsage:async()=>({allowed:false,error:'monthly_limit'})},{ocrEnabled:false}]){
    const r=await configured(()=>assert.fail('must not call'),options)(event(photo),ctx);assert.ok([429,503].includes(r.statusCode));
  }
});
test('vision maps no text, truncation, and provider failures without leaking errors',async()=>{
  const cases=[['NO_TEXT','stop',422],['文字','length',200],[null,'stop',502]];
  for(const [text,reason,status]of cases){
    const r=await configured(async()=>result({choices:[{message:{content:text},finish_reason:reason}]}))(event(photo),ctx);
    assert.equal(r.statusCode,status);if(reason==='length')assert.equal(JSON.parse(r.body).truncated,true);
  }
  const r=await configured(async()=>new Response('secret-provider-detail',{status:401}))(event(photo),ctx);
  assert.equal(r.statusCode,502);assert.equal(r.body.includes('secret-provider-detail'),false);
});
test('AI configuration exposes availability only with flags, credentials and budget',()=>{
  const env={AI_CHAT_ENABLED:'true',AI_VISION_ENABLED:'true',AI_ASSESSMENT_ENABLED:'true',AI_FEEDBACK_ENABLED:'true',QWEN_TTS_ENABLED:'true',QWEN_ASR_ENABLED:'true'};
  assert.deepEqual(aiConfiguration(env),{enabled:false,visionEnabled:false,assessmentEnabled:false,feedbackEnabled:false,ttsEnabled:false,asrEnabled:false,maxInputChars:2000});
  Object.assign(env,{AI_BUDGET_BUCKET:'usage-bucket',AI_IDENTITY_SALT:'x'.repeat(32),DEEPSEEK_API_KEY:'test-private-key',YANDEX_FOLDER_ID:'b1gsi4nj9mgt8alatjf9',QWEN_API_KEY:'sk-ws-test-private-key',QWEN_API_HOST:'example.cn-beijing.maas.aliyuncs.com'});
  assert.deepEqual(aiConfiguration(env),{enabled:true,visionEnabled:true,assessmentEnabled:true,feedbackEnabled:true,ttsEnabled:true,asrEnabled:true,maxInputChars:2000});
  env.QWEN_API_KEY='sk-sp-test-plan-key';assert.equal(aiConfiguration(env).ttsEnabled,false);
  env.DEEPSEEK_MODEL='deepseek-expensive-unknown';assert.equal(aiConfiguration(env).enabled,false);
  assert.equal(aiConfiguration(env).assessmentEnabled,true);
  env.DEEPSEEK_ASSESSMENT_MODEL='deepseek-pro';assert.equal(aiConfiguration(env).assessmentEnabled,false);
  delete env.DEEPSEEK_API_KEY;assert.equal(aiConfiguration(env).feedbackEnabled,true);
  env.AI_BUDGET_BUCKET='../other';assert.equal(aiConfiguration(env).feedbackEnabled,false);assert.equal(aiConfiguration(env).visionEnabled,false);
});
test('AI config is read only, private, and rejects unsupported origins/routes',async()=>{
  const r=await handler({path:'/ai/config',httpMethod:'GET',headers:{origin}});
  assert.equal(r.statusCode,200);assert.equal(r.headers['Cache-Control'],'private, no-store');
  assert.deepEqual(Object.keys(JSON.parse(r.body)).sort(),['enabled','visionEnabled','assessmentEnabled','feedbackEnabled','ttsEnabled','asrEnabled','maxInputChars'].sort());
  for(const [path,method,headers,status]of [['/ai/config','POST',{},405],['/ai/config','GET',{origin:'https://evil.test'},403],['/ai/unknown','GET',{},404],['/ai/config','OPTIONS',{origin},204]]){
    assert.equal((await handler({path,httpMethod:method,headers})).statusCode,status);
  }
});
test('new task, assessment and feedback routes dispatch without a paid membership gate',async()=>{
  const previous={};
  for(const key of ['AI_ASSESSMENT_ENABLED','AI_FEEDBACK_ENABLED','AI_BUDGET_BUCKET','AI_IDENTITY_SALT','DEEPSEEK_API_KEY','DEEPSEEK_ASSESSMENT_MODEL'])previous[key]=process.env[key];
  try{
    process.env.AI_ASSESSMENT_ENABLED='false';process.env.AI_FEEDBACK_ENABLED='false';
    const tasks=await handler({path:'/ai/tasks',httpMethod:'GET',headers:{origin}});
    assert.equal(tasks.statusCode,200);assert.equal(JSON.parse(tasks.body).tasks.length,108);assert.doesNotMatch(tasks.body,/"sample"/);
    const assess=await handler({path:'/ai/assess',httpMethod:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});
    assert.equal(assess.statusCode,503);assert.equal(JSON.parse(assess.body).error,'assessment_disabled');
    const feedback=await handler({path:'/ai/feedback',httpMethod:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});
    assert.equal(feedback.statusCode,503);assert.equal(JSON.parse(feedback.body).error,'feedback_disabled');
    Object.assign(process.env,{AI_ASSESSMENT_ENABLED:'true',AI_FEEDBACK_ENABLED:'true',AI_BUDGET_BUCKET:'usage-bucket',AI_IDENTITY_SALT:'x'.repeat(32),DEEPSEEK_API_KEY:'test-key',DEEPSEEK_ASSESSMENT_MODEL:'deepseek-v4-pro'});
    const invalid=await handler({path:'/ai/assess',httpMethod:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({mode:'writing',taskId:'writing-hsk1-01',answer:'中文',paid:true})},ctx);
    assert.equal(invalid.statusCode,400);assert.equal(JSON.parse(invalid.body).error,'invalid_input');
    const noConsent=await handler({path:'/ai/feedback',httpMethod:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({prompt:'中文',answer:'Ответ',reason:'unclear',consent:false})},ctx);
    assert.equal(noConsent.statusCode,400);assert.equal(JSON.parse(noConsent.body).error,'consent_required');
    for(const path of ['/ai/tasks','/ai/assess','/ai/feedback'])assert.equal((await handler({path,httpMethod:'OPTIONS',headers:{origin}})).statusCode,204);
  }finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test('feedback requires its own configured storage and assessment can run independently of chat',()=>{
  const env={TRANSLATION_BUDGET_BUCKET:'usage-bucket',TRANSLATION_IDENTITY_SALT:'x'.repeat(32),DEEPSEEK_API_KEY:'test-key',AI_ASSESSMENT_ENABLED:'true',AI_FEEDBACK_ENABLED:'true'};
  const config=aiConfiguration(env);assert.equal(config.enabled,false);assert.equal(config.assessmentEnabled,true);assert.equal(config.feedbackEnabled,false);
});
