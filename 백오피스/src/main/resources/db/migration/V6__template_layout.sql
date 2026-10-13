-- 템플릿에 화면 레이아웃(PostLayout JSON)을 함께 저장. 글쓰기에서 템플릿을 불러오면 본문 구성과 레이아웃이 같이 적용된다
ALTER TABLE post_templates ADD COLUMN layout_json TEXT;
