package cn.campus.ai.knowledge;

import static cn.campus.common.Json.*;

import java.net.*;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.stereotype.Component;

/** OpenAI-compatible text completions only. No images, private records, tools or redirects. */
@Component
public class CompatibleModelClient {
  public record Configuration(String base, String model, String key) {
    public boolean configured() {
      return !base.isBlank() && !model.isBlank() && !key.isBlank();
    }

    public URI endpoint() {
      URI u = URI.create(base.replaceAll("/+$", "") + "/chat/completions");
      boolean loopback =
          Set.of("localhost", "127.0.0.1", "[::1]", "::1")
              .contains(Objects.toString(u.getHost(), ""));
      if (u.getHost() == null
          || u.getUserInfo() != null
          || u.getRawQuery() != null
          || u.getFragment() != null
          || !(u.getScheme().equals("https") || u.getScheme().equals("http") && loopback))
        throw new IllegalArgumentException("模型接口须为HTTPS或本机回环地址");
      if (model.length() > 150
          || key.length() > 1000
          || key.indexOf('\n') >= 0
          || key.indexOf('\r') >= 0) throw new IllegalArgumentException("模型配置无效");
      return u;
    }
  }

  private volatile Configuration configuration;

  public Configuration configuration() {
    return configuration;
  }

  public void configure(Configuration next) {
    if (!next.base().isEmpty()) next.endpoint();
    configuration = next;
  }

  private final HttpClient client =
      HttpClient.newBuilder()
          .connectTimeout(Duration.ofSeconds(5))
          .followRedirects(HttpClient.Redirect.NEVER)
          .build();

  public CompatibleModelClient() {
    this(
        new Configuration(
            System.getenv().getOrDefault("ASSISTANT_API_BASE", ""),
            System.getenv().getOrDefault("ASSISTANT_MODEL", ""),
            System.getenv().getOrDefault("ASSISTANT_API_KEY", "")));
  }

  public CompatibleModelClient(Configuration configuration) {
    Configuration validated = configuration;
    try {
      if (configuration.configured()) configuration.endpoint();
    } catch (IllegalArgumentException error) {
      // Optional provider settings must not prevent the core application from starting.
      validated = new Configuration("", "", "");
      System.err.println(
          "Campus assistant model configuration invalid; retrieval remains available.");
    }
    this.configuration = validated;
  }

  public boolean configured() {
    return configuration.configured();
  }

  public String generate(String question, List<CampusRetriever.Hit> hits) throws Exception {
    return generate(question, hits, List.of(), false);
  }

  public String chat(
      String question,
      List<CampusRetriever.Hit> hits,
      List<cn.campus.ai.knowledge.dto.ChatQuestion.Turn> history)
      throws Exception {
    return generate(question, hits, history, true);
  }

  private String generate(
      String question,
      List<CampusRetriever.Hit> hits,
      List<cn.campus.ai.knowledge.dto.ChatQuestion.Turn> history,
      boolean chat)
      throws Exception {
    Configuration configuration = this.configuration;
    if (!configuration.configured()) throw new IllegalStateException("Model is not configured");
    StringBuilder facts = new StringBuilder();
    var ids = new HashSet<String>();
    for (var hit : hits) {
      var d = hit.document();
      if (facts.length() >= 10000) break;
      String text = d.text();
      text = text.substring(0, Math.min(text.length(), Math.min(2000, 10000 - facts.length())));
      facts
          .append("\n[资料编号 ")
          .append(d.id())
          .append("] ")
          .append(d.title())
          .append('\n')
          .append(text);
      ids.add(d.id());
    }
    String system = chat ? AssistantPrompts.CHAT : AssistantPrompts.SEARCH;
    var messages = new ArrayList<Map<String, Object>>();
    messages.add(obj("role", "system", "content", system));
    for (var turn : history) messages.add(obj("role", turn.role(), "content", turn.content()));
    messages.add(obj("role", "user", "content", "问题：" + question + "\n公开资料：" + facts));
    var body =
        obj(
            "model",
            configuration.model(),
            "stream",
            false,
            "messages",
            messages,
            "max_tokens",
            1500);
    var request =
        HttpRequest.newBuilder(configuration.endpoint())
            .timeout(Duration.ofSeconds(12))
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer " + configuration.key())
            .POST(HttpRequest.BodyPublishers.ofString(write(body)))
            .build();
    var pending = client.sendAsync(request, info -> new LimitedResponse());
    HttpResponse<byte[]> response;
    try {
      // Include the body in the deadline: a provider may send headers and then stall.
      response = pending.get(12, TimeUnit.SECONDS);
    } finally {
      if (!pending.isDone()) pending.cancel(true);
    }
    byte[] bytes = response.body();
    if (response.statusCode() != 200) throw new IllegalStateException("Model service unavailable");
    var result = parse(new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
    var choices = rows(result.get("choices"));
    if (choices.isEmpty()) throw new IllegalStateException("Model response invalid");
    String content = str(map(choices.getFirst().get("message")).get("content")).trim();
    if (content.startsWith("```"))
      content = content.replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", "");
    var answer = parse(content);
    String text = str(answer.get("answer")).trim();
    var citations = list(answer.get("sourceIds"));
    if (text.isBlank()
        || text.length() > 4000
        || (!chat && citations.isEmpty())
        || citations.size() > 6
        || citations.stream().anyMatch(id -> !(id instanceof String) || !ids.contains(id)))
      throw new IllegalStateException("Model citations invalid");
    return text;
  }

  private static final class LimitedResponse implements HttpResponse.BodySubscriber<byte[]> {
    private final HttpResponse.BodySubscriber<byte[]> delegate =
        HttpResponse.BodySubscribers.ofByteArray();
    private Flow.Subscription subscription;
    private long size;
    private boolean done;

    public CompletionStage<byte[]> getBody() {
      return delegate.getBody();
    }

    public void onSubscribe(Flow.Subscription value) {
      subscription = value;
      delegate.onSubscribe(value);
    }

    public void onNext(List<ByteBuffer> buffers) {
      if (done) return;
      for (var buffer : buffers) size += buffer.remaining();
      if (size > 512 * 1024) {
        done = true;
        subscription.cancel();
        delegate.onError(new IllegalStateException("Model response too large"));
      } else delegate.onNext(buffers);
    }

    public void onError(Throwable error) {
      if (!done) {
        done = true;
        delegate.onError(error);
      }
    }

    public void onComplete() {
      if (!done) {
        done = true;
        delegate.onComplete();
      }
    }
  }
}
