package cn.campus.miniprogram;

import cn.campus.web.RequestDispatcher;
import jakarta.servlet.http.*;
import java.io.IOException;
import org.springframework.web.bind.annotation.*;

@RestController
public class ShareCodeController {
  private final RequestDispatcher dispatcher;

  public ShareCodeController(RequestDispatcher dispatcher) {
    this.dispatcher = dispatcher;
  }

  @GetMapping("/api/share/mini-code")
  public void handle(HttpServletRequest request, HttpServletResponse response) throws IOException {
    dispatcher.handle(request, response);
  }
}
