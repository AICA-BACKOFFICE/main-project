package egovframework.launcher;

import egovframework.backoffice.config.BackofficeWebApplicationInitializer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import org.apache.catalina.Context;
import org.apache.catalina.startup.Tomcat;
import org.apache.tomcat.util.descriptor.web.ErrorPage;
import org.springframework.web.SpringServletContainerInitializer;

/** Optional local Tomcat launcher; production uses the default standard WAR. */
public final class LocalTomcatServer {
    private LocalTomcatServer() {}

    public static void main(String[] args) throws Exception {
        // 관리자 데이터는 PostgreSQL: 이 컴퓨터의 백오피스 전용 서버(data/postgres)를 먼저 켜요
        LocalPostgres.ensureRunning();
        // 예전 H2 파일 DB(data/backoffice.mv.db)와 그걸 옮기던 도구(H2ToPostgres)는 2026-10-21 없앴어요. 새 DB는 Flyway가 표를 만들고,
        // 선배들의 이야기 글은 사이트 사본(stories-data.js), 인사교 라이프는 페이지에서 처음 켤 때 가져와요
        String bind = System.getProperty("backoffice.bind", System.getenv().getOrDefault("BACKOFFICE_BIND", "127.0.0.1"));
        int port = Integer.parseInt(System.getProperty("backoffice.port", System.getenv().getOrDefault("BACKOFFICE_PORT", "8080")));
        Path base = Path.of("target", "tomcat-" + port).toAbsolutePath();
        Files.createDirectories(base.resolve("webroot"));
        Tomcat tomcat = new Tomcat();
        tomcat.setBaseDir(base.toString());
        tomcat.setPort(port);
        tomcat.getConnector().setProperty("address", bind);
        tomcat.getConnector().setProperty("maxSwallowSize", "-1");
        tomcat.getConnector().setMaxPostSize(205 * 1024 * 1024);
        Context context = tomcat.addContext("", base.resolve("webroot").toString());
        context.setParentClassLoader(LocalTomcatServer.class.getClassLoader());
        context.addServletContainerInitializer(new SpringServletContainerInitializer(), Set.of(BackofficeWebApplicationInitializer.class));
        for (int status : new int[]{404, 500}) {
            ErrorPage error = new ErrorPage(); error.setErrorCode(status); error.setLocation("/error"); context.addErrorPage(error);
        }
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try { tomcat.stop(); tomcat.destroy(); } catch (Exception ignored) { }
        }, "backoffice-shutdown"));
        tomcat.start();
        if (!context.getState().isAvailable()) {
            tomcat.stop(); tomcat.destroy();
            throw new IllegalStateException("백오피스 시작 실패. 위 오류를 확인해 주세요.");
        }
        System.out.println("AICA Spring MVC: http://" + bind + ":" + port + "/");
        tomcat.getServer().await();
    }
}
