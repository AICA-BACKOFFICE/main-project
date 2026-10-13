@echo off
chcp 65001 >nul
title 인사교 프론트오피스 (사이트)
rem 최종 프론트오피스: 이 폴더의 '프론트오피스'(사이트)를 그대로 보여 주고, 백오피스에서 반영하면 열린 화면이 자동으로 새로고침돼요.
rem 페이지 폴더: about = 인사교 알아보기 · stories = 선배들의 이야기 · life = 인사교 라이프 · check = 지원 전 체크 · home = 홈 · common = 공통
rem 필요한 것: Node.js(18 이상)
cd /d "%~dp0"
where node >nul 2>nul || goto :nonode
set "SITE=%~dp0프론트오피스"
echo 프론트오피스(사이트): http://127.0.0.1:4181/  (이 창을 닫으면 꺼져요)
echo 사이트 폴더: %SITE%
node "실행 도구\프론트오피스 서버\server.cjs" --port 4181 --dist "%SITE%" --open
pause
exit /b
:nonode
echo.
echo Node.js를 찾지 못했어요. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요.
pause
exit /b 1
