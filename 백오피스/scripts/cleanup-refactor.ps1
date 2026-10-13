# 기능별 파일 재분배(리팩터링) 뒤 남은 옛 파일 정리 스크립트
# 사용: 프로젝트 루트에서  powershell -ExecutionPolicy Bypass -File .\scripts\cleanup-refactor.ps1
# 새 위치로 옮겨진 파일의 "옛 복사본"만 지웁니다. 지우지 않으면 같은 매퍼/타입 별칭이 중복돼 기동에 실패합니다.
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$files = @(
  # 미디어 분류를 게시물 카테고리로 통일(2026-10)하면서 빠진 폴더 기능 파일
  "src\main\java\egovframework\backoffice\media\ImageFolder.java",
  "src\main\java\egovframework\backoffice\media\ImageFolderMapper.java",
  "src\main\resources\mapper\media\ImageFolderMapper.xml",
  # 레이아웃 설정을 글쓰기 → 템플릿 관리로 이동(2026-10)하면서 빠진 파일
  "src\main\resources\templates\post\editor\_layout-panel.html",
  "src\main\resources\static\js\post\layout.js",
  # 카테고리 관리 화면 제거(2026-10) — 조회용 Service/Mapper 는 남김
  "src\main\java\egovframework\backoffice\category\CategoryController.java",
  "src\main\java\egovframework\backoffice\category\CategoryForm.java",
  "src\main\resources\templates\category\list.html",
  "src\main\java\egovframework\backoffice\adminuser\AdminRole.java",
  "src\main\java\egovframework\backoffice\adminuser\AdminUser.java",
  "src\main\java\egovframework\backoffice\adminuser\AdminUserController.java",
  "src\main\java\egovframework\backoffice\adminuser\AdminUserForm.java",
  "src\main\java\egovframework\backoffice\adminuser\AdminUserMapper.java",
  "src\main\java\egovframework\backoffice\adminuser\AdminUserService.java",
  "src\main\java\egovframework\backoffice\adminuser\PasswordController.java",
  "src\main\java\egovframework\backoffice\api\PublicApiController.java",
  "src\main\java\egovframework\backoffice\auth\AdminUserDetailsService.java",
  "src\main\java\egovframework\backoffice\auth\CurrentAdmin.java",
  "src\main\java\egovframework\backoffice\auth\LoginController.java",
  "src\main\java\egovframework\backoffice\bootstrap\InitialAdminRunner.java",
  "src\main\java\egovframework\backoffice\bootstrap\SampleDataRunner.java",
  "src\main\java\egovframework\backoffice\image\ImageController.java",
  "src\main\java\egovframework\backoffice\image\ImageFile.java",
  "src\main\java\egovframework\backoffice\image\ImageMapper.java",
  "src\main\java\egovframework\backoffice\image\ImageStorageService.java",
  "src\main\java\egovframework\backoffice\post\BlockContent.java",
  "src\main\java\egovframework\backoffice\post\PostVersion.java",
  "src\main\java\egovframework\backoffice\post\PostVersionMapper.java",
  "src\main\java\egovframework\backoffice\stage0\Stage0Controller.java",
  "src\main\java\egovframework\backoffice\stage0\Stage0SecurityConfiguration.java",
  "src\main\resources\mapper\AdminUserMapper.xml",
  "src\main\resources\mapper\CategoryMapper.xml",
  "src\main\resources\mapper\ImageMapper.xml",
  "src\main\resources\mapper\PostMapper.xml",
  "src\main\resources\mapper\PostTemplateMapper.xml",
  "src\main\resources\mapper\PostVersionMapper.xml",
  "src\main\resources\mapper\StatsMapper.xml",
  "src\main\resources\templates\adminuser\form.html",
  "src\main\resources\templates\adminuser\list.html",
  "src\main\resources\templates\auth\login.html",
  "src\main\resources\templates\image\list.html",
  "src\main\resources\templates\post\form.html",
  "src\main\resources\templates\stage0\status.html",
  "src\test\java\egovframework\backoffice\post\BlockContentTest.java",
  "src\test\java\egovframework\backoffice\verification\Stage0DatabaseTest.java",
  "src\test\java\egovframework\backoffice\verification\Stage0WebTest.java",
  "src\test\resources\stage0\db\V1__stage0_probe.sql",
  "src\test\resources\stage0\mapper\ProbeMapper.xmlsrc\main\resources\static\js\block-editor.js"
)
$removed = 0
foreach ($f in $files) {
  $p = Join-Path $root $f
  if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force; Write-Host "삭제: $f"; $removed++ }
}
# 비어 있는 옛 폴더 정리
$dirs = @(
  "src\main\java\egovframework\backoffice\adminuser", "src\main\java\egovframework\backoffice\auth",
  "src\main\java\egovframework\backoffice\bootstrap", "src\main\java\egovframework\backoffice\image",
  "src\main\java\egovframework\backoffice\api", "src\main\java\egovframework\backoffice\stage0",
  "src\main\resources\templates\adminuser", "src\main\resources\templates\auth",
  "src\main\resources\templates\image", "src\main\resources\templates\stage0",
  "src\test\java\egovframework\backoffice\post", "src\test\java\egovframework\backoffice\verification",
  "src\test\resources\stage0\db", "src\test\resources\stage0\mapper", "src\test\resources\stage0"
)
foreach ($d in $dirs) {
  $p = Join-Path $root $d
  if ((Test-Path -LiteralPath $p) -and -not (Get-ChildItem -LiteralPath $p -Force | Select-Object -First 1)) { Remove-Item -LiteralPath $p -Force; Write-Host "빈 폴더 삭제: $d" }
}
# 이전 빌드 산출물(옛 클래스가 남아 있으면 혼란) 제거
if (Test-Path -LiteralPath (Join-Path $root "target")) { Remove-Item -LiteralPath (Join-Path $root "target") -Recurse -Force; Write-Host "target 폴더 삭제" }
Write-Host "완료: 파일 $removed개 삭제. 이제 .\mvnw.cmd -B -ntp clean verify 를 실행하세요."
