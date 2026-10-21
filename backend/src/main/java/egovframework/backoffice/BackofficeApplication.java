package egovframework.backoffice;

import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;

/** Standard Spring application configuration, loaded by the Servlet container. */
@Configuration(proxyBeanMethods = false)
@ComponentScan("egovframework.backoffice")
public class BackofficeApplication {
}
