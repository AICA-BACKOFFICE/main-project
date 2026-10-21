package db.migration;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * 2026-10-21 선배 이름 가리기(사용자 요청): 후기 · 인터뷰의 이름(senior_name)을 '김*수' 대신 성만 남기고 모두 *로 — 김*수 → 김**, 백*하늘 → 백***.
 * '익명'은 그대로. 인터뷰 질문과 답(자기소개 '김*준입니다') · 요약 · 후기 본문 안에 같은 이름이 있으면 그것도 바꾼다.
 * 고친 시각(updated_at)은 그대로 둔다(내용을 고친 게 아니라 이름 표기만 맞춤 — 목록 NEW 표시가 켜지지 않게).
 * 앞으로 저장하는 이름은 StoryContent.maskName 이 같은 규칙으로 가린다.
 */
public class V30__mask_senior_names extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection c = context.getConnection();
        mask(c, "reviews", List.of("summary", "body"));
        mask(c, "interviews", List.of("summary", "qa"));
    }

    private static void mask(Connection c, String table, List<String> texts) throws Exception {
        String columns = String.join(", ", texts);
        List<Object[]> rows = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT id, senior_name, " + columns + " FROM " + table + " WHERE senior_name IS NOT NULL");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                Object[] row = new Object[2 + texts.size()];
                row[0] = rs.getLong(1);
                for (int i = 1; i < row.length; i++) {
                    row[i] = rs.getString(i + 1);
                }
                rows.add(row);
            }
        }
        String set = "senior_name = ?" + texts.stream().map(t -> ", " + t + " = ?").reduce("", String::concat);
        try (PreparedStatement up = c.prepareStatement("UPDATE " + table + " SET " + set + " WHERE id = ?")) {
            for (Object[] row : rows) {
                String old = ((String) row[1]).replaceAll("\\s+", "");
                String masked = mask(old);
                if (masked.equals(row[1])) {
                    continue;
                }
                up.setString(1, masked);
                for (int i = 0; i < texts.size(); i++) {
                    String text = (String) row[2 + i];
                    boolean replace = text != null && old.codePointCount(0, old.length()) >= 2 && !old.equals(masked);
                    up.setString(2 + i, replace ? text.replace(old, masked) : text);
                }
                up.setLong(2 + texts.size(), (Long) row[0]);
                up.executeUpdate();
            }
        }
    }

    /** 성(첫 글자)만 남기고 나머지는 *. '익명'은 그대로 */
    public static String mask(String name) {
        String s = name == null ? "" : name.replaceAll("\\s+", "");
        if (s.isEmpty() || s.equals("익명")) {
            return s;
        }
        int first = s.offsetByCodePoints(0, 1);
        return s.substring(0, first) + "*".repeat(s.codePointCount(first, s.length()));
    }
}
