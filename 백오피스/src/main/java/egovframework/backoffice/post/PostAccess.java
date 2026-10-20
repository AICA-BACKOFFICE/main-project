package egovframework.backoffice.post;

import egovframework.backoffice.account.AdminRole;
import egovframework.backoffice.account.AdminUser;
import egovframework.backoffice.account.AdminUserMapper;
import java.util.Objects;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;

/** Shared server-side ownership and publication checks for every write path. */
@Component
public class PostAccess {
    private final AdminUserMapper users;
    public PostAccess(AdminUserMapper users) { this.users = users; }

    private AdminUser actor(Long id) {
        AdminUser user = id == null ? null : users.findById(id);
        if (user == null || !user.isActive()) throw new AccessDeniedException("활성 관리자 계정이 필요합니다.");
        return user;
    }

    public void requireEditable(Post post, Long actorId) {
        AdminUser user = actor(actorId);
        if (user.getRole() == AdminRole.SUPPORT && !Objects.equals(post.getAuthorId(), user.getId())) {
            throw new AccessDeniedException("서포터즈는 본인이 작성한 게시글만 수정할 수 있습니다.");
        }
    }

    public void requireStatus(PostStatus current, PostStatus requested, Long actorId) {
        if (actor(actorId).getRole() == AdminRole.SUPPORT && current != requested) {
            throw new AccessDeniedException("게시 상태 변경은 관리자만 가능합니다.");
        }
    }
}
