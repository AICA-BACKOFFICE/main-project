package egovframework.testsupport;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import egovframework.backoffice.config.LauncherController.BrowserVisits;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.filter.CharacterEncodingFilter;

/** Uses the production Spring configuration and security chain, without Boot test infrastructure. */
@Configuration(proxyBeanMethods = false)
public class CmsMockMvcConfig {
    @Bean @Lazy
    MockMvc mockMvc(WebApplicationContext context, BrowserVisits visits) {
        return MockMvcBuilders.webAppContextSetup(context)
                .addFilters(new CharacterEncodingFilter("UTF-8", true, false), visits)
                .apply(springSecurity()).build();
    }
}
