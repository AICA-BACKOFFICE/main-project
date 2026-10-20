package egovframework.launcher;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import org.flywaydb.core.Flyway;

/**
 * 예전 H2 파일 DB(data/backoffice.mv.db)의 관리자 데이터를 PostgreSQL로 옮기는 한 번용 도구(개발 프로필).
 * <ol>
 *   <li>PostgreSQL에 백오피스 표(Flyway V1~)를 만들고</li>
 *   <li>두 DB에 다 있는 표의 행을 모두 옮긴 뒤(외래 키 순서대로) 번호 매기기(identity)를 다음 번호로 맞춘다.</li>
 * </ol>
 * 백오피스를 켤 때({@link LocalTomcatServer}) PostgreSQL 데이터베이스가 아직 비어 있고 예전 H2 파일이 있으면 저절로 한 번 옮긴다({@link #copyIfFresh()}).
 * 손으로 다시 옮기려면(이미 있는 PostgreSQL 내용은 지움):
 * <pre>
 *   mvnw -Pdev compile exec:java "-Dexec.args=--copy-h2 --replace [--from ./data/backoffice]"
 * </pre>
 * 접속 정보는 백오피스와 같은 설정(src/main/resources/backoffice.properties 의 datasource.* · 환경변수 BACKOFFICE_DB_*)을 쓴다.
 */
public final class H2ToPostgres {
    private H2ToPostgres() {}

    private static final Set<String> SKIP = Set.of("flyway_schema_history");
    private static final String DEFAULT_FROM = "./data/backoffice";

    /** PostgreSQL 데이터베이스가 처음(Flyway 기록 없음)이고 예전 H2 파일이 있으면 옮긴다. 옮겼으면 true */
    static boolean copyIfFresh() throws Exception {
        Properties config = DevConfig.load();
        String url = config.getProperty("datasource.url", "");
        String from = System.getenv().getOrDefault("BACKOFFICE_H2_FROM", DEFAULT_FROM);
        if (!url.startsWith("jdbc:postgresql:") || !Files.isRegularFile(Path.of(from + ".mv.db"))) {
            return false;
        }
        try (Connection dst = DriverManager.getConnection(url, config.getProperty("datasource.username"), config.getProperty("datasource.password"))) {
            if (tables(dst).contains("flyway_schema_history")) {
                return false;
            }
        }
        System.out.println("처음 PostgreSQL을 써요. 예전 관리자 데이터(H2)를 옮길게요.");
        copy(from, false);
        return true;
    }

    /** --from 예전 H2 파일(.mv.db 앞까지) · --replace PostgreSQL에 있던 내용을 지우고 옮김 */
    static void run(List<String> args) throws Exception {
        copy(option(args, "--from", DEFAULT_FROM), args.contains("--replace"));
    }

    private static void copy(String from, boolean replace) throws Exception {
        Properties config = DevConfig.load();
        String url = config.getProperty("datasource.url"), user = config.getProperty("datasource.username"), password = config.getProperty("datasource.password");
        if (!url.startsWith("jdbc:postgresql:")) {
            throw new IllegalStateException("옮길 곳이 PostgreSQL이 아니에요: " + url);
        }
        Path h2File = Path.of(from + ".mv.db");
        if (!Files.isRegularFile(h2File)) {
            throw new IllegalStateException("예전 H2 데이터 파일이 없어요: " + h2File.toAbsolutePath());
        }
        System.out.println("옮기기: " + h2File.toAbsolutePath() + " → " + url + " (" + user + ")");

        Flyway.configure().dataSource(url, user, password).locations("classpath:db/migration").load().migrate();
        String h2Url = "jdbc:h2:file:" + from + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;IFEXISTS=TRUE;ACCESS_MODE_DATA=r";
        try (Connection src = DriverManager.getConnection(h2Url, "sa", ""); Connection dst = DriverManager.getConnection(url, user, password)) {
            dst.setAutoCommit(false);
            List<String> tables = order(dst, common(src, dst));
            long existing = count(dst, "posts");
            if (existing > 0 && !replace) {
                throw new IllegalStateException("PostgreSQL에 이미 게시물이 " + existing + "개 있어요. 지우고 다시 옮기려면 --replace 를 붙여 주세요.");
            }
            // PostgreSQL 쪽 표는 모두 비우고(예전 H2에 없던 표 — 생활 꿀팁 · FAQ — 는 백오피스가 켤 때 사이트 페이지에서 다시 옮김) 옮겨요
            Set<String> all = tables(dst);
            all.removeAll(SKIP);
            try (Statement st = dst.createStatement()) {
                st.execute("TRUNCATE " + String.join(", ", all) + " RESTART IDENTITY CASCADE");
            }
            Map<String, Integer> copied = new LinkedHashMap<>();
            for (String table : tables) {
                copied.put(table, copy(src, dst, table));
            }
            for (String table : tables) {
                resetIdentity(dst, table);
            }
            dst.commit();
            copied.forEach((t, n) -> System.out.printf("  %-22s %6d행%n", t, n));
            System.out.println("다 옮겼어요. 이제 백오피스를 켜면 PostgreSQL을 써요.");
        }
    }

