import {scryptSync, timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {all,db,ensure,fail,get,now,put,redirect,remove,value} from './store';

const SESSION_SECONDS=8*60*60;
const RATE_SECONDS=15*60;
const options={N:16384,r:8,p:5,maxmem:32*1024*1024};
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const cookieName=(request:Request)=>new URL(request.url).protocol==='https:'?'__Host-aica_session':'aica_session';
const readCookie=(request:Request)=>request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName(request)+'='))?.slice(cookieName(request).length+1);
const cookie=(request:Request,token:string,seconds:number)=>`${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
const digest=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');

export function validatePassword(password:string){if(password.length<10||password.length>128)fail(400,'비밀번호는 10자 이상 128자 이하로 입력해 주세요.');}
export function hashPassword(password:string){validatePassword(password);const salt=random();return `scrypt$16384$8$5$${salt}$${scryptSync(password,salt,32,options).toString('hex')}`;}
export function verifyPassword(password:string,hash?:string){
 const parts=hash?.split('$'),valid=parts?.length===6&&parts[0]==='scrypt'&&parts[1]==='16384'&&parts[2]==='8'&&parts[3]==='5'&&/^[a-f0-9]{64}$/.test(parts[4])&&/^[a-f0-9]{64}$/.test(parts[5]);
 const computed=scryptSync(password.length<=128?password:'invalid-password',valid?parts![4]:'dummy-salt-for-unknown-users',32,options);
 const expected=valid?Buffer.from(parts![5],'hex'):Buffer.alloc(32);
 return timingSafeEqual(computed,expected)&&!!valid&&password.length<=128;
}

// Atomic counters shared by all Worker instances. Neither login IDs nor IPs are stored here.
async function rateLimit(key:string,limit:number){
 const stamp=Date.now(),expiresAt=stamp+RATE_SECONDS*1000;
 const row=await db().prepare(`INSERT INTO cms_records(collection,key,data,updated_at) VALUES('auth_rate',?,json_object('count',1,'expiresAt',?),?)
 ON CONFLICT(collection,key) DO UPDATE SET data=json_object('count',CASE WHEN json_extract(data,'$.expiresAt')<=? THEN 1 ELSE json_extract(data,'$.count')+1 END,'expiresAt',CASE WHEN json_extract(data,'$.expiresAt')<=? THEN ? ELSE json_extract(data,'$.expiresAt') END),updated_at=excluded.updated_at RETURNING data`).bind(key,expiresAt,now(),stamp,stamp,expiresAt).first<{data:string}>();
 if(row&&JSON.parse(row.data).count>limit)fail(429,'로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.');
}
export function checkLoginOrigin(request:Request){const origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');if(origin!==new URL(request.url).origin||site==='cross-site')fail(403,'현재 사이트의 로그인 화면에서 다시 시도해 주세요.');}
async function passwordAttempt(request:Request,loginId:string){
 await ensure();
 await db().prepare("DELETE FROM cms_records WHERE collection='auth_rate' AND json_extract(data,'$.expiresAt')<=?").bind(Date.now()).run();
 const ip=request.headers.get('cf-connecting-ip');
 if(ip)await rateLimit('ip:'+await digest(ip),100);
 const key='account:'+await digest(loginId);await rateLimit(key,10);return key;
}
export async function passwordLogin(request:Request){
 checkLoginOrigin(request);
 const form=await request.formData(),loginId=value(form,'loginId').trim().toLowerCase(),password=value(form,'password');
 if(!loginId||loginId.length>120||!password||password.length>128)fail(400,'아이디와 비밀번호를 확인해 주세요.');
 const key=await passwordAttempt(request,loginId),user=(await all('users')).find(u=>String(u.loginId).toLowerCase()===loginId),credential=user?await get('auth_credentials',user.id):null;
 const correct=verifyPassword(password,credential?.hash);
 if(!correct||!user?.active)fail(401,'아이디 또는 비밀번호가 올바르지 않습니다.');
 await remove('auth_rate',key);
 await put('users',{...user,lastLoginAt:now()});
 return await startSession(request,user,credential.version,user.mustChangePw?'/account/password':'/admin');
}
export async function startSession(request:Request,user:any,version:string,path='/admin'){
 const token=random(),key=await digest(token),expiresAt=Date.now()+SESSION_SECONDS*1000;
 await db().prepare("DELETE FROM cms_records WHERE collection='auth_sessions' AND json_extract(data,'$.expiresAt')<=?").bind(Date.now()).run();
 await put('auth_sessions',{id:key,userId:user.id,version,expiresAt,createdAt:now()},key);
 const response=redirect(path);response.headers.set('Set-Cookie',cookie(request,token,SESSION_SECONDS));return response;
}
export async function passwordIdentity(request:Request):Promise<{present:boolean;user?:any;session?:any}>{
 const token=readCookie(request);if(!token)return {present:false};
 if(!/^[a-f0-9]{64}$/.test(token))return {present:true};
 const key=await digest(token),session=await get('auth_sessions',key);
 if(!session||session.expiresAt<=Date.now()){if(session)await remove('auth_sessions',key);return {present:true};}
 const user=await get('users',session.userId),credential=await get('auth_credentials',session.userId);
 if(!user?.active||!credential||credential.version!==session.version)return {present:true};
 return {present:true,user,session};
}
export async function passwordLogout(request:Request,chatgpt:boolean){
 const token=readCookie(request);if(token&&/^[a-f0-9]{64}$/.test(token))await remove('auth_sessions',await digest(token));
 const response=redirect(chatgpt?'/signout-with-chatgpt?return_to=%2Flogin':'/login');response.headers.set('Set-Cookie',cookie(request,'',0));return response;
}
export async function setAccountPassword(id:number,password:string,mustChangePw=true){
 const hash=hashPassword(password),version=crypto.randomUUID();
 const row=await get('users',id);if(!row)fail(404,'계정을 찾을 수 없습니다.');
 await db().batch([
 db().prepare('INSERT INTO cms_records(collection,key,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(collection,key) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind('auth_credentials',String(id),JSON.stringify({id,hash,version}),now()),
 db().prepare('UPDATE cms_records SET data=?,updated_at=? WHERE collection=? AND key=?').bind(JSON.stringify({...row,mustChangePw,updatedAt:now()}),now(),'users',String(id)),
 db().prepare("DELETE FROM cms_records WHERE collection='auth_sessions' AND json_extract(data,'$.userId')=?").bind(id)]);
 return version;
}
export async function changePassword(request:Request,user:any){
 const form=await request.formData(),password=value(form,'newPassword');validatePassword(password);
 if(password!==value(form,'newPasswordConfirm'))fail(400,'새 비밀번호와 확인 값이 일치하지 않습니다.');
 const credential=await get('auth_credentials',user.id);
 if(credential){
  const key=await passwordAttempt(request,String(user.loginId).toLowerCase());
  if(!verifyPassword(value(form,'currentPassword'),credential.hash))fail(400,'현재 비밀번호가 올바르지 않습니다.');
  if(verifyPassword(password,credential.hash))fail(400,'현재 비밀번호와 다른 새 비밀번호를 입력해 주세요.');
  await remove('auth_rate',key);
 }else if(user._authMethod!=='chatgpt')fail(403,'로그인을 다시 확인해 주세요.');
 const version=await setAccountPassword(user.id,password,false);
 return await startSession(request,user,version,'/admin?toast='+encodeURIComponent('비밀번호를 저장했습니다.'));
}
