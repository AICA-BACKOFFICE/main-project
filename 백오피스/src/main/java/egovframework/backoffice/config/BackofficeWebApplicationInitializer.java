package egovframework.backoffice.config;

import egovframework.backoffice.BackofficeApplication;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.Filter;
import jakarta.servlet.MultipartConfigElement;
import jakarta.servlet.ServletContext;
import jakarta.servlet.ServletException;
import java.util.EnumSet;
import org.springframework.web.WebApplicationInitializer;
import org.springframework.web.context.ContextLoaderListener;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.filter.CharacterEncodingFilter;
import org.springframework.web.filter.DelegatingFilterProxy;
import org.springframework.web.servlet.DispatcherServlet;

/** Servlet 6 / Tomcat 10.1 entrypoint, discovered from the standard WAR. */
public class BackofficeWebApplicationInitializer implements WebApplicationInitializer {
    @Override
    public void onStartup(ServletContext container) throws ServletException {
        AnnotationConfigWebApplicationContext context = new AnnotationConfigWebApplicationContext();
        context.register(BackofficeApplication.class);
        container.addListener(new ContextLoaderListener(context));
        container.setSessionTimeout(30);
        container.getSessionCookieConfig().setHttpOnly(true);

        var dispatcher = container.addServlet("dispatcher", new DispatcherServlet(context));
        dispatcher.setLoadOnStartup(1);
        dispatcher.setAsyncSupported(true);
        dispatcher.addMapping("/");
        dispatcher.setMultipartConfig(new MultipartConfigElement("", 200L * 1024 * 1024, 205L * 1024 * 1024, 0));

        registerFilter(container, "encoding", new CharacterEncodingFilter("UTF-8", true, false));
        registerFilter(container, "springSecurityFilterChain", new DelegatingFilterProxy("springSecurityFilterChain", context));
        registerFilter(container, "browserVisitsFilter", new DelegatingFilterProxy("browserVisitsFilter", context));

        if (Boolean.parseBoolean(System.getProperty("backoffice.h2-console", System.getenv().getOrDefault("BACKOFFICE_H2_CONSOLE", "false")))) {
            try {
                @SuppressWarnings("unchecked")
                Class<? extends jakarta.servlet.Servlet> servlet = (Class<? extends jakarta.servlet.Servlet>) Class.forName("org.h2.server.web.JakartaWebServlet");
                container.addServlet("h2-console", servlet).addMapping("/h2-console/*");
            } catch (ClassNotFoundException e) {
                throw new ServletException("H2 콘솔 클래스를 찾을 수 없습니다.", e);
            }
        }
    }

    private void registerFilter(ServletContext container, String name, Filter filter) {
        var registration = container.addFilter(name, filter);
        registration.setAsyncSupported(true);
        registration.addMappingForUrlPatterns(EnumSet.of(DispatcherType.REQUEST, DispatcherType.ASYNC, DispatcherType.ERROR), true, "/*");
    }
}
