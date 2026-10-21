-- 관리자 계정의 로그인 ID 를 이메일로 쓴다(길이 확장). 기존 ID(admin 등)는 그대로 로그인 가능
ALTER TABLE admin_users ALTER COLUMN login_id SET DATA TYPE VARCHAR(120);
