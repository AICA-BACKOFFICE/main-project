package egovframework.backoffice.config;

import java.util.LinkedHashSet;
import java.util.Set;
import org.springframework.beans.MutablePropertyValues;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.PropertySource;
import org.springframework.context.support.PropertySourcesPlaceholderConfigurer;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.EnumerablePropertySource;
import org.springframework.validation.DataBinder;

/** Explicit property loading and binding, independent of Spring Boot. */
@Configuration(proxyBeanMethods = false)
@PropertySource(value = "classpath:backoffice.properties", encoding = "UTF-8")
@PropertySource(value = "file:${backoffice.config:./config/backoffice.properties}", ignoreResourceNotFound = true, encoding = "UTF-8")
public class ApplicationConfig {
    @Bean
    static PropertySourcesPlaceholderConfigurer propertyPlaceholders() {
        return new PropertySourcesPlaceholderConfigurer();
    }

    @Bean
    BackofficeProperties backofficeProperties(ConfigurableEnvironment environment) {
        BackofficeProperties properties = new BackofficeProperties();
        Set<String> containerSettings = Set.of("backoffice.config", "backoffice.port", "backoffice.bind", "backoffice.h2-console");
        Set<String> names = new LinkedHashSet<>();
        environment.getPropertySources().forEach(source -> {
            if (source instanceof EnumerablePropertySource<?> enumerable) {
                for (String name : enumerable.getPropertyNames()) {
                    if (name.startsWith("backoffice.") && !containerSettings.contains(name)) names.add(name);
                }
            }
        });
        if (names.stream().anyMatch(name -> name.startsWith("backoffice.pages.items["))) {
            properties.getPages().getItems().clear();
        }
        MutablePropertyValues values = new MutablePropertyValues();
        for (String name : names) {
            String path = java.util.regex.Pattern.compile("-([a-z])").matcher(name.substring("backoffice.".length()))
                    .replaceAll(match -> match.group(1).toUpperCase(java.util.Locale.ROOT));
            values.add(path, environment.getProperty(name));
        }
        DataBinder binder = new DataBinder(properties);
        binder.setIgnoreUnknownFields(false);
        binder.bind(values);
        if (binder.getBindingResult().hasErrors()) {
            throw new IllegalStateException("백오피스 설정을 확인해 주세요: " + binder.getBindingResult().getFieldErrors().stream().map(e -> e.getField()).toList());
        }
        return properties;
    }
}
