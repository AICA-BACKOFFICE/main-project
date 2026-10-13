package egovframework.backoffice.post.version;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface PostVersionMapper {
    int insert(PostVersion version);

    /** 목록(본문 제외) — 최신순 */
    List<PostVersion> findByPost(@Param("postId") Long postId, @Param("limit") int limit);

    PostVersion findById(@Param("postId") Long postId, @Param("id") Long id);

    /** 발행 이력은 모두 보관, 그 외 이력은 최근 keep 개만 남긴다 */
    int prune(@Param("postId") Long postId, @Param("keep") int keep);

    int deleteByPost(@Param("postId") Long postId);
}
