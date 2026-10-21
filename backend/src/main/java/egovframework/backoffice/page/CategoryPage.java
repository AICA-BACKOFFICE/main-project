package egovframework.backoffice.page;

import java.nio.file.Path;

/**
 * 카테고리 페이지(인사교 알아보기 · 선배들의 이야기 · 인사교 라이프 · 지원 전 체크) 한 장.
 *
 * @param id    주소와 임시저장 파일 이름에 쓰는 영문 id (about 등)
 * @param title 사이드바·편집 화면에 보이는 이름
 * @param file  사이트 폴더 기준 파일 경로 (about/index.html)
 * @param path  실제 파일 위치
 */
public record CategoryPage(String id, String title, String file, Path path) {

    /** 페이지 파일이 있는 폴더 (올린 그림은 이 폴더의 assets/uploads 에 둔다) */
    public Path dir() {
        return path.getParent();
    }
}
