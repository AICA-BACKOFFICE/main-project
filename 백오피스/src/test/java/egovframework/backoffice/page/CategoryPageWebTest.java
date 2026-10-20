package egovframework.backoffice.page;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.authenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Comparator;
import java.util.stream.Stream;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import egovframework.backoffice.BackofficeApplication;
import egovframework.testsupport.CmsMockMvcConfig;
import org.springframework.test.context.TestPropertySource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 카테고리 페이지 관리: 사이드바 메뉴 → 편집 화면 → 편집용 페이지(편집기 붙임) → 임시저장 · 반영 · 버전 기록 · 그림 올리기 흐름을
 * 임시 사이트 폴더로 검증한다. 원본 표기(CRLF·문자 참조)는 받은 글 그대로 저장되어야 한다.
 */
@TestPropertySource(properties = {
        "datasource.url=jdbc:h2:mem:backoffice-pages-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "backoffice.upload-dir=${java.io.tmpdir}/aica-category-pages-test/uploads",
        "backoffice.pages.site-root=${java.io.tmpdir}/aica-category-pages-test/site",
        "backoffice.pages.data-dir=${java.io.tmpdir}/aica-category-pages-test/data",
        "backoffice.initial-admin.password=test-pass-1234"
})
@SpringJUnitWebConfig({BackofficeApplication.class, CmsMockMvcConfig.class})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class CategoryPageWebTest {

    private static final Path ROOT = Paths.get(System.getProperty("java.io.tmpdir"), "aica-category-pages-test");
    private static final Path SITE = ROOT.resolve("site");
    /** 윈도우 줄바꿈 · 소문자 doctype · 문자 참조(&middot;)가 섞인, 손으로 만든 페이지 */
    private static final String ABOUT = "<!doctype html>\r\n<html lang=\"ko\" data-menu=\"about\">\r\n<head>\r\n<meta charset=\"utf-8\">\r\n"
            + "<title>인사교 알아보기</title>\r\n<link rel=\"stylesheet\" href=\"../common/css/site.css\">\r\n</head>\r\n<body>\r\n"
            + "<header class=\"site-header\" id=\"siteHeader\"></header>\r\n<main id=\"main\"><h1>인사교 알아보기</h1><p>교육 &middot; 활동</p>"
            + "<img src=\"assets/photo.png\" alt=\"\"></main>\r\n</body>\r\n</html>\r\n";
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D};

    static {
        // 스프링이 뜨기 전에 임시 사이트 폴더를 새로 만든다(지난 실행의 임시저장·백업은 지움).
        try {
            if (Files.exists(ROOT)) {
                try (Stream<Path> walk = Files.walk(ROOT)) {
                    walk.sorted(Comparator.reverseOrder()).forEach(path -> path.toFile().delete());
                }
            }
            Files.createDirectories(SITE.resolve("about/assets"));
            Files.createDirectories(SITE.resolve("common/css"));
            Files.createDirectories(SITE.resolve(".git"));
            Files.writeString(SITE.resolve("about/index.html"), ABOUT, UTF_8);
            Files.writeString(SITE.resolve("common/css/site.css"), ".site-header{position:fixed}", UTF_8);
            Files.write(SITE.resolve("about/assets/photo.png"), PNG);
            Files.writeString(SITE.resolve(".git/config"), "[core]", UTF_8);
            Files.writeString(ROOT.resolve("secret.txt"), "outside", UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Autowired MockMvc mvc;

    private MockHttpSession login(String loginId, String password) throws Exception {
        return (MockHttpSession) mvc.perform(formLogin("/login").user("loginId", loginId).password("password", password))
                .andExpect(authenticated()).andReturn().getRequest().getSession(false);
    }

    private MockHttpSession admin() throws Exception {
        return login("admin", "test-pass-1234");
    }

    private String body(org.springframework.test.web.servlet.ResultActions result) throws Exception {
        return result.andReturn().getResponse().getContentAsString(UTF_8);
    }

    @Test
    @Order(1)
    void sidebarShowsFourCategoryPagesAndEditorOpens() throws Exception {
        MockHttpSession session = admin();
        String home = body(mvc.perform(get("/admin").session(session)).andExpect(status().isOk()));
        assertThat(home).contains("카테고리 페이지 관리")
                .contains("href=\"/admin/pages/about/edit\"").contains("인사교 알아보기")
                .contains("href=\"/admin/pages/stories/edit\"").contains("선배들의 이야기")
                .contains("href=\"/admin/pages/life/edit\"").contains("인사교 라이프")
                .contains("href=\"/admin/pages/check/edit\"").contains("지원 전 체크");

        mvc.perform(get("/admin/pages").session(session)).andExpect(redirectedUrl("/admin/pages/about/edit"));
        String editor = body(mvc.perform(get("/admin/pages/about/edit").session(session)).andExpect(status().isOk()));
        assertThat(editor).contains("id=\"bo-config\"").contains("\"apiBase\":\"/admin/pages/api/\"")
                .contains("\"initialPage\":\"about\"").contains("\"frontMode\":\"static\"")
                .contains("\"url\":\"/admin/pages/site/about/index.html\"")
                .contains("src=\"/js/page/editor.js\"").contains("관리자 홈")
                .doesNotContain("사이트 파일을 찾지 못했어요");

        // 사이트 폴더에 파일이 없는 페이지는 설정 안내를 보여 준다
        String missing = body(mvc.perform(get("/admin/pages/stories/edit").session(session)).andExpect(status().isOk()));
        assertThat(missing).contains("사이트 파일을 찾지 못했어요").contains("BACKOFFICE_SITE_ROOT").doesNotContain("src=\"/js/page/editor.js\"");
        mvc.perform(get("/admin/pages/nope/edit").session(session)).andExpect(status().isNotFound());
    }

    @Test
    @Order(2)
    void siteFilesAreServedForTheEditorFrame() throws Exception {
        MockHttpSession session = admin();
        // 편집 모드: 원본 글 그대로 + 편집기(원본 글 · 줄바꿈 정보 포함)
        String edit = body(mvc.perform(get("/admin/pages/site/about/index.html").param("__bo", "edit").session(session))
                .andExpect(status().isOk()));
        assertThat(edit).contains("<p>교육 &middot; 활동</p>")
                .contains("/css/page/canvas.css").contains("/js/page/canvas.js")
                .contains("window.__BO_PAGE__=").contains("\"eol\":\"\\r\\n\"").contains("\"doctype\":\"\\u003c!doctype html>\"")
                .contains("\"source\":\"\\u003c!doctype html>\\r\\n");
        assertThat(edit.indexOf("canvas.css")).isLessThan(edit.indexOf("</head>"));
        assertThat(edit.lastIndexOf("canvas.js")).isLessThan(edit.lastIndexOf("</body>"));

        // 미리보기·반영된 페이지: 원본 그대로, 상대 경로 CSS·그림도 같은 주소 아래에서
        assertThat(body(mvc.perform(get("/admin/pages/site/about/index.html").param("__bo", "preview").session(session)))).isEqualTo(ABOUT);
        assertThat(body(mvc.perform(get("/admin/pages/site/about/index.html").session(session)).andExpect(status().isOk()))).isEqualTo(ABOUT);
        mvc.perform(get("/admin/pages/site/about/").session(session)).andExpect(status().isOk()).andExpect(content().string(ABOUT));
        mvc.perform(get("/admin/pages/site/common/css/site.css").session(session)).andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("text/css"));
        mvc.perform(get("/admin/pages/site/about/assets/photo.png").session(session)).andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG));

        // 숨김 파일(.git 등)·사이트 폴더 밖·없는 파일은 열지 않는다
        mvc.perform(get("/admin/pages/site/.git/config").session(session)).andExpect(status().isNotFound());
        mvc.perform(get("/admin/pages/site/%2e%2e/secret.txt").session(session)).andExpect(status().is4xxClientError());
        mvc.perform(get("/admin/pages/site/about/none.css").session(session)).andExpect(status().isNotFound());

        // 로그인하지 않으면 편집 화면·사이트 파일은 로그인 화면으로
        mvc.perform(get("/admin/pages/site/about/index.html")).andExpect(status().is3xxRedirection());
    }

    @Test
    @Order(3)
    void draftPublishBackupFlowKeepsTheExactText() throws Exception {
        MockHttpSession session = admin();
        mvc.perform(get("/admin/pages/api/state").param("page", "about").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.hasDraft").value(false)).andExpect(jsonPath("$.conflict").value(false));
        mvc.perform(get("/admin/pages/api/pages").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(8))   // 2026-10-14: 이야기 하위 페이지 4개(후기 · 인터뷰 · 프로젝트 · 기수별 이모저모) 더함
                .andExpect(jsonPath("$[2].id").value("stories-reviews"))
                .andExpect(jsonPath("$[0].id").value("about")).andExpect(jsonPath("$[0].ready").value(true))
                .andExpect(jsonPath("$[1].ready").value(false));

        // 임시저장: 원본과 같은 글이면 임시저장본이 생기지 않는다
        mvc.perform(put("/admin/pages/api/draft").param("page", "about").session(session).with(csrf())
                        .contentType("text/html; charset=utf-8").content(ABOUT.getBytes(UTF_8)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.hasDraft").value(false));

        String edited = ABOUT.replace("<h1>인사교 알아보기</h1>", "<h1>인사교 알아보기 (수정)</h1>");
        mvc.perform(put("/admin/pages/api/draft").param("page", "about").session(session).with(csrf())
                        .contentType("text/html; charset=utf-8").content(edited.getBytes(UTF_8)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.hasDraft").value(true)).andExpect(jsonPath("$.draftSavedAt").isNotEmpty());
        // 편집 화면은 임시저장본을, 반영된 페이지는 원본을 보여 준다
        assertThat(body(mvc.perform(get("/admin/pages/site/about/index.html").param("__bo", "preview").session(session)))).isEqualTo(edited);
        assertThat(body(mvc.perform(get("/admin/pages/site/about/index.html").session(session)))).isEqualTo(ABOUT);
        assertThat(Files.readString(SITE.resolve("about/index.html"), UTF_8)).isEqualTo(ABOUT);

        // 페이지가 아닌 글은 거부
        mvc.perform(put("/admin/pages/api/draft").param("page", "about").session(session).with(csrf())
                        .contentType("text/html; charset=utf-8").content("<p>조각</p>".getBytes(UTF_8)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("페이지 형식이 올바르지 않아요."));

        // 반영: 받은 글 그대로(CRLF·&middot; 포함) 사이트 파일에 쓰고, 이전 파일은 버전 기록으로
        mvc.perform(post("/admin/pages/api/publish").param("page", "about").session(session).with(csrf())
                        .contentType("text/html; charset=utf-8").content(edited.getBytes(UTF_8)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.hasDraft").value(false)).andExpect(jsonPath("$.backup").isNotEmpty());
        assertThat(Files.readString(SITE.resolve("about/index.html"), UTF_8)).isEqualTo(edited);
        String backups = body(mvc.perform(get("/admin/pages/api/backups").param("page", "about").session(session)).andExpect(status().isOk()));
        String name = backups.replaceAll("(?s).*?\"name\":\"(about-[^\"]+\\.html)\".*", "$1");
        assertThat(name).startsWith("about-").endsWith(".html");
        assertThat(body(mvc.perform(get("/admin/pages/api/backups/" + name).param("page", "about").session(session)).andExpect(status().isOk()))).isEqualTo(ABOUT);
        mvc.perform(get("/admin/pages/api/backups/..%2Fsecret.txt").param("page", "about").session(session)).andExpect(status().is4xxClientError());
        assertThat(body(mvc.perform(get("/admin/pages/api/published").param("page", "about").session(session)))).isEqualTo(edited);

        // 임시저장 뒤 사이트 파일이 다른 곳에서 바뀌면 알린다
        mvc.perform(put("/admin/pages/api/draft").param("page", "about").session(session).with(csrf())
                        .contentType("text/html; charset=utf-8").content(ABOUT.getBytes(UTF_8)))
                .andExpect(jsonPath("$.hasDraft").value(true));
        Files.writeString(SITE.resolve("about/index.html"), edited.replace("(수정)", "(다른 곳에서 수정)"), UTF_8);
        mvc.perform(get("/admin/pages/api/state").param("page", "about").session(session)).andExpect(jsonPath("$.conflict").value(true));
        mvc.perform(delete("/admin/pages/api/draft").param("page", "about").session(session).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.hasDraft").value(false)).andExpect(jsonPath("$.conflict").value(false));

        // 없는 페이지 · CSRF 없는 저장
        mvc.perform(get("/admin/pages/api/state").param("page", "nope").session(session)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("알 수 없는 페이지예요: nope"));
        mvc.perform(put("/admin/pages/api/draft").param("page", "about").session(session)
                        .contentType("text/html; charset=utf-8").content(ABOUT.getBytes(UTF_8)))
                .andExpect(status().isForbidden());
        // 로그인이 끝난 저장 요청은 로그인 화면 대신 401
        mvc.perform(get("/admin/pages/api/state").param("page", "about")).andExpect(status().isUnauthorized());
    }

    @Test
    @Order(4)
    void imagesAreUploadedNextToThePageAndListed() throws Exception {
        MockHttpSession session = admin();
        String path = body(mvc.perform(post("/admin/pages/api/upload").param("page", "about").param("name", "새 사진.PNG")
                        .session(session).with(csrf()).contentType(MediaType.IMAGE_PNG).content(PNG))
                .andExpect(status().isOk())).replaceAll(".*\"path\":\"([^\"]+)\".*", "$1");
        assertThat(path).startsWith("assets/uploads/").endsWith(".png");
        assertThat(Files.exists(SITE.resolve("about").resolve(path))).isTrue();

        // 그림이 아닌 파일 · 내용이 다른 파일 · 위험한 SVG 는 거부
        mvc.perform(post("/admin/pages/api/upload").param("page", "about").param("name", "page.html").session(session).with(csrf())
                .content("<html>".getBytes(UTF_8))).andExpect(status().isBadRequest());
        mvc.perform(post("/admin/pages/api/upload").param("page", "about").param("name", "fake.png").session(session).with(csrf())
                .content("<html>".getBytes(UTF_8))).andExpect(status().isBadRequest());
        mvc.perform(post("/admin/pages/api/upload").param("page", "about").param("name", "icon.svg").session(session).with(csrf())
                .content("<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"alert(1)\"></svg>".getBytes(UTF_8))).andExpect(status().isBadRequest());
        mvc.perform(post("/admin/pages/api/upload").param("page", "about").param("name", "icon.svg").session(session).with(csrf())
                .content("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M4 4h16\"/></svg>".getBytes(UTF_8)))
                .andExpect(status().isOk());

        // 그림 목록: 방금 올린 것이 맨 앞, 경로는 편집 중인 페이지 기준
        mvc.perform(get("/admin/pages/api/assets").param("page", "about").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].upload").value(true))
                .andExpect(jsonPath("$[?(@.path == 'assets/photo.png')]").exists());
    }

    @Test
    @Order(5)
    void supportRoleCannotManageCategoryPages() throws Exception {
        MockHttpSession session = admin();
        mvc.perform(post("/admin/users").session(session).with(csrf())
                        .param("loginId", "support-pages@aica-gj.kr").param("name", "서포터").param("role", "SUPPORT")
                        .param("active", "true").param("password", "support-pass-1"))
                .andExpect(status().is3xxRedirection());
        MockHttpSession support = login("support-pages@aica-gj.kr", "support-pass-1");
        mvc.perform(get("/admin/pages/about/edit").session(support)).andExpect(status().isForbidden());
        mvc.perform(get("/admin/pages/api/state").param("page", "about").session(support)).andExpect(status().isForbidden());
        String posts = body(mvc.perform(get("/admin/posts").session(support)).andExpect(status().isOk()));
        assertThat(posts).doesNotContain("카테고리 페이지 관리");
    }
}
