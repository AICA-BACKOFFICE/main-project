package egovframework.backoffice.post;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.authenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import egovframework.backoffice.BackofficeApplication;
import egovframework.testsupport.CmsMockMvcConfig;
import java.util.Map;
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

/**
 * 임시저장 목록(/admin/posts/drafts): 후기 · 인터뷰 · 프로젝트의 임시저장 글과 임시저장 자주 묻는 질문을 종류별로 본다.
 * 게시중 · 휴지통 글은 빠지고, 서포터즈는 자기가 쓴 글만(FAQ 없음). 휴지통 화면에는 '← 선배들의 이야기 게시물 관리' 버튼이 없다.
 */
@TestPropertySource(properties = {
        "datasource.url=jdbc:h2:mem:backoffice-drafts-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "backoffice.pages.site-root=${java.io.tmpdir}/aica-drafts-test/site",
        "backoffice.pages.data-dir=${java.io.tmpdir}/aica-drafts-test/data",
        "backoffice.upload-dir=${java.io.tmpdir}/aica-drafts-test/uploads",
        "backoffice.initial-admin.password=test-pass-1234"
})
@SpringJUnitWebConfig({BackofficeApplication.class, CmsMockMvcConfig.class})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class PostDraftsWebTest {

    private static final Map<String, String> CATEGORY = Map.of("review", "1", "interview", "2", "project", "3");

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    private MockHttpSession login(String id, String password) throws Exception {
        return (MockHttpSession) mvc.perform(formLogin("/login").user("loginId", id).password("password", password))
                .andExpect(authenticated()).andReturn().getRequest().getSession(false);
    }

    private void write(MockHttpSession session, String kind, String title, String status, String story) throws Exception {
        mvc.perform(post("/admin/posts").session(session).with(csrf())
                        .param("title", title).param("categoryId", CATEGORY.get(kind)).param("status", status)
                        .param("thumbnailMode", "AUTO").param("blocksJson", "[]").param("storyJson", story))
                .andExpect(status().is3xxRedirection());
    }

    private String page(MockHttpSession session, String url) throws Exception {
        return mvc.perform(get(url).session(session)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8);
    }

    @Test
    @Order(1)
    void draftsOfEveryKindAreListedByKindAndSupportersSeeOnlyTheirOwn() throws Exception {
        MockHttpSession admin = login("admin", "test-pass-1234");
        String review = "{\"cat\":\"life\",\"cohort\":6,\"author\":\"김민서\",\"summary\":\"요약.\",\"body\":[\"본문\"]}";
        write(admin, "review", "임시 후기 하나", "DRAFT", review);
        write(admin, "review", "게시한 후기", "PUBLISHED", review);
        write(admin, "interview", "임시 인터뷰", "DRAFT", "{\"cohort\":8,\"author\":\"정ㅇㅇ\",\"track\":\"AI 서비스\",\"summary\":\"인터뷰\"}");
        write(admin, "project", "임시 프로젝트", "DRAFT", "{\"summary\":\"s\",\"cohort\":7,\"className\":\"03반\",\"major\":\"실증\",\"teamName\":\"t\"}");
        write(admin, "review", "휴지통 후기", "DRAFT", review);
        long trashed = jdbc.queryForObject("SELECT id FROM reviews WHERE title = '휴지통 후기'", Long.class);
        mvc.perform(post("/admin/posts/review/" + trashed + "/delete").session(admin).with(csrf())).andExpect(status().is3xxRedirection());
        // 자주 묻는 질문 하나를 임시저장으로
        jdbc.update("UPDATE faqs SET status = 'DRAFT' WHERE sort_order = 1");

        // 왼쪽 메뉴에 임시저장
        String home = page(admin, "/admin");
        assertThat(home).contains("href=\"/admin/posts/drafts\"").contains("임시저장");

        // 전체: 임시저장 글 · 질문만(게시중 · 휴지통 빠짐), 칩마다 개수
        String all = page(admin, "/admin/posts/drafts");
        assertThat(all).contains("임시 후기 하나").contains("임시 인터뷰").contains("임시 프로젝트").contains("비전공자인데 수업을 따라갈 수 있을까요?")
                .doesNotContain("게시한 후기").doesNotContain("휴지통 후기");
        assertThat(all).contains("전체 <em>4</em>").contains("후기 <em>1</em>").contains("인터뷰 <em>1</em>")
                .contains("프로젝트 <em>1</em>").contains("FAQ <em>1</em>");
        assertThat(all).contains("지원 전 Check FAQ › 준비사항").contains("FAQ 관리에서 수정");

        // 종류를 고르면 그 종류만
        String projects = page(admin, "/admin/posts/drafts?kind=project");
        assertThat(projects).contains("임시 프로젝트").doesNotContain("임시 후기 하나").doesNotContain("임시 인터뷰");
        String faqs = page(admin, "/admin/posts/drafts?kind=faq");
        assertThat(faqs).contains("비전공자인데 수업을 따라갈 수 있을까요?").doesNotContain("임시 프로젝트");
        assertThat(page(admin, "/admin/posts/drafts?kind=review&keyword=하나")).contains("임시 후기 하나");
        assertThat(page(admin, "/admin/posts/drafts?kind=review&keyword=없는글")).doesNotContain("임시 후기 하나");

        // 서포터즈: 자기가 쓴 임시저장만, FAQ 칩 없음
        mvc.perform(post("/admin/users").session(admin).with(csrf()).param("loginId", "support@drafts.example.test")
                .param("name", "임시 서포터즈").param("role", "SUPPORT").param("active", "true").param("password", "drafts-support-pass-1"))
                .andExpect(status().is3xxRedirection());
        MockHttpSession support = login("support@drafts.example.test", "drafts-support-pass-1");
        write(support, "review", "서포터즈 임시 후기", "DRAFT", review);
        String mine = page(support, "/admin/posts/drafts");
        assertThat(mine).contains("서포터즈 임시 후기").doesNotContain("임시 후기 하나").doesNotContain("임시 인터뷰")
                .doesNotContain("FAQ <em>").contains("전체 <em>1</em>");

        // 휴지통 화면의 '← 선배들의 이야기 게시물 관리' 버튼은 없앴다
        assertThat(page(admin, "/admin/posts/trash")).doesNotContain("← 선배들의 이야기 게시물 관리").contains("휴지통 후기");
    }

    @Test
    @Order(2)
    void draftsCanBeDeletedAndTheMenuShowsTheCountAndNewMarksThatExpire() throws Exception {
        MockHttpSession admin = login("admin", "test-pass-1234");
        // 왼쪽 메뉴 '임시저장' 옆 개수(관리자: 모든 임시저장 — 앞 시험의 글 3개 + 서포터즈 글 1개 + 질문 1개)
        String home = page(admin, "/admin");
        assertThat(home).contains("임시저장<span class=\"lnb-count\" title=\"임시저장 5개\">5</span>");
        // 방금 쓴 글이 있어 게시물 관리 · 각 종류 · FAQ 메뉴에 NEW
        assertThat(home).contains("선배들의 이야기 게시물 관리<span class=\"lnb-new\">NEW</span>")
                .contains("선배 후기<span class=\"lnb-new\">NEW</span>").contains("지원 전 Check FAQ 관리<span class=\"lnb-new\">NEW</span>");
        // 게시물 목록: 새로 올린 글에 NEW
        assertThat(page(admin, "/admin/posts")).contains("class=\"new-mark\"");

        // 임시저장 목록에서 삭제 → 휴지통, 보던 종류로 돌아감
        long project = jdbc.queryForObject("SELECT id FROM projects WHERE service_name = '임시 프로젝트'", Long.class);
        assertThat(page(admin, "/admin/posts/drafts?kind=project")).contains("/admin/posts/project/" + project + "/delete")
                .contains("value=\"/admin/posts/drafts?kind=project\"");
        mvc.perform(post("/admin/posts/project/" + project + "/delete").session(admin).with(csrf()).param("back", "/admin/posts/drafts?kind=project"))
                .andExpect(redirectedUrl("/admin/posts/drafts?kind=project"));
        assertThat(jdbc.queryForObject("SELECT status FROM projects WHERE id = ?", String.class, project)).isEqualTo("DELETED");
        long faq = jdbc.queryForObject("SELECT id FROM faqs WHERE sort_order = 1", Long.class);
        mvc.perform(post("/admin/faq/" + faq + "/delete").session(admin).with(csrf()).param("back", "/admin/posts/drafts?kind=faq"))
                .andExpect(redirectedUrl("/admin/posts/drafts?kind=faq"));
        assertThat(jdbc.queryForObject("SELECT status FROM faqs WHERE id = ?", String.class, faq)).isEqualTo("DELETED");
        assertThat(jdbc.queryForObject("SELECT status_before_trash FROM faqs WHERE id = ?", String.class, faq)).isEqualTo("DRAFT");
        assertThat(page(admin, "/admin")).contains("title=\"임시저장 3개\">3</span>");
        // 관리자 화면 밖으로는 돌아가지 않음
        long interview = jdbc.queryForObject("SELECT id FROM interviews WHERE title = '임시 인터뷰'", Long.class);
        mvc.perform(post("/admin/posts/interview/" + interview + "/delete").session(admin).with(csrf()).param("back", "https://example.com/x"))
                .andExpect(redirectedUrl("/admin/posts"));

        // NEW 는 24시간이 지나면 사라짐
        java.sql.Timestamp old = java.sql.Timestamp.valueOf(java.time.LocalDateTime.now().minusDays(2));
        for (String table : new String[]{"reviews", "interviews", "projects", "faqs", "media"}) {
            jdbc.update("UPDATE " + table + " SET created_at = ?, updated_at = ?", old, old);
        }
        String later = page(admin, "/admin");
        assertThat(later).doesNotContain("lnb-new");
        assertThat(page(admin, "/admin/posts")).doesNotContain("class=\"new-mark\"");

        // 오래전에 올린 글도 최근 24시간 안에 고치면 목록에 NEW(프로젝트 목록에서 안 보이던 문제)
        jdbc.update("UPDATE reviews SET updated_at = CURRENT_TIMESTAMP WHERE title = '게시한 후기'");
        assertThat(page(admin, "/admin/posts?kind=review")).contains("title=\"최근 24시간 안에 고친 글\">NEW</span>")
                .doesNotContain("title=\"최근 24시간 안에 새로 올린 글\"");
    }
}
