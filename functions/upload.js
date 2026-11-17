import {indexStudioMedia} from './utils/studio-catalog.js';
import {readStudioUpload,studioUploadLimit,StudioUploadError} from './utils/studio-upload.js';
import {metadataD1Enabled} from './utils/studio-metadata.js';
import { authenticateUploadRequest, uploadAuthMode } from "./utils/auth.js";
import { jsonResponse } from "./utils/http.js";
import { createDefaultMetadata, putMetadata } from "./utils/metadata.js";
import { allocateShortId, isShortUrlsEnabled, putShortLink } from "./utils/shortlink.js";
import { getUploadProvider } from "./storage/index.js";

export async function onRequestPost(context) {
    return performUpload(context);
}

export async function performUpload(context, options={}) {
    const { request, env } = context;

    try {
        const authResponse = authenticateUploadRequest(request, env);
        if (authResponse) {
            return authResponse;
        }

        const studio=options.studio===true;
        const versioned=studio&&metadataD1Enabled(env);
        const limit=studio?studioUploadLimit(env):null;
        const provider = getUploadProvider(env);
        try{provider.validateConfig(env);}catch(error){if(studio)return jsonResponse({error:'Upload storage is unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});throw error;}

        const formData = studio?await readStudioUpload(request,limit):await request.clone().formData();

        const uploadFile = formData.get('file');
        if (!uploadFile) {
            throw new Error('No file uploaded');
        }

        const fileName = uploadFile.name;
        const fileExtension = fileName.split('.').pop().toLowerCase();

        const longId = await provider.upload(env, uploadFile, { fileName, fileExtension });
        let shortId = null;

        const metadata=createDefaultMetadata(longId,{fileName,fileSize:uploadFile.size,provider:provider.key,...(studio?{aiPublished:false}:{})});
        // 将文件信息保存到 KV 存储
        if (env.img_url) {
            if (isShortUrlsEnabled(env)) {
                shortId = await allocateShortId(env);
            }

            if(shortId)metadata.shortId=shortId;
            await putMetadata(env,longId,metadata);
            await indexStudioMedia(env,longId,metadata);

            if (shortId) {
                await putShortLink(env, shortId, longId);
            }
        }

        return jsonResponse([{src:`/file/${shortId||longId}`,...(studio?{record:{name:longId,metadata:{...metadata,folderId:null,...(versioned?{metadataVersion:0}:{})}}}:{})}],{headers:{'Cache-Control':'no-store'}});
    } catch (error) {
        if(options.studio||uploadAuthMode(env)!=='legacy')return jsonResponse({error:error instanceof StudioUploadError?error.message:'Upload failed; check storage configuration or retry later'},{status:error instanceof StudioUploadError?error.status:503,headers:{'Cache-Control':'no-store'}});
        return jsonResponse({ error: error.message }, { status: 500 });
    }
}
