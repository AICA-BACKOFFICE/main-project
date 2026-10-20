package egovframework.launcher;

import java.io.File;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.stream.Stream;

/**
 * 백오피스 전용 PostgreSQL(개발 실행용). 컴퓨터에 설치된 PostgreSQL 프로그램(initdb · pg_ctl)만 빌려 써서
 * 이 폴더의 data/postgres 에 백오피스만 쓰는 데이터베이스 서버를 만들고 켠다. 원래 있던 PostgreSQL 서버 · postgres 비밀번호는 건드리지 않는다.
 * <ul>
 *   <li>처음 한 번: initdb(관리 계정 = 설정의 datasource.username / password, 글자 UTF-8) → 켜기 → 데이터베이스 만들기</li>
 *   <li>다음부터: 꺼져 있으면 켜기. 이 도구가 켰으면 백오피스를 끌 때 같이 끈다</li>
 * </ul>
 * 설정 주소가 이 컴퓨터(127.0.0.1 · localhost)의 PostgreSQL일 때만 돈다. 다른 서버를 쓰려면 BACKOFFICE_DB_URL 로 그 주소를 주면 된다.
 * 데이터 폴더는 BACKOFFICE_PG_DATA 로 바꿀 수 있다(기본 ./data/postgres).
 */
final class LocalPostgres {
    private LocalPostgres() {}

    private static final String DOWNLOAD = "https://www.postgresql.org/download/";

