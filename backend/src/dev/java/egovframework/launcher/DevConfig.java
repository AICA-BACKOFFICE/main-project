package egovframework.launcher;

import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Properties;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 개발 실행 도구가 읽는 백오피스 설정: backoffice.properties 의 ${환경변수:기본값} 을 앱과 같은 규칙으로 푼다. */
final class DevConfig {
    private DevConfig() {}

    private static final Pattern PLACEHOLDER = Pattern.compile("\\$\\{([A-Z0-9_]+):([^}]*)}");

    static Properties load() {
        Properties raw = new Properties();
        try (var in = DevConfig.class.getResourceAsStream("/backoffice.properties")) {
            raw.load(new InputStreamReader(in, StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("backoffice.properties 를 읽지 못했어요.", e);
        }
        Properties out = new Properties();
        for (String key : raw.stringPropertyNames()) {
            Matcher m = PLACEHOLDER.matcher(raw.getProperty(key));
            StringBuilder sb = new StringBuilder();
            while (m.find()) {
                String env = System.getenv(m.group(1));
                m.appendReplacement(sb, Matcher.quoteReplacement(env != null ? env : m.group(2)));
            }
            m.appendTail(sb);
            out.setProperty(key, sb.toString());
        }
        return out;
    }
}
