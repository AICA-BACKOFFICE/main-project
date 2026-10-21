package db.migration;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * 2026-10-20 글 상태(status)에 '삭제됨(DELETED)'을 더한다(사용자 요청). 상태는 넷이다:
 * DRAFT 임시저장 · PUBLISHED 게시중 · HIDDEN 미게시 · DELETED 삭제됨(휴지통).
 * 휴지통으로 옮기면 status 는 DELETED, 옮기기 전 상태는 status_before_trash, 옮긴 시각은 deleted_at 에 적는다(복원하면 원래 상태로).
 * V16이 이름 없이 만든 상태 확인 규칙(CHECK)을 찾아 바꾸므로, 테스트(H2)와 실제 DB(PostgreSQL)에서 같이 돌도록 자바로 쓴다.
 */
public class V18__status_deleted extends BaseJavaMigration {

    private static final String ALLOWED = "('DRAFT', 'PUBLISHED', 'HIDDEN', 'DELETED')";

    @Override
    public void migrate(Context context) throws Exception {
        Connection c = context.getConnection();
        for (String table : List.of("reviews", "interviews", "projects")) {
            for (String name : statusChecks(c, table)) {
                try (Statement st = c.createStatement()) {
                    st.execute("ALTER TABLE " + table + " DROP CONSTRAINT \"" + name.replace("\"", "\"\"") + "\"");
                }
            }
            try (Statement st = c.createStatement()) {
                st.execute("ALTER TABLE " + table + " ADD CONSTRAINT ck_" + table + "_status CHECK (status IN " + ALLOWED + ")");
                // 이미 휴지통에 있던 글(예전에는 미게시로 바꿔 두었음)은 삭제됨으로
                st.executeUpdate("UPDATE " + table + " SET status = 'DELETED' WHERE deleted_at IS NOT NULL");
                st.execute("COMMENT ON COLUMN " + table + ".status IS '상태: DRAFT 임시저장 · PUBLISHED 게시중 · HIDDEN 미게시 · DELETED 삭제됨(휴지통)'");
                st.execute("COMMENT ON COLUMN " + table + ".status_before_trash IS '휴지통으로 옮기기 전 상태(복원하면 이 상태로 돌아감). 휴지통이 아니면 비어 있음'");
                st.execute("COMMENT ON COLUMN " + table + ".deleted_at IS '휴지통으로 옮긴 시각(삭제됨일 때만)'");
            }
        }
    }

    /** 이 표의 상태 확인 규칙 이름들(규칙 글에 PUBLISHED 가 들어 있는 CHECK) */
    private static List<String> statusChecks(Connection c, String table) throws Exception {
        String sql = """
                SELECT tc.constraint_name, cc.check_clause
                  FROM information_schema.table_constraints tc
                  JOIN information_schema.check_constraints cc
                    ON cc.constraint_name = tc.constraint_name AND cc.constraint_schema = tc.constraint_schema
                 WHERE LOWER(tc.table_name) = ? AND tc.constraint_type = 'CHECK'
                """;
        List<String> out = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, table);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String clause = rs.getString(2);
                    if (clause != null && clause.contains("PUBLISHED") && !out.contains(rs.getString(1))) {
                        out.add(rs.getString(1));
                    }
                }
            }
        }
        if (out.isEmpty()) {
            throw new IllegalStateException(table + " 표의 상태 확인 규칙을 찾지 못했어요.");
        }
        return out;
    }
}
