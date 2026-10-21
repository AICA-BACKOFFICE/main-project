package egovframework.backoffice.post;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.authenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import egovframework.backoffice.BackofficeApplication;
import egovframework.testsupport.CmsMockMvcConfig;
import org.springframework.test.context.TestPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@TestPropertySource(properties = {
    "datasource.url=jdbc:h2:mem:trash-bulk-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "backoffice.pages.site-root=${java.io.tmpdir}/aica-trash-bulk-test/site",
    "backoffice.pages.data-dir=${java.io.tmpdir}/aica-trash-bulk-test/data",
    "backoffice.upload-dir=${java.io.tmpdir}/aica-trash-bulk-test/uploads",
    "backoffice.initial-admin.password=test-pass-1234"
})
@SpringJUnitWebConfig({BackofficeApplication.class, CmsMockMvcConfig.class})
@Transactional
class PostTrashBulkWebTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PostTrashService trash;

    private MockHttpSession login() throws Exception {
        return (MockHttpSession) mvc.perform(formLogin("/login").user("loginId", "admin").password("password", "test-pass-1234"))
                .andExpect(authenticated()).andReturn().getRequest().getSession(false);
    }

    /** 세 표에 번갈아 글을 넣는다(글 번호는 세 표가 같이 쓰므로 표마다 겹치지 않게) */
    private void add(String table, long id, boolean deleted) {
        Long author = jdbc.queryForObject("SELECT id FROM admin_users WHERE login_id='admin'", Long.class);
        String extra = table.equals("reviews") ? "category, " : table.equals("interviews") ? "cohort, " : "";
        String value = table.equals("reviews") ? "'생활', " : table.equals("interviews") ? "6, " : "";
        String title = table.equals("projects") ? "service_name" : "title";   // 프로젝트 제목 칸은 서비스 이름(V20)
        jdbc.update("INSERT INTO " + table + "(id, " + extra + title + ", status, author_id, status_before_trash, deleted_at) VALUES(?, " + value
                + "?, " + (deleted ? "'DELETED', ?, 'PUBLISHED', CURRENT_TIMESTAMP" : "'HIDDEN', ?, NULL, NULL") + ")", id, "test-" + id, author);
    }

    private long count(String table, long id) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE id=?", Long.class, id);
    }

    @Test void selectedRestoreAcrossTablesDeduplicatesAndInvalidBatchDoesNotModifyAnything() throws Exception {
        var session = login(); add("reviews", 90001, true); add("interviews", 90002, true); add("projects", 90003, false);
        mvc.perform(post("/admin/posts/trash/bulk").session(session).with(csrf()).param("action", "restore").param("ids", "review-90001", "project-90003"))
                .andExpect(status().isBadRequest());
        assertThat(trash.getDeleted(egovframework.backoffice.post.story.StoryKind.REVIEW, 90001L)).isNotNull();
        mvc.perform(post("/admin/posts/trash/bulk").session(session).with(csrf()).param("action", "restore").param("ids", "review-90001", "review-90001", "interview-90002"))
                .andExpect(status().is3xxRedirection());
        assertThat(jdbc.queryForObject("SELECT status FROM reviews WHERE id=90001", String.class)).isEqualTo("PUBLISHED");
        assertThat(jdbc.queryForObject("SELECT status FROM interviews WHERE id=90002", String.class)).isEqualTo("PUBLISHED");
        mvc.perform(post("/admin/posts/trash/bulk").session(session).with(csrf()).param("action", "purge"))
                .andExpect(status().isBadRequest());
    }

    @Test void selectedPurgeRemovesOnlyTheSelectedRows() throws Exception {
        var session = login(); add("projects", 90011, true); add("reviews", 90012, true); add("interviews", 90013, false);
        String page = mvc.perform(get("/admin/posts/trash").session(session)).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(page).contains("test-90011").contains("test-90012").doesNotContain("test-90013").contains("프로젝트").contains("후기 › 생활");
        mvc.perform(post("/admin/posts/trash/bulk").session(session).with(csrf()).param("action", "purge").param("ids", "project-90011"))
                .andExpect(status().is3xxRedirection());
        assertThat(count("projects", 90011)).isZero();
        assertThat(count("reviews", 90012)).isEqualTo(1);
        assertThat(count("interviews", 90013)).isEqualTo(1);
    }

    @Test void emptyIgnoresSearchAndPaginationAndRejectsStaleSnapshot() throws Exception {
        var session = login(); add("reviews", 90021, true); add("interviews", 90022, true); add("projects", 90023, false);
        String snapshot = trash.overview(null).token();
        mvc.perform(get("/admin/posts/trash?keyword=missing&size=1").session(session))
                .andExpect(status().isOk()).andExpect(content().string(org.hamcrest.Matchers.containsString("trash-select-all")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString(snapshot)));
        add("projects", 90024, true);
        mvc.perform(post("/admin/posts/trash/empty").session(session).with(csrf()).param("snapshot", snapshot))
                .andExpect(status().isBadRequest());
        assertThat(count("reviews", 90021)).isEqualTo(1);
        mvc.perform(post("/admin/posts/trash/empty").session(session).with(csrf()).param("snapshot", trash.overview(null).token()))
                .andExpect(status().is3xxRedirection());
        assertThat(trash.overview(null).count()).isZero();
        assertThat(count("projects", 90024)).isZero();
        assertThat(count("projects", 90023)).isEqualTo(1);
    }

    @Test void sameNumberInTwoTablesIsTreatedAsTwoPosts() throws Exception {
        // 글 번호는 표마다 1번부터라 후기 90031번과 프로젝트 90031번이 따로 있다 — 고른 종류의 글만 바뀐다
        var session = login(); add("reviews", 90031, true); add("projects", 90031, true);
        String page = mvc.perform(get("/admin/posts/trash").session(session)).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(page).contains("value=\"review-90031\"").contains("value=\"project-90031\"");
        mvc.perform(post("/admin/posts/trash/bulk").session(session).with(csrf()).param("action", "restore").param("ids", "project-90031"))
                .andExpect(status().is3xxRedirection());
        assertThat(jdbc.queryForObject("SELECT status FROM projects WHERE id=90031", String.class)).isEqualTo("PUBLISHED");
        assertThat(jdbc.queryForObject("SELECT status FROM reviews WHERE id=90031", String.class)).isEqualTo("DELETED");
        mvc.perform(post("/admin/posts/review/90031/purge").session(session).with(csrf())).andExpect(status().is3xxRedirection());
        assertThat(count("reviews", 90031)).isZero();
        assertThat(count("projects", 90031)).isEqualTo(1);
        mvc.perform(post("/admin/posts/trash/bulk").session(session).with(csrf()).param("action", "restore").param("ids", "90031"))
                .andExpect(status().isBadRequest());
    }

    @Test void bulkRoutesRequireAdminAndCsrf() throws Exception {
        var session = login();
        mvc.perform(post("/admin/posts/trash/bulk").session(session).param("action", "purge").param("ids", "review-90001"))
                .andExpect(status().isForbidden());
        for (String route : new String[]{"bulk", "empty"}) {
            mvc.perform(post("/admin/posts/trash/" + route).with(user("support").roles("SUPPORT")).with(csrf()))
                    .andExpect(status().isForbidden());
        }
    }
}
