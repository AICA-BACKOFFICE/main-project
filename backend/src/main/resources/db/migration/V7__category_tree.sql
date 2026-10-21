-- 카테고리 2단 구조(프론트 확정 IA): 카테고리(후기·인터뷰·프로젝트·기수별 모아보기) + 세부 카테고리
--   후기 → 생활 · 수업 · 프로젝트 · 취업·진로 / 기수별 모아보기 → 3~5기 · 6기 · 7기
-- 글은 category_id(카테고리) + sub_category_id(세부, 선택)를 가진다
ALTER TABLE categories ADD COLUMN parent_id BIGINT;
ALTER TABLE categories ADD CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories (id);
ALTER TABLE posts ADD COLUMN sub_category_id BIGINT;
ALTER TABLE posts ADD CONSTRAINT fk_posts_sub_category FOREIGN KEY (sub_category_id) REFERENCES categories (id);
CREATE INDEX ix_posts_sub_category ON posts (sub_category_id);

-- 기존에 임의로 만든 카테고리는 숨김 처리(글 연결은 유지)
UPDATE categories SET active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE parent_id IS NULL;

INSERT INTO categories (name, slug, description, sort_order, active) VALUES
  ('후기',          'review',    '겪어 본 사람이 직접 써요',                 1, TRUE),
  ('인터뷰',        'interview', '선배·교수진 인터뷰',                       2, TRUE),
  ('프로젝트',      'project',   '교육 과정에서 진행한 프로젝트',            3, TRUE),
  ('기수별 모아보기','cohort',    '입교식부터 수료식까지 기수별 소식',        4, TRUE);

INSERT INTO categories (name, slug, description, sort_order, active, parent_id) VALUES
  ('생활',     'review-life',    NULL, 1, TRUE, (SELECT id FROM categories WHERE slug = 'review')),
  ('수업',     'review-class',   NULL, 2, TRUE, (SELECT id FROM categories WHERE slug = 'review')),
  ('프로젝트', 'review-project', NULL, 3, TRUE, (SELECT id FROM categories WHERE slug = 'review')),
  ('취업·진로','review-career',  NULL, 4, TRUE, (SELECT id FROM categories WHERE slug = 'review')),
  ('3~5기',    'cohort-3-5',     NULL, 1, TRUE, (SELECT id FROM categories WHERE slug = 'cohort')),
  ('6기',      'cohort-6',       NULL, 2, TRUE, (SELECT id FROM categories WHERE slug = 'cohort')),
  ('7기',      'cohort-7',       NULL, 3, TRUE, (SELECT id FROM categories WHERE slug = 'cohort'));

ALTER TABLE post_versions ADD COLUMN sub_category_id BIGINT;
