package egovframework.backoffice.account;

/** 관리자 역할. 1차 초안은 2단계로 시작하고, 정책 확정 시 조정한다. */
public enum AdminRole {
    SUPER_ADMIN("최상위 관리자", "관리자 계정 관리 포함 전체 기능"),
    ADMIN("관리자", "게시물·카테고리·이미지·통계"),
    SUPPORT("서포터", "게시물 등록·수정만 가능 (삭제·게시 상태 변경·카테고리·통계·계정 관리 불가)");

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

    /** 게시물 삭제·상태 변경, 카테고리 관리, 통계 열람 권한 */
    public boolean canManageContent() {
        return this != SUPPORT;
    }

    public String authority() {
        return "ROLE_" + name();
    }
}
