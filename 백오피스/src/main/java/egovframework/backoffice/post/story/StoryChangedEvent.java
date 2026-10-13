package egovframework.backoffice.post.story;

/** 게시물이 저장·게시·미게시·휴지통·복원·완전 삭제되었음 — 커밋된 뒤 선배들의 이야기 사이트 데이터를 다시 쓴다({@link StorySiteService}). */
public record StoryChangedEvent(Long postId) {
}
