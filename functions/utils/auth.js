import { isEmptyBinding, jsonResponse, textResponse } from './http.js';

export const DASHBOARD_DISABLED_MESSAGE = 'Dashboard is disabled. Please bind a KV namespace to use this feature.';
export const BASIC_AUTH_CHALLENGE = 'Basic realm="my scope", charset="UTF-8"';

export function basicAuthentication(request) {
  const authorization = request.headers.get('Authorization') || '';
  const [scheme, encoded] = authorization.split(' ');

  if (!encoded || scheme !== 'Basic') {
    return badRequestResponse('Malformed authorization header.');
  }

  let buffer;
  try {
    buffer = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  } catch {
    return badRequestResponse('Invalid authorization value.');
  }
  const decoded = new TextDecoder().decode(buffer).normalize();
  const index = decoded.indexOf(':');

  if (index === -1 || /[\0-\x1F\x7F]/.test(decoded)) {
    return badRequestResponse('Invalid authorization value.');
  }

  return {
    user: decoded.substring(0, index),
    pass: decoded.substring(index + 1),
  };
}

export function dashboardDisabledResponse() {
  return textResponse(DASHBOARD_DISABLED_MESSAGE, { status: 200 });
}

export function basicAuthChallengeResponse() {
  return textResponse('You need to login.', {
    status: 401,
    headers: {
      'WWW-Authenticate': BASIC_AUTH_CHALLENGE,
    },
  });
}

export function unauthorizedResponse(reason) {
  return textResponse(reason, {
    status: 401,
    statusText: 'Unauthorized',
    headers: plainTextHeaders(reason),
  });
}

function badRequestResponse(reason) {
  return textResponse(reason, {
    status: 400,
    statusText: 'Bad Request',
    headers: plainTextHeaders(reason),
  });
}

function plainTextHeaders(reason) {
  return {
    'Content-Type': 'text/plain;charset=UTF-8',
    'Cache-Control': 'no-store',
    'Content-Length': new TextEncoder().encode(reason).length,
  };
}

export function uploadAuthMode(env){
  return env.UPLOAD_AUTH_MODE || 'legacy';
}
export function uploadRequiresAuth(env){
  return uploadAuthMode(env)!=='legacy'||!isEmptyBinding(env.UPLOAD_BASIC_USER)||!isEmptyBinding(env.UPLOAD_BASIC_PASS);
}
export function authenticateUploadRequest(request, env) {
  const mode=uploadAuthMode(env);
  if(!['legacy','admin','dedicated'].includes(mode))return jsonResponse({error:'Invalid upload authentication mode'},{status:503});
  const user=mode==='admin'?env.BASIC_USER:env.UPLOAD_BASIC_USER;
  const pass=mode==='admin'?env.BASIC_PASS:env.UPLOAD_BASIC_PASS;
  const hasUser=!isEmptyBinding(user),hasPass=!isEmptyBinding(pass);
  if(mode==='legacy'&&!hasUser&&!hasPass)return null;
  if(!hasUser||!hasPass){
    return jsonResponse({error:mode==='admin'?'Admin credentials must be configured':'UPLOAD_BASIC_USER and UPLOAD_BASIC_PASS must both be configured to protect uploads'},{status:mode==='legacy'?500:503});
  }
  const origin=request.headers.get('Origin');
  if(origin&&origin!==new URL(request.url).origin)return jsonResponse({error:'Cross-origin uploads are forbidden'},{status:403});
  if(!request.headers.has('Authorization'))return basicAuthChallengeResponse();
  const credentials=basicAuthentication(request);
  if(credentials instanceof Response)return credentials;
  if(user!==credentials.user||pass!==credentials.pass)return unauthorizedResponse('Invalid upload credentials.');
  return null;
}
