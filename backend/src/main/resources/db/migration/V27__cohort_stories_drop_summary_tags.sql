-- 2026-10-20 기수별 이모저모 칸 정리(사용자 요청): 요약(summary) · 태그(tags) 칸을 뺀다. 표는 아직 비어 있음.
--  - 격자 칸(썸네일)에는 제목 · 날짜만 보이고, 글 창에 보이는 글은 하나뿐이라 요약과 본문이 같은 내용 → 본문(body) 하나로.
--  - 기수별 이모저모 화면(cohort-v3.js)은 태그를 쓰지 않는다(기수 · 날짜로만 나눔).
ALTER TABLE cohort_stories DROP COLUMN summary;
ALTER TABLE cohort_stories DROP COLUMN tags;

COMMENT ON COLUMN cohort_stories.cohort IS '기수(숫자). 위쪽 기수 칩(7기 · 6기 · 3–5기)과 계정 이름(aica_7th)이 이 값으로 나뉨';
COMMENT ON COLUMN cohort_stories.title IS '제목(격자 칸 · 글 창 제목)';
COMMENT ON COLUMN cohort_stories.body IS '글 창에 보이는 글(문단 사이는 빈 줄). 격자 칸에는 안 보임';
COMMENT ON COLUMN cohort_stories.event_date IS '있었던 날. 달별 동그라미(5월 · 6월 …)는 이 날짜의 연 · 월로 나뉨';
