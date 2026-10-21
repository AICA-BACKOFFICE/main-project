/** One-time operator-requested account provisioning from private runtime configuration. */
export async function provisionAccounts(database:D1Database,raw:unknown){
 if(!raw)return;
 const input=JSON.parse(String(raw));
 if(!/^[\w-]{1,80}$/.test(input.id)||!Array.isArray(input.accounts)||input.accounts.length>10)throw new Error('Invalid account provisioning configuration');
 const marker='account-provision:'+input.id;
 if(await database.prepare('SELECT value FROM cms_settings WHERE key=?').bind(marker).first())return;
 const stamp=new Date().toISOString(),statements:D1PreparedStatement[]=[];
 for(const [index,item] of input.accounts.entries()){
  const email=String(item.email||'').trim().toLowerCase(),role=String(item.role);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['ADMIN','SUPPORT'].includes(role))throw new Error('Invalid provisioned account');
  const existing=await database.prepare("SELECT data FROM cms_records WHERE collection='users' AND lower(json_extract(data,'$.loginId'))=?").bind(email).first<{data:string}>();
  if(existing&&JSON.parse(existing.data).role==='SUPER_ADMIN')throw new Error('Provisioning cannot change a highest administrator');
  const id=Date.now()*1000+index,row={id,loginId:email,email,name:String(item.name||email.split('@')[0]).slice(0,50),role,active:true,mustChangePw:false,authUserId:null,createdAt:stamp,updatedAt:stamp};
  statements.push(database.prepare("INSERT INTO cms_records(collection,key,data,updated_at) SELECT 'users',?,?,? WHERE NOT EXISTS(SELECT 1 FROM cms_records WHERE collection='users' AND lower(json_extract(data,'$.loginId'))=?)").bind(String(id),JSON.stringify(row),stamp,email));
  statements.push(database.prepare("UPDATE cms_records SET data=json_set(data,'$.role',?,'$.active',json('true'),'$.updatedAt',?),updated_at=? WHERE collection='users' AND lower(json_extract(data,'$.loginId'))=? AND json_extract(data,'$.role')!='SUPER_ADMIN'").bind(role,stamp,stamp,email));
 }
 statements.push(database.prepare('INSERT OR IGNORE INTO cms_settings(key,value) VALUES(?,?)').bind(marker,stamp));
 await database.batch(statements);
}
