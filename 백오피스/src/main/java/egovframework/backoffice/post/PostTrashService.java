package egovframework.backoffice.post;

import egovframework.backoffice.common.NotFoundException;
import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.common.PageResult;
import egovframework.backoffice.post.story.StoryChangedEvent;
import egovframework.backoffice.post.version.PostVersionService;
import java.util.List;
import java.util.LinkedHashSet;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.access.prepost.PreAuthorize;

/** 휴지통: 이동(soft delete) · 목록 · 복원 · 완전 삭제. */
@Service
@Transactional
public class PostTrashService {

    private final PostMapper mapper;
    private final PostService posts;
    private final PostVersionService versions;
    private final ApplicationEventPublisher events;

    public PostTrashService(PostMapper mapper, PostService posts, PostVersionService versions, ApplicationEventPublisher events) {
        this.mapper = mapper;
        this.posts = posts;
        this.versions = versions;
        this.events = events;
    }

    /**
     * 휴지통으로 이동. 이동 직전 상태를 status_before_trash 에 남기고 상태를 미게시(HIDDEN)로 바꾼다 —
     * 게시중이던 글은 그 즉시 공개가 중단된다(선배들의 이야기 글은 사이트에서도 바로 내려간다).
     */
    public void moveToTrash(Long id) {
        posts.get(id);
        mapper.softDelete(id);
        events.publishEvent(new StoryChangedEvent(id));
    }

    @Transactional(readOnly = true)
    public PageResult<Post> search(PostSearch search) {
        List<Post> items = mapper.findTrash(search);
        long total = mapper.countTrash(search);
        return new PageResult<>(items, search.getPage(), search.getSize(), total);
    }

    @Transactional(readOnly = true)
    public Post getDeleted(Long id) {
        Post post = mapper.findDeletedById(id);
        if (post == null) {
            throw new NotFoundException("휴지통에서 게시물을 찾을 수 없습니다.");
        }
        return post;
    }

    public record TrashSnapshot(long count, String token) {}

    private TrashSnapshot snapshot(List<Post> rows) {
        String state = rows.stream().map(p -> p.getId() + ":" + p.getDeletedAt()).collect(Collectors.joining("|"));
        try {
            return new TrashSnapshot(rows.size(), HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(state.getBytes(StandardCharsets.UTF_8))));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    @Transactional(readOnly = true)
    public TrashSnapshot overview() {
        return snapshot(mapper.findAllDeleted());
    }

    @PreAuthorize("hasAnyRole('SUPER_ADMIN','ADMIN') and (#action != 'purge' or hasRole('SUPER_ADMIN'))")
    public int bulk(List<Long> requested, String action) {
        if (!List.of("restore", "purge").contains(action)) throw new BusinessException("작업을 확인해 주세요.");
        if (requested == null || requested.isEmpty() || requested.size() > 100
                || requested.stream().anyMatch(id -> id == null || id <= 0)) {
            throw new BusinessException("현재 페이지에서 게시물을 선택해 주세요.");
        }
        List<Long> ids = List.copyOf(new LinkedHashSet<>(requested));
        List<Post> locked = mapper.lockDeleted(ids);
        if (locked.size() != ids.size()) throw new BusinessException("휴지통 목록이 변경되었습니다. 새로고침 후 다시 선택해 주세요.");
        for (Post post : locked) {
            if ("restore".equals(action)) mapper.restore(post.getId());
            else purgeLocked(post.getId());
        }
        if ("restore".equals(action)) events.publishEvent(new StoryChangedEvent(locked.get(0).getId()));
        return locked.size();
    }

    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public int empty(String expectedSnapshot) {
        List<Post> locked = mapper.lockAllDeleted();
        if (!snapshot(locked).token().equals(expectedSnapshot)) {
            throw new BusinessException("휴지통 목록이 변경되었습니다. 새로고침 후 전체 개수를 다시 확인해 주세요.");
        }
        for (Post post : locked) purgeLocked(post.getId());
        return locked.size();
    }

    private void purgeLocked(Long id) {
        versions.deleteByPost(id);
        mapper.deleteViewLogs(id);
        mapper.hardDelete(id);
    }

    /** 복원 → 휴지통으로 옮기기 전 상태로 글 관리 목록에 돌아간다(게시중이었으면 다시 게시중 — 선배들의 이야기 글은 사이트에도 다시 올라간다). */
    public Post restore(Long id) {
        Post before = getDeleted(id);
        mapper.restore(id);
        events.publishEvent(new StoryChangedEvent(id));
        return before;
    }

    /** 완전 삭제 — 휴지통에 있는 글만 가능하며 되돌릴 수 없다. 이력·조회 로그를 먼저 지운다(FK). */
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public void purge(Long id) {
        getDeleted(id);
        versions.deleteByPost(id);
        mapper.deleteViewLogs(id);
        mapper.hardDelete(id);
        events.publishEvent(new StoryChangedEvent(id));
    }
}
