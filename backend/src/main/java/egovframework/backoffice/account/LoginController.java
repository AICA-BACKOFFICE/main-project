package egovframework.backoffice.account;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class LoginController {

    @GetMapping("/login")
    public String login() {
        return "account/login";
    }

    @GetMapping("/")
    public String root() {
        return "redirect:/admin";
    }
}
