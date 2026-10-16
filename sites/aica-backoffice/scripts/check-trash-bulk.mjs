// Disposable in-memory D1 integration test; never connects to the deployed site or preview data.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {mkdir,readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';

await mkdir('.sites-runtime',{recursive:true});
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
try{
 const DB=await mf.getD1Database('DB');
 globalThis.__trashTestEnv={DB};
 const sql=await readFile('drizzle/0000_complex_invisible_woman.sql','utf8');
 for(const part of sql.split('--> statement-breakpoint'))if(part.trim())await DB.exec(part.replace(/\r?\n/g,' '));
 // Mark initialized so the test owns every record, without importing production seed posts.
 await DB.exec("INSERT INTO cms_settings(key,value) VALUES('initialized','test'),('csrf-secret','test-only-secret');");
 await build({entryPoints:['lib/router.ts'],outfile:'.sites-runtime/trash-test-bundle.mjs',bundle:true,format:'esm',platform:'node',plugins:[{
  name:'isolated-d1',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__trashTestEnv;'}));}
 }]});
 const {dispatch}=await import('../.sites-runtime/trash-test-bundle.mjs?'+Date.now());
 const put=async(collection,row)=>DB.prepare('INSERT OR REPLACE INTO cms_records(collection,key,data,updated_at) VALUES(?,?,?,?)').bind(collection,String(row.id),JSON.stringify(row),'test').run();
 const admin={id:1,loginId:'tpwls386@gmail.com',name:'테스트 관리자',role:'SUPER_ADMIN',active:true};await put('users',admin);
 const post=(id,deleted=true)=>({id,title:'테스트 '+id,summary:'',authorId:1,categoryId:null,status:'HIDDEN',statusBeforeTrash:'PUBLISHED',deletedAt:deleted?'2026-10-15T00:00:00.000Z':null,updatedAt:'2026-10-15T00:00:00.000Z',blocksJson:'[]'});
 for(let id=1;id<=25;id++)await put('posts',post(id));await put('posts',post(99,false));
 let token='',checks=0;
 const call=async(path,body,expected=200,extra={})=>{
  const headers={'oai-authenticated-user-id':'local_seedy','oai-authenticated-user-email':'local@example.com','X-CSRF-TOKEN':token,...extra};
  const r=await dispatch(new Request('http://127.0.0.1:5173'+path,{method:body?'POST':'GET',body,headers}));const text=await r.text();assert.equal(r.status,expected,path+' '+text.slice(0,180));checks++;return {r,text,document:parseHTML(text).document};
 };
 token=JSON.parse((await call('/admin/session')).text).token;
 const form=(action,ids=[])=>new URLSearchParams([['action',action],...ids.map(id=>['ids',String(id)])]);
 const overview=async(query='')=>{const response=await call('/admin/posts/trash'+query);return {...response,snapshot:response.document.querySelector('[name="snapshot"]').value};};
 let page=await overview('?size=10&page=2');assert.equal(page.document.querySelectorAll('.trash-select').length,10);
 assert.ok(page.document.querySelector('#trash-empty-form').textContent.includes('(25개)'));
 assert.ok(page.document.querySelector('script[src="/js/post/trash.js"]'));
 assert.ok(page.document.querySelector('#trash-select-all'));
 assert.ok(page.document.querySelector('[data-trash-action="purge"]').hasAttribute('disabled'));
 const filtered=await overview('?keyword=does-not-exist');assert.ok(filtered.document.querySelector('#trash-select-all').hasAttribute('disabled'));
 assert.ok(!filtered.document.querySelector('#trash-empty-form button').hasAttribute('disabled'));
 await call('/admin/posts/trash/bulk',form('restore',[1,99]),409);
 const get=async(id)=>{const row=await DB.prepare("SELECT data FROM cms_records WHERE collection='posts' AND key=?").bind(String(id)).first();return row?JSON.parse(row.data):null;};
 assert.ok((await get(1)).deletedAt);
 await call('/admin/posts/trash/bulk',form('restore',[1,1,2]),303);assert.equal((await get(1)).status,'PUBLISHED');assert.equal((await get(2)).deletedAt,null);assert.ok((await get(3)).deletedAt);
 await call('/admin/posts/trash/bulk',form('purge'),400);await call('/admin/posts/trash/bulk',form('bad',[3]),400);
 await call('/admin/posts/trash/bulk',form('purge',['NaN']),400);
 await call('/admin/posts/trash/bulk',form('purge',[3]),403,{'X-CSRF-TOKEN':'wrong'});
 await call('/admin/posts/trash/empty',new URLSearchParams({snapshot:page.snapshot}),409);
 assert.ok(await get(3));
 await put('versions',{id:301,postId:3});await put('views',{id:302,postId:3});await put('versions',{id:401,postId:4});
 await call('/admin/posts/trash/bulk',form('purge',[3]),303);assert.equal(await get(3),null);
 for(const c of ['views','versions'])assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM cms_records WHERE collection=? AND json_extract(data,\'$.postId\')=3').bind(c).first()).n,0);
 assert.ok(await get(4));assert.ok(await get(99));
 await put('users',{...admin,role:'SUPPORT'});
 await call('/admin/posts/trash/bulk',form('purge',[4]),403);await call('/admin/posts/trash/empty',new URLSearchParams({snapshot:'invalid'}),403);
 await put('users',admin);
 page=await overview('?size=1&keyword=does-not-exist');
 await call('/admin/posts/trash/empty',new URLSearchParams({snapshot:page.snapshot}),303);
 assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM cms_records WHERE collection='posts' AND json_extract(data,'$.deletedAt') IS NOT NULL").first()).n,0);
 assert.ok(await get(1));assert.ok(await get(2));assert.ok(await get(99));
 assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM cms_records WHERE collection='versions'").first()).n,0);
 page=await overview();assert.ok(page.document.querySelector('#trash-empty-form button').hasAttribute('disabled'));
 await call('/admin/posts/trash/empty',new URLSearchParams({snapshot:page.snapshot}),303);
 console.log(JSON.stringify({ok:true,requests:checks,scope:'isolated in-memory D1; selection, history cleanup, empty across pages/search, stale confirmation, permissions, CSRF'}));
}finally{await mf.dispose();delete globalThis.__trashTestEnv;}
