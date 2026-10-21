package egovframework.backoffice.stats;

import egovframework.backoffice.post.PostStatus;
import egovframework.backoffice.post.story.StoryKind;
import lombok.Getter;
import lombok.Setter;

/** 많이 본 글 한 줄: 글 종류 + 번호(표마다 1번부터) · 제목 · 상태 · 조회 수 */
@Getter
@Setter
public class TopPost {
    /** review · interview · project */
    private String postType;
    private Long postId;
    private String title;
    private PostStatus status;
    private Long authorId;
    private long views;

    /** 후기 · 인터뷰 · 프로젝트 */
    public String getKindLabel() {
        StoryKind kind = StoryKind.ofSlug(postType);
        return kind == null ? "-" : kind.label();
    }
}
