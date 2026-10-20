package egovframework.backoffice.account;

import egovframework.backoffice.config.BackofficeProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/** 관리자 계정이 하나도 없을 때 최초 SUPER_ADMIN 을 생성한다. 재기동 시 중복 생성하지 않는다. */
@Component
@Order(1)
public class InitialAdminRunner {

    private static final Logger log = LoggerFactory.getLogger(InitialAdminRunner.class);

    private final AdminUserService adminUserService;
    private final BackofficeProperties properties;

    public InitialAdminRunner(AdminUserService adminUserService, BackofficeProperties properties) {
        this.adminUserService = adminUserService;
        this.properties = properties;
    }

    @EventListener(ContextRefreshedEvent.class)
    @Order(1)
    public void run() {
        BackofficeProperties.InitialAdmin init = properties.getInitialAdmin();
        if (init.getPassword() == null || init.getPassword().isBlank()) {
            log.warn("backoffice.initial-admin.password 가 비어 있어 최초 관리자를 생성하지 않습니다.");
            return;
        }
        boolean created = adminUserService.createInitialSuperAdminIfEmpty(init.getLoginId(), init.getName(), init.getPassword());
        if (created) {
            log.info("최초 최상위 관리자 계정을 생성했습니다. loginId={} (최초 로그인 후 비밀번호를 변경하세요)", init.getLoginId());
        }
    }
}
