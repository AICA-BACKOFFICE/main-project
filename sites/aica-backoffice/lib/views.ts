import templates from './templates.json';

type Node = string | {tag:string;attrs:Record<string,string|null>;children:Node[]};
type Ctx = Record<string,any>;
const views=templates as Record<string,Node>;
const voids=new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
export const escapeHtml=(x:any)=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const safeJson=(x:any)=>JSON.stringify(x).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const codes:Record<string,[string,string,string?]>={DRAFT:['임시저장','draft'],PUBLISHED:['게시중','published'],HIDDEN:['미게시','hidden'],PENDING:['답변대기','pending'],SUPER_ADMIN:['최상위 관리자','super','모든 관리 기능을 사용할 수 있습니다.'],ADMIN:['관리자','admin','콘텐츠·사이트·미디어 관리 (계정 관리·영구 삭제 불가)'],SUPPORT:['서포터즈','support','게시물 작성·본인 글 수정·업로드·전체 통계 조회']};
export class EnumValue {
  code:string;label:string;css:string;description:string;
  constructor(code:string){this.code=code;const item=codes[code]||[code,code.toLowerCase(),''];this.label=item[0];this.css=item[1];this.description=item[2]||'';}
  toString(){return this.code;}
}
export const enumValue=(code:any)=>code instanceof EnumValue?code:new EnumValue(String(code??''));
const primitive=(v:any)=>v instanceof EnumValue?v.code:v;

