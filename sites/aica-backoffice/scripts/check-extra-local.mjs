import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
const testEmail='local-smoke-'+Date.now()+'@example.com';
import {spawnSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:5173';const login=await fetch(base+'/signin-with-chatgpt?return_to=/admin',{redirect:'manual'}),cookie=login.headers.get('set-cookie').split(';')[0];const session=await(await fetch(base+'/admin/session',{headers:{Cookie:cookie}})).json();let checks=0;
const req=async(path,method='GET',body,expected=200,headers={})=>{const r=await fetch(base+path,{method,body,headers:{Cookie:cookie,'X-CSRF-TOKEN':session.token,...headers},redirect:'manual'});const text=await r.text();assert.equal(r.status,expected,path+' '+text.slice(0,200));checks++;return {r,text,data:r.headers.get('content-type')?.includes('json')?JSON.parse(text):null};};
const form=x=>new URLSearchParams(x),send=(path,data)=>req(path,'POST',JSON.stringify(data),200,{'Content-Type':'application/json'});
const size=17*1024*1024,blob=Buffer.alloc(size);blob.write('ftyp',4);const started=(await send('/admin/images/multipart/start',{name:'smoke-large.mp4',size})).data;
for(let offset=0,part=1;offset<size;offset+=started.partSize,part++)await req('/admin/images/multipart/'+started.id+'/part?partNumber='+part,'POST',blob.subarray(offset,offset+started.partSize));
const image=(await send('/admin/images/multipart/'+started.id+'/complete',{})).data;
const partial=await req(image.url,'GET',undefined,206,{Range:'bytes=4-7'});assert.equal(partial.text,'ftyp');assert.equal(partial.r.headers.get('content-range'),'bytes 4-7/'+size);
await req('/admin/media/'+image.id+'/delete','POST',form({}),303);
await req('/admin/notices','POST',form({title:'Local smoke notice',body:'확인',level:'INFO',active:'true',startsAt:'2020-01-01T12:00'}),303);
const noticePage=await req('/admin/notices'),noticeId=noticePage.text.match(/\/admin\/notices\/(\d+)\/toggle/)?.[1];assert.ok(noticeId);
assert.ok((await req('/admin')).text.includes('Local smoke notice'));
await req('/admin/notices/'+noticeId+'/dismiss','POST',form({}),303);
assert.ok(!(await req('/admin')).text.includes('Local smoke notice'));
await req('/admin/notices/'+noticeId+'/toggle','POST',form({}),303);
await req('/admin/notices/'+noticeId+'/delete','POST',form({}),303);
await req('/admin/users','POST',form({loginId:testEmail,name:'검증 계정',role:'SUPPORT',active:'true'}),303);
const userPage=await req('/admin/users'),userId=Array.from(parseHTML(userPage.text).document.querySelectorAll('tr')).find(tr=>tr.textContent.includes(testEmail))?.querySelector('a[href*="/edit"]')?.getAttribute('href')?.match(/users\/(\d+)\/edit/)?.[1];assert.ok(userId);
await req('/admin/users/'+userId,'POST',form({name:'검증 계정',role:'SUPPORT'}),303);
// Change only this preview database to exercise role enforcement, then restore.
const wrangler=sql=>{const p=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',sql],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);};
try{wrangler(`UPDATE cms_records SET data=json_set(data,'$.role','SUPPORT') WHERE collection='users' AND key='1'`);for(const p of ['/admin/users','/admin/stats','/admin/pages/about/edit','/admin/pages/api/state?page=about'])await req(p,'GET',undefined,403);await req('/admin/posts');await req('/admin/media');await req('/admin/templates/api');await req('/admin/templates/api','POST','{"name":"denied"}',403,{'Content-Type':'application/json'});}finally{wrangler(`UPDATE cms_records SET data=json_set(data,'$.role','SUPER_ADMIN') WHERE collection='users' AND key='1'`);}
console.log(JSON.stringify({ok:true,checks}));
