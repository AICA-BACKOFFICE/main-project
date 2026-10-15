import {all,bucket,bounded,fail,get,json,newId,now,numeric,put,remove} from './store';

// Upload videos in 8 MiB requests so the 200 MiB media limit does not require a
// 200 MiB Worker buffer or a single request larger than the hosting edge limit.
const CHUNK=8*1024*1024;
export async function multipart(request:Request,tail:string,user:any){
 if(request.method!=='POST')fail(405,'POST 요청이 필요합니다.');
 if(tail==='start'){const input=await request.json()as any,name=bounded(input.name,255,'파일 이름'),ext=name.split('.').pop()?.toLowerCase(),size=Number(input.size);if(!['mp4','m4v','mov','webm','pdf'].includes(ext||'')||!Number.isSafeInteger(size)||size<1||size>(ext==='pdf'?20:200)*1024*1024)fail(400,'파일 형식과 용량을 확인해 주세요.');
  const type=ext==='pdf'?'application/pdf':ext==='webm'?'video/webm':ext==='mov'?'video/quicktime':'video/mp4',id=String(newId()),key='uploads/'+crypto.randomUUID()+'.'+ext;const started=await bucket().createMultipartUpload(key,{httpMetadata:{contentType:type,contentDisposition:ext==='pdf'?'attachment':undefined}});
  const session={id,key,uploadId:started.uploadId,userId:user.id,name,ext,type,size,partSize:CHUNK,parts:[],categoryId:numeric(input.categoryId),subCategoryId:numeric(input.subCategoryId),createdAt:now()};await put('upload_sessions',session);return json({id,partSize:CHUNK});
 }
 const [id,action]=tail.split('/'),session=await get('upload_sessions',id);if(!session||session.userId!==user.id)fail(404,'업로드 세션이 없습니다.');if(Date.now()-Date.parse(session.createdAt)>3600000)fail(410,'업로드 시간이 지났습니다. 다시 올려 주세요.');const upload=bucket().resumeMultipartUpload(session.key,session.uploadId);
 if(action==='part'){const partNumber=Number(new URL(request.url).searchParams.get('partNumber')),total=Math.ceil(session.size/CHUNK),expected=partNumber===total?session.size-(total-1)*CHUNK:CHUNK;if(!Number.isInteger(partNumber)||partNumber<1||partNumber>total)fail(400,'파일 조각 번호를 확인해 주세요.');const blob=await request.blob();if(blob.size!==expected)fail(400,'파일 조각 크기가 다릅니다.');if(partNumber===1){const b=new Uint8Array(await blob.slice(0,16).arrayBuffer()),s=new TextDecoder().decode(b);if(session.ext==='pdf'?!s.startsWith('%PDF-'):session.ext==='webm'?!(b[0]===26&&b[1]===69):s.slice(4,8)!=='ftyp')fail(400,'파일 내용과 확장자가 맞지 않습니다.');}const part=await upload.uploadPart(partNumber,await blob.arrayBuffer());session.parts=session.parts.filter((p:any)=>p.partNumber!==partNumber);session.parts.push(part);await put('upload_sessions',session);return json({ok:true,partNumber});}
 if(action==='abort'){await upload.abort();await remove('upload_sessions',id);return json({ok:true});}
 if(action==='complete'){const parts=session.parts.sort((a:any,b:any)=>a.partNumber-b.partNumber);if(parts.length!==Math.ceil(session.size/CHUNK)||parts.some((p:any,i:number)=>p.partNumber!==i+1))fail(400,'업로드하지 못한 조각이 있습니다.');await upload.complete(parts);const record={id:Number(id),storedName:session.key.split('/').pop(),originalName:session.name,displayName:session.name,name:session.name,contentType:session.type,sizeBytes:session.size,size:session.size,url:'/'+session.key,kind:session.ext==='pdf'?'DOC':'VIDEO',uploadedBy:user.id,categoryId:session.categoryId,subCategoryId:session.subCategoryId,sitePath:null,r2Key:session.key,createdAt:now()};await put('images',record);await remove('upload_sessions',id);return json(record);}
 fail(404,'업로드 요청을 찾을 수 없습니다.');
}
