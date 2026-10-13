package egovframework.backoffice.common;

import java.util.List;
import lombok.Getter;

/** 목록 화면용 단순 페이징 결과. */
@Getter
public class PageResult<T> {
    private final List<T> items;
    private final int page;       // 1부터
    private final int size;
    private final long total;
    private final int totalPages;

    public PageResult(List<T> items, int page, int size, long total) {
        this.items = items;
        this.page = page;
        this.size = size;
        this.total = total;
        this.totalPages = (int) Math.max(1, (total + size - 1) / size);
    }

    public boolean isEmpty() {
        return items.isEmpty();
    }

    public boolean isHasPrev() {
        return page > 1;
    }

    public boolean isHasNext() {
        return page < totalPages;
    }

    /** 현재 페이지 주변 최대 5개 페이지 번호 */
    public List<Integer> getPageNumbers() {
        int start = Math.max(1, page - 2);
        int end = Math.min(totalPages, start + 4);
        start = Math.max(1, end - 4);
        return java.util.stream.IntStream.rangeClosed(start, end).boxed().toList();
    }

    public static int offset(int page, int size) {
        return (Math.max(page, 1) - 1) * size;
    }
}
