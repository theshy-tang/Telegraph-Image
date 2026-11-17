const {Miniflare}=require('miniflare');const fs=require('fs');const path=require('path');
async function createStudioDB(){
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB'],r2Buckets:['MEDIA']});
 try{
  const db=await mf.getD1Database('DB');
  for(const file of ['0001_media_studio_folders_d1.sql','0002_media_studio_folder_guards.sql','0003_media_studio_metadata.sql']){
   const raw=fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8');
   const statements=raw.includes('-- statement-boundary')?raw.split('-- statement-boundary'):raw.split(';');
   for(const s of statements){const sql=s.replace(/--[^\n]*/g,'').trim().replace(/\s+/g,' ');if(sql)await db.prepare(sql).run();}
  }
  return {db,bucket:await mf.getR2Bucket('MEDIA'),dispose:()=>mf.dispose()};
 }catch(error){await mf.dispose();throw error;}
}
module.exports={createStudioDB};
