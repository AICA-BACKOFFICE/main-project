package egovframework.backoffice.account;

import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class AdminUser {
    private Long id;
    private String loginId;
    private String name;
    private String passwordHash;
    private AdminRole role;
    private boolean active;
    private boolean mustChangePw;
    private LocalDateTime lastLoginAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