    /** 두 DB에 다 있는 표(Flyway 기록 빼고) */
    private static Set<String> common(Connection src, Connection dst) throws SQLException {
        Set<String> a = tables(src), b = tables(dst);
        a.retainAll(b);
        a.removeAll(SKIP);
        return a;
    }

    private static Set<String> tables(Connection c) throws SQLException {
        Set<String> out = new LinkedHashSet<>();
        try (ResultSet rs = c.getMetaData().getTables(null, "public", "%", new String[] {"TABLE"})) {
            while (rs.next()) {
                out.add(rs.getString("TABLE_NAME").toLowerCase(Locale.ROOT));
            }
        }
        return out;
    }

    /** 외래 키가 가리키는 표가 먼저 오게 */
    private static List<String> order(Connection dst, Set<String> tables) throws SQLException {
        DatabaseMetaData meta = dst.getMetaData();
        Map<String, Set<String>> needs = new HashMap<>();
        for (String t : tables) {
            Set<String> parents = new HashSet<>();
            try (ResultSet rs = meta.getImportedKeys(null, "public", t)) {
                while (rs.next()) {
                    String parent = rs.getString("PKTABLE_NAME").toLowerCase(Locale.ROOT);
                    if (!parent.equals(t) && tables.contains(parent)) {
                        parents.add(parent);
                    }
                }
            }
            needs.put(t, parents);
        }
        List<String> out = new ArrayList<>();
        while (out.size() < tables.size()) {
            boolean progress = false;
            for (String t : tables) {
                if (!out.contains(t) && out.containsAll(needs.get(t))) {
                    out.add(t);
                    progress = true;
                }
            }
            if (!progress) {
                throw new IllegalStateException("표 사이 외래 키가 돌고 있어 순서를 정하지 못했어요: " + needs);
            }
        }
        return out;
    }

    /** 표 하나의 행을 모두 옮긴다. 자기 자신을 가리키는 표(카테고리 위/아래)는 위 행이 먼저 들어가게 번호 순으로 */
    private static int copy(Connection src, Connection dst, String table) throws SQLException {
        List<String> cols = new ArrayList<>();
        Map<String, Integer> types = new HashMap<>();
        try (ResultSet rs = dst.getMetaData().getColumns(null, "public", table, "%")) {
            while (rs.next()) {
                types.put(rs.getString("COLUMN_NAME").toLowerCase(Locale.ROOT), rs.getInt("DATA_TYPE"));
            }
        }
        List<Object[]> rows = new ArrayList<>();
        boolean hasId = types.containsKey("id");
        try (Statement st = src.createStatement(); ResultSet rs = st.executeQuery("SELECT * FROM " + table + (hasId ? " ORDER BY id" : ""))) {
            ResultSetMetaData md = rs.getMetaData();
            for (int i = 1; i <= md.getColumnCount(); i++) {
                String name = md.getColumnName(i).toLowerCase(Locale.ROOT);
                if (types.containsKey(name)) {
                    cols.add(name);
                }
            }
            while (rs.next()) {
                Object[] row = new Object[cols.size()];
                for (int i = 0; i < cols.size(); i++) {
                    int t = types.get(cols.get(i));
                    row[i] = t == Types.VARCHAR || t == Types.LONGVARCHAR || t == Types.CLOB || t == Types.CHAR ? rs.getString(cols.get(i)) : rs.getObject(cols.get(i));
                }
                rows.add(row);
            }
        }
        if (rows.isEmpty()) {
            return 0;
        }
        // id 는 GENERATED BY DEFAULT AS IDENTITY 라 옮긴 번호 그대로 넣을 수 있다
        String sql = "INSERT INTO " + table + " (" + String.join(", ", cols) + ") VALUES (" + "?, ".repeat(cols.size() - 1) + "?)";
        try (PreparedStatement ps = dst.prepareStatement(sql)) {
            for (Object[] row : rows) {
                for (int i = 0; i < row.length; i++) {
                    ps.setObject(i + 1, row[i]);
                }
                ps.addBatch();
            }
            ps.executeBatch();
        }
        return rows.size();
    }

    /** identity 번호를 지금 가장 큰 번호 다음으로(새로 쓰는 글이 옮긴 글 번호와 겹치지 않게). id 칸이 없는 표(공지 닫음 기록 등)는 건너뜀 */
    private static void resetIdentity(Connection dst, String table) throws SQLException {
        try (ResultSet cols = dst.getMetaData().getColumns(null, "public", table, "id")) {
            if (!cols.next()) {
                return;
            }
        }
        String seq;
        try (Statement st = dst.createStatement(); ResultSet rs = st.executeQuery("SELECT pg_get_serial_sequence('" + table + "', 'id')")) {
            seq = rs.next() ? rs.getString(1) : null;
        }
        if (seq != null) {
            try (Statement st = dst.createStatement()) {
                st.execute("SELECT setval('" + seq + "', COALESCE((SELECT MAX(id) FROM " + table + "), 0) + 1, false)");
            }
        }
    }

    private static long count(Connection c, String table) throws SQLException {
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM " + table)) {
            return rs.next() ? rs.getLong(1) : 0;
        }
    }

    private static String option(List<String> args, String name, String def) {
        int i = args.indexOf(name);
        return i >= 0 && i + 1 < args.size() ? args.get(i + 1) : def;
    }
}
