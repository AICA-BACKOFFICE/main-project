package egovframework.backoffice.account;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrlPattern;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import egovframework.backoffice.BackofficeApplication;
import egovframework.testsupport.CmsMockMvcConfig;
import jakarta.servlet.http.Cookie;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * 로그인 상태 유지: 로그인 화면의 체크(기본 켜짐)로 14일 쿠키를 받으면, 세션이 끝나거나 서버를 다시 켜도(세션 없음)
 * 관리자 화면이 로그인 화면으로 돌아가지 않는다. 체크를 끄면 쿠키가 없고, 로그아웃 · 비밀번호 변경이면 쿠키가 무효가 된다.
 */
@TestPropertySource(properties = {
        "datasource.url=jdbc:h2:mem:backoffice-remember-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "backoffice.pages.site-root=${java.io.tmpdir}/aica-remember-test/site",
        "backoffice.pages.data-dir=${java.io.tmpdir}/aica-remember-test/data",
        "backoffice.upload-dir=${java.io.tmpdir}/aica-remember-test/uploads",
        "backoffice.remember-me-key-file=${java.io.tmpdir}/aica-remember-test/remember-me.key",
        "backoffice.initial-admin.password=test-pass-1234"
})
@SpringJUnitWebConfig({BackofficeApplication.class, CmsMockMvcConfig.class})
class RememberMeWebTest {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    private MvcResult login(boolean remember) throws Exception {
        var req = post("/login").with(csrf()).param("loginId", "admin").param("password", "test-pass-1234");
        if (remember) {
            req = req.param("remember", "on");
        }
        return mvc.perform(req).andExpect(redirectedUrl("/admin")).andReturn();
    }

    @Test
    void stayingSignedInSurvivesALostSessionUntilLogoutOrPasswordChange() throws Exception {
        // 로그인 화면: 로그인 상태 유지 체크가 기본으로 켜져 있다
        String page = mvc.perform(get("/login")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8);
        assertThat(page).contains("name=\"remember\"").contains("checked").contains("로그인 상태 유지");

        // 체크를 끄면 쿠키가 없다
        assertThat(login(false).getResponse().getCookie("AICA_REMEMBER")).isNull();

        // 켜면 14일 쿠키(자바스크립트로는 못 읽음). 열쇠는 파일에 한 번 만들어 두고 계속 쓴다
        MvcResult signedIn = login(true);
        Cookie remember = signedIn.getResponse().getCookie("AICA_REMEMBER");
        assertThat(remember).isNotNull();
        assertThat(remember.getMaxAge()).isEqualTo(14 * 24 * 3600);
        assertThat(remember.isHttpOnly()).isTrue();
        Path keyFile = Path.of(System.getProperty("java.io.tmpdir"), "aica-remember-test", "remember-me.key");
        assertThat(Files.readString(keyFile, UTF_8).trim()).hasSizeGreaterThanOrEqualTo(32);

        // 세션 없이(30분이 지나 세션이 끝났거나 서버를 다시 켠 것처럼) 쿠키만으로 관리자 화면 · 로그인 확인이 된다
        mvc.perform(get("/admin").cookie(remember)).andExpect(status().isOk());
        mvc.perform(get("/admin/session").cookie(remember)).andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true)).andExpect(jsonPath("$.token").isNotEmpty());
        // 쿠키가 없으면 지금처럼 로그인 화면 · 401
        mvc.perform(get("/admin")).andExpect(status().is3xxRedirection()).andExpect(redirectedUrlPattern("**/login"));
        mvc.perform(get("/admin/session")).andExpect(status().isUnauthorized());

        // 로그아웃하면 쿠키를 지운다
        MockHttpSession session = (MockHttpSession) signedIn.getRequest().getSession(false);
        Cookie cleared = mvc.perform(post("/logout").session(session).cookie(remember).with(csrf()))
                .andExpect(redirectedUrl("/login?logout")).andReturn().getResponse().getCookie("AICA_REMEMBER");
        assertThat(cleared).isNotNull();
        assertThat(cleared.getMaxAge()).isZero();

        // 비밀번호가 바뀌면 예전에 받은 쿠키로는 들어갈 수 없다
        Cookie again = login(true).getResponse().getCookie("AICA_REMEMBER");
        mvc.perform(get("/admin").cookie(again)).andExpect(status().isOk());
        jdbc.update("UPDATE admin_users SET password_hash = ? WHERE login_id = 'admin'",
                new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("changed-pass-5678"));
        mvc.perform(get("/admin").cookie(again)).andExpect(status().is3xxRedirection()).andExpect(redirectedUrlPattern("**/login"));
    }
}
