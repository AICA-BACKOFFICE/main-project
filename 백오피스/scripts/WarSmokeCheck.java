import java.net.CookieManager;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.regex.Pattern;
import org.apache.catalina.Context;
import org.apache.catalina.startup.Tomcat;

/** Runs a packaged WAR with only Tomcat on the server classpath; uses an isolated test configuration. */
class WarSmokeCheck {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    private static String field(String html, String name) {
        var match = Pattern.compile("name=\"" + name + "\"[^>]*value=\"([^\"]+)\"").matcher(html);
        if (!match.find()) throw new AssertionError("Missing form field: " + name);
        return match.group(1);
    }
    public static void main(String[] args) throws Exception {
        check(args.length == 2, "Usage: WarSmokeCheck.java /absolute/path/backoffice.war /absolute/path/test.properties");
        Path config = Path.of(args[1]).toAbsolutePath();
        check(Files.isRegularFile(config), "Isolated test properties required");
        var properties = new java.util.Properties();
        try (var reader = Files.newBufferedReader(config, StandardCharsets.UTF_8)) { properties.load(reader); }
        check(properties.getProperty("datasource.url", "").startsWith("jdbc:h2:mem:"), "Smoke test requires an in-memory database");
        System.setProperty("backoffice.config", config.toString());
        Tomcat tomcat = new Tomcat();
        Path base = Path.of("target/war-smoke").toAbsolutePath(); Files.createDirectories(base.resolve("webapps"));
        tomcat.setBaseDir(base.toString()); tomcat.setPort(0);
        tomcat.getConnector().setProperty("address", "127.0.0.1");
        tomcat.getConnector().setProperty("maxSwallowSize", "-1");
        tomcat.setAddDefaultWebXmlToWebapp(false);
        Context context = tomcat.addWebapp("", Path.of(args[0]).toAbsolutePath().toString());
        context.addMimeMapping("css", "text/css"); context.addMimeMapping("js", "application/javascript");
        try {
            tomcat.start(); check(context.getState().isAvailable(), "WAR deployment failed");
            String origin = "http://127.0.0.1:" + tomcat.getConnector().getLocalPort();
            HttpClient client = HttpClient.newBuilder().cookieHandler(new CookieManager()).connectTimeout(Duration.ofSeconds(10)).build();
            java.util.function.Function<String, HttpResponse<String>> get = path -> {
                try { return client.send(HttpRequest.newBuilder(URI.create(origin + path)).timeout(Duration.ofSeconds(15)).GET().build(), HttpResponse.BodyHandlers.ofString()); }
                catch (Exception e) { throw new RuntimeException(e); }
            };
            var login = get.apply("/login"); check(login.statusCode() == 200 && login.body().contains("로그인"), "UTF-8 login page");
            check(get.apply("/css/admin.css").statusCode() == 200, "Static CSS");
            check(get.apply("/js/post/trash.js").statusCode() == 200, "Static trash script");
            check(get.apply("/admin").statusCode() == 302, "Anonymous administrator access blocked");
            String csrf = field(login.body(), "_csrf");
            String body = "loginId=admin&password=" + URLEncoder.encode(properties.getProperty("backoffice.initial-admin.password"), StandardCharsets.UTF_8) + "&_csrf=" + URLEncoder.encode(csrf, StandardCharsets.UTF_8);
            var authenticated = client.send(HttpRequest.newBuilder(URI.create(origin + "/login")).header("Content-Type", "application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
            String destination = authenticated.headers().firstValue("Location").orElse("");
            check(authenticated.statusCode() == 302 && URI.create(destination).getPath().equals("/admin"), "Real servlet form login: status=" + authenticated.statusCode() + ", redirect=" + destination);
            check(get.apply("/admin").statusCode() == 200, "Authenticated dashboard");
            check(get.apply("/admin/posts/trash").body().contains("trash-select-all"), "Trash bulk controls");
            check(get.apply("/admin/pages/about/edit").statusCode() == 200, "Page editor");
            var session = get.apply("/admin/session");
            var token = Pattern.compile("\"token\":\"([^\"]+)\"").matcher(session.body()); check(token.find(), "Session CSRF token");
            var denied = client.send(HttpRequest.newBuilder(URI.create(origin + "/admin/posts/trash/empty")).POST(HttpRequest.BodyPublishers.ofString("snapshot=invalid")).header("Content-Type", "application/x-www-form-urlencoded").build(), HttpResponse.BodyHandlers.ofString());
            check(denied.statusCode() == 403, "Mutation without CSRF blocked");
            byte[] png = {(byte)137,80,78,71,13,10,26,10,0,0,0,13};
            var bytes = new java.io.ByteArrayOutputStream();
            bytes.write("--smoke-boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test.png\"\r\nContent-Type: image/png\r\n\r\n".getBytes(StandardCharsets.UTF_8));
            bytes.write(png); bytes.write("\r\n--smoke-boundary--\r\n".getBytes(StandardCharsets.UTF_8));
            var upload = client.send(HttpRequest.newBuilder(URI.create(origin + "/admin/images")).header("Content-Type", "multipart/form-data; boundary=smoke-boundary").header("X-CSRF-TOKEN", token.group(1)).POST(HttpRequest.BodyPublishers.ofByteArray(bytes.toByteArray())).build(), HttpResponse.BodyHandlers.ofString());
            check(upload.statusCode() == 200, "Real multipart upload: " + upload.statusCode());
            var image = Pattern.compile("\"url\":\"([^\"]+)\"").matcher(upload.body()); check(image.find(), "Uploaded image URL");
            var served = get.apply(image.group(1)); check(served.statusCode() == 200 && served.headers().firstValue("Content-Type").orElse("").equals("image/png"), "Binary content type without text charset");
            var missing = get.apply("/admin/not-a-real-page"); check(missing.statusCode() == 404 && !missing.body().contains("Exception"), "Container 404 error handling");
            System.out.println("WAR_SMOKE_OK: login, UTF-8, static files, authentication, page editor, trash, CSRF, multipart upload, binary resources, 404");
        } finally { tomcat.stop(); tomcat.destroy(); }
    }
}