    /** 필요하면 켜고, 이 도구가 켰으면 끝날 때 끄도록 한다. 관리하지 않는 주소면 아무것도 안 함 */
    static void ensureRunning() throws Exception {
        Properties config = DevConfig.load();
        String url = config.getProperty("datasource.url", "");
        if (!url.startsWith("jdbc:postgresql://")) {
            return;
        }
        URI uri = URI.create(url.substring("jdbc:".length()));
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if (!host.equals("127.0.0.1") && !host.equals("localhost")) {
            return;
        }
        int port = uri.getPort() > 0 ? uri.getPort() : 5432;
        String database = uri.getPath().replaceFirst("^/", "");
        String user = config.getProperty("datasource.username"), password = config.getProperty("datasource.password");
        Path data = Path.of(System.getenv().getOrDefault("BACKOFFICE_PG_DATA", "data/postgres")).toAbsolutePath().normalize();

        if (!listening(port)) {
            Path bin = findBin();
            if (!Files.isRegularFile(data.resolve("PG_VERSION"))) {
                System.out.println("백오피스 전용 PostgreSQL을 처음 만들어요: " + data);
                initdb(bin, data, user, password);
            }
            System.out.println("백오피스 전용 PostgreSQL을 켜요(포트 " + port + ")...");
            run(bin, data.getParent().resolve("postgres-start.log"), "pg_ctl", "start", "-w", "-t", "60", "-D", data.toString(),
                    "-l", data.getParent().resolve("postgres.log").toString(), "-o", "-p " + port);
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                try {
                    run(bin, data.getParent().resolve("postgres-stop.log"), "pg_ctl", "stop", "-m", "fast", "-D", data.toString());
                } catch (Exception ignored) {
                    // 끝나는 중이라 알릴 곳이 없어요(다음에 켤 때 PostgreSQL이 알아서 정리)
                }
            }, "postgres-stop"));
        }
        createDatabase(port, database, user, password);
    }

    private static boolean listening(int port) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress("127.0.0.1", port), 500);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    /** 데이터베이스(aica_backoffice)가 없으면 만든다 */
    private static void createDatabase(int port, String database, String user, String password) throws Exception {
        String admin = "jdbc:postgresql://127.0.0.1:" + port + "/postgres";
        try (Connection c = DriverManager.getConnection(admin, user, password)) {
            try (PreparedStatement ps = c.prepareStatement("SELECT 1 FROM pg_database WHERE datname = ?")) {
                ps.setString(1, database);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        return;
                    }
                }
            }
            if (!database.matches("[a-z_][a-z0-9_]*")) {
                throw new IllegalStateException("데이터베이스 이름이 올바르지 않아요: " + database);
            }
            try (Statement st = c.createStatement()) {
                st.execute("CREATE DATABASE " + database + " ENCODING 'UTF8' TEMPLATE template0");
            }
            System.out.println("데이터베이스를 만들었어요: " + database);
        }
    }

    private static void initdb(Path bin, Path data, String user, String password) throws Exception {
        Files.createDirectories(data.getParent());
        Path pw = Files.createTempFile("aica-pg", ".txt");
        try {
            Files.writeString(pw, password, StandardCharsets.UTF_8);
            run(bin, data.getParent().resolve("postgres-init.log"), "initdb", "-D", data.toString(), "-U", user, "-A", "scram-sha-256",
                    "--pwfile=" + pw, "-E", "UTF8", "--locale=C");
        } finally {
            Files.deleteIfExists(pw);
        }
    }

    /** PostgreSQL 프로그램을 돌린다. 화면 대신 로그 파일로(서버가 출력을 잡고 있어도 기다리지 않게) */
    private static void run(Path bin, Path log, String tool, String... args) throws Exception {
        List<String> cmd = new ArrayList<>();
        cmd.add(bin.resolve(tool + (windows() ? ".exe" : "")).toString());
        cmd.addAll(List.of(args));
        Process p = new ProcessBuilder(cmd).redirectErrorStream(true).redirectOutput(log.toFile()).redirectInput(ProcessBuilder.Redirect.from(new File(windows() ? "NUL" : "/dev/null"))).start();
        if (p.waitFor() != 0) {
            throw new IllegalStateException("PostgreSQL " + tool + " 이(가) 실패했어요. 자세한 내용: " + log + System.lineSeparator()
                    + Files.readString(log, StandardCharsets.UTF_8));
        }
    }

    /** initdb · pg_ctl 이 있는 폴더: PATH → 기본 설치 위치(Windows · macOS Postgres.app · Homebrew) 순서, 새 버전 먼저 */
    static Path findBin() {
        String exe = windows() ? "pg_ctl.exe" : "pg_ctl";
        for (String dir : System.getenv().getOrDefault("PATH", "").split(File.pathSeparator)) {
            if (!dir.isBlank() && Files.isRegularFile(Path.of(dir.trim(), exe))) {
                return Path.of(dir.trim());
            }
        }
        List<Path> roots = windows()
                ? List.of(Path.of("C:\\Program Files\\PostgreSQL"))
                : List.of(Path.of("/Applications/Postgres.app/Contents/Versions"), Path.of("/opt/homebrew/opt"), Path.of("/usr/local/opt"), Path.of("/usr/lib/postgresql"));
        for (Path root : roots) {
            if (!Files.isDirectory(root)) {
                continue;
            }
            try (Stream<Path> dirs = Files.list(root)) {
                Path found = dirs.map(d -> d.resolve("bin")).filter(b -> Files.isRegularFile(b.resolve(exe)))
                        .max(Comparator.comparing(b -> version(b.getParent().getFileName().toString()))).orElse(null);
                if (found != null) {
                    return found;
                }
            } catch (IOException ignored) {
                // 다음 위치에서 찾아요
            }
        }
        throw new IllegalStateException("PostgreSQL 프로그램(pg_ctl)을 찾지 못했어요. " + DOWNLOAD + " 에서 PostgreSQL 16 이상을 설치한 뒤 다시 켜 주세요."
                + " 설치할 때 정하는 postgres 비밀번호는 백오피스에서 쓰지 않아요.");
    }

    /** "17" · "postgresql@16" · "16.4" 같은 폴더 이름의 큰 번호 */
    private static int version(String name) {
        String digits = name.replaceAll("^\\D*(\\d+).*$", "$1");
        try {
            return Integer.parseInt(digits);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static boolean windows() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    }
}
