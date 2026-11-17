import {
  allFolders, folderResponse, folderReady, safeMutation, parseFolderBody,
  folderName, folderId, folderKey, siblingExists
} from '../../utils/studio-folders.js';

export async function onRequestGet({env}) {
  if(!folderReady(env))return folderResponse({error:'Admin credentials and img_url KV required'},503);
  try {
    return folderResponse({folders:await allFolders(env.img_url)});
  }catch(e){
    console.error('Folder list failed',e);
    return folderResponse({error:'Cannot list folders'},503);
  }
}

export async function onRequestPost({request,env}) {
  if(!folderReady(env))return folderResponse({error:'Admin credentials and img_url KV required'},503);
  if(!safeMutation(request))return folderResponse({error:'Same-origin JSON request required'},403);
  let input;
  try {input=await parseFolderBody(request);}catch{return folderResponse({error:'Invalid JSON body'},400);}
  if(!input || typeof input!=='object')return folderResponse({error:'Invalid folder data'},400);
  const name=folderName(input.name), parentId=input.parentId == null ? null : input.parentId;
  if(!name || (parentId!==null&&!folderId(parentId)))return folderResponse({error:'Invalid name or parent ID'},400);

  try {
    const folders=await allFolders(env.img_url);
    if(folders.length>=1000)return folderResponse({error:'Folder limit reached'},409);
    if(parentId && !folders.some(f=>f.id===parentId))return folderResponse({error:'Parent folder does not exist'},404);
    if(siblingExists(folders,name,parentId))return folderResponse({error:'Folder name already exists in this location'},409);
    let depth=0, cursor=parentId;
    while(cursor){depth++;if(depth>=8)return folderResponse({error:'Maximum folder depth reached'},400);
      cursor=folders.find(f=>f.id===cursor)?.parentId||null;
    }
    const id=crypto.randomUUID().replace(/-/g,'');
    const now=Date.now();
    const folder={id,name,parentId,createdAt:now,updatedAt:now};
    await env.img_url.put(folderKey(id),'1',{metadata:folder});
    return folderResponse({folder},201);
  } catch(e) {
    console.error('Create folder failed',e);
    return folderResponse({error:'Failed to create folder'},503);
  }
}
