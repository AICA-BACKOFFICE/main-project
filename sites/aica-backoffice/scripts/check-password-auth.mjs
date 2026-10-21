// Real Workers runtime and isolated D1/R2. No production accounts or data are touched.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {mkdir,readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';

await mkdir('.sites-runtime',{recursive:true});
await build({stdin:{contents:"import {dispatch} from './lib/router';export default {fetch:dispatch};",resolveDir:process.cwd()},outfile:'.sites-runtime/password-worker-test.mjs',bundle:true,platform:'neutral',mainFields:['module','main'],format:'esm',external:['cloudflare:workers','node:*']});
const mf=new Miniflare({modules:true,scriptPath:'.sites-runtime/password-worker-test.mjs',compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET']});
try{
 const DB=await mf.getD1Database('DB');
 for(const part of (await readFile('drizzle/0000_complex_invisible_woman.sql','utf8')).split('--> statement-breakpoint'))if(part.trim())await DB.exec(part.replace(/\r?\n/g,' '));
 await DB.exec("INSERT INTO cms_settings(key,value) VALUES('initialized','test'),('csrf-secret','test-only-csrf');");
 const put=async(collection,row)=>DB.prepare('INSERT OR REPLACE INTO cms_records(collection,key,data,updated_at) VALUES(?,?,?,?)').bind(collection,String(row.id),JSON.stringify(row),'test').run();
 const rows=async(collection)=>(await DB.prepare('SELECT data FROM cms_records WHERE collection=?').bind(collection).all()).results.map(x=>JSON.parse(x.data));
 await put('users',{id:1,loginId:'owner@auth.example.test',email:'owner@auth.example.test',name:'검증 최상위 관리자',role:'SUPER_ADMIN',active:true,createdAt:new Date().toISOString()});
 const owner={headers:{'oai-authenticated-user-id':'test-owner','oai-authenticated-user-email':'owner@auth.example.test'},token:''};
 const anonymous={headers:{},token:''};
 const form=x=>new URLSearchParams(x);
 let checks=0;
 async function req(client,path,{method='GET',body,expected=200,headers={}}={}){
  if(body)method='POST';
  const response=await mf.dispatchFetch('https://auth.example.test'+path,{method,body,redirect:'manual',headers:{...client.headers,...(method==='POST'?{Origin:'https://auth.example.test','X-CSRF-TOKEN':client.token}:{}),...headers}});
  const text=await response.text();assert.equal(response.status,expected,`${method} ${path}: ${text.slice(0,180)}`);checks++;
  return {response,text,document:parseHTML(text).document};
 }
 async function token(client){client.token=JSON.parse((await req(client,'/admin/session')).text).token;}
 async function login(email,password,expected=303){const result=await req(anonymous,'/login',{body:form({loginId:email,password}),expected});const setCookie=result.response.headers.get('set-cookie');return {...result,client:{headers:setCookie?{Cookie:setCookie.split(';')[0]}:{},token:''}};}
 const loginView=await req(anonymous,'/login');assert.ok(loginView.document.querySelector('input[name="password"]'));assert.ok(loginView.document.querySelector('a[href="/auth/chatgpt"]'));
 await req(anonymous,'/admin',{expected:303});await req(anonymous,'/admin/session',{expected:303});
 await req(anonymous,'/login',{body:form({loginId:'owner@auth.example.test',password:'unknown-password'}),expected:403,headers:{Origin:'https://other.example'}});
 await req(anonymous,'/login',{body:form({loginId:'owner@auth.example.test',password:'unknown-password'}),expected:403,headers:{Origin:''}});
 await login('unknown@auth.example.test','unknown-password',401);
 await login('owner@auth.example.test','unknown-password',401);
 await token(owner);
 const initial='Only-for-isolated-test-713!';
 await req(owner,'/admin/users',{body:form({loginId:'short@auth.example.test',name:'거부',role:'SUPPORT',active:'true',password:'short'}),expected:400});
 for(const [email,role]of [['admin@auth.example.test','ADMIN'],['support@auth.example.test','SUPPORT']])await req(owner,'/admin/users',{body:form({loginId:email,name:role,role,active:'true',password:initial}),expected:303});
 const users=await rows('users'),adminId=users.find(u=>u.role==='ADMIN').id,supportId=users.find(u=>u.role==='SUPPORT').id;
 const credentials=await rows('auth_credentials');assert.equal(credentials.length,2);assert.ok(credentials.every(c=>c.hash.startsWith('scrypt$')&&!c.hash.includes(initial)));assert.notEqual(credentials[0].hash,credentials[1].hash);
 const passwordForms=await req(owner,`/admin/users/${adminId}/edit`);assert.ok(passwordForms.document.querySelector('#password'));assert.ok(!passwordForms.text.includes(credentials[0].hash));assert.equal(passwordForms.document.querySelector('#password').getAttribute('value'),'');
 let {client:admin,response:first}=await login('ADMIN@auth.example.test',initial);
 assert.equal(first.headers.get('location'),'/account/password');assert.match(first.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);assert.match(first.headers.get('set-cookie'),/; Secure/);assert.match(first.headers.get('set-cookie'),/^__Host-aica_session=/);
 await token(admin);
 assert.equal((await req(admin,'/admin',{expected:303})).response.headers.get('location'),'/account/password');
 await req(admin,'/admin/posts',{body:form({title:'비밀번호 변경 전 거부',status:'DRAFT'}),expected:303});assert.equal((await rows('posts')).length,0);
 const forced=await req(admin,'/account/password');assert.ok(forced.text.includes('임시 비밀번호'));assert.ok(forced.document.querySelector('#currentPassword'));
 await req(admin,'/account/password',{body:form({currentPassword:'wrong',newPassword:'Changed-password-713!',newPasswordConfirm:'Changed-password-713!'}),expected:400});
 await req(admin,'/account/password',{body:form({currentPassword:initial,newPassword:'Changed-password-713!',newPasswordConfirm:'does-not-match'}),expected:400});
 const changed=await req(admin,'/account/password',{body:form({currentPassword:initial,newPassword:'Changed-password-713!',newPasswordConfirm:'Changed-password-713!'}),expected:303});
 const oldAdmin=structuredClone(admin);admin.headers.Cookie=changed.response.headers.get('set-cookie').split(';')[0];await token(admin);
 await req(oldAdmin,'/admin/stats',{expected:303});await login('admin@auth.example.test',initial,401);
 await req(admin,'/admin/stats');await req(admin,'/admin/users',{expected:403});
 await req(admin,'/admin/users',{body:form({loginId:'blocked@auth.example.test',name:'거부',role:'SUPER_ADMIN',active:'true',password:initial}),expected:403});
 await req(admin,'/admin/posts',{body:form({title:'CSRF 거부',status:'DRAFT'}),expected:403,headers:{'X-CSRF-TOKEN':'invalid'}});
 await req(admin,'/admin/posts',{body:form({title:'자체 로그인 작성',status:'DRAFT',blocksJson:'[]'}),expected:303});
 const post=(await rows('posts'))[0];assert.equal(post.authorId,adminId);
 let {client:support}=await login('support@auth.example.test',initial);await token(support);
 const supportChange=await req(support,'/account/password',{body:form({currentPassword:initial,newPassword:'Support-password-713!',newPasswordConfirm:'Support-password-713!'}),expected:303});support.headers.Cookie=supportChange.response.headers.get('set-cookie').split(';')[0];await token(support);
 await req(support,'/admin/stats');await req(support,`/admin/posts/${post.id}/edit`,{expected:403});await req(support,'/admin/pages/about/edit',{expected:403});
 await req(support,'/admin/posts',{body:form({title:'서포터즈 자체 작성',status:'DRAFT',blocksJson:'[]'}),expected:303});
 const supportSession=structuredClone(support);await req(owner,`/admin/users/${supportId}`,{body:form({name:'SUPPORT',role:'SUPPORT',active:'true',password:'Reset-support-713!'}),expected:303});await req(supportSession,'/admin/stats',{expected:303});await login('support@auth.example.test','Support-password-713!',401);
 const originalAdmin=structuredClone(admin);await req(owner,`/admin/users/${adminId}`,{body:form({name:'ADMIN',role:'SUPPORT',active:'true'}),expected:303});await req(admin,'/admin/pages/about/edit',{expected:403});
 await req(owner,`/admin/users/${adminId}`,{body:form({name:'ADMIN',role:'SUPPORT'}),expected:303});await req(admin,'/admin/stats',{expected:303});await login('admin@auth.example.test','Changed-password-713!',401);
 await req(owner,`/admin/users/${adminId}`,{body:form({name:'ADMIN',role:'ADMIN',active:'true'}),expected:303});admin=(await login('admin@auth.example.test','Changed-password-713!')).client;await token(admin);
 const loggedOut=await req(admin,'/logout',{body:form({}),expected:303});assert.match(loggedOut.response.headers.get('set-cookie'),/Max-Age=0/);await req(admin,'/admin/stats',{expected:303});
 const tampered={headers:{Cookie:originalAdmin.headers.Cookie.slice(0,-1)+'x'},token:''};await req(tampered,'/admin/stats',{expected:303});
 const expired=(await login('admin@auth.example.test','Changed-password-713!')).client;for(const session of await rows('auth_sessions'))if(session.userId===adminId)await put('auth_sessions',{...session,expiresAt:Date.now()-1});await req(expired,'/admin/stats',{expected:303});
 for(let i=0;i<10;i++)await login('limited@auth.example.test','incorrect-password',401);await login('limited@auth.example.test','incorrect-password',429);
 const ownSecurity=await req(owner,'/account/password');assert.ok(!ownSecurity.document.querySelector('#currentPassword'));assert.ok(ownSecurity.text.includes('팀 계정 로그인'));
 const ownerSet=await req(owner,'/account/password',{body:form({newPassword:'Owner-password-713!',newPasswordConfirm:'Owner-password-713!'}),expected:303});assert.ok(ownerSet.response.headers.has('set-cookie'));
 const localOwner=(await login('owner@auth.example.test','Owner-password-713!')).client;await token(localOwner);await req(localOwner,'/admin/users');await req(owner,'/admin/users');
 const usersPage=await req(owner,'/admin/users');assert.ok(!usersPage.text.includes('scrypt$'));assert.ok(!usersPage.text.includes(initial));
 console.log(JSON.stringify({ok:true,requests:checks,runtime:'workerd',scope:'password login without ChatGPT identity; salted scrypt; initial/change/reset; CSRF/origin; rate limits; expiry/logout; live roles/deactivation; existing ChatGPT login'}));
}finally{await mf.dispose();}
