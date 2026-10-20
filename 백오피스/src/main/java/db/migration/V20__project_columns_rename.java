package db.migration;

import java.sql.Connection;
import java.sql.Statement;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * 2026-10-20 프로젝트 표 칸 정리(사용자 요청).
 * <ul>
 *   <li>card_summary(카드 짧은 요약) 칸을 뺀다 — 카드의 회색 한 줄은 summary 가 맡는다.</li>
 *   <li>headline 과 summary 의 내용을 서로 바꾼다. 예: MAKERY
 *       project_subject(카드 큰 제목) = "대화형 에이전트를 활용한 소상공인 브랜딩·콘텐츠 생성 및 운영 서비스",
 *       summary(제목 아래 한 줄 요약 · 상세 첫 문단) = "대화만으로 브랜드 로고와 숏폼을 만들고 SNS 운영까지 돕는 소상공인 서비스".</li>
 *   <li>칸 이름: title → service_name(서비스 이름, 예: MAKERY), headline → project_subject(프로젝트 주제).</li>
 * </ul>
 * 칸 이름 바꾸기 문법이 H2(테스트)와 PostgreSQL(실제 DB)에서 달라서 자바로 쓴다.
 */
public class V20__project_columns_rename extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection c = context.getConnection();
        boolean postgres = c.getMetaData().getDatabaseProductName().toLowerCase().contains("postgres");
        try (Statement st = c.createStatement()) {
            st.execute("ALTER TABLE projects DROP COLUMN card_summary");
            // 바꿀 값이 서로 다른 칸 길이에 들어가도록 먼저 넓힌다(summary 는 TEXT)
            st.execute("ALTER TABLE projects ALTER COLUMN headline SET DATA TYPE VARCHAR(200)");
            // 한 문장 안에서 두 칸을 같이 바꾸면 둘 다 바꾸기 전 값을 쓴다(SQL 표준)
            st.executeUpdate("UPDATE projects SET headline = summary, summary = headline");
            st.execute(rename("title", "service_name", postgres));
            st.execute(rename("headline", "project_subject", postgres));
            st.execute("COMMENT ON COLUMN projects.service_name IS '서비스 이름(예: MAKERY) — 카드 위 작은 파란 글씨 · 상세 제목'");
            st.execute("COMMENT ON COLUMN projects.project_subject IS '프로젝트 주제 — 카드의 큰 제목(비우면 서비스 이름)'");
            st.execute("COMMENT ON COLUMN projects.summary IS '한 줄 요약 — 카드 제목 아래 회색 줄 · 상세 화면 첫 문단'");
        }
    }

    private static String rename(String from, String to, boolean postgres) {
        return postgres
                ? "ALTER TABLE projects RENAME COLUMN " + from + " TO " + to
                : "ALTER TABLE projects ALTER COLUMN " + from + " RENAME TO " + to;
    }
}
