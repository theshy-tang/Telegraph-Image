// Real local SQLite adapter for SQL regression tests when workerd is unavailable.
const {DatabaseSync}=require('node:sqlite'),fs=require('fs'),path=require('path');
function createSQLiteD1(){
 const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync(path.join(__dirname,'../migrations')).filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8'));
 const db={prepare(query){const stmt=sql.prepare(query);let args=[];return {bind(...a){args=a;return this},async first(column){const r=stmt.get(...args);return column?r?.[column]??null:r||null},async all(){return {results:stmt.all(...args)}},async run(){return {success:true,meta:{changes:Number(stmt.run(...args).changes)}}},async execute(){return /^\s*(?:SELECT|WITH|PRAGMA)/i.test(query)?this.all():this.run()}}},async batch(statements){sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.execute());sql.exec('COMMIT');return out;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 sql.exec('UPDATE studio_catalog_state SET ready=1');return {sql,db,close:()=>sql.close()};
}
module.exports={createSQLiteD1};
