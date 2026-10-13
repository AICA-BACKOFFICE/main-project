package egovframework.backoffice.post.version;

import egovframework.backoffice.common.NotFoundException;
import egovframework.backoffice.post.Post;
import egovframework.backoffice.post.PostAssembler;
import egovframework.backoffice.post.PostForm;
import egovframework.backoffice.post.PostMapper;
import egovframework.backoffice.post.story.StoryChangedEvent;
import java.util.List;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 게시물 버전 이력. 저장·발행마다 스냅샷을 남기고(발행 이력은 모두, 그 외는 최근 {@value #KEEP}개),
 * 복원은 "현재 상태 백업 → 스냅샷으로 교체 → 복원 기록" 순으로 진행한다.
 */
@Service
@Transactional
public class PostVersionService {

    /** 게시물당 보관하는 저장 이력 수(발행 이력은 별도로 모두 보관) */
    public static final int KEEP = 20;

    private final PostVersionMapper mapper;
    private final PostMapper posts;
    private final PostAssembler assembler;
    private final ApplicationEventPublisher events;

    public PostVersionService(PostVersionMapper mapper, PostMapper posts, PostAssembler assembler, ApplicationEventPublisher events) {
        this.mapper = mapper;
        this.posts = posts;
        this.assembler = assembler;
        this.events = events;
    }

    private Post livePost(Long postId) {
        Post post = posts.findById(postId);
        if (post == null) {
            throw new NotFoundException("게시물을 찾을 수 없습니다.");
        }
        return post;
    }

    public void record(Post post, String reason, Long adminId) {
        mapper.insert(PostVersion.of(post, reason, adminId));
        mapper.prune(post.getId(), KEEP);
    }

    @Transactional(readOnly = true)
    public List<PostVersion> versionsOf(Long postId) {
        livePost(postId);
        return mapper.findByPost(postId, 100);
    }

    @Transactional(readOnly = true)
    public PostVersion version(Long postId, Long versionId) {
        livePost(postId);
        PostVersion v = mapper.findById(postId, versionId);
        if (v == null) {
            throw new NotFoundException("버전을 찾을 수 없습니다.");
        }
        return v;
    }

    /**
     * 선택한 버전으로 되돌린다. 현재 내용을 먼저 '복원 전 백업'으로 남기고,
     * 제목·요약·카테고리·본문·대표이미지·레이아웃을 스냅샷 값으로 교체한다. 공개 상태(status)는 바꾸지 않는다.
     */
    public void restore(Long postId, Long versionId, Long adminId) {
        Post post = livePost(postId);
        PostVersion v = version(postId, versionId);
        record(post, PostVersion.RESTORE_BACKUP, adminId);

        PostForm form = new PostForm();
        form.setTitle(v.getTitle());
        form.setSummary(v.getSummary());
        form.setCategoryId(v.getCategoryId());
        form.setSubCategoryId(v.getSubCategoryId());
        form.setThumbnailMode(v.getThumbnailMode());
        form.setThumbnailUrl(v.getThumbnailUrl());
        form.setStatus(post.getStatus());
        form.setBlocksJson(v.getBlocksJson());
        form.setLayoutJson(v.getLayoutJson());
        form.setStoryJson(v.getStoryJson());
        assembler.apply(post, form);
        posts.update(post);
        record(post, PostVersion.RESTORE, adminId);
        events.publishEvent(new StoryChangedEvent(postId));
    }

    /** 스냅샷 JSON → 블록 목록 (이력 응답용) */
    @Transactional(readOnly = true)
    public List<java.util.Map<String, Object>> blocksOf(PostVersion v) {
        return assembler.blocksOf(v.getBlocksJson());
    }

    /** 게시물 완전 삭제 전 호출 */
    public void deleteByPost(Long postId) {
        mapper.deleteByPost(postId);
    }
}
