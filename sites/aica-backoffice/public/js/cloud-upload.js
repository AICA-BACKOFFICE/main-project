(()=>{
 window.AicaCloudUpload=async(file,url,headers)=>{
  const target=new URL(url,location.href),api='/admin/images/multipart/',jsonHeaders={...headers,'Content-Type':'application/json'};
  const send=async(path,body,h=jsonHeaders)=>{const r=await fetch(api+path,{method:'POST',credentials:'same-origin',headers:h,body});const data=await r.json();if(!r.ok)throw new Error(data.message||'업로드하지 못했습니다.');return data;};
  const started=await send('start',JSON.stringify({name:file.name,size:file.size,categoryId:target.searchParams.get('categoryId'),subCategoryId:target.searchParams.get('subCategoryId')}));
  try{for(let offset=0,part=1;offset<file.size;offset+=started.partSize,part++)await send(started.id+'/part?partNumber='+part,file.slice(offset,offset+started.partSize),{...headers,'Content-Type':'application/octet-stream'});return await send(started.id+'/complete','{}');}catch(e){try{await send(started.id+'/abort','{}');}catch{}throw e;}
 };
})();
