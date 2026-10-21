package egovframework.backoffice;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.authenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrlPattern;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import egovframework.testsupport.CmsMockMvcConfig;
import org.springframework.test.context.TestPropertySource;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/**
 * 로그인 → 관리자 홈 → 후기 · 인터뷰 · 프로젝트 글 쓰기 · 게시 · 휴지통 흐름을 실제 컨텍스트로 검증한다.
 * 2026-10-20부터 DB 표는 admin_users · reviews · interviews · projects 넷과 방문 통계 표 둘(visit_logs · post_view_logs, V22),
 * 자주 묻는 질문 표(faqs, V23), 미디어 표(media, V25), 기수별 이모저모 표(cohort_stories, V26), 카테고리 페이지 버전 기록 표(page_versions, V28), 인사교 라이프 표 4개(V29),
 * 그리고 Flyway 기록표다.
 */
@TestPropertySource(properties = {
        "datasource.url=jdbc:h2:mem:backoffice-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "backoffice.pages.site-root=${java.io.tmpdir}/aica-backofficewebtest/site",
        "backoffice.pages.data-dir=${java.io.tmpdir}/aica-backofficewebtest/data",
        "backoffice.upload-dir=${java.io.tmpdir}/aica-backofficewebtest/uploads",
        "backoffice.initial-admin.password=test-pass-1234"
})
@SpringJUnitWebConfig({BackofficeApplication.class, CmsMockMvcConfig.class})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class BackofficeWebTest {

    private static final String REVIEW = "1", INTERVIEW = "2", PROJECT = "3";

    @Autowired MockMvc mvc;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    private MockHttpSession login() throws Exception {
        MvcResult result = mvc.perform(formLogin("/login").user("loginId", "admin").password("password", "test-pass-1234"))
                .andExpect(authenticated())
                .andExpect(redirectedUrl("/admin"))
                .andReturn();
        return (MockHttpSession) result.getRequest().getSession(false);
    }

    /** 글 쓰기(등록) → 새 글 번호 */
    private String create(MockHttpSession session, String categoryId, String title, String status, String story) throws Exception {
        MvcResult created = mvc.perform(post("/admin/posts").session(session).with(csrf())
                        .param("title", title).param("categoryId", categoryId).param("status", status)
                        .param("thumbnailMode", "AUTO").param("blocksJson", "[]").param("storyJson", story))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrlPattern("/admin/posts/*/*/edit"))
                .andReturn();
        return created.getResponse().getRedirectedUrl().replaceAll("\\D", "");
    }

    private String body(MockHttpSession session, String url, String... params) throws Exception {
        var req = get(url).session(session);
        for (int i = 0; i + 1 < params.length; i += 2) {
            req = req.param(params[i], params[i + 1]);
        }
        return mvc.perform(req).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    private String one(String sql, Object... args) {
        return jdbc.queryForObject(sql, String.class, args);
    }

    @Test
    @Order(1)
    void loginPageIsPublicAndAdminPagesRequireLogin() throws Exception {
        mvc.perform(get("/login")).andExpect(status().isOk());
        mvc.perform(get("/admin/posts")).andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrlPattern("**/login"));
        mvc.perform(get("/api/public/stories")).andExpect(status().isOk());
        // 열어 둔 화면의 로그인 확인: 풀렸으면 로그인 화면 대신 401, 살아 있으면 새 보안 토큰
        mvc.perform(get("/admin/session")).andExpect(status().isUnauthorized());
    }

    @Test
    @Order(2)
    void initialSuperAdminCanLoginAndSeeDashboard() throws Exception {
        MockHttpSession session = login();
        assertThat(jdbc.queryForObject("SELECT last_login_at FROM admin_users WHERE login_id='admin'", java.sql.Timestamp.class)).isNotNull();
        // 관리자 홈: 원래 모양(방문수 · 30일 그래프 · 인기글 · 게시물 현황). 방문수 · 그래프 · 인기글은 방문 통계 표(V22)에서,
        // 게시물 현황은 후기 · 인터뷰 · 프로젝트 표에서 센다(자세한 검증은 stats/VisitStatsWebTest)
        assertThat(body(session, "/admin")).contains("누적 방문수").contains("id=\"visitChart\"").contains("게시물 현황")
                .contains("href=\"/admin/posts?kind=review\"").contains("href=\"/admin/posts?kind=interview\"")
                .contains("href=\"/admin/posts?kind=project\"").contains("href=\"/admin/stats?days=30\"");
        mvc.perform(get("/admin/users").session(session)).andExpect(status().isOk());
        mvc.perform(get("/admin/session").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.header").value("X-CSRF-TOKEN"))
                .andExpect(jsonPath("$.parameter").value("_csrf"));
    }

    @Test
    @Order(3)
    void onlyFourteenTablesRemainAndRemovedScreensAreGone() throws Exception {
        // 표 4개(관리자 · 후기 · 인터뷰 · 프로젝트)에 방문 통계 표 2개(V22) · 자주 묻는 질문 표(V23) · 미디어 표(V25) · 기수별 이모저모 표(V26) · 페이지 버전 기록 표(V28) · 인사교 라이프 표 4개(V29)
        List<String> tables = jdbc.queryForList(
                "SELECT LOWER(table_name) FROM information_schema.tables WHERE LOWER(table_schema) = 'public' ORDER BY 1", String.class);
        assertThat(tables).containsExactly("admin_users", "cohort_stories", "faqs", "flyway_schema_history", "interviews", "life_facility_photos",
                "life_facility_spaces", "life_foods", "life_spots", "media", "page_versions", "post_view_logs", "projects", "reviews", "visit_logs");
        // 기수별 이모저모: 더미 카드 기준 칸만 만들고 데이터는 아직 없다(V26). 요약 · 태그 칸은 뺐다(V27)
        assertThat(jdbc.queryForList("SELECT LOWER(column_name) FROM information_schema.columns WHERE LOWER(table_name) = 'cohort_stories'", String.class))
                .contains("cohort", "title", "body", "event_date", "photos", "video_url", "video_length",
                        "status", "status_before_trash", "author_id", "published_at", "deleted_at")
                .doesNotContain("summary", "tags");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cohort_stories", Integer.class)).isZero();
        // 후기 표에는 반 · 직군(track) · 흐르는 한마디(ticker) 칸이 없다(V17)
        assertThat(jdbc.queryForList("SELECT LOWER(column_name) FROM information_schema.columns WHERE LOWER(table_name) = 'reviews'", String.class))
                .contains("category", "cohort", "show_on_hub", "status_before_trash").doesNotContain("track", "ticker");
        MockHttpSession session = login();
        for (String url : List.of("/admin/templates", "/admin/notices", "/admin/categories",
                "/admin/images/recent")) {
            mvc.perform(get(url).session(session)).andExpect(status().isNotFound());
        }
        for (String url : List.of("/api/public/posts", "/api/public/categories", "/api/public/life.js")) {
            mvc.perform(get(url)).andExpect(status().isNotFound());
        }
        assertThat(body(session, "/admin/posts")).contains("미디어 관리").contains("방문 통계").doesNotContain("기수별 모아보기");
    }

    @Test
    @Order(4)
    void reviewIsSavedInReviewsTableByCategoryAndGoesThroughTrash() throws Exception {
        MockHttpSession session = login();
        String story = "{\"cat\":\"life\",\"cohort\":6,\"author\":\"김민서\",\"summary\":\"생활비를 아끼며 버틴 이야기.\","
                + "\"body\":[\"첫 문단\",\"둘째 문단\"],\"tags\":[0,4],\"hub\":true,\"track\":\"버리는 반\",\"ticker\":\"버리는 한마디\"}";
        String id = create(session, REVIEW, "테스트 후기", "DRAFT", story);

        // 표 칸에 나눠 담김: 분야는 한글, 본문은 빈 줄로 나눈 글, 태그는 #글자
        assertThat(one("SELECT category FROM reviews WHERE id = ?", Long.valueOf(id))).isEqualTo("생활");
        // 선배 이름은 성만 보이고 나머지는 *(2026-10-21): 김민서 → 김**
        assertThat(one("SELECT senior_name FROM reviews WHERE id = ?", Long.valueOf(id))).isEqualTo("김**");
        assertThat(one("SELECT body FROM reviews WHERE id = ?", Long.valueOf(id))).isEqualTo("첫 문단\n\n둘째 문단");
        assertThat(one("SELECT tags FROM reviews WHERE id = ?", Long.valueOf(id))).isEqualTo("#비전공자 #적응");
        assertThat(jdbc.queryForObject("SELECT show_on_hub FROM reviews WHERE id = ?", Boolean.class, Long.valueOf(id))).isTrue();
        assertThat(one("SELECT status FROM reviews WHERE id = ?", Long.valueOf(id))).isEqualTo("DRAFT");

        // 글 관리 목록: 후기 › 분야 표시 · 분야로 거르기 · 작성자로 찾기
        assertThat(body(session, "/admin/posts", "categoryId", REVIEW, "subCategoryId", "5")).contains("후기 › 생활").contains("테스트 후기");
        assertThat(body(session, "/admin/posts", "categoryId", REVIEW, "subCategoryId", "6")).doesNotContain("테스트 후기");
        assertThat(body(session, "/admin/posts", "kind", "interview")).doesNotContain("테스트 후기");
        String adminName = one("SELECT name FROM admin_users WHERE login_id = 'admin'");
        assertThat(body(session, "/admin/posts", "keyword", adminName)).contains("테스트 후기");
        assertThat(body(session, "/admin/posts", "keyword", "없는작성자")).doesNotContain("테스트 후기");
        assertThat(body(session, "/admin/posts", "authorId", "999")).doesNotContain("테스트 후기");

        // 고치는 화면: 표 칸에서 다시 만든 양식 값
        assertThat(body(session, "/admin/posts/review/" + id + "/edit")).contains("테스트 후기").contains("&quot;cat&quot;:&quot;life&quot;")
                .contains("둘째 문단");
        // 미리보기(사이트 폴더가 없을 때는 기본 화면)
        assertThat(body(session, "/admin/posts/review/" + id + "/preview")).contains("생활비를 아끼며 버틴 이야기.").contains("첫 문단");

        // 임시저장은 사이트에 안 보임 → 게시하면 보임(주소 #r-p번호)
        mvc.perform(get("/api/public/stories")).andExpect(jsonPath("$.reviews.length()").value(0));
        mvc.perform(post("/admin/posts/review/" + id + "/status").session(session).with(csrf()).param("status", "PUBLISHED"))
                .andExpect(status().is3xxRedirection());
        mvc.perform(get("/api/public/stories")).andExpect(jsonPath("$.reviews.length()").value(1))
                .andExpect(jsonPath("$.reviews[0].title").value("테스트 후기"))
                .andExpect(jsonPath("$.reviews[0].anchor").value("r-p" + id))
                .andExpect(jsonPath("$.reviews[0].cat").value("life"))
                .andExpect(jsonPath("$.reviews[0].body[1]").value("둘째 문단"))
                .andExpect(jsonPath("$.reviews[0].hub").value(true))
                .andExpect(jsonPath("$.reviews[0].track").doesNotExist())
                .andExpect(jsonPath("$.reviews[0].ticker").doesNotExist())
                .andExpect(jsonPath("$.cohorts.length()").value(0));   // 기수별 이모저모(cohort_stories)는 아직 글 없음
        mvc.perform(get("/api/public/stories.js")).andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("window.STORIES_DATA")));

        // 분야를 바꿔 고치면 표의 분야 칸도 바뀐다
        mvc.perform(post("/admin/posts/review/" + id).session(session).with(csrf())
                        .param("title", "수정된 후기").param("categoryId", REVIEW).param("status", "PUBLISHED").param("thumbnailMode", "AUTO")
                        .param("blocksJson", "[]").param("storyJson", story.replace("\"life\"", "\"class\"")))
                .andExpect(status().is3xxRedirection());
        assertThat(one("SELECT category FROM reviews WHERE id = ?", Long.valueOf(id))).isEqualTo("수업");
        assertThat(one("SELECT title FROM reviews WHERE id = ?", Long.valueOf(id))).isEqualTo("수정된 후기");
        assertThat(body(session, "/admin/posts", "categoryId", REVIEW, "subCategoryId", "6")).contains("수정된 후기");

        // 삭제됨은 휴지통 버튼으로만(상태 바꾸기 · 저장으로는 안 됨), 고르는 목록에도 없음
        mvc.perform(post("/admin/posts/review/" + id + "/status").session(session).with(csrf()).param("status", "DELETED"))
                .andExpect(status().isBadRequest());
        assertThat(one("SELECT status FROM reviews WHERE id = ?", Long.valueOf(id))).isEqualTo("PUBLISHED");
        assertThat(body(session, "/admin/posts")).doesNotContain(">삭제됨<");
        // 표의 상태 칸은 네 가지만 받는다
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update("UPDATE reviews SET status = 'GONE' WHERE id = ?", Long.valueOf(id)))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);

        // 휴지통: 삭제됨으로 바뀌고 이전 상태(게시중)를 기억, 사이트에서 내려감
        mvc.perform(post("/admin/posts/review/" + id + "/delete").session(session).with(csrf())).andExpect(status().is3xxRedirection());
        mvc.perform(get("/api/public/stories")).andExpect(jsonPath("$.reviews.length()").value(0));
        assertThat(body(session, "/admin/posts/trash")).contains("복원").contains("삭제됨").contains("삭제 전 게시중").contains("수정된 후기");
        assertThat(one("SELECT status FROM reviews WHERE id = ?", Long.valueOf(id))).isEqualTo("DELETED");
        assertThat(one("SELECT status_before_trash FROM reviews WHERE id = ?", Long.valueOf(id))).isEqualTo("PUBLISHED");
        assertThat(body(session, "/admin/posts")).doesNotContain("수정된 후기");

        // 복원 → 게시중으로 돌아와 사이트에 다시
        mvc.perform(post("/admin/posts/review/" + id + "/restore").session(session).with(csrf()))
                .andExpect(status().is3xxRedirection()).andExpect(header().string("Location", "/admin/posts"));
        mvc.perform(get("/api/public/stories")).andExpect(jsonPath("$.reviews.length()").value(1));
        // 미게시 → 휴지통 → 복원하면 미게시 그대로
        mvc.perform(post("/admin/posts/review/" + id + "/status").session(session).with(csrf()).param("status", "HIDDEN"));
        mvc.perform(post("/admin/posts/review/" + id + "/delete").session(session).with(csrf()));
        mvc.perform(post("/admin/posts/review/" + id + "/restore").session(session).with(csrf()));
        assertThat(one("SELECT status FROM reviews WHERE id = ?", Long.valueOf(id))).isEqualTo("HIDDEN");

        // 다시 휴지통 → 완전 삭제 → 표에서 사라짐
        mvc.perform(post("/admin/posts/review/" + id + "/delete").session(session).with(csrf())).andExpect(status().is3xxRedirection());
        mvc.perform(post("/admin/posts/review/" + id + "/purge").session(session).with(csrf()))
                .andExpect(status().is3xxRedirection()).andExpect(header().string("Location", "/admin/posts/trash"));
        mvc.perform(get("/admin/posts/review/" + id + "/edit").session(session)).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM reviews WHERE id = ?", Long.class, Long.valueOf(id))).isZero();
    }

    @Test
    @Order(5)
    void classificationColumnsAreRequiredEvenForDrafts() throws Exception {
        MockHttpSession session = login();
        // 후기 분야 · 인터뷰 기수는 표가 꼭 받아야 하는 칸이라 임시저장도 거부(글쓰기 화면에 안내)
        mvc.perform(post("/admin/posts").session(session).with(csrf())
                        .param("title", "분야 없는 후기").param("categoryId", REVIEW).param("status", "DRAFT").param("thumbnailMode", "AUTO")
                        .param("blocksJson", "[]").param("storyJson", "{\"author\":\"김\"}"))
                .andExpect(status().isOk()).andExpect(content().string(org.hamcrest.Matchers.containsString("후기 분야")));
        mvc.perform(post("/admin/posts").session(session).with(csrf())
                        .param("title", "기수 없는 인터뷰").param("categoryId", INTERVIEW).param("status", "DRAFT").param("thumbnailMode", "AUTO")
                        .param("blocksJson", "[]").param("storyJson", "{\"author\":\"김\"}"))
                .andExpect(status().isOk()).andExpect(content().string(org.hamcrest.Matchers.containsString("기수를 입력해 주세요")));
        // 글 종류 없이는 저장하지 않음
        mvc.perform(post("/admin/posts").session(session).with(csrf())
                        .param("title", "종류 없는 글").param("status", "DRAFT").param("thumbnailMode", "AUTO").param("blocksJson", "[]"))
                .andExpect(status().isOk()).andExpect(content().string(org.hamcrest.Matchers.containsString("글 종류")));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM reviews WHERE title = '분야 없는 후기'", Long.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM interviews WHERE title = '기수 없는 인터뷰'", Long.class)).isZero();

        // 기수가 있으면 인터뷰 표에 기수로 들어감
        String iv = create(session, INTERVIEW, "기수 있는 인터뷰", "DRAFT",
                "{\"cohort\":7,\"author\":\"박\",\"track\":\"데이터 분석반\",\"video\":{\"yt\":\"dQw4w9WgXcQ\",\"dur\":\"8:05\"},"
                        + "\"qa\":[{\"q\":\"왜?\",\"a\":\"좋아서\"}]}");
        assertThat(jdbc.queryForObject("SELECT cohort FROM interviews WHERE id = ?", Integer.class, Long.valueOf(iv))).isEqualTo(7);
        assertThat(one("SELECT video_url FROM interviews WHERE id = ?", Long.valueOf(iv))).isEqualTo("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
        assertThat(one("SELECT video_length FROM interviews WHERE id = ?", Long.valueOf(iv))).isEqualTo("8:05");
        assertThat(one("SELECT qa FROM interviews WHERE id = ?", Long.valueOf(iv))).contains("\"q\":\"왜?\"");
        assertThat(body(session, "/admin/posts/interview/" + iv + "/edit")).contains("dQw4w9WgXcQ").contains("좋아서");
        // 관리자 홈 게시물 현황: 인터뷰 수가 인터뷰 표(휴지통 제외)와 같다
        long interviews = jdbc.queryForObject("SELECT COUNT(*) FROM interviews WHERE deleted_at IS NULL", Long.class);
        assertThat(body(session, "/admin")).contains("href=\"/admin/posts?kind=interview\">인터뷰</a> <b>" + interviews + "</b>");
    }

    @Test
    @Order(6)
    void projectColumnsAreSplitAndJoinedAgainForTheSite() throws Exception {
        MockHttpSession session = login();
        String story = "{\"summary\":\"요약 문장. 둘째 문장.\",\"cohort\":6,\"className\":\"01반\",\"major\":\"자연어처리A\",\"teamName\":\"AI셈블\","
                + "\"teamSize\":5,\"tags\":[\"#Python\",\"React\"],\"sections\":[{\"h\":\"문제 정의\",\"p\":\"문제\"},{\"h\":\"주요 기능\",\"p\":\"• 하나 • 둘\"},"
                + "{\"h\":\"기술 설명\",\"p\":\"기술\"}],\"links\":[{\"label\":\"발표 자료\",\"url\":\"https://example.com/deck\"}]}";
        String id = create(session, PROJECT, "AI 프로젝트", "PUBLISHED", story);
        var row = jdbc.queryForMap("SELECT cohort, class_name, major, team_name, team_size, problem, features, tech, tags, links FROM projects WHERE id = ?",
                Long.valueOf(id));
        assertThat(row.get("cohort")).isEqualTo(6);
        assertThat(row.get("class_name")).isEqualTo("01반");
        assertThat(row.get("major")).isEqualTo("자연어처리A");
        assertThat(row.get("team_name")).isEqualTo("AI셈블");
        assertThat(row.get("team_size")).isEqualTo(5);
        assertThat(row.get("problem")).isEqualTo("문제");
        assertThat(row.get("features")).isEqualTo("• 하나 • 둘");
        assertThat(row.get("tech")).isEqualTo("기술");
        assertThat(row.get("tags")).isEqualTo("#Python #React");
        assertThat(String.valueOf(row.get("links"))).contains("https://example.com/deck");

        // 사이트에는 예전 모양 그대로(팀 · 전공 · 기수 · 반 세 줄)
        mvc.perform(get("/api/public/stories")).andExpect(jsonPath("$.projects[0].title").value("AI 프로젝트"))
                .andExpect(jsonPath("$.projects[0].anchor").value("pj-p" + id))
                .andExpect(jsonPath("$.projects[0].team").value("AI셈블 · 5명"))
                .andExpect(jsonPath("$.projects[0].type").value("자연어처리A"))
                .andExpect(jsonPath("$.projects[0].term").value("6기 · 01반"))
                .andExpect(jsonPath("$.projects[0].sections[1].h").value("주요 기능"))
                .andExpect(jsonPath("$.projects[0].teamName").doesNotExist());

        // 예전 모양(team · type · term)으로 들어온 값은 칸으로 나눠 담는다
        String old = create(session, PROJECT, "예전 모양 프로젝트", "DRAFT",
                "{\"summary\":\"s\",\"team\":\"리뷰찌개 · 6명\",\"type\":\"데이터분석\",\"term\":\"6기 · 10반\"}");
        var oldRow = jdbc.queryForMap("SELECT cohort, class_name, major, team_name, team_size FROM projects WHERE id = ?", Long.valueOf(old));
        assertThat(oldRow.get("team_name")).isEqualTo("리뷰찌개");
        assertThat(oldRow.get("team_size")).isEqualTo(6);
        assertThat(oldRow.get("cohort")).isEqualTo(6);
        assertThat(oldRow.get("class_name")).isEqualTo("10반");
        assertThat(oldRow.get("major")).isEqualTo("데이터분석");

        // 글 종류를 바꾸면 그 종류의 표로 옮겨 가고, 그 표의 새 번호를 받아 새 주소로 열린다
        String moved = mvc.perform(post("/admin/posts/project/" + old).session(session).with(csrf())
                        .param("title", "후기로 바꾼 글").param("categoryId", REVIEW).param("status", "DRAFT").param("thumbnailMode", "AUTO")
                        .param("blocksJson", "[]").param("storyJson", "{\"cat\":\"proj\",\"author\":\"이\"}"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrlPattern("/admin/posts/review/*/edit")).andReturn().getResponse().getRedirectedUrl().replaceAll("\\D", "");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM projects WHERE id = ?", Long.class, Long.valueOf(old))).isZero();
        assertThat(one("SELECT category FROM reviews WHERE id = ?", Long.valueOf(moved))).isEqualTo("프로젝트");

        // 글 번호는 표마다 1번부터: 인터뷰 1번과 프로젝트 1번이 따로 있고, 주소의 종류로 구분된다
        assertThat(jdbc.queryForObject("SELECT MIN(id) FROM projects", Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("SELECT MIN(id) FROM interviews", Long.class)).isEqualTo(1L);
        assertThat(body(session, "/admin/posts/project/1/edit")).contains("AI 프로젝트").doesNotContain("기수 있는 인터뷰");
        assertThat(body(session, "/admin/posts/interview/1/edit")).contains("기수 있는 인터뷰").doesNotContain("AI 프로젝트");
        mvc.perform(get("/admin/posts/1/edit").session(session)).andExpect(status().isNotFound());
        mvc.perform(get("/admin/posts/cohort/1/edit").session(session)).andExpect(status().isNotFound());
        long interviewsBefore = jdbc.queryForObject("SELECT COALESCE(MAX(id), 0) FROM interviews", Long.class);
        String next = create(session, INTERVIEW, "번호 확인", "DRAFT", "{\"cohort\":6}");
        assertThat(Long.parseLong(next)).isEqualTo(interviewsBefore + 1);
    }

    @Test
    @Order(7)
    void imageUploadKeepsOnlyTheFile() throws Exception {
        MockHttpSession session = login();
        var fake = new MockMultipartFile("file", "evil.png", "image/png", "not an image".getBytes());
        mvc.perform(MockMvcRequestBuilders.multipart("/admin/images").file(fake).session(session).with(csrf()))
                .andExpect(status().isBadRequest());

        byte[] png = java.util.Base64.getDecoder().decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");
        var real = new MockMultipartFile("file", "dot.png", "image/png", png);
        String url = com.jayway.jsonpath.JsonPath.read(mvc.perform(MockMvcRequestBuilders.multipart("/admin/images").file(real).session(session).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.url").value(org.hamcrest.Matchers.startsWith("/uploads/")))
                .andExpect(jsonPath("$.name").value("dot.png"))
                .andReturn().getResponse().getContentAsString(), "$.url");
        assertThat(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get(System.getProperty("java.io.tmpdir"), "aica-backofficewebtest/uploads",
                url.substring("/uploads/".length())))).isEqualTo(png);
    }

    @Test
    @Order(8)
    void superAdminManagesAccountsAndLastSuperAdminIsProtected() throws Exception {
        MockHttpSession session = login();
        mvc.perform(post("/admin/users").session(session).with(csrf())
                        .param("loginId", "Editor1@AICA-gj.kr").param("name", "편집자").param("role", "ADMIN")
                        .param("active", "true").param("password", "editor-pass-1"))
                .andExpect(status().is3xxRedirection());

        // 이메일 형식이 아니면 등록 거부, 저장은 소문자로 정규화
        assertThat(mvc.perform(post("/admin/users").session(session).with(csrf())
                        .param("loginId", "editor2").param("name", "x").param("role", "ADMIN").param("active", "true").param("password", "editor-pass-1"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("이메일 주소 형식");
        assertThat(one("SELECT login_id FROM admin_users WHERE name = '편집자'")).isEqualTo("editor1@aica-gj.kr");

        // 자기 자신(마지막 SUPER_ADMIN) 강등 시도 → 오류 메시지와 함께 폼 재표시
        String body = mvc.perform(post("/admin/users/1").session(session).with(csrf())
                        .param("loginId", "admin").param("name", "최초 관리자").param("role", "ADMIN").param("active", "true"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).contains("마지막 최상위 관리자");

        // 일반 관리자는 계정 관리 화면에 접근할 수 없다
        MvcResult editorLogin = mvc.perform(formLogin("/login").user("loginId", "editor1@aica-gj.kr").password("password", "editor-pass-1"))
                .andExpect(authenticated()).andReturn();
        MockHttpSession editor = (MockHttpSession) editorLogin.getRequest().getSession(false);
        mvc.perform(get("/admin/users").session(editor)).andExpect(status().isForbidden());
        mvc.perform(get("/admin/posts").session(editor)).andExpect(status().isOk());

        // 서포터즈는 본인 글 작성·수정. 상태 변경·휴지통은 관리자 이상.
        mvc.perform(post("/admin/users").session(session).with(csrf())
                        .param("loginId", "support1@aica-gj.kr").param("name", "서포터").param("role", "SUPPORT")
                        .param("active", "true").param("password", "support-pass-1"))
                .andExpect(status().is3xxRedirection());
        MockHttpSession support = (MockHttpSession) mvc.perform(
                        formLogin("/login").user("loginId", "support1@aica-gj.kr").password("password", "support-pass-1"))
                .andExpect(authenticated()).andReturn().getRequest().getSession(false);
        mvc.perform(get("/admin").session(support)).andExpect(status().isOk());
        String supportPostId = create(support, REVIEW, "서포터 글", "DRAFT", "{\"cat\":\"class\",\"author\":\"서포터\"}");
        mvc.perform(post("/admin/posts/review/" + supportPostId).session(support).with(csrf())
                        .param("title", "서포터 글 수정").param("categoryId", REVIEW).param("status", "DRAFT").param("thumbnailMode", "AUTO")
                        .param("blocksJson", "[]").param("storyJson", "{\"cat\":\"class\",\"author\":\"서포터\"}"))
                .andExpect(status().is3xxRedirection());
        mvc.perform(post("/admin/posts/review/" + supportPostId + "/delete").session(support).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(post("/admin/posts/review/" + supportPostId + "/status").session(support).with(csrf()).param("status", "PUBLISHED"))
                .andExpect(status().isForbidden());
        assertThat(body(support, "/admin/posts")).contains("서포터 글 수정").contains("임시저장");
    }
}
