import {metadataD1Enabled,mutateStudioMetadata} from '../../../utils/studio-metadata.js';
import {getMetadata} from '../../../utils/metadata.js';
import { jsonResponse, textResponse } from "../../../utils/http.js";
import { updateMetadata } from "../../../utils/metadata.js";

export async function onRequest(context) {
    const { params, env } = context;

    if(metadataD1Enabled(env)){
        const current=await getMetadata(env,params.id);
        if(!current)return textResponse('Media not found',{status:404});

        const updated=await mutateStudioMetadata(env.MEDIA_STUDIO_DB,params.id,current,m=>({...m,liked:!m.liked}));
        return jsonResponse({success:true,liked:updated.liked});
    }
    const metadata = await updateMetadata(env, params.id, current => {
        current.liked = !current.liked;
        return current;
    });

    if (!metadata) {
        return textResponse(`Image metadata not found for ID: ${params.id}`, { status: 404 });
    }

    return jsonResponse({ success: true, liked: metadata.liked });
}
