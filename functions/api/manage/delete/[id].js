import {hasStudioD1} from '../../../utils/studio-d1.js';
import {metadataD1Enabled,markStudioMediaDeleted} from '../../../utils/studio-metadata.js';
import { jsonResponse } from "../../../utils/http.js";
import { deleteShortLink } from "../../../utils/shortlink.js";

export async function onRequest(context) {
    const { env, params, request } = context;

    if(hasStudioD1(env)){
        if(request.method!=='DELETE')return jsonResponse({error:'DELETE required'},{status:405,headers:{Allow:'DELETE'}});
        if(request.headers.get('Origin')!==new URL(request.url).origin)return jsonResponse({error:'Same-origin request required'},{status:403});
        if(!/^[A-Za-z0-9_-]{5,300}\.[A-Za-z0-9]{2,12}$/.test(params.id))return jsonResponse({error:'Invalid media ID'},{status:400});
    }
    const raw=await env.img_url.getWithMetadata(params.id);
    const metadata=raw?.metadata;
    if(hasStudioD1(env)){
        if(metadataD1Enabled(env))await markStudioMediaDeleted(env.MEDIA_STUDIO_DB,params.id,metadata||{});
        else await env.MEDIA_STUDIO_DB.prepare('DELETE FROM studio_media_folders WHERE media_id=?').bind(params.id).run();
    }
    await env.img_url.delete(params.id);

    if (metadata?.shortId) {
        await deleteShortLink(env, metadata.shortId);
    }

    return jsonResponse(params.id);
}
