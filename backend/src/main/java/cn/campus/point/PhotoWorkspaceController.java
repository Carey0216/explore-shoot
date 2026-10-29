package cn.campus.point;

import cn.campus.web.RequestDispatcher;
import jakarta.servlet.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
public record PhotoWorkspaceController(RequestDispatcher dispatcher) {
  @RequestMapping({
    "/api/weather",
    "/api/client-health",
    "/api/client-performance",
    "/api/photography/timing",
    "/api/my/memories",
    "/api/my/memories/**"
  })
  public void handle(HttpServletRequest request, HttpServletResponse response)
      throws java.io.IOException {
    dispatcher.handle(request, response);
  }
}
