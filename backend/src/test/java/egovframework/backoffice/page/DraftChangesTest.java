package egovframework.backoffice.page;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 임시저장 안내에 보여 줄 '바뀐 곳': 어느 부분(가까운 제목) · 글자 · 링크 주소 · 보이지 않는 설명의 전과 후 */
class DraftChangesTest {

    private static final String PAGE = String.join("\r\n",
            "<!doctype html>", "<html><body>",
            "<h2>모집 프로세스</h2>",
            "<article class=\"pf-card\" aria-label=\"STEP 01 서류 전형\">",
            "<p>지원 자격을 확인해요.</p>",
            "</article>",
            "<h2>자주 묻는 질문</h2>",
            "<div class=\"faq-at\">선배들의 이야기는 <a href=\"../stories/index.html#reviews\">선배 후기</a>에서 볼 수 있어요.</div>",
            "</body></html>", "");

    @Test
    void samePageHasNoChanges() {
        assertThat(DraftChanges.between(PAGE, PAGE)).isEmpty();
        assertThat(DraftChanges.between(PAGE, PAGE.replace("\r\n", "\n"))).isEmpty();
    }

    @Test
    void describesTextLinkAndHiddenLabelChangesWithTheNearestHeading() {
        String draft = PAGE.replace("../stories/index.html#reviews", "http://127.0.0.1:4181/about/index.html")
                .replace("aria-label=\"STEP 01 서류 전형\"", "aria-label=\"STEP 01\"")
                .replace("지원 자격을 확인해요.", "지원 자격과 동기를 확인해요.");
        List<Map<String, String>> changes = DraftChanges.between(PAGE, draft);
        assertThat(changes).extracting(c -> c.get("where") + "|" + c.get("what")).containsExactly(
                "모집 프로세스|글자",
                "모집 프로세스|보이지 않는 설명(화면 읽어 주기용)",
                "자주 묻는 질문|링크 주소");
        assertThat(changes.get(1)).containsEntry("before", "STEP 01 서류 전형").containsEntry("after", "STEP 01");
        assertThat(changes.get(0).get("before")).isEqualTo("지원 자격을 확인해요.");
        assertThat(changes.get(0).get("after")).isEqualTo("지원 자격과 동기를 확인해요.");
        assertThat(changes.get(2)).containsEntry("before", "../stories/index.html#reviews")
                .containsEntry("after", "http://127.0.0.1:4181/about/index.html");
    }

    @Test
    void styleOnlyChangesAreStillListed() {
        String draft = PAGE.replace("<div class=\"faq-at\">", "<div class=\"faq-at\" style=\"color:red\">");
        List<Map<String, String>> changes = DraftChanges.between(PAGE, draft);
        assertThat(changes).hasSize(1);
        assertThat(changes.get(0)).containsEntry("what", "모양 · 배치").containsEntry("where", "자주 묻는 질문");
    }
}
