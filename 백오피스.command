#!/bin/bash
# 인사교 백오피스(관리자 페이지) — macOS: 더블클릭(처음 한 번은 오른쪽 클릭 › 열기) · Linux: bash 백오피스.command
# 필요한 것: Java 17 이상. 처음 켤 때는 인터넷으로 Maven과 부품을 받아서 몇 분 걸려요.
cd "$(dirname "$0")/백오피스" || exit 1
if ! java -version >/dev/null 2>&1 && [ -z "$JAVA_HOME" ]; then
  echo "Java를 찾지 못했어요. https://adoptium.net 에서 Temurin 17 또는 21을 설치한 뒤 다시 실행해 주세요."
  read -r -p "엔터를 누르면 닫혀요" _; exit 1
fi
export BACKOFFICE_PORT="${BACKOFFICE_PORT:-8080}"
export BACKOFFICE_SITE_ROOT="${BACKOFFICE_SITE_ROOT:-$(cd ../프론트오피스 && pwd)}"
export BACKOFFICE_FRONT_URL="${BACKOFFICE_FRONT_URL:-http://127.0.0.1:4181/}"
echo "백오피스(관리자 페이지): http://127.0.0.1:$BACKOFFICE_PORT/  (이 창을 닫으면 꺼져요)"
echo "고치는 사이트 폴더: $BACKOFFICE_SITE_ROOT"
# 서버가 준비되면 바로 브라우저로 관리자 페이지를 열어요. 그사이 이미 열어 둔 창에서 관리자 화면을 열었으면 새 창은 열지 않아요.
if [ "$BACKOFFICE_NO_BROWSER" != "1" ]; then
  ( for i in $(seq 1 2400); do
      if seen=$(curl -s "http://127.0.0.1:$BACKOFFICE_PORT/launcher/browser-seen"); then
        case "$seen" in *true*) ;; *) (open "http://127.0.0.1:$BACKOFFICE_PORT/" || xdg-open "http://127.0.0.1:$BACKOFFICE_PORT/") >/dev/null 2>&1 ;; esac
        break
      fi; sleep 0.5
    done ) &
fi
chmod +x ./mvnw 2>/dev/null
./mvnw -B -ntp -Denforcer.skip=true spring-boot:run
read -r -p "엔터를 누르면 닫혀요" _
