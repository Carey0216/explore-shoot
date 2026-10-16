package cn.campus.miniprogram;

import cn.campus.web.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Explicit user-only routes, using the same Java services and transaction boundary as the web. */
@RestController
public class MiniProgramController {
  private final RequestDispatcher dispatcher;

  public MiniProgramController(RequestDispatcher dispatcher) {
    this.dispatcher = dispatcher;
  }

  @RequestMapping("/api/mini/**")
  public void handle(HttpServletRequest request, HttpServletResponse response) throws IOException {
    dispatcher.handle(new MiniProgramRequest(request), response);
  }
}
