@echo off
chcp 65001 >nul
title 최신으로 받기 (GitHub)
rem 함께 작업하는 사람이 GitHub에 올린 최신 내용(코드 · 사이트)을 받아서 이 폴더를 올라와 있는 것과 똑같이 맞춰요. 필요한 것: Git
rem 새 내용이 있을 때만, 이 컴퓨터에서 바뀐 파일을 지우지 않고 git stash에 보관해 둔 뒤 받아요.
cd /d "%~dp0"
where git >nul 2>nul || goto :nogit
git rev-parse --is-inside-work-tree >nul 2>nul || goto :notclone
echo GitHub에서 최신 내용을 확인하고 있어요...
git fetch --quiet || goto :fetchfail
git rev-parse --verify --quiet "@{u}" >nul || goto :noupstream
git merge-base --is-ancestor "@{u}" HEAD && goto :uptodate
git merge-base --is-ancestor HEAD "@{u}" || goto :diverged
rem 백오피스가 켜져 있으면(관리자 페이지 포트가 열려 있으면) 받기 전에 닫아 달라고 해요.
set "BO_PORT=%BACKOFFICE_PORT%"
if "%BO_PORT%"=="" set "BO_PORT=8080"
powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', %BO_PORT%); $c.Close(); exit 1 } catch { exit 0 }" || goto :running
echo.
echo 새로 받을 내용:
git --no-pager log --format="  - %%s" "HEAD..@{u}"
set "STASHED="
for /f "delims=" %%x in ('git status --porcelain -uall') do set "STASHED=1"
if not defined STASHED goto :merge
echo.
echo 이 컴퓨터에서 바뀐 파일이 있어요.
echo 지우지 않고 따로 보관(git stash)해 둔 뒤 최신 내용으로 바꿀게요.
git -c user.name=auto-backup -c user.email=auto-backup@localhost stash push --include-untracked --message "최신으로 받기 전 자동 보관" >nul || goto :stashfail
:merge
git merge --ff-only --quiet "@{u}" || goto :mergefail
echo.
echo 최신 내용으로 바꿨어요. 백오피스.cmd · 프론트오피스.cmd로 켜 주세요.
if defined STASHED echo 이 컴퓨터에서 바뀌었던 파일은 git stash에 보관돼 있어요. 다시 꺼내야 하면 함께 작업하는 사람에게 말해 주세요.
goto :end
:uptodate
echo.
echo 이미 최신이에요.
goto :end
:nogit
echo Git을 찾지 못했어요. https://git-scm.com 에서 설치한 뒤 다시 실행해 주세요.
goto :fail
:notclone
echo 이 폴더는 git clone으로 받은 폴더가 아니에요(ZIP으로 받은 경우 등). README를 보고 git clone으로 받아 주세요.
goto :fail
:fetchfail
echo GitHub에 연결하지 못했어요. 인터넷 연결과 GitHub 로그인을 확인해 주세요.
goto :fail
:noupstream
echo 이 폴더가 GitHub 저장소와 연결돼 있지 않아요. 함께 작업하는 사람에게 도움을 요청해 주세요.
goto :fail
:diverged
echo 이 컴퓨터에서 만든 커밋이 아직 올라가지 않았는데 GitHub에도 새 내용이 있어서, 자동으로 받을 수 없어요. 함께 작업하는 사람에게 도움을 요청해 주세요.
goto :fail
:running
echo 새 내용이 있어요. 백오피스(관리자 페이지) 창을 닫은 뒤 다시 실행해 주세요.
goto :fail
:stashfail
echo 바뀐 파일을 보관하지 못해서 멈췄어요. 위 메시지를 함께 작업하는 사람에게 보여 주세요.
goto :fail
:mergefail
echo 받지 못했어요. 위 메시지를 함께 작업하는 사람에게 보여 주세요.
goto :fail
:fail
echo.
pause
exit /b 1
:end
echo.
pause
exit /b 0
