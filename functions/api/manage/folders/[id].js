import {
  allFolders, folderResponse, folderReady, safeMutation, parseFolderBody,
  folderName, folderId, folderKey, siblingExists, createsCycle,
  hasChildFolder, containsMedia
} from '../../../utils/studio-folders.js';

export async function onRequestPatch({request,env,params}) {
  if(!folderReady(env))return folderResponse({error:'Admin credentials and img_url KV required'},503);
  if(!safeMutation(request))return folderResponse({error:'Same-origin JSON request required'},403);
  const id=params.id;
  if(!folderId(id))return folderResponse({error:'Invalid folder ID'},400);
  let input;
  try {input=await parseFolderBody(request);}catch{return folderResponse({error:'Invalid JSON body'},400);}
  if(!input||typeof input!=='object'||(!Object.hasOwn(input,'name')&&!Object.hasOwn(input,'parentId')))
    return folderResponse({error:'Name or parent folder is required'},400);
  if(Object.hasOwn(input,'name')&&!folderName(input.name))return folderResponse({error:'Invalid folder name'},400);
  if(Object.hasOwn(input,'parentId')&&input.parentId!==null&&!folderId(input.parentId))
    return folderResponse({error:'Invalid parent folder'},400);

  try {
    const folders=await allFolders(env.img_url);
    const current=folders.find(f=>f.id===id);
    if(!current)return folderResponse({error:'Folder not found'},404);
    const name=Object.hasOwn(input,'name')?folderName(input.name):current.name;
    const parentId=Object.hasOwn(input,'parentId')?input.parentId:current.parentId;
    if(parentId&&!folders.some(f=>f.id===parentId))return folderResponse({error:'Parent folder does not exist'},404);
    if(createsCycle(folders,id,parentId))return folderResponse({error:'Cannot move a folder inside itself or its descendants'},409);
    if(siblingExists(folders,name,parentId,id))return folderResponse({error:'Folder name already exists in destination'},409);
    // Enforce maximum depth of 8 for this folder and its descendants.
    let depth=0,parent=parentId;
    while(parent){depth++;if(depth>=8)return folderResponse({error:'Maximum folder depth reached'},400);parent=folders.find(f=>f.id===parent)?.parentId||null;}
    const descendants=(node)=>{const children=folders.filter(f=>f.parentId===node);return children.length?1+Math.max(...children.map(f=>descendants(f.id))):0;};
    if(depth+descendants(id)>7)return folderResponse({error:'Moving subtree would exceed maximum depth'},400);

    const persisted=await env.img_url.getWithMetadata(folderKey(id));
    if(!persisted?.metadata)return folderResponse({error:'Folder not found'},404);
    const updated={...persisted.metadata,id,name,parentId,updatedAt:Date.now()};
    await env.img_url.put(folderKey(id),persisted.value??'1',{metadata:updated});
    return folderResponse({folder:updated});
  }catch(e){console.error('Update folder failed',e);return folderResponse({error:'Failed to update folder'},503);}
}

export async function onRequestDelete({request,env,params}) {
  if(!folderReady(env))return folderResponse({error:'Admin credentials and img_url KV required'},503);
  if(request.headers.get('Origin')!==new URL(request.url).origin)return folderResponse({error:'Same-origin request required'},403);
  const id=params.id;
  if(!folderId(id))return folderResponse({error:'Invalid folder ID'},400);
  try {
    // Independent safety checks run concurrently. Deletion still happens only
    // after confirming both that there are no child folders and no media.
    const [folders, hasMedia] = await Promise.all([
      allFolders(env.img_url),
      containsMedia(env.img_url,id)
    ]);
    if(!folders.some(f=>f.id===id))return folderResponse({error:'Folder not found'},404);
    if(hasChildFolder(folders,id))return folderResponse({error:'Move or delete child folders first'},409);
    if(hasMedia)return folderResponse({error:'Move media out of this folder before deleting'},409);
    await env.img_url.delete(folderKey(id));
    return folderResponse({deleted:id});
  }catch(e){console.error('Delete folder failed',e);return folderResponse({error:'Cannot verify that folder is empty'},503);}
}
