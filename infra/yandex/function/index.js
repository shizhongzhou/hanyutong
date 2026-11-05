'use strict';
const { createHmac, timingSafeEqual } = require('node:crypto');
const privateCatalog = require('./catalog.json');
const BUCKET = 'https://storage.yandexcloud.net/hanyutong-dev-media-b1gsi4nj/';
const MAX_RANGE = 1024 * 1024;
const ORIGINS = new Set(['https://shizhongzhou.github.io', 'http://127.0.0.1:8765', 'http://localhost:8765']);
function publicCatalog(catalog) {
  const { source, ...result } = catalog;
  result.files = catalog.files.map(({key, sha256, preview, ...file}) => file);
  return result;
}
function requestedRange(header, size) {
  if (!header) return [0, Math.min(size, MAX_RANGE) - 1];
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  let start, end;
  if (!match[1]) {
    const count = Number(match[2]);
    if (!Number.isSafeInteger(count) || count <= 0) return null;
    start = Math.max(0, size - count); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return null;
  return [start, Math.min(end, size - 1, start + MAX_RANGE - 1)];
}
function createHandler({catalog = privateCatalog, secret = () => process.env.LIBRARY_SESSION_SECRET, fetcher = fetch, now = () => Date.now()} = {}) {
  const entries = new Map(catalog.files.map(f => [f.id, f]));
  const catalogBody = JSON.stringify(publicCatalog(catalog));
  const sign = (payload, key) => createHmac('sha256', key).update(payload).digest('base64url');
  return async (event, context = {}) => {
    const method = event.httpMethod || 'GET', path = event.path || '/health';
    const incoming = Object.fromEntries(Object.entries(event.headers || {}).map(([k,v]) => [k.toLowerCase(),v]));
    const origin = incoming.origin;
    const headers = {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges', 'Vary': 'Origin'
    };
    if (ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const response = (statusCode, data = {}, extra = {}) => ({statusCode, headers: {...headers, ...extra}, body: method === 'HEAD' || statusCode === 204 ? '' : JSON.stringify(data)});
    if (origin && !ORIGINS.has(origin)) return response(403, {error:'origin_not_allowed'});
    if (method === 'OPTIONS') return response(204);
    if (path === '/health' && ['GET','HEAD'].includes(method)) return response(200, {status:'ok',service:'hanyutong',environment:'development',libraryFiles:catalog.totalFiles});
    if (path === '/library/catalog') {
      if (!['GET','HEAD'].includes(method)) return response(405, {error:'method_not_allowed'});
      return {...response(200), body: method === 'HEAD' ? '' : catalogBody};
    }
    const match = /^\/library\/(access|media)\/(rts-[a-f0-9]{24})$/.exec(path);
    const file = match && entries.get(match[2]);
    if (!file) return response(404, {error:'not_found'});
    const key = secret();
    if (!key || key.length < 32) return response(503, {error:'reader_not_configured'});
    const view = file.preview || (['pdf','audio'].includes(file.kind) ? file : null);
    if (!view || !/^library\/(road-to-success|previews)\/[a-f0-9]{64}\.(pdf|mp3)$/.test(view.key)) return response(409, {error:'preview_unavailable'});
    if (match[1] === 'access') {
      if (method !== 'POST') return response(405, {error:'method_not_allowed'});
      if (!ORIGINS.has(origin)) return response(403, {error:'app_origin_required'});
      const expires = Math.floor(now() / 1000) + 3600;
      const payload = Buffer.from(JSON.stringify({id:file.id,exp:expires})).toString('base64url');
      return response(200, {token: payload + '.' + sign(payload, key), expires});
    }
    if (!['GET','HEAD'].includes(method)) return response(405, {error:'method_not_allowed'});
    const token = event.queryStringParameters?.ticket;
    if (typeof token !== 'string' || token.length > 512) return response(401, {error:'reading_session_required'});
    const [payload, signature, extra] = token.split('.');
    try {
      const expected = Buffer.from(sign(payload, key));
      const actual = Buffer.from(signature || '');
      if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw Error();
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (claims.id !== file.id || !Number.isSafeInteger(claims.exp) || claims.exp <= Math.floor(now()/1000)) throw Error();
    } catch (_) { return response(401, {error:'reading_session_expired'}); }
    const mediaHeaders = {'Content-Type':file.kind === 'audio' ? 'audio/mpeg' : 'application/pdf','Accept-Ranges':'bytes','Content-Disposition':'inline'};
    if (method === 'HEAD') return response(200, {}, {...mediaHeaders, 'Content-Length':String(view.size)});
    const range = requestedRange(incoming.range, view.size);
    if (!range) return response(416, {error:'invalid_range'}, {'Content-Range':`bytes */${view.size}`});
    const [start,end] = range;
    if (!context.token?.access_token) return response(503, {error:'reader_credentials_unavailable'});
    try {
      const upstream = await fetcher(BUCKET + view.key, {
        headers:{Authorization:'Bearer ' + context.token.access_token,Range:`bytes=${start}-${end}`},
        signal:AbortSignal.timeout(8000), redirect:'error'
      });
      if (upstream.status !== 206 || upstream.headers.get('content-range') !== `bytes ${start}-${end}/${view.size}`) return response(502, {error:'reading_source_unavailable'});
      const content = Buffer.from(await upstream.arrayBuffer());
      if (content.length !== end-start+1) return response(502, {error:'incomplete_reading_range'});
      return {statusCode:206, headers:{...headers,...mediaHeaders,'Content-Range':`bytes ${start}-${end}/${view.size}`,'Content-Length':String(content.length)}, isBase64Encoded:true, body:content.toString('base64')};
    } catch (_) { return response(502, {error:'reading_source_unavailable'}); }
  };
}
exports.handler = createHandler();
exports.createHandler = createHandler;
exports.publicCatalog = publicCatalog;
exports.requestedRange = requestedRange;
