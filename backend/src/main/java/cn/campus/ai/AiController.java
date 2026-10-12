package cn.campus.ai;

import cn.campus.web.RequestDispatcher;
import jakarta.servlet.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
public class AiController {
  private final RequestDispatcher dispatcher;

  public AiController(RequestDispatcher dispatcher) {
    this.dispatcher = dispatcher;
  }

  @RequestMapping({"/api/translation", "/api/navigation/voices", "/api/navigation/speech"})
  public void handle(HttpServletRequest request, HttpServletResponse response)
      throws java.io.IOException {
    dispatcher.handle(request, response);
  }
}
