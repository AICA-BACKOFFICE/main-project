package egovframework.backoffice.config;

import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** backoffice.properties 의 backoffice.* 설정. ApplicationConfig에서 Spring DataBinder로 바인딩한다. */
@Getter
@Setter
public class BackofficeProperties {
    /** 상단·사이드바에 표시할 서비스 이름 */
    private String siteName = "AICA 관리자 페이지";
    /** 사이드바 서비스 이름 아래 표시할 환경 라벨 (local / dev / prod) */
    private String environmentLabel = "local";
    /** 업로드 이미지 저장 디렉터리 */
    private String uploadDir = "./data/uploads";
    /** 프론트 오피스 주소 (미리보기 화면에서 "실제 화면 열기" 링크에 사용) */
    private String frontBaseUrl = "https://www.aica-gj.kr/main.php";
    private InitialAdmin initialAdmin = new InitialAdmin();
    /** 카테고리 페이지 관리: 공유용 사이트의 페이지(인사교 알아보기 등)를 실제 화면 그대로 고치는 편집기 */
    private Pages pages = new Pages();

    @Getter
    @Setter
    public static class InitialAdmin {
        private String loginId = "admin";
        private String name = "최초 관리자";
        private String password;
    }

    @Getter
    @Setter
    public static class Pages {
        /** 사이트 파일 폴더 — about/ · stories/ · life/ · check/ 와 공통 common/ 이 들어 있는 공유용 사이트(aica-site-preview) */
        private String siteRoot = "./data/site";
        /** 임시저장·반영 전 백업을 두는 폴더 */
        private String dataDir = "./data/pages";
        /** 편집할 페이지. 사이드바 '카테고리 페이지 관리'에 이 순서로 보인다. file 은 사이트 폴더 기준 경로 */
        private List<Item> items = new ArrayList<>(List.of(
                new Item("about", "인사교 알아보기", "about/index.html"),
                new Item("stories", "선배들의 이야기", "stories/index.html"),
                // 2026-10-14 사이트 새 시안: 이야기가 '한눈에 보기'(위) + 종류별 페이지로 나뉨 → 사이드바에서는 선배들의 이야기 아래에 펼쳐 보임
                new Item("stories-reviews", "선배들의 이야기 › 후기", "stories/reviews.html", "stories"),
                new Item("stories-interviews", "선배들의 이야기 › 인터뷰", "stories/interviews.html", "stories"),
                new Item("stories-projects", "선배들의 이야기 › 프로젝트", "stories/projects.html", "stories"),
                new Item("stories-cohorts", "선배들의 이야기 › 기수별 이모저모", "stories/cohorts.html", "stories"),
                new Item("life", "인사교 라이프", "life/index.html"),
                new Item("check", "지원 전 체크", "check/index.html")));
        /** 편집 화면에서 고를 수 없게 잠글 곳 — 모든 페이지가 함께 쓰는 머리말·바닥글·모바일 메뉴 등(common/js/site.js 가 그림) */
        private List<String> locked = new ArrayList<>(List.of("#siteHeader", "#siteFooter", "#drawer", ".skip-link", ".floating", "#toast",
                "#siteLnb", ".st-mhf"));   // 왼쪽 메뉴(site.js) · 이야기 제목 띠(mast-fix.js)도 스크립트가 그리는 곳
        /** 페이지 기능이 내용을 자동으로 채워 편집 화면에서는 누를 수 없게 할 곳(지원 전 체크의 질문 분류·검색) */
        private List<String> inert = new ArrayList<>(List.of(".faq-tools"));
        private String inertNotice = "분류 버튼과 검색은 질문 목록에 맞춰 자동으로 채워지는 곳이라 편집 화면에서는 누를 수 없어요. "
                + "분류별 질문 수는 저장할 때 자동으로 맞춰지고, 동작은 ‘미리보기’에서 확인할 수 있어요.";
        /**
         * 곳마다 따로 안내하는 '누를 수 없는 곳': [선택자, 안내]. 선배들의 이야기의 후기 · 인터뷰 · 프로젝트 목록 · 글 창 · 한눈에 보기 미리보기는
         * 게시물 관리의 DB 내용(공개 API)으로 그려지는 곳이라 페이지 편집에서는 고르지 못하게 한다.
         * 기수별 모아보기 카드 · 인사교 라이프 · 지원 전 체크는 2026-10-20부터 다시 페이지 HTML이라 페이지 편집에서 고친다.
         * 한눈에 보기의 큰 인터뷰 카드는 사진 · 제목 · 이름만 DB로 채우고, 꼬리표(em)와 인용(.hb-ivf-q)은 페이지 글이라 고를 수 있다.
         */
        private List<List<String>> inertNotices = new ArrayList<>(List.of(List.of(
                ".stories-page .idgrid, .stories-page .rvlist, .stories-page .rev .pager, .stories-page .ov, "
                        + ".stories-page .ivgrid, .stories-page .ivdots, .stories-page .iva-out, .stories-page .iva-chips, .stories-page .cpager, .stories-page .ivd, "
                        + ".stories-page .pjgrid, .stories-page .pjd, "
                        + ".stories-hub .hb-ivf > .hb-ph, .stories-hub .hb-ivf > svg, .stories-hub .hb-ivf h3, .stories-hub .hb-ivf .hb-by, "
                        + ".stories-hub .hb-ivl, .stories-hub .hb-lqw, .stories-hub .hb-pis, .stories-hub .hb-pjs",
                "이 부분은 ‘선배들의 이야기 게시물 관리’에 올린 후기 · 인터뷰 · 프로젝트로 채워지는 곳이에요. "
                        + "글을 쓰거나 고치려면 게시물 관리 › 선배들의 이야기 게시물 관리에서 해 주세요. 발행하면 이 자리에 바로 반영돼요.")));
        /** 글꼴 목록: [CSS font-family, 이름]. 사이트에 들어 있는 글꼴만 넣는다(배포해도 그대로 보이도록) */
        private List<List<String>> fonts = new ArrayList<>(List.of(
                List.of("Pretendard, sans-serif", "프리텐다드"),
                List.of("'Paperlogy Text', Pretendard, sans-serif", "페이퍼로지 (본문)"),
                List.of("'Paperlogy Title', Pretendard, sans-serif", "페이퍼로지 (제목)"),
                List.of("Giants, Pretendard, sans-serif", "자이언츠 (굵은 제목)"),
                List.of("'Noto Serif KR', 'Nanum Myeongjo', Batang, serif", "명조체")));
        /** 글자 색 목록: [색, 이름] */
        private List<List<String>> palette = new ArrayList<>(List.of(
                List.of("#14233f", "진남색 (본문)"), List.of("#162021", "검정"), List.of("#566175", "회색 (보조 글)"),
                List.of("#a3abbb", "연회색"), List.of("#ffffff", "흰색"), List.of("#1f4ed8", "대표 파랑"),
                List.of("#1249ee", "알아보기 파랑"), List.of("#1c2a4a", "남색"), List.of("#5b8cff", "하늘색"),
                List.of("#7c5cff", "보라"), List.of("#e5483a", "빨강"), List.of("#ed961a", "주황"),
                List.of("#fee500", "노랑"), List.of("#12a35e", "초록"), List.of("#d6409f", "분홍")));
        /** 프론트오피스(사이트) 주소. '반영된 페이지' 버튼이 이 주소를 연다. 비우면 이 서버의 /admin/pages/site/ 에서 보여 준다 */
        private String frontUrl = "";
        /** '사이트에 반영' 창의 안내(공개 사이트에 올리는 방법) */
        private String deployNote = "함께 작업하는 사람들도 보게 하려면 반영 후 백오피스 프로젝트 폴더의 바뀐 파일을 커밋하고 GitHub(AICA-BACKOFFICE/main-project)에 푸시해 주세요.";
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Item {
        private String id;
        private String title;
        private String file;
        /** 사이드바에서 이 페이지를 펼쳐 보일 위 페이지 id(이야기 하위 페이지 → stories). 없으면 맨 위 */
        private String parent;

        public Item(String id, String title, String file) {
            this(id, title, file, null);
        }
    }
}
