package cn.campus.maps;

import cn.campus.web.RequestDispatcher;
import jakarta.servlet.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
public class MapController {
  private final RequestDispatcher dispatcher;

  public MapController(RequestDispatcher dispatcher) {
    this.dispatcher = dispatcher;
  }

  @RequestMapping({"/_AMapService/**"})
  public void handle(HttpServletRequest request, HttpServletResponse response)
      throws java.io.IOException {
    dispatcher.handle(request, response);
  }
}
