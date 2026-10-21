-- 2026-10-14 사이트 새 시안(1014본): 후기 분야 '취업·진로'가 '취업 성공' · '진로 고민' 둘로 나뉨
-- 세부 카테고리 두 개를 더하고 예전 '취업·진로'는 숨김(글 연결은 유지 — 글을 다시 저장하면 새 분야로 옮겨짐)
INSERT INTO categories (name, slug, description, sort_order, active, parent_id) VALUES
  ('취업 성공', 'review-job',  NULL, 4, TRUE, (SELECT id FROM categories WHERE slug = 'review')),
  ('진로 고민', 'review-path', NULL, 5, TRUE, (SELECT id FROM categories WHERE slug = 'review'));
UPDATE categories SET active = FALSE, sort_order = 9, updated_at = CURRENT_TIMESTAMP WHERE slug = 'review-career';
