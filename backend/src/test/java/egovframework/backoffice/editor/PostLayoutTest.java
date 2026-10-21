package egovframework.backoffice.editor;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PostLayoutTest {

    @Test
    void blankOrBrokenJsonFallsBackToDefaults() {
        assertThat(PostLayout.parse(null).getPreset()).isEqualTo("basic");
        assertThat(PostLayout.parse("not json").getHeader()).containsExactly("category", "title", "meta", "thumbnail", "summary");
        assertThat(PostLayout.normalize("{}")).isNull();   // 기본값과 같으면 저장하지 않는다
    }

    @Test
    void unknownValuesAreDroppedAndTitleIsForced() {
        PostLayout l = PostLayout.parse("""
            {"preset":"side-right","align":"weird","width":"wide",
             "header":["summary","hack","category"],
             "sidebar":["toc","share","toc"],"footer":["share","related"]}
            """);
        assertThat(l.getPreset()).isEqualTo("side-right");
        assertThat(l.isHasSidebar()).isTrue();
        assertThat(l.getSidebarSide()).isEqualTo("right");
        assertThat(l.getAlign()).isEqualTo("center");
        assertThat(l.getWidth()).isEqualTo("wide");
        assertThat(l.getHeader()).containsExactly("title", "summary", "category");
        assertThat(l.getSidebar()).containsExactly("toc", "share");
        assertThat(l.getFooter()).containsExactly("related");      // 사이드바와 겹치는 share 는 하단에서 제거
        assertThat(l.getCssClass()).isEqualTo("lo-side-right lo-align-center lo-width-wide");
        assertThat(PostLayout.normalize(l.toJson())).isEqualTo(l.toJson());
    }
}
