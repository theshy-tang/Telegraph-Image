import {performUpload} from '../../upload.js';
import {jsonResponse} from '../../utils/http.js';
export async function onRequestPost(context){
  const {request,env}=context;
  if(!env.img_url)return jsonResponse({error:'Media storage index unavailable'},{status:503});
  if(request.headers.get('Origin')!==new URL(request.url).origin)return jsonResponse({error:'Same-origin upload required'},{status:403});
  // The management middleware and shared uploader both validate the admin account.
  // Dedicated credentials on /upload remain independent from the Studio login.
  return performUpload({...context,env:{...env,UPLOAD_AUTH_MODE:'admin'}},{studio:true});
}
