package egovframework.backoffice.post.story;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 선배 이름 가리기(2026-10-21): 성(첫 글자)만 남기고 모두 *, '익명'은 그대로. 질문과 답 · 본문 안의 같은 이름도 */
class SeniorNameMaskTest {

    @Test
    void namesKeepOnlyTheFamilyName() {
        assertThat(StoryContent.maskName("김민서")).isEqualTo("김**");
        assertThat(StoryContent.maskName("김*서")).isEqualTo("김**");
        assertThat(StoryContent.maskName("김**")).isEqualTo("김**");
        assertThat(StoryContent.maskName("김*")).isEqualTo("김*");
        assertThat(StoryContent.maskName("백*하늘")).isEqualTo("백***");
        assertThat(StoryContent.maskName(" 홍 길동 ")).isEqualTo("홍**");
        assertThat(StoryContent.maskName("익명")).isEqualTo("익명");
        assertThat(StoryContent.maskName("")).isEmpty();
        assertThat(db.migration.V30__mask_senior_names.mask("김*준")).isEqualTo("김**");
        assertThat(db.migration.V30__mask_senior_names.mask("익명")).isEqualTo("익명");
    }

    @Test
    void theTypedNameIsHiddenInsideTheTextToo() {
        StoryContent stories = new StoryContent(new ObjectMapper());
        Map<String, Object> iv = stories.normalize(StoryKind.INTERVIEW,
                "{\"author\":\"정민수\",\"cohort\":6,\"summary\":\"정민수 선배 이야기\",\"qa\":[{\"q\":\"자기소개\",\"a\":\"안녕하세요, 정민수입니다.\"}]}", false);
        assertThat(iv.get("author")).isEqualTo("정**");
        assertThat(iv.get("summary")).isEqualTo("정** 선배 이야기");
        assertThat(((List<?>) iv.get("qa")).get(0)).isEqualTo(Map.of("q", "자기소개", "a", "안녕하세요, 정**입니다."));
        // 예전 표기(김*준)로 저장된 글을 고쳐 저장하면 그 표기도 새 표기로
        Map<String, Object> old = stories.normalize(StoryKind.INTERVIEW,
                "{\"author\":\"김*준\",\"cohort\":7,\"qa\":[{\"q\":\"자기소개\",\"a\":\"김*준입니다.\"}]}", false);
        assertThat(old.get("author")).isEqualTo("김**");
        assertThat(((Map<?, ?>) ((List<?>) old.get("qa")).get(0)).get("a")).isEqualTo("김**입니다.");
        Map<String, Object> review = stories.normalize(StoryKind.REVIEW,
                "{\"cat\":\"life\",\"author\":\"김민서\",\"summary\":\"김민서의 하루\",\"body\":[\"저는 김민서예요.\"]}", false);
        assertThat(review.get("author")).isEqualTo("김**");
        assertThat(review.get("body")).isEqualTo(List.of("저는 김**예요."));
    }
}
