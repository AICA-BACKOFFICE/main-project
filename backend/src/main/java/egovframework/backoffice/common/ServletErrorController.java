package egovframework.backoffice.common;

import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.RequestMapping;

/** Container error dispatch without exposing exception details. */
@Controller
public class ServletErrorController {
    @RequestMapping("/error")
    public String error(HttpServletRequest request, HttpServletResponse response, Model model) {
        Object attribute = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);
        int status = attribute instanceof Integer value ? value : 500;
        response.setStatus(status);
        model.addAttribute("status", status);
        model.addAttribute("message", status == 404 ? "페이지를 찾을 수 없습니다." : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return "error";
    }
}
