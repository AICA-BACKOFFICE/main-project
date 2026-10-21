-- 운영진 공지(관리자 화면 상단 띠) 기능을 없앤다(2026-10-19 결정). V8에서 만든 공지 표와 '공지 닫음' 기록 표를 지운다.
-- 닫음 기록이 공지를 가리키므로 닫음 기록 표를 먼저 지운다.
DROP TABLE notice_dismissals;
DROP TABLE notices;
