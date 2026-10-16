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
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:trash-bulk-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "backoffice.pages.site-root=${java.io.tmpdir}/aica-trash-bulk-test/site",
    "backoffice.pages.data-dir=${java.io.tmpdir}/aica-trash-bulk-test/data",
    "backoffice.upload-dir=${java.io.tmpdir}/aica-trash-bulk-test/uploads",
    "backoffice.initial-admin.password=test-pass-1234"
})
@AutoConfigureMockMvc
@Transactional
class PostTrashBulkWebTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PostTrashService trash;

    private MockHttpSession login() throws Exception {
        return (MockHttpSession) mvc.perform(formLogin("/login").user("loginId", "admin").password("password", "test-pass-1234"))
                .andExpect(authenticated()).andReturn().getRequest().getSession(false);
    }

    private void add(long id, boolean deleted) {
        Long author = jdbc.queryForObject("SELECT id FROM admin_users WHERE login_id='admin'", Long.class);
        jdbc.update("INSERT INTO posts(id,title,status,blocks_json,author_id,status_before_trash,deleted_at) VALUES(?,?,'HIDDEN','[]',?,'PUBLISHED'," + (deleted ? "CURRENT_TIMESTAMP" : "NULL") + ")", id, "test-" + id, author);
    }

    private long count(String table, long id) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE " + (table.equals("posts") ? "id" : "post_id") + "=?", Long.class, id);
    }

    @Test void selectedRestoreDeduplicatesAndInvalidBatchDoesNotModifyAnything() throws Exception {
        var session = login(); add(90001, true); add(90002, true); add(90003, false);
        mvc.perform(post("/admin/posts/trash/bulk").session(session).with(csrf()).param("action", "restore").param("ids", "90001", "90003"))
                .andExpect(status().isBadRequest());
        assertThat(trash.getDeleted(90001L)).isNotNull();
        mvc.perform(post("/admin/posts/trash/bulk").session(session).with(csrf()).param("action", "restore").param("ids", "90001", "90001"))
                .andExpect(status().is3xxRedirection());
        assertThat(jdbc.queryForObject("SELECT status FROM posts WHERE id=90001", String.class)).isEqualTo("PUBLISHED");
        assertThat(trash.getDeleted(90002L)).isNotNull();
        mvc.perform(post("/admin/posts/trash/bulk").session(session).with(csrf()).param("action", "purge"))
                .andExpect(status().isBadRequest());
    }

    @Test void selectedPurgeRemovesHistoryAndViewsButKeepsOtherPosts() throws Exception {
        var session = login(); add(90011, true); add(90012, true); add(90013, false);
        jdbc.update("INSERT INTO post_versions(post_id,reason,title,status,blocks_json) VALUES(90011,'PUBLISH','history','PUBLISHED','[]')");
        jdbc.update("INSERT INTO post_view_logs(post_id,viewed_on) VALUES(90011,CURRENT_DATE)");
        mvc.perform(post("/admin/posts/trash/bulk").session(session).with(csrf()).param("action", "purge").param("ids", "90011"))
                .andExpect(status().is3xxRedirection());
        assertThat(count("posts", 90011)).isZero();
        assertThat(count("post_versions", 90011)).isZero();
        assertThat(count("post_view_logs", 90011)).isZero();
        assertThat(count("posts", 90012)).isEqualTo(1);
        assertThat(count("posts", 90013)).isEqualTo(1);
    }

    @Test void emptyIgnoresSearchAndPaginationAndRejectsStaleSnapshot() throws Exception {
        var session = login(); add(90021, true); add(90022, true); add(90023, false);
        String snapshot = trash.overview().token();
        mvc.perform(get("/admin/posts/trash?keyword=missing&size=1").session(session))
                .andExpect(status().isOk()).andExpect(content().string(org.hamcrest.Matchers.containsString("trash-select-all")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString(snapshot)));
        add(90024, true);
        mvc.perform(post("/admin/posts/trash/empty").session(session).with(csrf()).param("snapshot", snapshot))
                .andExpect(status().isBadRequest());
        assertThat(count("posts", 90021)).isEqualTo(1);
        mvc.perform(post("/admin/posts/trash/empty").session(session).with(csrf()).param("snapshot", trash.overview().token()))
                .andExpect(status().is3xxRedirection());
        assertThat(trash.overview().count()).isZero();
        assertThat(count("posts", 90023)).isEqualTo(1);
    }

    @Test void bulkRoutesRequireAdminAndCsrf() throws Exception {
        var session = login();
        mvc.perform(post("/admin/posts/trash/bulk").session(session).param("action", "purge").param("ids", "90001"))
                .andExpect(status().isForbidden());
        for (String route : new String[]{"bulk", "empty"}) {
            mvc.perform(post("/admin/posts/trash/" + route).with(user("support").roles("SUPPORT")).with(csrf()))
                    .andExpect(status().isForbidden());
        }
    }
}
