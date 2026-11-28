import {metadataD1Enabled,mutateStudioMetadata} from '../../../utils/studio-metadata.js';
import {getMetadata} from '../../../utils/metadata.js';
import { jsonResponse, textResponse } from "../../../utils/http.js";
import { updateMetadata } from "../../../utils/metadata.js";

export async function onRequest(context) {
    const { request, params, env } = context;

    const url = new URL(request.url);
    const fileName = url.searchParams.get('newName') || params.name;
    if(metadataD1Enabled(env)){
        const current=await getMetadata(env,params.id);
        if(!current)return textResponse('Media not found',{status:404});
        if(typeof fileName!=='string'||!fileName.trim()||fileName.length>160||/[\u0000-\u001f\u007f<>]/.test(fileName))return textResponse('Invalid display name',{status:400});
        const updated=await mutateStudioMetadata(env.MEDIA_STUDIO_DB,params.id,current,m=>({...m,fileName}));
        return jsonResponse({success:true,fileName:updated.fileName});
    }
    const metadata = await updateMetadata(env, params.id, current => {
        current.fileName = fileName;
        return current;
    });

    if (!metadata) {
        return textResponse(`Image metadata not found for ID: ${params.id}`, { status: 404 });
    }

    return jsonResponse({ success: true, fileName: metadata.fileName });
}
