from html.parser import HTMLParser
from pathlib import Path
import json, shutil

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parents[1]
LIB = ROOT / 'lib'
PUBLIC = ROOT / 'public'
LIB.mkdir(exist_ok=True)
PUBLIC.mkdir(exist_ok=True)
VOID = set('area base br col embed hr img input link meta param source track wbr'.split())

class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.root = {'tag': '', 'attrs': {}, 'children': []}
        self.stack = [self.root]
    def handle_starttag(self, tag, attrs):
        n = {'tag': tag, 'attrs': dict(attrs), 'children': []}
        self.stack[-1]['children'].append(n)
        if tag not in VOID: self.stack.append(n)
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID: self.stack.pop()
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i]['tag'] == tag:
                self.stack = self.stack[:i]
                break
    def handle_data(self, s): self.stack[-1]['children'].append(s)
    def handle_entityref(self, s): self.handle_data('&'+s+';')
    def handle_charref(self, s): self.handle_data('&#'+s+';')
    def handle_comment(self, s): self.handle_data('<!--'+s+'-->')
    def handle_decl(self, s): self.handle_data('<!'+s+'>')

templates = {}
for p in (WORKSPACE/'backend/src/main/resources/templates').rglob('*.html'):
    parser=Tree(); parser.feed(p.read_text(encoding='utf-8'))
    name=p.relative_to(WORKSPACE/'backend/src/main/resources/templates').as_posix()[:-5]
    templates[name]=parser.root
# Hosted account security and large-file upload support.
def hosted_template(n):
    if not isinstance(n,dict):return
    if n.get('tag')=='a' and n['attrs'].get('th:href')=='@{/account/password}':n['children']=['계정 보안']
    if n.get('tag')=='head':n['children'].append({'tag':'script','attrs':{'src':'/js/cloud-upload.js','defer':None},'children':[]})
    for child in n['children']:hosted_template(child)
for tree in templates.values():hosted_template(tree)
def password_templates(templates):
    def visit(n,fn):
        if not isinstance(n,dict):return
        fn(n)
        for child in n['children']:visit(child,fn)
    def account_form(n):
        a=n['attrs']
        if a.get('id')=='password':
            a['minlength']='10';a['maxlength']='128';a['th:required']='${form.id == null}'
            a['th:placeholder']="${form.id == null} ? '10자 이상' : '변경할 때만 입력 (10자 이상)'"
    visit(templates['account/user-form'],account_form)
    def help_text(n):
        if n['attrs'].get('class')=='help' and any(isinstance(c,str) and '발급한 비밀번호' in c for c in n['children']):n['children']=['10자 이상 128자 이하로 입력하세요. 발급한 비밀번호는 담당자에게 직접 전달하고 첫 로그인 후 변경하도록 안내해 주세요.']
    visit(templates['account/user-form'],help_text)
    def account_list(n):
        if n['attrs'].get('th:if')=='${u.mustChangePw}':
            n['attrs']['th:if']='${u.hasPassword and u.mustChangePw}'
        if n['tag']=='td' and any(isinstance(c,dict) and c['attrs'].get('th:text')=='${u.name}' for c in n['children']):
            n['children'].append({'tag':'span','attrs':{'class':'badge draft','th:if':'${not u.hasPassword}'},'children':['비밀번호 미설정']})
    visit(templates['account/user-list'],account_list)
    def password_page(n):
        a=n['attrs']
        if n['tag']=='h2':n['children']=['계정 보안 · 비밀번호 설정']
        if a.get('for')=='currentPassword' or a.get('id')=='currentPassword':a['th:if']='${hasPassword}'
        if n['tag']=='input' and a.get('type')=='password':a['maxlength']='128'
        if a.get('id') in ('newPassword','newPasswordConfirm'):a['minlength']='10'
        if a.get('class')=='help':n['children']=['10자 이상 128자 이하. 이 CMS에서 사용할 비밀번호를 설정합니다.']
        if n['tag']=='button' and a.get('type')=='submit':n['children']=['비밀번호 저장']
        if a.get('class')=='card-body':n['children'].insert(0,{'tag':'div','attrs':{'class':'alert info','th:if':'${not hasPassword}'},'children':['팀 계정 로그인에 사용할 비밀번호를 설정해 주세요. 아이디는 현재 계정의 이메일 주소입니다.']})
    visit(templates['account/password'],password_page)
password_templates(templates)
(LIB/'templates.json').write_text(json.dumps(templates,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
shutil.copytree(WORKSPACE/'backend/src/main/resources/static',PUBLIC,dirs_exist_ok=True)
core=PUBLIC/'js/editor/core.js'
core.write_text(core.read_text(encoding='utf-8').replace('var fd = new FormData();','if (!isImg && f.size > 16 * 1024 * 1024 && window.AicaCloudUpload) return window.AicaCloudUpload(f, url, csrf());\n      var fd = new FormData();'),encoding='utf-8')

pages={}
texts={}
assets=[]
source=WORKSPACE/'frontend'
for p in source.rglob('*'):
    if not p.is_file(): continue
    rel=p.relative_to(source).as_posix()
    if p.suffix=='.html': pages[rel]=p.read_bytes().decode('utf-8')
    else:
        out=PUBLIC/'site'/rel;out.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,out)
        if p.suffix in ('.js','.css'): texts[rel]=p.read_text(encoding='utf-8')
        if p.suffix.lower() in ('.png','.jpg','.jpeg','.webp','.svg','.gif','.avif'):
            assets.append({'path':rel,'size':p.stat().st_size})
(LIB/'site-pages.json').write_text(json.dumps(pages,ensure_ascii=False),encoding='utf-8')
(LIB/'site-texts.json').write_text(json.dumps(texts,ensure_ascii=False),encoding='utf-8')
(LIB/'site-assets.json').write_text(json.dumps(assets,ensure_ascii=False),encoding='utf-8')
archive=WORKSPACE/'docs/archive/전체페이지-초기화전-2026-10-15_09-11-44/프론트오피스/stories'
story_pages={}
if archive.exists():
    for p in archive.glob('*.html'):
        source=p.read_text(encoding='utf-8')
        import re
        source=re.sub(r'(src|href)="(js|css)/([^"?]+)([^"\n]*)"',lambda m:m.group(0) if m.group(3)=='stories-data.js' else f'{m.group(1)}="../cms-assets/stories/{m.group(2)}/{m.group(3)}{m.group(4)}"',source)
        story_pages['stories/'+p.name]=source
    for folder in ['js','css']:
        for p in (archive/folder).glob('*'):
            if p.name=='stories-data.js' or not p.is_file():continue
            out=PUBLIC/'site/cms-assets/stories'/folder/p.name
            out.parent.mkdir(parents=True,exist_ok=True)
            if p.suffix=='.css':out.write_text(p.read_text(encoding='utf-8').replace('../assets/','/site/stories/assets/'),encoding='utf-8')
            else:shutil.copyfile(p,out)
    for p in (archive/'assets').rglob('*'):
        if p.is_file():
            out=PUBLIC/'site/stories/assets'/p.relative_to(archive/'assets')
            if not out.exists():out.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,out)
(LIB/'story-pages.json').write_text(json.dumps(story_pages,ensure_ascii=False),encoding='utf-8')
config=json.loads((WORKSPACE/'scripts/claude-deploy/site.config.json').read_text(encoding='utf-8'))
(LIB/'page-config.json').write_text(json.dumps(config,ensure_ascii=False),encoding='utf-8')
print(json.dumps({'templates':len(templates),'pages':len(pages),'imageAssets':len(assets)}))
