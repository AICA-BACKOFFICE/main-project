// Real router, isolated in-memory D1/R2, separate identities. Never calls production.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {mkdir,readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
await mkdir('.sites-runtime',{recursive:true});
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB'],r2Buckets:['BUCKET']});
try{
 const DB=await mf.getD1Database('DB');
 const provisioning={id:'role-test-accounts',accounts:[{email:'admin@roles.example.test',role:'ADMIN',name:'검증 관리자'},{email:'support@roles.example.test',role:'SUPPORT',name:'검증 서포터즈'}]};
 const r2=await mf.getR2Bucket('BUCKET');
 // Node-created File streams lack Workers' known-length metadata; adapt only the test boundary.
 const BUCKET={put:async(key,body,options)=>r2.put(key,body instanceof ReadableStream?await new Response(body).arrayBuffer():body,options),get:(...args)=>r2.get(...args),delete:(...args)=>r2.delete(...args)};
 globalThis.__roleTestEnv={DB,BUCKET,CMS_ACCOUNT_PROVISION:JSON.stringify(provisioning)};
 for(const part of (await readFile('drizzle/0000_complex_invisible_woman.sql','utf8')).split('--> statement-breakpoint'))if(part.trim())await DB.exec(part.replace(/\r?\n/g,' '));
 await DB.exec("INSERT INTO cms_settings(key,value) VALUES('initialized','test'),('csrf-secret','test-only-secret');");
 const put=async(collection,row)=>DB.prepare('INSERT OR REPLACE INTO cms_records(collection,key,data,updated_at) VALUES(?,?,?,?)').bind(collection,String(row.id),JSON.stringify(row),'test').run();
 const rows=async(collection)=>(await DB.prepare('SELECT data FROM cms_records WHERE collection=?').bind(collection).all()).results.map(x=>JSON.parse(x.data));
 await put('users',{id:1,loginId:'owner@roles.example.test',email:'owner@roles.example.test',name:'검증 최상위 관리자',role:'SUPER_ADMIN',active:true});
 await build({stdin:{contents:"export {dispatch} from './lib/router';export {provisionAccounts} from './lib/account-provision';",resolveDir:process.cwd()},outfile:'.sites-runtime/role-test-bundle.mjs',bundle:true,platform:'node',format:'esm',plugins:[{name:'isolated-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'role-test'}));b.onLoad({filter:/.*/,namespace:'role-test'},()=>({contents:'export const env=globalThis.__roleTestEnv;'}));}}]});
 const {dispatch,provisionAccounts}=await import('../.sites-runtime/role-test-bundle.mjs?'+Date.now());
 let checks=0;
 const client=email=>({email,authId:'test-'+email.split('@')[0],token:''});
 const owner=client('owner@roles.example.test'),admin=client('admin@roles.example.test'),support=client('support@roles.example.test');
 async function req(user,path,{body,method=body?'POST':'GET',expected=200,headers={}}={}){
  const response=await dispatch(new Request('https://role-test.example.test'+path,{method,body,headers:{'oai-authenticated-user-id':user.authId,'oai-authenticated-user-email':user.email,'X-CSRF-TOKEN':user.token,...headers}}));
  const text=await response.text();assert.equal(response.status,expected,`${user.email} ${method} ${path}: ${text.slice(0,150)}`);checks++;return {response,text,document:parseHTML(text).document};
 }
 const form=data=>new URLSearchParams(data);
 for(const user of [owner,admin,support])user.token=JSON.parse((await req(user,'/admin/session')).text).token;
 let users=await rows('users');assert.equal(users.length,3);assert.equal(users.find(u=>u.loginId===admin.email).role,'ADMIN');assert.equal(users.find(u=>u.loginId===support.email).role,'SUPPORT');
 for(const user of [owner,admin,support])for(const path of ['/admin','/admin/stats','/admin/media','/admin/posts/new'])await req(user,path);
 for(const user of [admin,support]){
  await req(user,'/admin/users',{expected:403});
  await req(user,'/admin/users',{body:form({loginId:'blocked@example.test',name:'차단',role:'SUPER_ADMIN',active:'true'}),expected:403});
 }
 await req(owner,'/admin/users',{body:form({loginId:'additional@roles.example.test',name:'추가 검증',role:'SUPPORT',active:'true',password:'Isolated-test-password-713!'}),expected:303});
 const save=(user,id,title,status='DRAFT',expected=303)=>req(user,'/admin/posts'+(id?'/'+id:''),{body:form({title,status,blocksJson:'[]',thumbnailMode:'AUTO'}),expected});
 const create=async(user,title)=>{const r=await save(user,null,title);return Number(r.response.headers.get('location').match(/posts\/(\d+)/)[1]);};
 const own=await create(support,'서포터즈 글'),other=await create(admin,'관리자 글');
 const ownRaw=(await rows('posts')).find(p=>p.id===own);assert.equal(ownRaw.authorId,users.find(u=>u.loginId===support.email).id);
 await req(support,`/admin/posts/${own}/edit`);
 await req(support,`/admin/posts/${other}/edit`,{expected:403});
 await save(support,other,'금지된 수정','DRAFT',403);
 await req(support,`/admin/posts/${other}/versions`,{expected:403});
 await save(admin,own,'관리자가 서포터즈 글 수정');
 await req(admin,`/admin/posts/${own}/status`,{body:form({status:'PUBLISHED'}),expected:303});
 await save(support,own,'서포터즈가 본인 게시글 수정','PUBLISHED');
 await save(support,own,'무단 상태 변경','HIDDEN',403);
 await req(support,`/admin/posts/${own}/status`,{body:form({status:'HIDDEN'}),expected:403});
 await save(support,null,'직접 발행 시도','PUBLISHED',403);
 const version=(await rows('versions')).find(v=>v.postId===own);
 await req(support,`/admin/posts/${own}/versions/${version.id}/restore`,{body:form({}),expected:303});
 await req(support,`/admin/posts/${other}/versions/${version.id}/restore`,{body:form({}),expected:403});
 const list=await req(support,'/admin/posts');
 assert.ok(list.document.querySelector(`a[href="/admin/posts/${own}/edit"]`));assert.ok(!list.document.querySelector(`a[href="/admin/posts/${other}/edit"]`));
 assert.ok(list.document.querySelector('a[href="/admin/stats"]'));
 const supportEditor=await req(support,`/admin/posts/${own}/edit`);assert.ok(supportEditor.document.querySelector('#statusSelect').hasAttribute('disabled'));
 for(const path of ['/admin/pages/about/edit','/admin/faq','/admin/pages/life-photos','/admin/pages/api/state?page=about']){
  await req(support,path,{expected:403});await req(admin,path);
 }
 await req(support,'/admin/pages/api/draft?page=about',{method:'PUT',body:'<html>denied</html>',expected:403});
 const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13]);let image;
 for(const user of [owner,admin,support]){
  const body=new FormData();body.set('file',new File([png],'role-test.png',{type:'image/png'}));
  image=JSON.parse((await req(user,'/admin/images',{body})).text);
  const video=new FormData();video.set('files',new File([new Uint8Array([0,0,0,12,102,116,121,112,105,115,111,109])],'role-test.mp4',{type:'video/mp4'}));
  await req(user,'/admin/media/upload',{body:video,expected:303});
 }
 for(const action of ['rename','move','delete'])await req(support,`/admin/media/${image.id}/${action}`,{body:form({displayName:'거부'}),expected:403});
 await req(admin,`/admin/media/${image.id}/rename`,{body:form({displayName:'허용된 이름'}),expected:303});
 await req(admin,`/admin/media/${image.id}/delete`,{body:form({}),expected:303});
 await req(support,`/admin/posts/${own}/delete`,{body:form({}),expected:403});
 await req(admin,`/admin/posts/${own}/delete`,{body:form({}),expected:303});
 await req(admin,`/admin/posts/${own}/restore`,{body:form({}),expected:303});
 await req(admin,`/admin/posts/${own}/delete`,{body:form({}),expected:303});
 await req(admin,`/admin/posts/${own}/purge`,{body:form({}),expected:403});
 for(const user of [admin,support]){
  await req(user,'/admin/posts/trash/bulk',{body:form({action:'purge',ids:String(own)}),expected:403});
  await req(user,'/admin/posts/trash/empty',{body:form({snapshot:'invalid'}),expected:403});
 }
 const trash=await req(admin,'/admin/posts/trash');assert.ok(!trash.document.querySelector('#trash-empty-form'));assert.ok(!trash.document.querySelector('[data-trash-action="purge"]'));
 await req(owner,`/admin/posts/${own}/purge`,{body:form({}),expected:303});assert.ok(!(await rows('posts')).some(p=>p.id===own));
 const supportRow=(await rows('users')).find(u=>u.loginId===support.email);await put('users',{...supportRow,active:false});
 await req(support,'/admin/stats',{expected:303});
 await provisionAccounts(DB,JSON.stringify(provisioning));
 assert.equal((await rows('users')).find(u=>u.loginId===support.email).active,false,'Provisioning must not reactivate an account after its one-time marker');
 console.log(JSON.stringify({ok:true,requests:checks,roles:['SUPER_ADMIN','ADMIN','SUPPORT'],provisionedAccounts:2,scope:'isolated D1/R2; ownership, stats, site, media, trash, account administration, provisioning idempotence'}));
}finally{await mf.dispose();delete globalThis.__roleTestEnv;}
