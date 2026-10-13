package egovframework.backoffice.post;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface PostMapper {
    List<Post> search(@Param("s") PostSearch search);

    long countSearch(@Param("s") PostSearch search);

    Post findById(@Param("id") Long id);

    /** 프론트 공개용: 게시중 + 미삭제 */
    Post findPublishedById(@Param("id") Long id);

    List<Post> findPublished(@Param("categorySlug") String categorySlug, @Param("subSlug") String subSlug,
                             @Param("offset") int offset, @Param("limit") int limit);

    long countPublished(@Param("categorySlug") String categorySlug, @Param("subSlug") String subSlug);

    int insert(Post post);

    int update(Post post);

    int softDelete(@Param("id") Long id);

    /** 휴지통(삭제된 글) 목록 */
    List<Post> findTrash(@Param("s") PostSearch search);

    long countTrash(@Param("s") PostSearch search);

    Post findDeletedById(@Param("id") Long id);

    int restore(@Param("id") Long id);

    int deleteViewLogs(@Param("id") Long id);

    int hardDelete(@Param("id") Long id);

    int updateStatus(@Param("id") Long id, @Param("status") PostStatus status);

    int increaseViewCount(@Param("id") Long id);

    long countAll();

    long countByStatus(@Param("status") PostStatus status);

    List<Post> findTopViewed(@Param("limit") int limit);

    List<Post> findRecent(@Param("limit") int limit);

    /** 선배들의 이야기 사이트 데이터용: 게시중인 고정 양식 글, 최신 게시 순 */
    List<Post> findPublishedStories();

    /** 고정 양식 글(휴지통 포함)이 있는지 */
    long countStoryById(@Param("id") Long id);
}
