package egovframework.backoffice.post;

import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

/**
 * 표 한 줄(reviews · interviews · projects). 세 표의 칸을 모두 가지고, 그 표에 없는 칸은 비어 있다.
 * 목록(세 표를 합친 조회)에는 공통 칸과 후기 분야 · 기수만 채워진다.
 */
@Getter
@Setter
public class StoryRow {
    /** review · interview · project */
    private String kind;
    private Long id;
    private String title;
    private PostStatus status;
    private PostStatus statusBeforeTrash;
    private Long authorId;
    private String authorName;
    private LocalDateTime publishedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime deletedAt;

    // 공통 내용
    private String summary;
    private Integer cohort;
    private String seniorName;
    private String tags;
    /** 사진(JSON: photos · cover · img …) */
    private String photos;

    // 후기
    private String category;
    private String body;
    private Boolean showOnHub;

    // 인터뷰
    /** 반 · 직군(인터뷰만) */
    private String track;
    /** 질문과 답(JSON) */
    private String qa;
    private String videoUrl;
    private String videoLength;

    // 프로젝트
    private String className;
    private String major;
    private String teamName;
    private Integer teamSize;
    /** 프로젝트 주제(project_subject 칸) — 카드의 큰 제목 */
    private String headline;
    private String problem;
    private String features;
    private String tech;
    /** 자료 링크(JSON) */
    private String links;
}
