package egovframework.backoffice.common;

import org.springframework.http.HttpStatus;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

/** 화면 요청의 공통 오류 처리. (REST 컨트롤러는 각자 @ExceptionHandler 로 JSON 응답) */
@ControllerAdvice(annotations = org.springframework.stereotype.Controller.class)
public class GlobalExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public String notFound(NotFoundException e, Model model) {
        model.addAttribute("status", 404);
        model.addAttribute("message", e.getMessage());
        return "error";
    }

    @ExceptionHandler(BusinessException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public String business(BusinessException e, Model model) {
        model.addAttribute("status", 400);
        model.addAttribute("message", e.getMessage());
        return "error";
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public Object tooLarge(jakarta.servlet.http.HttpServletRequest request, Model model) {
        String message = "업로드 용량 제한을 초과했습니다 (이미지 10MB · 문서 20MB · 동영상 200MB). 파일을 줄여서 다시 올려 주세요.";
        // 에디터의 fetch 업로드(/admin/images)에는 JSON 으로 응답
        if (request.getRequestURI().startsWith("/admin/images")) {
            return org.springframework.http.ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                    .body(java.util.Map.of("message", message));
        }
        model.addAttribute("status", 400);
        model.addAttribute("message", message);
        return new org.springframework.web.servlet.ModelAndView("error", model.asMap(), HttpStatus.BAD_REQUEST);
    }
}
