#!/bin/bash
# 인사교 프론트오피스(사이트) — macOS: 더블클릭(처음 한 번은 오른쪽 클릭 › 열기) · Linux: bash 프론트오피스.command
# 필요한 것: Node.js(18 이상)
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js를 찾지 못했어요. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요."
  read -r -p "엔터를 누르면 닫혀요" _; exit 1
fi
echo "프론트오피스(사이트): http://127.0.0.1:4181/  (이 창을 닫으면 꺼져요)"
node "실행 도구/프론트오피스 서버/server.cjs" --port 4181 --dist "$(pwd)/프론트오피스" --open
read -r -p "엔터를 누르면 닫혀요" _
