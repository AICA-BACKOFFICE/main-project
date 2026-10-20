-- 2026-10-20 후기 표에서 반 · 직군(track)과 흐르는 한마디(ticker) 칸을 뺀다(사용자 요청).
-- 두 칸 모두 후기 62개에서 비어 있었다. 사이트의 흐르는 띠는 후기 요약(굵은 첫 문단)의 첫 문장을 쓴다.
ALTER TABLE reviews DROP COLUMN track;
ALTER TABLE reviews DROP COLUMN ticker;
