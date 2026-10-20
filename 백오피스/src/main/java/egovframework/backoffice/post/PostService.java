package egovframework.backoffice.post;

import egovframework.backoffice.common.NotFoundException;
import egovframework.backoffice.common.PageResult;
import egovframework.backoffice.post.story.StoryChangedEvent;
import egovframework.backoffice.post.story.StoryKind;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 게시물 조회·등록·수정·상태 변경. 글은 종류별 표(후기 · 인터뷰 · 프로젝트, {@link PostStore})에 있다. 휴지통은 {@link PostTrashService}. */
@Service
@Transactional
public class PostService {

    private final PostStore mapper;
    private final PostAssembler assembler;
    private final ApplicationEventPublisher events;
    private final PostAccess access;

    public PostService(PostStore mapper, PostAssembler assembler, ApplicationEventPublisher events, PostAccess access) {
        this.mapper = mapper;
        this.assembler = assembler;
        this.events = events;
        this.access = access;
    }

    @Transactional(readOnly = true)
    public PageResult<Post> search(PostSearch search) {
        List<Post> items = mapper.search(search);
        long total = mapper.countSearch(search);
        return new PageResult<>(items, search.getPage(), search.getSize(), total);
    }

    @Transactional(readOnly = true)
    public Post get(StoryKind kind, Long id) {
        Post post = mapper.findById(kind, id);
        if (post == null) {
            throw new NotFoundException("게시물을 찾을 수 없습니다.");
        }
        return post;
    }

    public Post create(PostForm form, Long authorId) {
        requireChoosable(form.getStatus());
        access.requireStatus(PostStatus.DRAFT, form.getStatus(), authorId);
        Post post = new Post();
        post.setAuthorId(authorId);
        apply(post, form);
        if (post.getStatus() == PostStatus.PUBLISHED) {
            post.setPublishedAt(LocalDateTime.now());
        }
        mapper.insert(post);
        events.publishEvent(new StoryChangedEvent(post.getId()));
        return post;
    }

    /** 고친 내용 저장. 글 종류를 바꾸면 새 종류의 표로 옮겨 번호가 바뀌므로, 저장된 글(새 종류 · 번호)을 돌려준다 */
    public Post update(StoryKind kind, Long id, PostForm form, Long adminId) {
        requireChoosable(form.getStatus());
        Post post = get(kind, id);
        access.requireEditable(post, adminId);
        access.requireStatus(post.getStatus(), form.getStatus(), adminId);
        apply(post, form);
        if (post.getStatus() == PostStatus.PUBLISHED && post.getPublishedAt() == null) {
            post.setPublishedAt(LocalDateTime.now());
        }
        mapper.update(post, kind);
        events.publishEvent(new StoryChangedEvent(post.getId()));
        return post;
    }

    @Transactional(readOnly = true)
    public Post getForEditing(StoryKind kind, Long id, Long adminId) {
        Post post = get(kind, id);
        access.requireEditable(post, adminId);
        return post;
    }

    public void changeStatus(StoryKind kind, Long id, PostStatus status) {
        if (!PostStatus.CHOOSABLE.contains(status)) {
            throw new egovframework.backoffice.common.BusinessException("삭제는 '휴지통으로 이동' 버튼으로 해 주세요.");
        }
        get(kind, id);
        mapper.updateStatus(kind, id, status);
        events.publishEvent(new StoryChangedEvent(id));
    }

    /** 삭제됨은 휴지통 버튼(PostTrashService)으로만 — 저장 · 상태 바꾸기로는 못 바꾼다 */
    private static void requireChoosable(PostStatus status) {
        if (status != null && !PostStatus.CHOOSABLE.contains(status)) {
            throw new IllegalArgumentException("삭제는 '휴지통으로 이동' 버튼으로 해 주세요.");
        }
    }

    /** 폼 입력을 정화해 게시물에 반영한다 (규칙은 {@link PostAssembler}). */
    public Post apply(Post post, PostForm form) {
        return assembler.apply(post, form);
    }

    /** 미리보기 렌더용: 저장된 JSON 을 블록 목록으로 */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> blocksOf(Post post) {
        return assembler.blocksOf(post.getBlocksJson());
    }

    /** 화면 레이아웃(없으면 기본값) */
    public egovframework.backoffice.editor.PostLayout layoutOf(Post post) {
        return assembler.layoutOf(post.getLayoutJson());
    }

    /** 목차 위젯용 제목 목록 */
    public List<Map<String, Object>> tocOf(List<Map<String, Object>> blocks) {
        return assembler.toc(blocks);
    }

    /** 사이드바·하단 위젯용: 최근 게시 글(현재 글 제외) */
    @Transactional(readOnly = true)
    public List<Post> recentPublished(Long excludeId, int limit) {
        return mapper.findPublishedStories().stream().filter(p -> excludeId == null || !excludeId.equals(p.getId())).limit(limit).toList();
    }

    /** 사이드바·하단 위젯용: 같은 종류의 게시 글(현재 글 제외) */
    @Transactional(readOnly = true)
    public List<Post> relatedPublished(Post post, int limit) {
        return mapper.findPublishedStories().stream()
                .filter(p -> !p.getId().equals(post.getId()) && (post.getCategoryId() == null || post.getCategoryId().equals(p.getCategoryId())))
                .limit(limit).toList();
    }
}
