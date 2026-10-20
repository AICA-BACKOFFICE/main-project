package egovframework.backoffice.post;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 후기(reviews) · 인터뷰(interviews) · 프로젝트(projects) 표. 목록 · 휴지통은 세 표를 합쳐(UNION ALL) 보고,
 * 글 하나는 그 글이 있는 표에서 읽고 쓴다. 글 번호는 표마다 1번부터라(V19) 글은 늘 종류 + 번호로 찾는다.
 * table 인자는 {@link PostStore} 가 정한 표 이름(reviews · interviews · projects)만 넣는다.
 */
@Mapper
public interface StoryTableMapper {

    /** kind: review · interview · project(없으면 전체), category: 후기 분야 */
    List<StoryRow> search(@Param("s") PostSearch search, @Param("kind") String kind, @Param("category") String category);

    long countSearch(@Param("s") PostSearch search, @Param("kind") String kind, @Param("category") String category);

    List<StoryRow> findTrash(@Param("s") PostSearch search);

    long countTrash(@Param("s") PostSearch search);

    /** 휴지통 전체(번호 · 지운 시각) */
    List<StoryRow> findAllDeleted();

    /** 관리자 홈: 기수별 인터뷰 · 프로젝트 수(휴지통 제외) — [{cohort, cnt}] */
    List<java.util.Map<String, Object>> interviewCohorts();

    List<java.util.Map<String, Object>> projectCohorts();

    /** 세 표의 글 수(휴지통 포함) — 비어 있으면 사이트 사본에서 가져온다 */
    long countAll();

    StoryRow findReview(@Param("id") Long id);

    StoryRow findInterview(@Param("id") Long id);

    StoryRow findProject(@Param("id") Long id);

    List<StoryRow> publishedReviews();

    List<StoryRow> publishedInterviews();

    List<StoryRow> publishedProjects();

    int insertReview(StoryRow row);

    int insertInterview(StoryRow row);

    int insertProject(StoryRow row);

    int updateReview(StoryRow row);

    int updateInterview(StoryRow row);

    int updateProject(StoryRow row);

    int updateStatus(@Param("table") String table, @Param("id") Long id, @Param("status") PostStatus status);

    int softDelete(@Param("table") String table, @Param("id") Long id);

    int restore(@Param("table") String table, @Param("id") Long id);

    int hardDelete(@Param("table") String table, @Param("id") Long id);

    /** 글 종류를 바꿀 때: 원래 표에서 지운다(휴지통 아님) */
    int deleteLive(@Param("table") String table, @Param("id") Long id);

    List<StoryRow> lockDeleted(@Param("table") String table, @Param("ids") List<Long> ids);

    List<StoryRow> lockAllDeleted(@Param("table") String table);
}
