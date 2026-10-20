-- 2026-10-20 인터뷰 표에서 꼬리표(kicker)와 한 줄 인용(quote) 칸을 뺀다(사용자 요청).
-- 한눈에 보기 큰 인터뷰 카드의 꼬리표 · 인용은 사이트 페이지(stories/index.html) 글로 옮겨, 카테고리 페이지 관리에서 고친다.
ALTER TABLE interviews DROP COLUMN kicker;
ALTER TABLE interviews DROP COLUMN quote;
