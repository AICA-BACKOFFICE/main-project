package egovframework.backoffice.account;

/** 운영 권한 정책: 최상위 관리자 · 관리자 · 서포터즈. */
public enum AdminRole {
    SUPER_ADMIN("최상위 관리자", "관리자 계정 관리 포함 전체 기능"),
    ADMIN("관리자", "게시물·사이트 페이지·미디어 관리·통계 (계정 관리·영구 삭제 불가)"),
    SUPPORT("서포터즈", "게시물 작성·본인 글 수정·이미지/영상 업로드·전체 통계 조회");

    private final String label;
    private final String description;

    AdminRole(String label, String description) {
        this.label = label;
        this.description = description;
    }

    public String getLabel() {
        return label;
    }

    public String getDescription() {
        return description;
    }

    /** 게시 상태·사이트 페이지·미디어 정리·휴지통 이동/복원 권한 */
    public boolean canManageContent() {
        return this != SUPPORT;
    }

    public String authority() {
        return "ROLE_" + name();
    }
}
