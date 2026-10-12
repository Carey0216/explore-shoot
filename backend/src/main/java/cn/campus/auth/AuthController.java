package cn.campus.auth;

import cn.campus.web.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** All entry points share authentication, origin checks and transaction handling. */
@RestController
public class AuthController {
  private final RequestDispatcher dispatcher;

  public AuthController(RequestDispatcher dispatcher) {
    this.dispatcher = dispatcher;
  }

  @RequestMapping({"/api/auth/**"})
  public void handle(HttpServletRequest request, HttpServletResponse response) throws IOException {
    dispatcher.handle(request, response);
  }
}
