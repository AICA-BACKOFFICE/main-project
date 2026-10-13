-- 선배들의 이야기(후기·인터뷰·프로젝트·기수별 모아보기) 고정 양식: 양식 칸 값(JSON).
-- 이 값이 있는 글은 게시·미게시·휴지통·복원할 때마다 사이트의 stories/js/stories-data.js 로 다시 써진다. 본문 블록은 이 값으로 자동 생성
ALTER TABLE posts ADD COLUMN story_json TEXT;
ALTER TABLE post_versions ADD COLUMN story_json TEXT;
