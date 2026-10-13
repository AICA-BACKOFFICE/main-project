package egovframework.backoffice.editor;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class BlockContentTest {

    private final BlockContent content = new BlockContent(new ObjectMapper());

    @Test
    void sanitizeKeepsAllowedInlineFormattingOnly() {
        List<Map<String, Object>> blocks = content.sanitize(content.parse("""
            [{"type":"paragraph","align":"weird","html":"<b>굵게</b> <span style=\\"color: #ff0000; font-size: 20px; position: fixed\\">색</span> <img src=x onerror=alert(1)> <a href=\\"javascript:alert(1)\\">x</a> <a href=\\"https://a.b\\">ok</a>"},
             {"type":"unknown","html":"x"},
             {"type":"heading","level":9,"html":"<script>1</script>제목"},
             {"type":"image","url":"/uploads/2026/09/a.png","alt":"<b>a</b>","caption":"c","width":"huge"},
             {"type":"list","style":"number","items":["a","<u>b</u>"]},
             {"type":"divider","extra":1}]
            """));

        assertThat(blocks).hasSize(5);
        Map<String, Object> p = blocks.get(0);
        assertThat(p.get("align")).isEqualTo("left");
        String html = (String) p.get("html");
        assertThat(html).contains("<b>굵게</b>").contains("color: #ff0000").contains("font-size: 20px")
                .doesNotContain("position").doesNotContain("<img").doesNotContain("javascript:")
                .contains("href=\"https://a.b\"").contains("rel=\"noopener noreferrer\"");

        assertThat(blocks.get(1).get("level")).isEqualTo(3);
        assertThat((String) blocks.get(1).get("html")).doesNotContain("script").contains("제목");

        assertThat(blocks.get(2).get("width")).isEqualTo("full");
        assertThat(blocks.get(2).get("alt")).isEqualTo("a");

        assertThat(blocks.get(3).get("items")).isEqualTo(List.of("a", "<u>b</u>"));
        assertThat(blocks.get(4)).containsOnlyKeys("type");
    }

    @Test
    void helpersDeriveThumbnailAndSummary() {
        List<Map<String, Object>> blocks = content.sanitize(content.parse("""
            [{"type":"paragraph","align":"left","html":"첫 <b>문장</b>입니다."},
             {"type":"image","url":"https://cdn.example.com/x.jpg","alt":"","caption":"","width":"full"},
             {"type":"image","url":"/uploads/2.png","alt":"","caption":"","width":"full"}]
            """));
        assertThat(content.firstImageUrl(blocks)).isEqualTo("https://cdn.example.com/x.jpg");
        assertThat(content.plainText(blocks, 160)).isEqualTo("첫 문장입니다.");
        assertThat(content.plainText(blocks, 5)).hasSize(5).endsWith("…");
        assertThat(content.serialize(blocks)).startsWith("[{\"type\":\"paragraph\"");
    }

    @Test
    void styleFilterAcceptsOnlyKnownProperties() {
        assertThat(BlockContent.filterStyle("color:#123; font-size: 18px; background: url(x); font-weight: bold"))
                .isEqualTo("color: #123; font-size: 18px; font-weight: bold;");
        assertThat(BlockContent.filterStyle("font-size: 900px")).isEmpty();
    }
}
