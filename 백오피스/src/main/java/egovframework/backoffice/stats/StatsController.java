package egovframework.backoffice.stats;

import egovframework.backoffice.account.CurrentAdmin;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
public class StatsController {

    private final StatsService statsService;

    public StatsController(StatsService statsService) {
        this.statsService = statsService;
    }

    /** 대시보드(로그인 후 첫 화면) */
    @GetMapping("/admin")
    public String dashboard(@AuthenticationPrincipal CurrentAdmin me, Model model) {
        if (me != null && !me.getRole().canManageContent()) {
            return "redirect:/admin/posts";
        }
        model.addAttribute("menu", "dashboard");
        StatsService.Summary monthly = statsService.summary(30);
        model.addAttribute("stats", monthly);
        model.addAttribute("weekly", statsService.summary(7));
        // 그래프용 단순 데이터 (템플릿에서 JSON 으로 인라인)
        java.time.format.DateTimeFormatter dayFmt = java.time.format.DateTimeFormatter.ofPattern("d");
        java.time.format.DateTimeFormatter monFmt = java.time.format.DateTimeFormatter.ofPattern("M월");
        java.util.List<java.util.Map<String, Object>> chart = new java.util.ArrayList<>();
        for (DailyStat d : monthly.getDaily()) {
            java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("d", d.getDay().format(dayFmt));
            m.put("m", d.getDay().format(monFmt));
            m.put("v", d.getVisitors());
            chart.add(m);
        }
        model.addAttribute("chart", chart);
        return "dashboard/index";
    }

    /** 방문자·조회수 통계 */
    @GetMapping("/admin/stats")
    public String stats(@RequestParam(defaultValue = "14") int days, Model model) {
        int range = days == 7 || days == 14 || days == 30 ? days : 14;
        model.addAttribute("menu", "stats");
        model.addAttribute("range", range);
        model.addAttribute("stats", statsService.summary(range));
        return "stats/index";
    }
}
