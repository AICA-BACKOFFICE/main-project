#!/bin/bash
# 함께 작업하는 사람이 GitHub에 올린 최신 내용(코드 · 사이트 · 관리자 데이터)을 받아서 이 폴더를 올라와 있는 것과 똑같이 맞춰요 — macOS: 더블클릭 · Linux: bash "최신으로 받기.command"
# 새 내용이 있을 때만, 이 컴퓨터에서 바뀐 파일(관리자 데이터는 백오피스를 켜기만 해도 조금 바뀌어요)을 지우지 않고 git stash에 보관해 둔 뒤 받아요.
cd "$(dirname "$0")" || exit 1
finish() { echo; read -r -p "엔터를 누르면 닫혀요" _; exit "${1:-0}"; }
command -v git >/dev/null 2>&1 || { echo "Git을 찾지 못했어요. https://git-scm.com 에서 설치한 뒤 다시 실행해 주세요."; finish 1; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "이 폴더는 git clone으로 받은 폴더가 아니에요(ZIP으로 받은 경우 등). README를 보고 git clone으로 받아 주세요."; finish 1; }
echo "GitHub에서 최신 내용을 확인하고 있어요..."
git fetch --quiet || { echo "GitHub에 연결하지 못했어요. 인터넷 연결과 GitHub 로그인을 확인해 주세요."; finish 1; }
git rev-parse --verify --quiet "@{u}" >/dev/null || { echo "이 폴더가 GitHub 저장소와 연결돼 있지 않아요. 함께 작업하는 사람에게 도움을 요청해 주세요."; finish 1; }
if git merge-base --is-ancestor "@{u}" HEAD; then echo; echo "이미 최신이에요."; finish 0; fi
git merge-base --is-ancestor HEAD "@{u}" || { echo "이 컴퓨터에서 만든 커밋이 아직 올라가지 않았는데 GitHub에도 새 내용이 있어서, 자동으로 받을 수 없어요. 함께 작업하는 사람에게 도움을 요청해 주세요."; finish 1; }
# 백오피스가 켜져 있는 동안 관리자 데이터 파일을 바꾸면 안 돼요.
if curl -s -o /dev/null "http://127.0.0.1:${BACKOFFICE_PORT:-8080}/login"; then echo "새 내용이 있어요. 백오피스(관리자 페이지) 창을 닫은 뒤 다시 실행해 주세요."; finish 1; fi
echo; echo "새로 받을 내용:"
git --no-pager log --format="  - %s" "HEAD..@{u}"
STASHED=
if [ -n "$(git status --porcelain -uall)" ]; then
  echo; echo "이 컴퓨터에서 바뀐 파일이 있어요(관리자 데이터는 백오피스를 켜기만 해도 조금 바뀌어요)."; echo "지우지 않고 따로 보관(git stash)해 둔 뒤 최신 내용으로 바꿀게요."
  git -c user.name=auto-backup -c user.email=auto-backup@localhost stash push --include-untracked --message "최신으로 받기 전 자동 보관" >/dev/null || { echo "바뀐 파일을 보관하지 못해서 멈췄어요. 위 메시지를 함께 작업하는 사람에게 보여 주세요."; finish 1; }
  STASHED=1
fi
git merge --ff-only --quiet "@{u}" || { echo "받지 못했어요. 위 메시지를 함께 작업하는 사람에게 보여 주세요."; finish 1; }
echo; echo "최신 내용으로 바꿨어요. 백오피스.command · 프론트오피스.command로 켜 주세요."
[ -n "$STASHED" ] && echo "이 컴퓨터에서 바뀌었던 파일은 git stash에 보관돼 있어요. 다시 꺼내야 하면 함께 작업하는 사람에게 말해 주세요."
finish 0
