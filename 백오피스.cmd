@echo off
chcp 65001 >nul
title 인사교 백오피스 (관리자 페이지)
rem 최종 백오피스: 이 폴더의 '백오피스'(관리자 페이지 · 카테고리 페이지 관리 · 게시물 관리).
rem 고치는 사이트는 이 폴더의 '프론트오피스'예요. 편집 화면의 '반영된 페이지' 버튼은 프론트오피스(4181)를 열어요.
rem 필요한 것: Java 17 이상. 처음 켤 때는 인터넷으로 Maven과 부품을 받아서 몇 분 걸려요.
cd /d "%~dp0백오피스"
rem Java 찾기: JAVA_HOME → Android Studio에 들어 있는 Java → PATH의 java
if defined JAVA_HOME if not exist "%JAVA_HOME%\bin\java.exe" set "JAVA_HOME="
if not defined JAVA_HOME if exist "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "JAVA_EXE=java"
if defined JAVA_HOME set "JAVA_EXE=%JAVA_HOME%\bin\java.exe"
"%JAVA_EXE%" -version >nul 2>nul || goto :nojava
rem 버전 확인: 17보다 낮으면(1.8 · 11 등) 안내하고 멈춰요. 버전을 못 읽으면 그냥 진행
set "JV=" & set "JM=" & set "JMN="
for /f "tokens=3" %%v in ('call "%JAVA_EXE%" -version 2^>^&1 ^| findstr /i "version"') do if not defined JV set "JV=%%~v"
for /f "delims=.-+_ " %%m in ("%JV%") do set "JM=%%m"
set /a JMN=JM 2>nul
if defined JV if "%JM%"=="1" goto :oldjava
if defined JV if %JMN% LSS 17 goto :oldjava
if "%BACKOFFICE_PORT%"=="" set "BACKOFFICE_PORT=8080"
if "%BACKOFFICE_SITE_ROOT%"=="" set "BACKOFFICE_SITE_ROOT=%~dp0프론트오피스"
if "%BACKOFFICE_FRONT_URL%"=="" set "BACKOFFICE_FRONT_URL=http://127.0.0.1:4181/"
echo 백오피스(관리자 페이지): http://127.0.0.1:%BACKOFFICE_PORT%/  (이 창을 닫으면 꺼져요)
echo 고치는 사이트 폴더: %BACKOFFICE_SITE_ROOT%
echo 프론트오피스: %BACKOFFICE_FRONT_URL%  (프론트오피스.cmd로 켜요)
rem 서버가 준비되면 브라우저로 관리자 페이지를 열어요(BACKOFFICE_NO_BROWSER=1 이면 열지 않음).
if not "%BACKOFFICE_NO_BROWSER%"=="1" start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 300; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:%BACKOFFICE_PORT%/login | Out-Null; Start-Process 'http://127.0.0.1:%BACKOFFICE_PORT%/'; break } catch { Start-Sleep -Seconds 2 } }"
call .\mvnw.cmd -B -ntp -Denforcer.skip=true spring-boot:run
pause
exit /b
:nojava
echo.
echo Java를 찾지 못했어요. Java 17 이상을 설치한 뒤 다시 실행해 주세요.
echo   예: https://adoptium.net 에서 Temurin 17 또는 21 (설치할 때 JAVA_HOME 설정도 켜 주세요)
pause
exit /b 1
:oldjava
echo.
echo 설치된 Java가 너무 오래됐어요. Java 17 이상을 설치해 주세요: https://adoptium.net
"%JAVA_EXE%" -version
pause
exit /b 1
