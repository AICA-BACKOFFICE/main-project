package egovframework.backoffice;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 실행 파일이 브라우저를 열지 묻는 곳: 서버가 켜진 뒤 브라우저가 화면(로그인 화면 포함)을 열기 전에는 seen=false,
 * 연 뒤에는 seen=true(이미 열어 둔 창이 있으니 새 창을 열지 않음). 로그인 없이 물을 수 있다.
 */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:backoffice-launcher-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "backoffice.initial-admin.password=test-pass-1234"
})
@AutoConfigureMockMvc
class LauncherWebTest {

    @Autowired MockMvc mvc;

    @Test
    void browserSeenTurnsOnAfterTheFirstPageView() throws Exception {
        mvc.perform(get("/launcher/browser-seen").accept(MediaType.TEXT_HTML, MediaType.ALL)).andExpect(status().isOk())
                .andExpect(jsonPath("$.seen").value(false));
        // 그림 · 스크립트 같은 요청은 화면을 연 것으로 치지 않음
        mvc.perform(get("/css/admin.css").accept(MediaType.valueOf("text/css")));
        mvc.perform(get("/launcher/browser-seen")).andExpect(jsonPath("$.seen").value(false));
        mvc.perform(get("/login").accept(MediaType.TEXT_HTML)).andExpect(status().isOk());
        mvc.perform(get("/launcher/browser-seen")).andExpect(status().isOk()).andExpect(jsonPath("$.seen").value(true));
    }
}
