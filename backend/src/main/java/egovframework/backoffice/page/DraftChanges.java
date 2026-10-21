package egovframework.backoffice.page;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;

/**
 * 임시저장본이 사이트 파일과 어디가 다른지 사람이 읽을 말로 정리한다(FAQ 관리 · 인사교 라이프 게시물 관리의
 * '아직 반영하지 않은 임시저장이 있어 저장할 수 없어요' 안내에 함께 보여 줌).
 * 페이지 편집기는 고친 곳만 파일에서 바꾸므로 줄 단위로 맞대어 바뀐 묶음을 찾고, 묶음마다
 * 가까운 제목(어느 부분) · 글자 · 링크 주소 · 그림 · 그림 설명 · 보이지 않는 설명(화면 읽어 주기용)의 전과 후를 적는다.
 */
final class DraftChanges {

    /** 안내에 보여 줄 최대 개수(나머지는 '외 N곳') */
    static final int MAX = 12;
    private static final int CONTEXT = 18;
    private static final Pattern HEADING = Pattern.compile("<h[1-4]\\b[^>]*>(.*?)</h[1-4]>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final String[][] ATTRS = {
            {"href", "링크 주소"}, {"src", "그림"}, {"alt", "그림 설명"}, {"aria-label", "보이지 않는 설명(화면 읽어 주기용)"}
    };

    private DraftChanges() {
    }

    static List<Map<String, String>> between(String published, String draft) {
        String[] a = lines(published);
        String[] b = lines(draft);
        int start = 0;
        while (start < a.length && start < b.length && a[start].equals(b[start])) {
            start++;
        }
        int endA = a.length;
        int endB = b.length;
        while (endA > start && endB > start && a[endA - 1].equals(b[endB - 1])) {
            endA--;
            endB--;
        }
        List<Map<String, String>> out = new ArrayList<>();
        int n = endA - start;
        int m = endB - start;
        if (n == 0 && m == 0) {
            return out;
        }
        // 가운데만 맞대기(최장 공통 줄)
        int[][] best = new int[n + 1][m + 1];
        for (int i = n - 1; i >= 0; i--) {
            for (int j = m - 1; j >= 0; j--) {
                best[i][j] = a[start + i].equals(b[start + j]) ? best[i + 1][j + 1] + 1 : Math.max(best[i + 1][j], best[i][j + 1]);
            }
        }
        StringBuilder removed = new StringBuilder();
        StringBuilder added = new StringBuilder();
        int hunkAt = -1;
        int i = 0;
        int j = 0;
        while (i < n || j < m) {
            if (i < n && j < m && a[start + i].equals(b[start + j])) {
                flush(out, a, hunkAt, removed, added);
                hunkAt = -1;
                i++;
                j++;
            } else if (j < m && (i >= n || best[i][j + 1] >= best[i + 1][j])) {
                if (hunkAt < 0) {
                    hunkAt = start + i;
                }
                added.append(b[start + j++]).append('\n');
            } else {
                if (hunkAt < 0) {
                    hunkAt = start + i;
                }
                removed.append(a[start + i++]).append('\n');
            }
        }
        flush(out, a, hunkAt, removed, added);
        return out;
    }

    private static String[] lines(String html) {
        return (html == null ? "" : html).replace("\r\n", "\n").split("\n", -1);
    }

    private static void flush(List<Map<String, String>> out, String[] a, int at, StringBuilder removed, StringBuilder added) {
        if (at < 0) {
            return;
        }
        String where = headingBefore(a, at);
        Document before = Jsoup.parseBodyFragment(removed.toString());
        Document after = Jsoup.parseBodyFragment(added.toString());
        int count = out.size();
        String tb = before.body().text();
        String ta = after.body().text();
        if (!tb.equals(ta)) {
            String[] ex = excerpts(tb, ta);
            out.add(change(where, "글자", ex[0], ex[1]));
        }
        for (String[] attr : ATTRS) {
            List<String> va = values(before, attr[0]);
            List<String> vb = values(after, attr[0]);
            if (va.equals(vb)) {
                continue;
            }
            if (va.size() == vb.size()) {
                for (int k = 0; k < va.size(); k++) {
                    if (!Objects.equals(va.get(k), vb.get(k))) {
                        out.add(change(where, attr[1], va.get(k), vb.get(k)));
                    }
                }
            } else {
                out.add(change(where, attr[1], String.join(" · ", va), String.join(" · ", vb)));
            }
        }
        if (out.size() == count) {
            out.add(change(where, "모양 · 배치", "", "글자는 그대로이고 모양(색 · 크기 · 위치 등)이 바뀌었어요"));
        }
        removed.setLength(0);
        added.setLength(0);
    }

    private static List<String> values(Document doc, String attr) {
        List<String> out = new ArrayList<>();
        for (Element el : doc.body().select("[" + attr + "]")) {
            out.add(el.attr(attr));
        }
        return out;
    }

    /** 바뀐 곳 앞뒤를 조금만 남긴 전 · 후 글자 */
    private static String[] excerpts(String before, String after) {
        int p = 0;
        while (p < before.length() && p < after.length() && before.charAt(p) == after.charAt(p)) {
            p++;
        }
        int s = 0;
        while (s < before.length() - p && s < after.length() - p
                && before.charAt(before.length() - 1 - s) == after.charAt(after.length() - 1 - s)) {
            s++;
        }
        int from = Math.max(0, p - CONTEXT);
        return new String[] {cut(before, from, before.length() - s), cut(after, from, after.length() - s)};
    }

    private static String cut(String text, int from, int changedEnd) {
        int to = Math.min(text.length(), changedEnd + CONTEXT);
        String core = text.substring(from, Math.max(from, to));
        if (core.length() > 160) {
            core = core.substring(0, 160) + "…";
        }
        return (from > 0 ? "…" : "") + core + (to < text.length() ? "…" : "");
    }

    /** 바뀐 곳 바로 위의 가까운 제목(어느 부분인지) */
    private static String headingBefore(String[] a, int at) {
        for (int k = Math.min(at, a.length - 1); k >= 0; k--) {
            Matcher m = HEADING.matcher(a[k]);
            String last = null;
            while (m.find()) {
                last = m.group(1);
            }
            if (last != null) {
                String text = Jsoup.parse(last.replace("><", "> <")).text().trim();   // Q 표시 · 질문처럼 붙은 칸은 띄어서
                if (!text.isEmpty()) {
                    return text.length() > 40 ? text.substring(0, 40) + "…" : text;
                }
            }
        }
        return "";
    }

    private static Map<String, String> change(String where, String what, String before, String after) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("where", where);
        m.put("what", what);
        m.put("before", before == null ? "" : before);
        m.put("after", after == null ? "" : after);
        return m;
    }
}
