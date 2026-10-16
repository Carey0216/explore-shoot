package cn.campus.web;

import cn.campus.common.*;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.*;

/** One safe error response for web, native, asynchronous model and navigation requests. */
public final class ApiErrors {
  public record ErrorBody(String error, String code, String requestId) {}

  public static void send(HttpServletResponse response, Throwable failure) throws IOException {
    while ((failure instanceof CompletionException || failure instanceof ExecutionException)
        && failure.getCause() != null) failure = failure.getCause();
    if (response.isCommitted()) return;
    int status = failure instanceof ApiException a ? a.status : 500;
    String code =
        switch (status) {
          case 400, 415 -> "invalid_request";
          case 401 -> "authentication_required";
          case 403 -> "forbidden";
          case 404 -> "not_found";
          case 409 -> "revision_conflict";
          case 429 -> "rate_limited";
          case 503 -> "service_unavailable";
          default -> "request_failed";
        };
    String id = UUID.randomUUID().toString();
    response.setStatus(status);
    response.setContentType("application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Request-ID", id);
    response
        .getOutputStream()
        .write(
            Json.write(
                    new ErrorBody(
                        failure instanceof ApiException ? failure.getMessage() : "服务暂时不可用，请重试",
                        code,
                        id))
                .getBytes(StandardCharsets.UTF_8));
    if (!(failure instanceof ApiException))
      System.err.println("Request " + id + " failed: " + failure.getClass().getSimpleName());
  }
}
