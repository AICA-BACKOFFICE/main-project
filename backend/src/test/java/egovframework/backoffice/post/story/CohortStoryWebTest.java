package egovframework.backoffice.post.story;

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
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * 기수별 이모저모 게시물(2026-10-20, cohort_stories 표): 선배들의 이야기 게시물 관리 아래 메뉴에서 쓰고 · 게시 · 휴지통 · 임시저장을
 * 후기 · 인터뷰 · 프로젝트와 똑같이 한다. 사이트 데이터에는 cohorts 목록으로, 날짜는 카드 모양(2026. 08. 20), 영상은 유튜브 주소로 간다.
 */
@TestPropertySource(properties = {
        "datasource.url=jdbc:h2:mem:backoffice-cohort-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "backoffice.upload-dir=${java.io.tmpdir}/aica-cohort-test/uploads",
        "backoffice.pages.site-root=${java.io.tmpdir}/aica-cohort-test/site",
        "backoffice.pages.data-dir=${java.io.tmpdir}/aica-cohort-test/data",
        "backoffice.initial-admin.password=test-pass-1234"
})
@SpringJUnitWebConfig({BackofficeApplication.class, CmsMockMvcConfig.class})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class CohortStoryWebTest {

    private static final String COHORT_CATEGORY = "4";

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    private MockHttpSession login() throws Exception {
        return (MockHttpSession) mvc.perform(formLogin("/login").user("loginId", "admin").password("password", "test-pass-1234"))
                .andExpect(authenticated()).andReturn().getRequest().getSession(false);
    }

    private String page(MockHttpSession session, String url) throws Exception {
        return mvc.perform(get(url).session(session)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8);
    }

    private MvcResult write(MockHttpSession session, String url, String title, String status, String story) throws Exception {
        return mvc.perform(post(url).session(session).with(csrf())
                        .param("title", title).param("categoryId", COHORT_CATEGORY).param("status", status)
                        .param("thumbnailMode", "AUTO").param("blocksJson", "[]").param("storyJson", story))
                .andReturn();
    }

    @Test
    @Order(1)
    void cohortPostsAreManagedUnderStoriesAndGoToTheSite() throws Exception {
        MockHttpSession admin = login();

        // 왼쪽 메뉴: 선배들의 이야기 게시물 관리 › 프로젝트 아래에 기수별 이모저모
        String list = page(admin, "/admin/posts?kind=cohort");
        assertThat(list).contains("href=\"/admin/posts?kind=cohort\"").contains("기수별 이모저모")
                .contains("/admin/posts/new?kind=cohort");
        assertThat(list.indexOf("kind=project\"")).isLessThan(list.indexOf("kind=cohort\""));
        // 새 글은 기수별 이모저모 양식(카테고리 4번)으로
        assertThat(page(admin, "/admin/posts/new?kind=cohort")).contains("data-slug=\"cohort\"");

        // 기수는 표의 분류 칸이라 임시저장도 꼭, 게시하려면 날짜 · 사진(또는 영상)도
        assertThat(write(admin, "/admin/posts", "기수 없음", "DRAFT", "{\"body\":[\"글\"]}").getResponse().getContentAsString(UTF_8))
                .contains("기수를 입력해 주세요");
        assertThat(write(admin, "/admin/posts", "날짜 없음", "PUBLISHED", "{\"cohort\":7}").getResponse().getContentAsString(UTF_8))
                .contains("있었던 날");
        assertThat(write(admin, "/admin/posts", "그림 없음", "PUBLISHED", "{\"cohort\":7,\"date\":\"2026-08-20\"}").getResponse().getContentAsString(UTF_8))
                .contains("사진을 한 장 이상");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cohort_stories", Integer.class)).isZero();

        // 게시: 칸마다 표에 나눠 들어감
        String story = "{\"cohort\":7,\"date\":\"2026-08-20\",\"body\":[\"첫 문단\",\"둘째 문단\"],\"tags\":[0],\"summary\":\"버림\","
                + "\"video\":{\"yt\":\"https://www.youtube.com/watch?v=47e6pa3Z-Mg\",\"dur\":\"5:40\"}}";
        MvcResult created = write(admin, "/admin/posts", "7기 입교식 하이라이트", "PUBLISHED", story);
        String location = created.getResponse().getRedirectedUrl();
        assertThat(location).matches("/admin/posts/cohort/\\d+/edit");
        long id = Long.parseLong(location.replaceAll("\\D", ""));
        var row = jdbc.queryForMap("SELECT * FROM cohort_stories WHERE id = ?", id);
        assertThat(row.get("cohort")).isEqualTo(7);
        assertThat(row.get("title")).isEqualTo("7기 입교식 하이라이트");
        assertThat(String.valueOf(row.get("event_date"))).isEqualTo("2026-08-20");
        assertThat(row.get("body")).isEqualTo("첫 문단\n\n둘째 문단");
        assertThat(row.get("video_url")).isEqualTo("https://www.youtube.com/watch?v=47e6pa3Z-Mg");
        assertThat(row.get("video_length")).isEqualTo("5:40");
        assertThat(row.get("status")).isEqualTo("PUBLISHED");

        // 사이트 데이터: cohorts 목록 · 카드 날짜 모양 · 유튜브 주소 · 글 주소 st-번호
        mvc.perform(get("/api/public/stories"))
                .andExpect(jsonPath("$.cohorts.length()").value(1))
                .andExpect(jsonPath("$.cohorts[0].title").value("7기 입교식 하이라이트"))
                .andExpect(jsonPath("$.cohorts[0].anchor").value("st-" + id))
                .andExpect(jsonPath("$.cohorts[0].cohort").value(7))
                .andExpect(jsonPath("$.cohorts[0].date").value("2026. 08. 20"))
                .andExpect(jsonPath("$.cohorts[0].body[1]").value("둘째 문단"))
                .andExpect(jsonPath("$.cohorts[0].video.url").value("https://www.youtube.com/watch?v=47e6pa3Z-Mg"))
                .andExpect(jsonPath("$.cohorts[0].video.dur").value("5:40"))
                .andExpect(jsonPath("$.cohorts[0].summary").doesNotExist())
                .andExpect(jsonPath("$.cohorts[0].tags").doesNotExist());

        // 목록 · 수정 화면
        assertThat(page(admin, "/admin/posts?kind=cohort")).contains("7기 입교식 하이라이트").contains("/admin/posts/cohort/" + id + "/edit");
        assertThat(page(admin, "/admin/posts")).contains("7기 입교식 하이라이트");
        // 목록 위 '미게시 n건'(누르면 미게시만) · 미게시 단추는 확인창(2026-10-21)
        assertThat(page(admin, "/admin/posts?kind=cohort")).contains("미게시 <b>0</b>건").contains("미게시로 바꾸시겠습니까?")
                .contains("name=\"back\" value=\"/admin/posts?kind=cohort\"");
        // 미게시 뒤에는 보던 목록으로(관리 화면 밖 주소는 안 받음)
        mvc.perform(post("/admin/posts/cohort/" + id + "/status").session(admin).with(csrf()).param("status", "HIDDEN").param("back", "/admin/posts?kind=cohort"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl("/admin/posts?kind=cohort"));
        mvc.perform(post("/admin/posts/cohort/" + id + "/status").session(admin).with(csrf()).param("status", "HIDDEN").param("back", "//example.com/x"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl("/admin/posts"));
        assertThat(page(admin, "/admin/posts?kind=cohort")).contains("미게시 <b>1</b>건").contains("status=HIDDEN");
        assertThat(page(admin, "/admin/posts?categoryId=4&status=HIDDEN")).contains("7기 입교식 하이라이트").contains("class=\"status-chip on\"");
        assertThat(page(admin, "/admin/posts?categoryId=1&status=HIDDEN")).doesNotContain("7기 입교식 하이라이트");
        assertThat(page(admin, "/admin/posts/cohort/" + id + "/edit")).contains("2026-08-20").contains("7기 입교식 하이라이트");

        // 고치기: 2026. 09. 01 모양 날짜도 받아요
        write(admin, "/admin/posts/cohort/" + id, "7기 입교식", "PUBLISHED",
                "{\"cohort\":7,\"date\":\"2026. 09. 01\",\"body\":[\"고친 글\"],\"video\":{\"yt\":\"47e6pa3Z-Mg\"}}");
        assertThat(String.valueOf(jdbc.queryForObject("SELECT event_date FROM cohort_stories WHERE id = ?", Object.class, id))).isEqualTo("2026-09-01");
        assertThat(jdbc.queryForObject("SELECT body FROM cohort_stories WHERE id = ?", String.class, id)).isEqualTo("고친 글");

        // 휴지통 → 사이트에서 내려가고, 휴지통 기수별 이모저모 칩에서 보이고, 복원하면 다시 게시중
        mvc.perform(post("/admin/posts/cohort/" + id + "/delete").session(admin).with(csrf())).andExpect(status().is3xxRedirection());
        assertThat(jdbc.queryForObject("SELECT status FROM cohort_stories WHERE id = ?", String.class, id)).isEqualTo("DELETED");
        mvc.perform(get("/api/public/stories")).andExpect(jsonPath("$.cohorts.length()").value(0));
        assertThat(page(admin, "/admin/posts/trash?kind=cohort")).contains("기수별 이모저모").contains("7기 입교식");
        mvc.perform(post("/admin/posts/cohort/" + id + "/restore").session(admin).with(csrf())).andExpect(status().is3xxRedirection());
        assertThat(jdbc.queryForObject("SELECT status FROM cohort_stories WHERE id = ?", String.class, id)).isEqualTo("PUBLISHED");

        // 새 글을 '저장(발행)'으로 등록하면(after=list) 그 종류의 게시물 관리 목록으로, 그냥 등록(임시저장)은 글 수정 화면으로
        mvc.perform(post("/admin/posts").session(admin).with(csrf()).param("title", "목록으로 돌아가는 글").param("categoryId", COHORT_CATEGORY)
                        .param("status", "DRAFT").param("thumbnailMode", "AUTO").param("blocksJson", "[]").param("storyJson", "{\"cohort\":6}")
                        .param("after", "list"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl("/admin/posts?kind=cohort"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.flash().attribute("toast", "등록이 완료되었습니다."));
        assertThat(page(admin, "/admin/posts?kind=cohort")).contains("목록으로 돌아가는 글");

        // 임시저장 목록에도 종류 칩으로
        write(admin, "/admin/posts", "6기 수료식 준비", "DRAFT", "{\"cohort\":6}");
        assertThat(page(admin, "/admin/posts/drafts?kind=cohort")).contains("6기 수료식 준비").contains("기수별 이모저모");

        // 관리자 홈 게시물 현황에도
        assertThat(page(admin, "/admin")).contains("href=\"/admin/posts?kind=cohort\"");
    }

    @Test
    @Order(2)
    void cohortCardWithOnlyTheSiteIllustrationCanBePublished() throws Exception {
        // 사이트 카드 중 사진 없이 시안 그림(SVG)만 있는 카드(2026-10-21 DB로 옮김): 다시 저장 · 게시해도 그림이 남아요
        MockHttpSession admin = login();
        String art = "<svg class=\\\"illu\\\" viewBox=\\\"0 0 400 260\\\" xmlns=\\\"http://www.w3.org/2000/svg\\\"><rect width=\\\"100%\\\" height=\\\"100%\\\" fill=\\\"#2457F5\\\"/></svg>";
        MvcResult created = write(admin, "/admin/posts", "도메인 선택의 날", "PUBLISHED",
                "{\"cohort\":7,\"date\":\"2026-07-11\",\"body\":[\"여섯 갈래\"],\"art\":\"" + art + "\"}");
        String location = created.getResponse().getRedirectedUrl();
        assertThat(location).matches("/admin/posts/cohort/\\d+/edit");
        long id = Long.parseLong(location.replaceAll("\\D", ""));
        assertThat(jdbc.queryForObject("SELECT photos FROM cohort_stories WHERE id = ?", String.class, id)).contains("\"art\":\"<svg");
        mvc.perform(get("/api/public/stories"))
                .andExpect(jsonPath("$.cohorts[?(@.anchor == 'st-" + id + "')].art").value(org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.startsWith("<svg"))));
        // 위험한 그림(스크립트)은 버려서 그림이 없으면 게시할 수 없어요
        assertThat(write(admin, "/admin/posts", "나쁜 그림", "PUBLISHED",
                "{\"cohort\":7,\"date\":\"2026-07-11\",\"art\":\"<svg><script>alert(1)</script></svg>\"}").getResponse().getContentAsString(UTF_8))
                .contains("사진을 한 장 이상");
    }
}
