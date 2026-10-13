package egovframework.backoffice.faq;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

/** FAQ 관리 — 메뉴와 화면 틀만 준비. 기능(질문 등록·답변·답변대기 관리)은 후속 구현. */
@Controller
public class FaqController {

    @GetMapping("/admin/faq")
    public String index(Model model) {
        model.addAttribute("menu", "faq");
        return "faq/index";
    }
}
