package egovframework.backoffice.media;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ImageMapper {
    int insert(ImageFile image);

    ImageFile findById(@Param("id") Long id);

    List<ImageFile> findRecent(@Param("limit") int limit);

    /**
     * 분류·종류·키워드 검색. categoryId 가 있으면 그 카테고리(세부 지정 시 세부까지), unfiled 면 미분류만, 둘 다 없으면 전체.
     */
    List<ImageFile> search(@Param("q") MediaQuery q, @Param("limit") int limit, @Param("offset") int offset);

    long count(@Param("q") MediaQuery q);

    /** 카테고리(1단) id 별 건수: [{id, cnt}] */
    List<CountRow> countByCategory();

    /** 세부 카테고리 id 별 건수 */
    List<CountRow> countBySubCategory();

    long countUnfiled();

    long countByKind(@Param("kind") String kind);

    long sumSizeBytes();

    int updateDisplayName(@Param("id") Long id, @Param("displayName") String displayName);

    int updateCategory(@Param("id") Long id, @Param("categoryId") Long categoryId, @Param("subCategoryId") Long subCategoryId);

    int delete(@Param("id") Long id);

    /** 집계 행 */
    class CountRow {
        private Long id;
        private long cnt;

        public Long getId() { return id; }
        public void setId(Long id) { this.id = id; }
        public long getCnt() { return cnt; }
        public void setCnt(long cnt) { this.cnt = cnt; }
    }
}
