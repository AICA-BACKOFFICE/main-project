-- 2026-10-20 자주 묻는 질문(faqs)도 다른 게시글 표(후기 · 인터뷰 · 프로젝트)처럼 상태 칸과 휴지통 칸을 둔다(사용자 요청).
-- 사이트에는 게시중(PUBLISHED)이고 휴지통이 아닌 질문만 보인다. FAQ 관리에서 지운 질문은 휴지통으로 가고(삭제됨 · 지운 시각 · 지우기 전 상태),
-- 휴지통 화면에서 복원(지우기 전 상태로)하거나 완전 삭제한다. 지금 있는 질문 21개는 모두 게시중.
ALTER TABLE faqs ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE faqs ALTER COLUMN status SET DEFAULT 'DRAFT';
ALTER TABLE faqs ADD COLUMN status_before_trash VARCHAR(20);
ALTER TABLE faqs ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE faqs ADD CONSTRAINT ck_faqs_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'HIDDEN', 'DELETED'));
CREATE INDEX ix_faqs_list ON faqs (deleted_at, status, sort_order);

COMMENT ON TABLE faqs IS '지원 전 체크 › 자주 묻는 질문(FAQ). 관리: 게시물 관리 › 지원 전 Check FAQ 관리';
COMMENT ON COLUMN faqs.category IS '분류: 사이트 지원 전 체크 페이지의 분류 버튼(data-cat) 이름(준비사항 · 수업 · 생활 · 지원금 · 프로젝트)';
COMMENT ON COLUMN faqs.question IS '질문';
COMMENT ON COLUMN faqs.answer IS '답변(HTML: 링크 · 굵게 · 기울임 · 강조 · 줄바꿈 · 확인 필요 표시만)';
COMMENT ON COLUMN faqs.sort_order IS '번호(사이트에 보이는 순서)';
COMMENT ON COLUMN faqs.status IS '상태: DRAFT 임시저장 · PUBLISHED 게시중 · HIDDEN 미게시 · DELETED 삭제됨(휴지통)';
COMMENT ON COLUMN faqs.status_before_trash IS '휴지통으로 옮기기 전 상태(복원하면 이 상태로 돌아감). 휴지통이 아니면 비어 있음';
COMMENT ON COLUMN faqs.deleted_at IS '휴지통으로 옮긴 시각(삭제됨일 때만)';
