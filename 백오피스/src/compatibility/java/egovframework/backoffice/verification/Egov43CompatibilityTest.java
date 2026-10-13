package egovframework.backoffice.verification;

import java.util.Locale;
import java.util.Map;
import org.apache.ibatis.session.SqlSessionFactory;
import org.egovframe.rte.fdl.cmmn.EgovAbstractServiceImpl;
import org.egovframe.rte.fdl.cmmn.trace.LeaveaTrace;
import org.egovframe.rte.psl.dataaccess.EgovAbstractMapper;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.support.StaticMessageSource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Positive compatibility expectations. Failures are real Stage 0 blockers:
 * they must NOT be skipped, inverted, or treated as production approval.
 */
class Egov43CompatibilityTest {
    @Test
    void mapperWithExplicitWiringCanReadAndRollback() throws Exception {
        try (var context = new AnnotationConfigApplicationContext(Stage0DatabaseTest.ProbeConfiguration.class)) {
            var mapper = new ProbeMapper();
            mapper.setSqlSessionFactory(context.getBean(SqlSessionFactory.class));
            mapper.afterPropertiesSet();
            var tx = new TransactionTemplate(context.getBean(PlatformTransactionManager.class));
            tx.executeWithoutResult(status -> {
                mapper.insert("stage0.Probe.insert", Map.of("id", 7, "value", "egov probe"));
                assertThat(mapper.<String>selectOne("stage0.Probe.value", Map.of("id", 7)))
                        .isEqualTo("egov probe");
                status.setRollbackOnly();
            });
            assertThat(mapper.<Integer>selectOne("stage0.Probe.count")).isZero();
        }
    }

    @Test
    void inheritedResourceInjectionShouldInitializeMapperWithoutAdapter() {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.register(Stage0DatabaseTest.ProbeConfiguration.class);
            context.registerBean("probeMapper", ProbeMapper.class);
            context.refresh();
            assertThat(context.getBean(ProbeMapper.class).<Integer>selectOne("stage0.Probe.count")).isZero();
        }
    }

    @Test
    void inheritedResourceInjectionShouldInitializeServiceWithoutAdapter() {
        try (var context = new AnnotationConfigApplicationContext()) {
            var messages = new StaticMessageSource();
            messages.addMessage("stage0.message", Locale.getDefault(), "stage0 message");
            context.registerBean("messageSource", StaticMessageSource.class, () -> messages);
            context.registerBean("leaveaTrace", LeaveaTrace.class);
            context.registerBean("probeService", ProbeService.class);
            context.refresh();
            var service = context.getBean(ProbeService.class);
            assertThat(ReflectionTestUtils.getField(service, "messageSource"))
                    .as("RTE 4.3 javax.annotation.Resource must be injected by Spring 6")
                    .isSameAs(messages);
            assertThat(service.messageException().getMessage()).isEqualTo("stage0 message");
        }
    }

    public static class ProbeMapper extends EgovAbstractMapper {}
    public static class ProbeService extends EgovAbstractServiceImpl {
        Exception messageException() { return processException("stage0.message"); }
    }
}
