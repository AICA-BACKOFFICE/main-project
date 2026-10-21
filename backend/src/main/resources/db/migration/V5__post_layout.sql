-- 글별 화면 레이아웃 설정(프리셋·정렬·폭·헤더/사이드바/하단 요소 구성). NULL 이면 기본 레이아웃
ALTER TABLE posts ADD COLUMN layout_json TEXT;
ALTER TABLE post_versions ADD COLUMN layout_json TEXT;
