package egovframework.backoffice.stats;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.authenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import egovframework.backoffice.BackofficeApplication;
import egovframework.testsupport.CmsMockMvcConfig;
import java.util.Map;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * 방문 통계(V22): 사이트가 보낸 방문 · 글 조회 기록이 visit_logs · post_view_logs 에 쌓이고 관리자 홈 · 방문 통계 화면에서 세어진다.
 * 게시중인 글만 조회를 받고, 글을 완전히 지우면 조회 기록도 지워지며, 글 종류를 바꾸면 조회 기록이 새 종류 + 번호를 따라간다.
 */
@TestPropertySource(properties = {
        "datasource.url=jdbc:h2:mem:backoffice-stats-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "backoffice.pages.site-root=${java.io.tmpdir}/aica-stats-test/site",
        "backoffice.pages.data-dir=${java.io.tmpdir}/aica-stats-test/data",
        "backoffice.upload-dir=${java.io.tmpdir}/aica-stats-test/uploads",
        "backoffice.initial-admin.password=test-pass-1234"
})
@SpringJUnitWebConfig({BackofficeApplication.class, CmsMockMvcConfig.class})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class VisitStatsWebTest {

    private static final Map<String, String> CATEGORY = Map.of("review", "1", "interview", "2", "project", "3");
    private static final String REVIEW_STORY = "{\"cat\":\"life\",\"cohort\":6,\"author\":\"김민서\",\"summary\":\"요약.\",\"body\":[\"본문\"],\"tags\":[]}";
    private static final String INTERVIEW_STORY = "{\"cohort\":8,\"author\":\"정ㅇㅇ\",\"track\":\"AI 서비스\",\"summary\":\"8기 인터뷰\",\"qa\":[{\"q\":\"질문\",\"a\":\"답\"}]}";

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    private MockHttpSession login() throws Exception {
        return (MockHttpSession) mvc.perform(formLogin("/login").user("loginId", "admin").password("password", "test-pass-1234"))
                .andExpect(authenticated()).andReturn().getRequest().getSession(false);
    }

    /** 글 쓰기(id 가 없으면 새 글) 또는 고치기 — urlKind 는 지금 글 주소의 종류, kind 는 저장할 종류 → 저장된 글 번호 */
    private long save(MockHttpSession session, String urlKind, Long id, String kind, String title, String status, String story) throws Exception {
        String location = mvc.perform(post(id == null ? "/admin/posts" : "/admin/posts/" + urlKind + "/" + id).session(session).with(csrf())
                        .param("title", title).param("categoryId", CATEGORY.get(kind)).param("status", status)
                        .param("thumbnailMode", "AUTO").param("blocksJson", "[]").param("storyJson", story))
                .andExpect(status().is3xxRedirection()).andReturn().getResponse().getRedirectedUrl();
        assertThat(location).contains("/admin/posts/" + kind + "/");
        return Long.parseLong(location.replaceAll(".*/admin/posts/[a-z]+/(\\d+)/edit.*", "$1"));
    }

    private ResultActions track(String path, String json, String userAgent) throws Exception {
        var req = post("/api/public/track/" + path).contentType(MediaType.APPLICATION_JSON).content(json);
        if (userAgent != null) {
            req = req.header("User-Agent", userAgent);
        }
        return mvc.perform(req);
    }

    private long count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Long.class, args);
    }

    private String body(MockHttpSession session, String url) throws Exception {
        return mvc.perform(get(url).session(session)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8);
    }

    @Test
    @Order(1)
    void visitsAreRecordedWithoutLoginAndCountedOnDashboard() throws Exception {
        // 로그인 · 보안 토큰 없이(사이트 방문자) 보낸다. 같은 방문자는 하루 1명, 페이지뷰는 줄마다
        track("visit", "{\"visitorKey\":\"visitor-aaaa-0001\",\"path\":\"/home/index.html?utm=x#top\",\"device\":\"MOBILE\"}", null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true));
        track("visit", "{\"visitorKey\":\"visitor-aaaa-0001\",\"path\":\"/stories/reviews.html\",\"device\":\"PC\"}", null)
                .andExpect(status().isOk());
        track("visit", "{\"visitorKey\":\"visitor-bbbb-0002\",\"path\":\"/life/index.html\",\"device\":\"TV\"}", null)
                .andExpect(status().isOk());
        // 방문자 번호가 이상하면 받지 않고, 검색 로봇은 세지 않는다
        track("visit", "{\"visitorKey\":\"x\",\"path\":\"/home/index.html\"}", null).andExpect(status().isBadRequest());
        track("visit", "{\"visitorKey\":\"visitor-cccc-0003\",\"path\":\"/home/index.html\"}", "Mozilla/5.0 (compatible; Googlebot/2.1)")
                .andExpect(status().isOk());

        assertThat(count("SELECT COUNT(*) FROM visit_logs")).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT path FROM visit_logs WHERE device = 'MOBILE'", String.class)).isEqualTo("/home/index.html");
        assertThat(count("SELECT COUNT(*) FROM visit_logs WHERE device IS NULL")).isEqualTo(1);   // 모르는 기기 값은 비움
        assertThat(jdbc.queryForObject("SELECT visited_on FROM visit_logs WHERE path = '/life/index.html'", java.sql.Date.class).toLocalDate())
                .isEqualTo(StatsService.today());

        MockHttpSession session = login();
        String home = body(session, "/admin");
        assertThat(home).contains("오늘 방문수</div><div class=\"v\">2</div>")
                .contains("누적 방문수</div><div class=\"v\">2</div>")
                .contains("href=\"/admin/stats?days=30\"").contains("id=\"visitChart\"")
                .doesNotContain("표를 추가하면");
        String stats = body(session, "/admin/stats?days=7");
        assertThat(stats).contains("방문 통계").contains("7일 방문자").contains("7일 페이지뷰").contains("아직 조회된 글이 없습니다.");
    }

    @Test
    @Order(2)
    void onlyPublishedPostsGetViewsAndViewsFollowThePost() throws Exception {
        MockHttpSession session = login();
        long review = save(session, null, null, "review", "많이 본 후기", "PUBLISHED", REVIEW_STORY);
        long draft = save(session, null, null, "review", "임시 후기", "DRAFT", REVIEW_STORY);

        track("posts/review/" + review + "/view", "{\"visitorKey\":\"visitor-aaaa-0001\"}", null).andExpect(status().isOk());
        track("posts/review/" + review + "/view", "{\"visitorKey\":\"visitor-bbbb-0002\"}", null).andExpect(status().isOk());
        // 임시저장 · 없는 글 · 없는 종류는 세지 않는다
        track("posts/review/" + draft + "/view", "{\"visitorKey\":\"visitor-aaaa-0001\"}", null).andExpect(status().isNotFound());
        track("posts/interview/" + review + "/view", "{\"visitorKey\":\"visitor-aaaa-0001\"}", null).andExpect(status().isNotFound());
        track("posts/notice/" + review + "/view", "{\"visitorKey\":\"visitor-aaaa-0001\"}", null).andExpect(status().isNotFound());
        track("posts/review/" + review + "/view", "{}", null).andExpect(status().isBadRequest());
        assertThat(count("SELECT COUNT(*) FROM post_view_logs WHERE post_type = 'review' AND post_id = ?", review)).isEqualTo(2);

        // 관리자 홈 인기글(7일) · 7일 게시물 조회, 방문 통계의 많이 본 글
        String home = body(session, "/admin");
        assertThat(home).contains("많이 본 후기").contains("/admin/posts/review/" + review + "/preview")
                .contains("7일 게시물 조회 <b>2</b>회");
        assertThat(body(session, "/admin/stats")).contains("많이 본 후기").contains("후기").contains("게시중");

        // 글 종류를 바꾸면(인터뷰 표로 옮겨 새 번호) 조회 기록도 따라간다
        long moved = save(session, "review", review, "interview", "많이 본 후기", "PUBLISHED", INTERVIEW_STORY);
        assertThat(count("SELECT COUNT(*) FROM post_view_logs WHERE post_type = 'review' AND post_id = ?", review)).isZero();
        assertThat(count("SELECT COUNT(*) FROM post_view_logs WHERE post_type = 'interview' AND post_id = ?", moved)).isEqualTo(2);
        assertThat(body(session, "/admin")).contains("/admin/posts/interview/" + moved + "/preview");

        // 휴지통에 있는 글은 인기글에서 빠지고, 완전히 지우면 조회 기록도 지워진다
        mvc.perform(post("/admin/posts/interview/" + moved + "/delete").session(session).with(csrf())).andExpect(status().is3xxRedirection());
        assertThat(body(session, "/admin")).doesNotContain("많이 본 후기");
        assertThat(count("SELECT COUNT(*) FROM post_view_logs")).isEqualTo(2);
        mvc.perform(post("/admin/posts/interview/" + moved + "/purge").session(session).with(csrf())).andExpect(status().is3xxRedirection());
        assertThat(count("SELECT COUNT(*) FROM post_view_logs")).isZero();
    }
}