export function splitTop(s:string,sep=','):string[]{
  let start=0,depth=0,quote='',out:string[]=[];
  for(let i=0;i<s.length;i++){const c=s[i];if(quote){if(c===quote&&s[i-1]!=='\\')quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if('([{'.includes(c))depth++;else if(')]}'.includes(c))depth--;else if(c===sep&&depth===0){out.push(s.slice(start,i).trim());start=i+1;}}
  out.push(s.slice(start).trim());return out.filter(Boolean);
}
function closing(s:string,start:number,open:string,close:string){let d=1,q='';for(let i=start+1;i<s.length;i++){const c=s[i];if(q){if(c===q&&s[i-1]!=='\\')q='';continue;}if(c==="'"||c==='"'){q=c;continue;}if(c===open)d++;if(c===close&&!--d)return i;}throw new Error('Unclosed expression '+s.slice(start));}
type Tok={k:string,v:any};
function tokens(s:string):Tok[]{const out:Tok[]=[];for(let i=0;i<s.length;){const c=s[i];if(/\s/.test(c)){i++;continue;}
  if('$*@~'.includes(c)&&s[i+1]==='{'){const end=closing(s,i+1,'{','}');out.push({k:'special',v:[c,s.slice(i+2,end)]});i=end+1;continue;}
  if(c==="'"||c==='"'){let v='',j=i+1;for(;j<s.length;j++){if(s[j]===c){if(s[j+1]===c){v+=c;j++;continue;}break;}if(s[j]==='\\'&&j+1<s.length){j++;v+=({n:'\n',r:'\r',t:'\t'} as any)[s[j]]??s[j];}else v+=s[j];}if(j===s.length)throw new Error('Unclosed string');out.push({k:'value',v});i=j+1;continue;}
  const num=s.slice(i).match(/^\d+(?:\.\d+)?/);if(num){out.push({k:'value',v:Number(num[0])});i+=num[0].length;continue;}
  const word=s.slice(i).match(/^[#A-Za-z_$][\w$-]*/);if(word){const w=word[0];out.push(w==='null'?{k:'value',v:null}:w==='true'||w==='false'?{k:'value',v:w==='true'}:['and','or','not'].includes(w)?{k:({and:'&&',or:'||',not:'!'} as any)[w],v:w}:{k:'id',v:w});i+=w.length;continue;}
  const op=s.slice(i,i+2);if(['==','!=','>=','<=','&&','||','?:','.!','.?'].includes(op)){out.push({k:op,v:op});i+=2;continue;}if('.[](),?:+-*/%!<>'.includes(c)){out.push({k:c,v:c});i++;continue;}throw new Error('Unsupported expression token '+s.slice(i));
}return out;}
type Ast=any;
const astCache=new Map<string,Ast>();
function parse(s:string):Ast{if(astCache.has(s))return astCache.get(s);const ts=tokens(s);let at=0;const peek=()=>ts[at]?.k;const take=(k?:string)=>{const t=ts[at++];if(!t||(k&&t.k!==k))throw new Error('Expected '+k+' in '+s);return t;};
 const priority:Record<string,number>={'||':1,'&&':2,'==':3,'!=':3,'>':4,'<':4,'>=':4,'<=':4,'+':5,'-':5,'*':6,'/':6,'%':6};
 function expression(min=0):Ast{const t=take();let a:Ast;if(t.k==='value')a=['value',t.v];else if(t.k==='id')a=['id',t.v];else if(t.k==='special')a=['special',...t.v];else if(t.k==='('){a=expression();take(')');}else if(['!','-','+'].includes(t.k))a=['unary',t.k,expression(7)];else throw new Error('Unexpected '+t.k+' in '+s);
  for(;;){const p=peek();if(p==='.'){take();a=['get',a,['value',take('id').v]];continue;}if(p==='['){take();const b=expression();take(']');a=['get',a,b];continue;}if(p==='.!'||p==='.?'){take();take('[');const b=expression();take(']');a=[p,a,b];continue;}if(p==='('){take();const args:Ast[]=[];while(peek()!==')'){args.push(expression());if(peek()!==',')break;take();}take(')');a=['call',a,args];continue;}
   if(p==='?:'&&min===0){take();a=['elvis',a,expression()];continue;}if(p==='?'&&min===0){take();const b=expression();const hasElse=peek()===':';if(hasElse)take(':');a=['ternary',a,b,hasElse?expression():['value',null]];continue;}const n=priority[p??''];if(!n||n<min)break;take();a=['binary',p,a,expression(n+1)];
  }return a;
 }const a=expression();if(at!==ts.length)throw new Error('Unparsed expression '+s+' at '+ts[at].k);astCache.set(s,a);return a;}
function member(obj:any,key:any){if(obj==null)return null;if(['__proto__','constructor','prototype'].includes(String(key)))return null;return obj[key]??null;}
function method(obj:any,key:string,args:any[]){if(obj instanceof EnumValue){if(key==='name')return obj.code;if(key==='canManageContent')return ['SUPER_ADMIN','ADMIN'].includes(obj.code);}
 if(typeof obj==='string'&&key==='isBlank')return !obj.trim();
 if(obj&&obj.__utility){switch(obj.__utility+'.'+key){
  case 'fields.hasErrors':return !!obj.errors?.[args[0]];case 'fields.hasGlobalErrors':return !!obj.errors?._global?.length;case 'fields.globalErrors':return obj.errors?._global||[];
  case 'lists.isEmpty':return !args[0]?.length;case 'lists.size':return args[0]?.length||0;case 'lists.contains':return (args[0]||[]).some((v:any)=>primitive(v)==primitive(args[1]));
  case 'strings.isEmpty':return args[0]==null||String(args[0])==='';case 'strings.replace':return String(args[0]??'').split(String(args[1])).join(String(args[2]));case 'strings.startsWith':return String(args[0]??'').startsWith(String(args[1]));case 'strings.substring':return String(args[0]??'').substring(Number(args[1]),args[2]==null?undefined:Number(args[2]));case 'strings.toLowerCase':return String(args[0]??'').toLowerCase();case 'strings.toString':return String(args[0]??'');
  case 'numbers.formatInteger':return Number(args[0]||0).toLocaleString(args[2]==='COMMA'?'en-US':'ko-KR',{useGrouping:args[2]==='COMMA',minimumIntegerDigits:Number(args[1]||1),maximumFractionDigits:0});
  case 'numbers.formatDecimal':return Number(args[0]||0).toLocaleString('en-US',{minimumIntegerDigits:Number(args[1]||1),minimumFractionDigits:Number(args[2]||0),maximumFractionDigits:Number(args[2]||0),useGrouping:false});
  case 'temporals.format':return formatDate(args[0],args[1]);
 }}throw new Error('Unsupported template method '+key);}
export function formatDate(v:any,pattern='yyyy-MM-dd HH:mm'){if(!v)return '';const raw=String(v).replace(' ','T');const s=/^\d{4}-\d{2}-\d{2}$/.test(raw)?raw+'T00:00:00':raw;const date=new Date(s.endsWith('Z')||/[+-]\d\d:\d\d$/.test(s)?s:s+'+09:00');if(!Number.isFinite(+date))return String(v);const d=new Date(+date+9*3600000);const p=(n:number)=>String(n).padStart(2,'0');const vals:Record<string,string>={yyyy:String(d.getUTCFullYear()),MM:p(d.getUTCMonth()+1),dd:p(d.getUTCDate()),HH:p(d.getUTCHours()),mm:p(d.getUTCMinutes()),M:String(d.getUTCMonth()+1),d:String(d.getUTCDate()),E:'일월화수목금토'[d.getUTCDay()]};return String(pattern).replace(/yyyy|MM|dd|HH|mm|M|d|E/g,k=>vals[k]);}
function run(a:Ast,c:Ctx):any{switch(a[0]){
 case 'value':return a[1];case 'id':return c[a[1]]??c._item?.[a[1]]??null;case 'get':return member(run(a[1],c),run(a[2],c));
 case 'special':if(a[1]==='$')return expression(a[2],c);if(a[1]==='*')return expression(a[2],{...c,...c._form});if(a[1]==='@')return url(a[2],c);return fragment(a[2],c);
 case 'unary':{const v=primitive(run(a[2],c));return a[1]==='!'?!v:a[1]==='-'?-Number(v):Number(v);}
 case 'elvis':{const v=run(a[1],c);return v==null||v===''?run(a[2],c):v;}
 case 'ternary':return run(a[1],c)?run(a[2],c):run(a[3],c);
 case 'call':if(a[1][0]!=='get')throw new Error('Template calls must be whitelisted');return method(run(a[1][1],c),String(run(a[1][2],c)),a[2].map((x:Ast)=>run(x,c)));
 case '.!':return (run(a[1],c)||[]).map((v:any)=>run(a[2],{...c,_item:v}));case '.?':return (run(a[1],c)||[]).filter((v:any)=>run(a[2],{...c,_item:v}));
 case 'binary':{const op=a[1];const l=primitive(run(a[2],c));if(op==='&&')return l&&run(a[3],c);if(op==='||')return l||run(a[3],c);const r=primitive(run(a[3],c));switch(op){case '==':return l==r;case '!=':return l!=r;case '+':return typeof l==='string'||typeof r==='string'?String(l??'')+String(r??''):Number(l)+Number(r);case '-':return Number(l)-Number(r);case '*':return Number(l)*Number(r);case '/':return Number(l)/Number(r);case '%':return Number(l)%Number(r);case '>':return l>r;case '<':return l<r;case '>=':return l>=r;case '<=':return l<=r;}}}
 throw new Error('Invalid template expression');}
export function expression(s:string,c:Ctx):any{if(s.startsWith('|')&&s.endsWith('|'))return s.slice(1,-1).replace(/\$\{([^}]+)\}/g,(_,e)=>String(expression(e,c)??''));return run(parse(s),c);}
function url(s:string,c:Ctx){let path=s,params='';let q='';let depth=0;for(let i=0;i<s.length;i++){const a=s[i];if(q){if(a===q&&s[i-1]!=='\\')q='';continue;}if(a==="'"||a==='"'){q=a;continue;}if(a==='{')depth++;if(a==='}')depth--;if(a==='('&&depth===0){path=s.slice(0,i);params=s.slice(i+1,-1);break;}}
 const query=new URLSearchParams();for(const p of splitTop(params)){const eq=p.indexOf('=');if(eq<0)continue;const key=p.slice(0,eq).trim(),v=expression(p.slice(eq+1),c);if(v==null||v==='')continue;const placeholder='{'+key+'}';if(path.includes(placeholder))path=path.replaceAll(placeholder,encodeURIComponent(String(v)));else query.set(key,String(v));}const qs=query.toString();return path+(qs?'?'+qs:'');}
type Ref={_ref:true;template:string;name:string;args:any[]};
function fragment(s:string,c:Ctx):Ref{const divider=s.indexOf('::');const template=(divider<0?s:s.slice(0,divider)).trim()||c._template;const target=(divider<0?'':s.slice(divider+2)).trim();const open=target.indexOf('(');return {_ref:true,template,name:open<0?target:target.slice(0,open).trim(),args:open<0?[]:splitTop(target.slice(open+1,-1)).map(x=>expression(x,c))};}
function find(n:Node,p:(n:Exclude<Node,string>)=>boolean):Exclude<Node,string>|null{if(typeof n==='string')return null;if(p(n))return n;for(const x of n.children){const got=find(x,p);if(got)return got;}return null;}
function renderRef(ref:Ref,c:Ctx){if(!ref?._ref)throw new Error('Invalid fragment');const root=views[ref.template];if(!root)throw new Error('Missing template '+ref.template);const node=find(root,n=>(n.attrs['th:fragment']||'').split('(')[0].trim()===ref.name||n.tag===ref.name);if(!node)throw new Error('Missing fragment '+ref.template+'::'+ref.name);const declaration=node.attrs['th:fragment']||'';const open=declaration.indexOf('(');const params=open<0?[]:splitTop(declaration.slice(open+1,-1));const vars:Ctx={...c,_template:ref.template};params.forEach((p,i)=>vars[p]=ref.args[i]);return renderNode(node,vars);}
function renderNode(n:Node,context:Ctx):string{if(typeof n==='string'){if(context._inline==='javascript')return n.replace(/\/\*\[\[(.*?)\]\]\*\/\s*(?:\[\]|null|'[^']*'|"[^"]*"|\d+)/gs,(_,e)=>safeJson(expression(e,context)));return n;}
 const a=n.attrs;
 if(a['th:each']){const i=a['th:each'].indexOf(':');const [name,status]=a['th:each'].slice(0,i).split(',').map(x=>x.trim());const items=expression(a['th:each'].slice(i+1).trim(),context)||[];return Array.from(items).map((item,index)=>renderNode({...n,attrs:{...a,'th:each':null}},{...context,[name]:item,[status||name+'Stat']:{index,count:index+1,first:index===0,last:index===items.length-1,size:items.length,even:index%2===0,odd:index%2===1}})).join('');}
 let c={...context};if(a['th:with'])for(const def of splitTop(a['th:with'])){const i=def.indexOf('=');c[def.slice(0,i).trim()]=expression(def.slice(i+1),c);}if(a['th:object'])c._form=expression(a['th:object'],c);
 if(a['th:if']&&!expression(a['th:if'],c))return '';if(a['th:unless']&&expression(a['th:unless'],c))return '';
 if(a['th:replace'])return renderRef(expression(a['th:replace'],c),c);
 const attrs:Record<string,any>={};for(const [k,v]of Object.entries(a))if(!k.startsWith('th:')&&k!=='xmlns:th')attrs[k]=v;
 for(const [k,v]of Object.entries(a)){if(!v||!k.startsWith('th:'))continue;const key=k.slice(3);if(['each','with','object','if','unless','replace','fragment','text','utext','errors','field','inline','attr','classappend'].includes(key))continue;const val=expression(v,c);if(['selected','readonly','open','disabled','checked','hidden','multiple','required'].includes(key)){if(val)attrs[key]='';else delete attrs[key];}else if(val!=null)attrs[key]=String(val);else delete attrs[key];}
 if(a['th:classappend'])attrs.class=String(attrs.class||'')+' '+String(expression(a['th:classappend'],c)??'');
 if(a['th:attr'])for(const def of splitTop(a['th:attr'])){const i=def.indexOf('=');const val=expression(def.slice(i+1),c);if(val!=null)attrs[def.slice(0,i).trim()]=String(val);}
 let content:string|undefined;
 if(a['th:field']){const name=a['th:field'].replace(/^\*\{|\}$/g,'');const value=member(c._form,name);attrs.name=name;attrs.id=attrs.id||name;
  if(n.tag==='textarea')content=escapeHtml(value);else if(n.tag==='select')c._selected=value;else if(attrs.type==='checkbox'){attrs.value='true';if(value)attrs.checked='';else delete attrs.checked;}else if(attrs.type==='radio'){if(String(primitive(value))===String(attrs.value))attrs.checked='';else delete attrs.checked;}else attrs.value=String(value??'');
 }
 if(n.tag==='option'&&c._selected!=null){if(String(attrs.value??'')===String(primitive(c._selected)))attrs.selected='';else delete attrs.selected;}
 if(a['th:text'])content=escapeHtml(expression(a['th:text'],c));if(a['th:utext'])content=String(expression(a['th:utext'],c)??'');if(a['th:errors'])content=escapeHtml(c._errors?.[a['th:errors'].replace(/^\*\{|\}$/g,'')]||'');
 if(a['th:inline'])c._inline=a['th:inline'];
 if(content===undefined)content=n.children.map(x=>renderNode(x,c)).join('');
 if(n.tag==='form'&&String(attrs.method||'get').toLowerCase()==='post'&&c._csrf)content=`<input type="hidden" name="_csrf" value="${escapeHtml(c._csrf.token)}">`+content;
 if(!n.tag||n.tag==='th:block')return content;
 const opening='<'+n.tag+Object.entries(attrs).map(([k,v])=>' '+k+(v==null?'':'="'+escapeHtml(v)+'"')).join('')+'>';
 return opening+(voids.has(n.tag)?'':content+'</'+n.tag+'>');}

export function renderView(name:string,model:Ctx):string{const root=views[name];if(!root)throw new Error('Missing view '+name);const c:Ctx={...model,_template:name};for(const name of ['fields','lists','strings','numbers','temporals'])c['#'+name]={__utility:name,errors:model._errors};return renderNode(root,c);}
