package egovframework.backoffice.post.story;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.authenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/**
 * 선배들의 이야기 게시물: 사이트에 있던 글 가져오기 → 고정 양식으로 쓰고 미리보기 → 발행하면 사이트 데이터에 바로 →
 * 미게시 · 휴지통이면 내려가고 복원하면 다시 → 사진은 사이트로 복사, 위험한 값은 버림. 임시 사이트 폴더로 검증한다.
 */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:backoffice-story-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "backoffice.upload-dir=${java.io.tmpdir}/aica-story-test/uploads",
        "backoffice.pages.site-root=${java.io.tmpdir}/aica-story-test/site",
        "backoffice.pages.data-dir=${java.io.tmpdir}/aica-story-test/data",
        "backoffice.initial-admin.password=test-pass-1234"
})
@AutoConfigureMockMvc
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class StoryPostWebTest {

    private static final Path ROOT = Paths.get(System.getProperty("java.io.tmpdir"), "aica-story-test");
    private static final Path SITE = ROOT.resolve("site");
    private static final Path DATA = SITE.resolve("stories/js/stories-data.js");
    /** 처음 사이트 데이터(정적 페이지에서 옮긴 글 — 관리자 글 번호 없음) */
    private static final String STATIC_DATA = "/* 처음 */\nwindow.STORIES_DATA = {\"version\":1,\"source\":\"static-page\","
            + "\"reviews\":[{\"anchor\":\"r-life-0\",\"cat\":\"life\",\"title\":\"첫 후기\",\"summary\":\"첫 요약.\",\"body\":[\"본문\"],\"cohort\":7,\"author\":\"김민서\",\"track\":\"데이터 분석\",\"tags\":[4]},"
            + "{\"anchor\":\"r-class-0\",\"cat\":\"class\",\"title\":\"둘째 후기\",\"summary\":\"둘째 요약.\",\"body\":[\"본문\"],\"cohort\":6,\"author\":\"이서연\",\"track\":\"AI 모델링\",\"tags\":[]}],"
            + "\"interviews\":[{\"anchor\":\"iv-7\",\"title\":\"영상 인터뷰\",\"summary\":\"요약\",\"cohort\":6,\"author\":\"윤태경\",\"track\":\"인프라\",\"art\":\"<svg viewBox=\\\"0 0 4 4\\\"><rect width=\\\"4\\\" height=\\\"4\\\"/></svg>\",\"video\":{\"yt\":\"h1KXqTuGzkA\",\"dur\":\"8:05\"}}],"
            + "\"projects\":[{\"anchor\":\"pj-1\",\"title\":\"손끝\",\"tags\":[\"#접근성\"],\"summary\":\"요약\",\"team\":\"AI 모델링 2반 · 5명\",\"type\":\"실증\",\"term\":\"도약과정 720H\"}],"
            + "\"cohorts\":[{\"cohort\":7,\"tags\":[0],\"title\":\"입교식\",\"summary\":\"요약\",\"date\":\"2026. 05. 29\",\"img\":{\"src\":\"assets/x.jpg\",\"alt\":\"\",\"w\":880,\"h\":550}},"
            + "{\"cohort\":6,\"tags\":[8],\"title\":\"수료식\",\"summary\":\"요약\",\"date\":\"2025. 12. 20\"}]};\n";

    static {
        try {
            if (Files.exists(ROOT)) {
                try (Stream<Path> walk = Files.walk(ROOT)) {
                    walk.sorted(Comparator.reverseOrder()).forEach(path -> path.toFile().delete());
                }
            }
            Files.createDirectories(DATA.getParent());
            Files.writeString(SITE.resolve("stories/index.html"),
                    "<!doctype html>\n<html><head><script src=\"js/stories-data.js\" defer></script></head>\n<body class=\"x\">\n<main class=\"stories-page\"></main>\n</body></html>\n", UTF_8);
            Files.writeString(DATA, STATIC_DATA, UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;

    private MockHttpSession login() throws Exception {
        return (MockHttpSession) mvc.perform(formLogin("/login").user("loginId", "admin").password("password", "test-pass-1234"))
                .andExpect(authenticated()).andReturn().getRequest().getSession(false);
    }

    private JsonNode site() throws IOException {
        String js = Files.readString(DATA, UTF_8);
        return json.readTree(js.substring(js.indexOf('{'), js.lastIndexOf('}') + 1));
    }

    private String categoryId(String slug) {
        return String.valueOf(jdbc.queryForObject("SELECT id FROM categories WHERE slug = ?", Long.class, slug));
    }

    private long save(MockHttpSession session, String id, String slug, String title, String status, String story) throws Exception {
        String location = mvc.perform(post(id == null ? "/admin/posts" : "/admin/posts/" + id).session(session).with(csrf())
                        .param("title", title).param("categoryId", categoryId(slug)).param("status", status)
                        .param("thumbnailMode", "AUTO").param("blocksJson", "[]").param("storyJson", story))
                .andExpect(status().is3xxRedirection()).andReturn().getResponse().getRedirectedUrl();
        return Long.parseLong(location.replaceAll(".*/admin/posts/(\\d+)/edit.*", "$1"));
    }

    @Test
    @Order(1)
    void siteStoriesAreImportedOnStartupKeepingOrderAndLooks() throws Exception {
        JsonNode data = site();
        assertThat(data.get("source").asText()).isEqualTo("backoffice");
        assertThat(data.get("reviews")).hasSize(2);
        assertThat(data.get("reviews").get(0).get("anchor").asText()).isEqualTo("r-life-0");
        assertThat(data.get("reviews").get(0).get("id").isNumber()).isTrue();
        assertThat(data.get("reviews").get(1).get("title").asText()).isEqualTo("둘째 후기");
        assertThat(data.get("interviews").get(0).get("art").asText()).startsWith("<svg");
        assertThat(data.get("interviews").get(0).get("video").get("yt").asText()).isEqualTo("h1KXqTuGzkA");
        assertThat(data.get("cohorts").get(0).get("img").get("src").asText()).isEqualTo("assets/x.jpg");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM posts WHERE story_json IS NOT NULL AND status = 'PUBLISHED'", Long.class)).isEqualTo(6L);
        // 후기 분야 · 기수 기록 기수로 세부 카테고리가 정해진다
        assertThat(jdbc.queryForObject("SELECT sc.slug FROM posts p JOIN categories sc ON sc.id = p.sub_category_id WHERE p.title = '둘째 후기'", String.class))
                .isEqualTo("review-class");
        assertThat(jdbc.queryForObject("SELECT sc.slug FROM posts p JOIN categories sc ON sc.id = p.sub_category_id WHERE p.title = '수료식'", String.class))
                .isEqualTo("cohort-6");
    }

    @Test
    @Order(2)
    void writePreviewPublishUnpublishTrashRestore() throws Exception {
        MockHttpSession session = login();
        mvc.perform(get("/admin/posts/new").session(session)).andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().string(org.hamcrest.Matchers.containsString("id=\"storyForm\"")));
        String story = "{\"cat\":\"career\",\"cohort\":7,\"author\":\"홍길동\",\"track\":\"AI 모델링\",\"summary\":\"새 요약입니다.\","
                + "\"body\":[\"첫 문단\",\"둘째 문단\"],\"tags\":[6,6,99],\"anchor\":\"bad anchor!\"}";

        // 발행하려면 본문이 있어야 한다(저장 안 됨)
        long before = jdbc.queryForObject("SELECT COUNT(*) FROM posts", Long.class);
        mvc.perform(post("/admin/posts").session(session).with(csrf()).param("title", "새 후기").param("categoryId", categoryId("review"))
                        .param("status", "PUBLISHED").param("thumbnailMode", "AUTO").param("blocksJson", "[]")
                        .param("storyJson", "{\"cat\":\"career\",\"cohort\":7,\"author\":\"홍길동\",\"track\":\"AI\",\"summary\":\"요약\"}"))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().string(org.hamcrest.Matchers.containsString("본문 문단을 하나 이상")));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM posts", Long.class)).isEqualTo(before);

        // 저장 전 미리보기: 사이트 화면 그대로, 데이터 파일만 이 글을 넣은 내용(사이트 파일은 그대로)
        String sitePrev = Files.readString(DATA, UTF_8);
        String to = mvc.perform(post("/admin/posts/preview").session(session).with(csrf()).param("title", "새 후기")
                        .param("categoryId", categoryId("review")).param("status", "PUBLISHED").param("thumbnailMode", "AUTO")
                        .param("blocksJson", "[]").param("storyJson", "{\"cat\":\"career\",\"summary\":\"미리 보는 요약\"}"))
                .andExpect(status().is3xxRedirection()).andReturn().getResponse().getRedirectedUrl();
        assertThat(to).matches("/admin/posts/story-preview/[0-9a-f]+/stories/index\\.html#r-pnew");
        String dir = to.substring(0, to.indexOf("stories/index.html"));
        String page = mvc.perform(get(dir + "stories/index.html").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(UTF_8);
        assertThat(page).contains("data-story-preview").contains("<body class=\"x\"><div data-story-preview");
        String prevData = mvc.perform(get(dir + "stories/js/stories-data.js").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(UTF_8);
        assertThat(prevData).contains("미리 보는 요약").contains("r-pnew").contains("첫 후기");
        assertThat(Files.readString(DATA, UTF_8)).isEqualTo(sitePrev);
        mvc.perform(get("/admin/posts/story-preview/nope/stories/index.html").session(session)).andExpect(status().isNotFound());
        mvc.perform(get(dir + "../../secret.txt").session(session)).andExpect(status().is4xxClientError());

        // 발행 → 사이트 맨 앞(가장 최근 글)
        long id = save(session, null, "review", "새 후기", "PUBLISHED", story);
        JsonNode first = site().get("reviews").get(0);
        assertThat(first.get("id").asLong()).isEqualTo(id);
        assertThat(first.get("anchor").asText()).isEqualTo("r-p" + id);
        assertThat(first.get("title").asText()).isEqualTo("새 후기");
        assertThat(first.get("tags").toString()).isEqualTo("[6]");
        assertThat(first.get("body")).hasSize(2);
        assertThat(jdbc.queryForObject("SELECT sc.slug FROM posts p JOIN categories sc ON sc.id = p.sub_category_id WHERE p.id = " + id, String.class))
                .isEqualTo("review-career");
        assertThat(jdbc.queryForObject("SELECT summary FROM posts WHERE id = " + id, String.class)).isEqualTo("새 요약입니다.");

        // 저장된 글 미리보기도 사이트 화면으로
        String saved = mvc.perform(get("/admin/posts/" + id + "/preview").session(session)).andExpect(status().is3xxRedirection())
                .andReturn().getResponse().getRedirectedUrl();
        assertThat(saved).endsWith("#r-p" + id);

        // 미게시 → 사이트에서 내려감, 다시 게시 → 원래 자리
        mvc.perform(post("/admin/posts/" + id + "/status").session(session).with(csrf()).param("status", "HIDDEN")).andExpect(status().is3xxRedirection());
        assertThat(site().get("reviews")).hasSize(2);
        mvc.perform(post("/admin/posts/" + id + "/status").session(session).with(csrf()).param("status", "PUBLISHED")).andExpect(status().is3xxRedirection());
        assertThat(site().get("reviews").get(0).get("id").asLong()).isEqualTo(id);

        // 휴지통 → 내려감, 복원 → 게시중으로 돌아와 다시 사이트에
        mvc.perform(post("/admin/posts/" + id + "/delete").session(session).with(csrf())).andExpect(status().is3xxRedirection());
        assertThat(site().get("reviews")).hasSize(2);
        mvc.perform(post("/admin/posts/" + id + "/restore").session(session).with(csrf())).andExpect(status().is3xxRedirection());
        assertThat(site().get("reviews").get(0).get("id").asLong()).isEqualTo(id);

        // 고치면 바로 반영
        save(session, String.valueOf(id), "review", "고친 후기", "PUBLISHED", story);
        assertThat(site().get("reviews").get(0).get("title").asText()).isEqualTo("고친 후기");

        // 완전 삭제
        mvc.perform(post("/admin/posts/" + id + "/delete").session(session).with(csrf())).andExpect(status().is3xxRedirection());
        mvc.perform(post("/admin/posts/" + id + "/purge").session(session).with(csrf())).andExpect(status().is3xxRedirection());
        assertThat(site().get("reviews")).hasSize(2);
    }

    @Test
    @Order(4)
    void sidebarOpensEachStoryKindAndTheTopBarMenusAreGone() throws Exception {
        MockHttpSession session = login();
        String page = mvc.perform(get("/admin/posts").param("kind", "interview").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(UTF_8);
        // 왼쪽 메뉴: 선배들의 이야기가 펼쳐지고 선배 인터뷰가 선택, 목록은 인터뷰 카테고리로 걸러짐
        assertThat(page).containsPattern("<a[^>]*class=\"on\"[^>]*>선배 인터뷰</a>")
                .doesNotContainPattern("<a[^>]*class=\"on\"[^>]*>선배들의 이야기 게시물 관리</a>")
                .containsPattern("<option value=\"" + categoryId("interview") + "\" selected=\"selected\">")
                .contains("영상 인터뷰");
        // 상단 메뉴(게시물 · 미디어 · FAQ · 통계) · 임시 비밀번호 안내 · 운영진 공지 메뉴는 없음
        assertThat(page).doesNotContain("gnb-menu").doesNotContain("임시 비밀번호를 사용 중입니다").doesNotContain(">운영진 공지<");
    }

    @Test
    @Order(3)
    void photosAreCopiedToTheSiteAndUnsafeValuesAreDropped() throws Exception {
        MockHttpSession session = login();
        byte[] png = java.util.Base64.getDecoder().decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");
        String up = mvc.perform(MockMvcRequestBuilders.multipart("/admin/images").file(new MockMultipartFile("file", "photo.png", "image/png", png))
                        .session(session).with(csrf()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8);
        String url = json.readTree(up).get("url").asText();
        String story = "{\"cohort\":8,\"date\":\"2027. 03. 02\",\"summary\":\"8기 입교\",\"tags\":[0],"
                + "\"img\":{\"src\":\"" + url + "\",\"alt\":\"입교식\",\"w\":1,\"h\":1},"
                + "\"video\":{\"url\":\"https://youtu.be/asfChHljIC0?t=3\",\"dur\":\"1:02\"},"
                + "\"art\":\"<svg onload=\\\"alert(1)\\\"></svg>\",\"body\":\"첫 문단\\n\\n둘째 문단\"}";
        long id = save(session, null, "cohort", "8기 입교식", "PUBLISHED", story);
        JsonNode first = site().get("cohorts").get(0);   // 날짜가 가장 최근
        assertThat(first.get("id").asLong()).isEqualTo(id);
        String src = first.get("img").get("src").asText();
        assertThat(src).startsWith("assets/uploads/post-").endsWith(".png");
        assertThat(Files.exists(SITE.resolve("stories").resolve(src))).isTrue();
        assertThat(first.get("video").get("url").asText()).isEqualTo("https://www.youtube.com/watch?v=asfChHljIC0");
        assertThat(first.has("art")).isFalse();
        assertThat(first.get("body")).hasSize(2);
        assertThat(jdbc.queryForObject("SELECT thumbnail_url FROM posts WHERE id = " + id, String.class)).isEqualTo(url);

        // 프로젝트 자료 링크는 http(s)만
        long pj = save(session, null, "project", "새 프로젝트", "PUBLISHED", "{\"summary\":\"s\",\"team\":\"t\",\"type\":\"실증\",\"term\":\"720H\","
                + "\"tags\":\"컴퓨터비전 #접근성\",\"links\":[{\"label\":\"x\",\"url\":\"javascript:alert(1)\"},{\"label\":\"발표\",\"url\":\"https://example.com/a\"}]}");
        JsonNode project = site().get("projects").get(0);
        assertThat(project.get("id").asLong()).isEqualTo(pj);
        assertThat(project.get("links")).hasSize(1);
        assertThat(project.get("tags").toString()).isEqualTo("[\"#컴퓨터비전\",\"#접근성\"]");

        // 휴지통으로 옮기면 복사한 사진도 사이트에서 정리
        mvc.perform(post("/admin/posts/" + id + "/delete").session(session).with(csrf())).andExpect(status().is3xxRedirection());
        assertThat(Files.exists(SITE.resolve("stories").resolve(src))).isFalse();
    }
}
