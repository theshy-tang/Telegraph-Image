import {recordsReady,registerStudioRecord} from './utils/studio-records.js';
import {catalogStatus} from './utils/studio-catalog.js';
import {cutoverReadOnly,cutoverResponse} from './utils/cutover.js';
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
    if(cutoverReadOnly(env))return cutoverResponse();

    let recoveryId=null,stage='upload';
    try {
        const authResponse = authenticateUploadRequest(request, env);
        if (authResponse) {
            return authResponse;
        }

        const studio=options.studio===true;
        const versioned=studio&&metadataD1Enabled(env);
        const durable=studio&&await recordsReady(env);
        if(durable&&!(await catalogStatus(env))?.ready)throw Error('Upload catalog unavailable');
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
        recoveryId=longId;
        let shortId = null;

        const metadata=createDefaultMetadata(longId,{fileName,fileSize:uploadFile.size,provider:provider.key,...(studio?{aiPublished:false}:{})});
        if(durable){
            stage='d1_record';
            const saved=await registerStudioRecord(env,longId,metadata);
            return jsonResponse([{src:'/file/'+longId,record:{name:longId,metadata:saved.metadata},registration:{source:'d1',kvPending:saved.kvPending}}],{headers:{'Cache-Control':'no-store'}});
        }
        // 将文件信息保存到 KV 存储
        if (env.img_url) {
            stage='media_record';
            if (isShortUrlsEnabled(env)) {
                shortId = await allocateShortId(env);
            }

            if(shortId)metadata.shortId=shortId;
            await putMetadata(env,longId,metadata);
            stage='catalog';
            await indexStudioMedia(env,longId,metadata);

            if (shortId) {
                stage='short_link';
                await putShortLink(env, shortId, longId);
            }
        }

        return jsonResponse([{src:`/file/${shortId||longId}`,...(studio?{record:{name:longId,metadata:{...metadata,folderId:null,...(versioned?{metadataVersion:0}:{})}}}:{})}],{headers:{'Cache-Control':'no-store'}});
    } catch (error) {
        if(recoveryId&&(options.studio||uploadAuthMode(env)!=='legacy')){
            const limited=/(?:quota|daily|limit.{0,40}(?:put|write)|(?:put|write).{0,40}limit)/i.test(String(error.message));
            const code=stage==='media_record'?(limited?'MEDIA_KV_WRITE_LIMIT':'MEDIA_KV_WRITE_FAILED'):stage==='d1_record'?'MEDIA_D1_REGISTER_FAILED':stage==='catalog'?'MEDIA_CATALOG_WRITE_FAILED':'MEDIA_LINK_WRITE_FAILED';
            return jsonResponse({error:'File reached storage, but library registration failed',code,recovery:{id:recoveryId,src:'/file/'+encodeURIComponent(recoveryId)}},{status:503,headers:{'Cache-Control':'no-store'}});
        }
        if(options.studio||uploadAuthMode(env)!=='legacy')return jsonResponse({error:error instanceof StudioUploadError?error.message:'Upload failed; check storage configuration or retry later'},{status:error instanceof StudioUploadError?error.status:503,headers:{'Cache-Control':'no-store'}});
        return jsonResponse({ error: error.message }, { status: 500 });
    }
}
