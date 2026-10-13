package egovframework.backoffice.common;

/** 사용자에게 그대로 보여줄 수 있는 업무 규칙 위반 메시지. */
public class BusinessException extends RuntimeException {
    public BusinessException(String message) {
        super(message);
    }
}
