-- 미디어 관리의 분류를 게시물 카테고리(2단)와 같게 맞춘다: images.category_id / sub_category_id → categories
-- 기존 기수 폴더(1~5기·6기·7기)는 "기수별 모아보기 › 3~5기·6기·7기"로 옮긴다
ALTER TABLE images ADD COLUMN category_id BIGINT;
ALTER TABLE images ADD COLUMN sub_category_id BIGINT;
ALTER TABLE images ADD CONSTRAINT fk_images_category FOREIGN KEY (category_id) REFERENCES categories (id);
ALTER TABLE images ADD CONSTRAINT fk_images_sub_category FOREIGN KEY (sub_category_id) REFERENCES categories (id);
CREATE INDEX ix_images_category ON images (category_id, sub_category_id, id DESC);

UPDATE images SET category_id = (SELECT id FROM categories WHERE slug = 'cohort'),
                  sub_category_id = (SELECT id FROM categories WHERE slug = 'cohort-3-5')
 WHERE folder_id = (SELECT id FROM image_folders WHERE name = '1~5기');
UPDATE images SET category_id = (SELECT id FROM categories WHERE slug = 'cohort'),
                  sub_category_id = (SELECT id FROM categories WHERE slug = 'cohort-6')
 WHERE folder_id = (SELECT id FROM image_folders WHERE name = '6기');
UPDATE images SET category_id = (SELECT id FROM categories WHERE slug = 'cohort'),
                  sub_category_id = (SELECT id FROM categories WHERE slug = 'cohort-7')
 WHERE folder_id = (SELECT id FROM image_folders WHERE name = '7기');

-- 폴더 테이블은 더 쓰지 않는다
ALTER TABLE images DROP CONSTRAINT fk_images_folder;
DROP INDEX IF EXISTS ix_images_folder;
ALTER TABLE images DROP COLUMN folder_id;
DROP TABLE image_folders;
