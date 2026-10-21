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
 * 2026-10-20 글 번호를 표마다 따로(사용자 요청): 후기 · 인터뷰 · 프로젝트가 같이 쓰던 번호 줄(story_post_id_seq)을 없애고
 * 표마다 번호 줄(reviews_id_seq · interviews_id_seq · projects_id_seq)을 둔다. 지금 있는 글은 표마다 예전 번호 순서대로 1번부터 다시 매긴다.
 * 번호가 표끼리 겹치므로 관리 화면 주소에는 글 종류가 들어간다(/admin/posts/project/1/edit). 사이트 주소는 원래 종류 글자가 붙어 있다(#pj-p1).
 * 테스트(H2)와 실제 DB(PostgreSQL)에서 같이 돌도록 자바로 쓴다(번호 줄 기본값 문법이 다름).
 */
public class V19__own_numbering_per_table extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection c = context.getConnection();
        boolean postgres = c.getMetaData().getDatabaseProductName().toLowerCase().contains("postgres");
        try (Statement st = c.createStatement()) {
            for (String table : List.of("reviews", "interviews", "projects")) {
                // 1) 예전 번호 순서대로 1, 2, 3 …(번호가 서로 부딪히지 않게 먼저 음수로 옮겼다가 하나씩 매김)
                List<Long> ids = new ArrayList<>();
                try (ResultSet rs = st.executeQuery("SELECT id FROM " + table + " ORDER BY id")) {
                    while (rs.next()) {
                        ids.add(rs.getLong(1));
                    }
                }
                st.executeUpdate("UPDATE " + table + " SET id = -id");
                try (PreparedStatement ps = c.prepareStatement("UPDATE " + table + " SET id = ? WHERE id = ?")) {
                    for (int i = 0; i < ids.size(); i++) {
                        ps.setLong(1, i + 1);
                        ps.setLong(2, -ids.get(i));
                        ps.executeUpdate();
                    }
                }
                long next = ids.size() + 1;
                // 2) 이 표만의 번호 줄
                String seq = table + "_id_seq";
                st.execute("CREATE SEQUENCE " + seq + " START WITH " + next);
                st.execute("ALTER TABLE " + table + " ALTER COLUMN id SET DEFAULT "
                        + (postgres ? "nextval('" + seq + "')" : "NEXT VALUE FOR " + seq));
                if (postgres) {
                    st.execute("ALTER SEQUENCE " + seq + " OWNED BY " + table + ".id");
                }
                st.execute("COMMENT ON COLUMN " + table + ".id IS '글 번호(이 표 안에서 1번부터)'");
            }
            st.execute("DROP SEQUENCE IF EXISTS story_post_id_seq");
        }
    }
}
