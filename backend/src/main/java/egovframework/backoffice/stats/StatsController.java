package egovframework.backoffice.stats;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

/** 방문 통계 화면: 7 · 14 · 30일 방문자 · 페이지뷰 · 게시물 조회와 많이 본 글. 서포터즈도 같이 본다 */
@Controller
public class StatsController {

    private final StatsService statsService;

    public StatsController(StatsService statsService) {
        this.statsService = statsService;
    }

    @GetMapping("/admin/stats")
    public String stats(@RequestParam(defaultValue = "14") int days, Model model) {
        int range = days == 7 || days == 14 || days == 30 ? days : 14;
        model.addAttribute("menu", "stats");
        model.addAttribute("range", range);
        model.addAttribute("stats", statsService.summary(range));
        model.addAttribute("topPosts", statsService.topPosts(0, 10));
        return "stats/index";
    }
}
