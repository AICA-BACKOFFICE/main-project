import { env } from 'cloudflare:workers';
import seedData from './seed.json';
import { enumValue } from './views';

export const OWNER_EMAIL='tpwls386@gmail.com';
export const OWNER_NAME='박세진';
export const now=()=>new Date().toISOString();
export const newId=()=>Date.now()*1000+Math.floor(Math.random()*1000);
export function db():D1Database{if(!env.DB)throw new Error('영구 저장소가 연결되지 않았습니다.');return env.DB;}
export function bucket():R2Bucket{if(!env.BUCKET)throw new Error('파일 저장소가 연결되지 않았습니다.');return env.BUCKET;}
export async function serveObject(request:Request,key:string){const object=await bucket().get(key,{range:request.headers});if(!object)return null;const headers=new Headers();object.writeHttpMetadata(headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Accept-Ranges','bytes');headers.set('ETag',object.httpEtag);const range=object.range as {offset?:number;length?:number;suffix?:number}|undefined;let status=200;if(range&&request.headers.has('range')){const offset=range.offset??Math.max(0,object.size-(range.suffix||object.size)),length=range.length??object.size-offset;headers.set('Content-Range',`bytes ${offset}-${offset+length-1}/${object.size}`);headers.set('Content-Length',String(length));status=206;}else headers.set('Content-Length',String(object.size));return new Response(request.method==='HEAD'?null:object.body,{status,headers});}
export class HttpError extends Error{status:number;code?:string;constructor(status:number,message:string,code?:string){super(message);this.status=status;this.code=code;}}
export function fail(status:number,message:string,code?:string):never{throw new HttpError(status,message,code);}
export const json=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export const html=(body:string,status=200)=>new Response(body,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'SAMEORIGIN'}});
export const redirect=(location:string)=>new Response(null,{status:303,headers:{Location:location,'Cache-Control':'no-store'}});
const names:Record<string,string>={admin_users:'users',categories:'categories',images:'images',posts:'posts',post_versions:'versions',post_templates:'templates',notices:'notices',notice_dismissals:'dismissals',visit_logs:'visits',post_view_logs:'views'};
let ready:Promise<void>|undefined;
async function initialize(){
 const done=await db().prepare("SELECT value FROM cms_settings WHERE key='initialized'").first();if(done)return;
 const statements:D1PreparedStatement[]=[];
 for(const [old,collection]of Object.entries(names))for(const raw of (seedData as any)[old]||[]){const row={...raw};delete row.passwordHash;const key=String(row.id??`${row.noticeId}:${row.adminId}`);statements.push(db().prepare('INSERT OR IGNORE INTO cms_records(collection,key,data,updated_at) VALUES(?,?,?,?)').bind(collection,key,JSON.stringify(row),now()));}
 for(let i=0;i<statements.length;i+=40)await db().batch(statements.slice(i,i+40));
 const owner={id:1,loginId:OWNER_EMAIL,email:OWNER_EMAIL,name:OWNER_NAME,role:'SUPER_ADMIN',active:true,mustChangePw:false,authUserId:null,createdAt:now(),updatedAt:now()};
 await db().prepare('INSERT INTO cms_records(collection,key,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(collection,key) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind('users','1',JSON.stringify(owner),now()).run();
 await db().batch([
 db().prepare('INSERT OR IGNORE INTO cms_settings(key,value) VALUES(?,?)').bind('csrf-secret',crypto.randomUUID()+crypto.randomUUID()),
 db().prepare('INSERT OR IGNORE INTO cms_settings(key,value) VALUES(?,?)').bind('initialized',now())]);
}
export async function ensure(){if(!ready)ready=initialize().catch(e=>{ready=undefined;throw e;});await ready;}
export async function all(collection:string):Promise<any[]>{await ensure();const r=await db().prepare('SELECT data FROM cms_records WHERE collection=?').bind(collection).all<{data:string}>();return r.results.map(x=>JSON.parse(x.data));}
export async function get(collection:string,key:any):Promise<any|null>{await ensure();const r=await db().prepare('SELECT data FROM cms_records WHERE collection=? AND key=?').bind(collection,String(key)).first<{data:string}>();return r?JSON.parse(r.data):null;}
export async function put(collection:string,row:any,key:any=row.id){await ensure();await db().prepare('INSERT INTO cms_records(collection,key,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(collection,key) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind(collection,String(key),JSON.stringify(row),now()).run();return row;}
export async function remove(collection:string,key:any){await ensure();await db().prepare('DELETE FROM cms_records WHERE collection=? AND key=?').bind(collection,String(key)).run();}
export async function setting(key:string,fallback:any=null){await ensure();const r=await db().prepare('SELECT value FROM cms_settings WHERE key=?').bind(key).first<{value:string}>();return r?r.value:fallback;}
export async function setSetting(key:string,value:string){await db().prepare('INSERT INTO cms_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,value).run();}
export async function currentUser(request:Request){await ensure();const authId=request.headers.get('oai-authenticated-user-id');const email=request.headers.get('oai-authenticated-user-email')?.toLowerCase();if(!authId||!email)return null;
 const local=authId==='local_seedy'&&['127.0.0.1','localhost'].includes(new URL(request.url).hostname);
 const users=await all('users');let user=local?users.find(u=>u.id===1):users.find(u=>u.authUserId===authId)||users.find(u=>!u.authUserId&&String(u.loginId).toLowerCase()===email);
 if(!user||!user.active)return null;if(!local&&!user.authUserId){user={...user,authUserId:authId,lastLoginAt:now()};await put('users',user);}
 return {...user,role:enumValue(user.role),superAdmin:String(user.role)==='SUPER_ADMIN',mustChangePw:false,_authId:authId};
}
export function manage(user:any){if(!user||!['ADMIN','SUPER_ADMIN'].includes(String(user.role)))fail(403,'관리자 권한이 필요합니다.');}
export function superuser(user:any){if(!user||String(user.role)!=='SUPER_ADMIN')fail(403,'최고관리자 권한이 필요합니다.');}
export async function csrf(user:any){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(await setting('csrf-secret')),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signed=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(user._authId));return Array.from(new Uint8Array(signed),x=>x.toString(16).padStart(2,'0')).join('');}
export async function checkMutation(request:Request,user:any){if(!user)fail(401,'로그인이 필요합니다.');const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)fail(403,'다른 사이트에서 보낸 요청입니다.');let token=request.headers.get('x-csrf-token')||request.headers.get('x-bo-token');if(!token&&/form|urlencoded/.test(request.headers.get('content-type')||'')){const form=await request.clone().formData();token=String(form.get('_csrf')||'');}const expected=await csrf(user);let mismatch=expected.length!==(token||'').length?1:0;for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^((token||'').charCodeAt(i)||0);if(mismatch)fail(403,'보안 확인이 만료됐습니다. 새로고침해 주세요.','token');}
export const value=(form:FormData,key:string)=>String(form.get(key)??'');
export const numeric=(v:any)=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
export function bounded(s:any,max:number,label:string){const v=String(s??'').trim();if(v.length>max)fail(400,label+'이 너무 깁니다.');return v;}
export function parseJson(s:any,fallback:any=[]){try{return typeof s==='string'?JSON.parse(s):s??fallback;}catch{return fallback;}}
export function paginate<T>(items:T[],page=1,size=20){size=Math.max(1,Math.min(100,Number(size)||20));const total=items.length,totalPages=Math.max(1,Math.ceil(total/size));page=Math.max(1,Math.min(totalPages,Number(page)||1));const start=Math.max(1,Math.min(page-2,totalPages-4));return {items:items.slice((page-1)*size,page*size),page,size,total,totalPages,empty:!total,hasPrev:page>1,hasNext:page<totalPages,pageNumbers:Array.from({length:Math.min(5,totalPages)},(_,i)=>start+i)};}
export async function categoryTree(){const list=(await all('categories')).sort((a,b)=>a.sortOrder-b.sortOrder);return list.filter(c=>c.parentId==null&&c.active).map(c=>({...c,children:list.filter(s=>s.parentId===c.id&&s.active)}));}
