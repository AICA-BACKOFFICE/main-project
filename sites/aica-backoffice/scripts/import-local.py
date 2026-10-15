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
for p in (WORKSPACE/'백오피스/src/main/resources/templates').rglob('*.html'):
    parser=Tree(); parser.feed(p.read_text(encoding='utf-8'))
    name=p.relative_to(WORKSPACE/'백오피스/src/main/resources/templates').as_posix()[:-5]
    if name=='account/user-form':
        def adapt(n):
            if not isinstance(n,dict): return
            for index,child in enumerate(n['children']):
                if isinstance(child,dict) and child['attrs'].get('for')=='password':
                    child['children']=['로그인 방식']
                    child['attrs'].pop('th:text',None)
                    child['attrs'].pop('th:classappend',None)
                    for sibling in n['children'][index+1:]:
                        if isinstance(sibling,dict):
                            sibling['children']=['등록된 이메일의 ChatGPT 계정으로 로그인합니다. 비밀번호는 ChatGPT 계정에서 관리합니다.']
                            break
                adapt(child)
        adapt(parser.root)
    templates[name]=parser.root
# Hosted account security and large-file upload support.
def hosted_template(n):
    if not isinstance(n,dict):return
    if n.get('tag')=='a' and n['attrs'].get('th:href')=='@{/account/password}':n['children']=['계정 보안']
    if n.get('tag')=='head':n['children'].append({'tag':'script','attrs':{'src':'/js/cloud-upload.js','defer':None},'children':[]})
    for child in n['children']:hosted_template(child)
for tree in templates.values():hosted_template(tree)
(LIB/'templates.json').write_text(json.dumps(templates,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
shutil.copytree(WORKSPACE/'백오피스/src/main/resources/static',PUBLIC,dirs_exist_ok=True)
core=PUBLIC/'js/editor/core.js'
core.write_text(core.read_text(encoding='utf-8').replace('var fd = new FormData();','if (!isImg && f.size > 16 * 1024 * 1024 && window.AicaCloudUpload) return window.AicaCloudUpload(f, url, csrf());\n      var fd = new FormData();'),encoding='utf-8')

pages={}
texts={}
assets=[]
source=WORKSPACE/'프론트오피스'
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
archive=WORKSPACE/'예전 파일/전체페이지-초기화전-2026-10-15_09-11-44/프론트오피스/stories'
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
config=json.loads((WORKSPACE/'실행 도구/클로드 배포/site.config.json').read_text(encoding='utf-8'))
(LIB/'page-config.json').write_text(json.dumps(config,ensure_ascii=False),encoding='utf-8')
print(json.dumps({'templates':len(templates),'pages':len(pages),'imageAssets':len(assets)}))
