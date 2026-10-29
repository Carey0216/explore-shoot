package cn.campus.tools;

import static cn.campus.common.Json.*;

import cn.campus.common.Json;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;

/** Publish only to the agreed repository, regardless of visibility. Releases remain immutable. */
public final class ReleasePublisher {
  private static final String REPO = "Carey0216/explore-shoot";
  private final Path root;
  private final Git git;
  private final HttpClient client =
      HttpClient.newBuilder()
          .connectTimeout(Duration.ofSeconds(10))
          .followRedirects(HttpClient.Redirect.NEVER)
          .build();
  private String token;

  public ReleasePublisher(Path root) {
    this.root = root;
    git = new Git(root);
  }

  public static void verifyRepository(Map<String, Object> repository) {
    if (!REPO.equalsIgnoreCase(str(repository.get("full_name"))))
      throw new IllegalStateException("仅可发布到本项目既有仓库");
  }

  public static String notes(String changes, Map<String, Object> entry) {
    String marker = "## " + entry.get("version") + " · " + entry.get("date");
    int start = changes.indexOf(marker);
    if (start < 0) throw new IllegalStateException("缺少版本的中文日志或日期不一致");
    String description =
        changes.substring(start + marker.length()).split("\\r?\\n## ", 2)[0].trim();
    if (description.isEmpty()) throw new IllegalStateException("版本日志为空");
    return "## 探索与拍摄 v"
        + entry.get("version")
        + "\n\n"
        + (entry.get("backfilledAt") != null
            ? "开发 / 验收日期："
                + entry.get("date")
                + "。此历史版本于 "
                + entry.get("backfilledAt")
                + " 补发 Release，未改写原有 main 历史。\n\n"
            : "")
        + (yes(entry.get("recovered"))
            ? "此版为从首次备份恢复的原型源码快照，恢复提交日期不是原始开发日期。源码来源和运行方式见归档 README.md。\n\n"
            : "")
        + "对应源码提交：`"
        + entry.get("commit")
        + "`。\n\n"
        + description;
  }

  public void run(String[] arguments) throws Exception {
    String mode = arguments.length == 0 ? "" : arguments[0];
    if (arguments.length > 1 || !Set.of("", "--check", "--list", "--history").contains(mode))
      throw new IllegalArgumentException("用法：release [--check|--list|--history]");
    if (!git.run("remote", "get-url", "origin").equals("https://github.com/" + REPO + ".git"))
      throw new IllegalStateException("仅可发布到本项目既有仓库");
    List<Map<String, Object>> entries =
        rows(
            Json.MAPPER.readValue(
                Files.readString(root.resolve("reference/releases.json")), Object.class));
    String current = str(parse(Files.readString(root.resolve("package.json"))).get("version")),
        changes = Files.readString(root.resolve("CHANGELOG.md"));
    Set<String> versions = new HashSet<>();
    for (var entry : entries) {
      String version = str(entry.get("version")), commit = str(entry.get("commit"));
      if (!version.matches("\\d+\\.\\d+\\.\\d+")
          || !versions.add(version)
          || !commit.matches("[a-f0-9]{40}")
          || !str(entry.get("date")).matches("\\d{4}-\\d{2}-\\d{2}")
          || str(entry.get("title")).isBlank()) throw new IllegalStateException("版本对应表格式错误或重复");
      git.run("cat-file", "-e", commit + "^{commit}");
      String old = str(parse(git.run("show", commit + ":package.json")).get("version"));
      if (!old.equals(version) && !(version.equals("2.0.1") && old.equals("2.0.0")))
        throw new IllegalStateException("版本与历史 package.json 不匹配：" + version);
      notes(changes, entry);
      if (!git.run("rev-parse", "v" + version + "^{commit}").equals(commit))
        throw new IllegalStateException("标签对应错误：" + version);
    }
    if (!versions.contains(current)) throw new IllegalStateException("请先记录当前版本的固定源码提交");
    ReleaseDocs.check(root, current, entries);
    int major=Integer.parseInt(current.split("\\.")[0]),minor=Integer.parseInt(current.split("\\.")[1]);
    if(!mode.equals("--list")&&(major>8||major==8&&minor>=2)){
      var visual=new ProcessBuilder("node","tools/visual/check-release.cjs","--release",current).directory(root.toFile()).inheritIO().start();
      if(!visual.waitFor(60,java.util.concurrent.TimeUnit.SECONDS)){visual.destroyForcibly();throw new IllegalStateException("双端截图检查超时");}
      if(visual.exitValue()!=0)throw new IllegalStateException("双端截图检查未通过；请按双端组件与验收规范完成本版真实截图和差异审查");
    }
    if (mode.equals("--check")) {
      System.out.println("版本、中文日志、源码和标签核对通过：" + entries.size() + " 个版本");
      return;
    }
    token = System.getenv("GITHUB_TOKEN");
    if (token == null || token.isBlank()) {
      String credential =
          git.runWithInput(
              "protocol=https\nhost=github.com\npath=" + REPO + ".git\n\n", "credential", "fill");
      token =
          credential
              .lines()
              .filter(l -> l.startsWith("password="))
              .map(l -> l.substring(9))
              .findFirst()
              .orElse(null);
    }
    if (token == null || token.isBlank()) throw new IllegalStateException("未找到现有 GitHub 登录凭据");
    try {
      verifyRepository(map(request("", null)));
      if (mode.equals("--list")) {
        List<Map<String, Object>> releases = rows(request("/releases?per_page=100", null));
        for (var entry : entries) {
          var release =
              releases.stream()
                  .filter(
                      r ->
                          eq(r.get("tag_name"), "v" + entry.get("version")) && !yes(r.get("draft")))
                  .findFirst()
                  .orElseThrow(() -> new IllegalStateException("缺少已发布版本"));
          System.out.println(release.get("tag_name") + " · " + release.get("html_url"));
        }
      } else {
        if (!git.run("status", "--porcelain").isEmpty())
          throw new IllegalStateException("工作区仍有未提交的更改");
        if (!git.run("ls-remote", "origin", "refs/heads/main")
            .split("\\s+")[0]
            .equals(git.run("rev-parse", "HEAD")))
          throw new IllegalStateException("main 尚未同步到 GitHub");
        String tags = git.run("ls-remote", "origin", "refs/tags/*");
        for (var entry : entries) {
          if (!mode.equals("--history") && !eq(entry.get("version"), current)) continue;
          String tag = "v" + entry.get("version"), ref = "refs/tags/" + tag;
          String remoteCommit =
              tags.lines()
                  .filter(l -> l.endsWith("\t" + ref + "^{}"))
                  .map(l -> l.split("\\s+")[0])
                  .findFirst()
                  .orElseGet(
                      () ->
                          tags.lines()
                              .filter(l -> l.endsWith("\t" + ref))
                              .map(l -> l.split("\\s+")[0])
                              .findFirst()
                              .orElse(""));
          if (!eq(remoteCommit, entry.get("commit")))
            throw new IllegalStateException("远端标签与固定源码不一致：" + tag);
          var existing = map(request("/releases/tags/" + tag, null));
          if (!existing.isEmpty()) {
            if (yes(existing.get("draft")) || yes(existing.get("prerelease")))
              throw new IllegalStateException("已有版本仍处于预发布状态");
            System.out.println("已存在，保留：" + existing.get("html_url"));
            continue;
          }
          var release =
              map(
                  request(
                      "/releases",
                      obj(
                          "tag_name",
                          tag,
                          "target_commitish",
                          entry.get("commit"),
                          "name",
                          tag + " · " + entry.get("title"),
                          "body",
                          notes(changes, entry),
                          "draft",
                          false,
                          "prerelease",
                          false,
                          "make_latest",
                          eq(entry.get("version"), current) ? "true" : "false")));
          System.out.println("已发布仓库版本：" + release.get("html_url"));
        }
      }
      if (!eq(map(request("/releases/latest", null)).get("tag_name"), "v" + current))
        throw new IllegalStateException("最新版本标识与当前版本不一致");
    } finally {
      token = null;
    }
  }

  private Object request(String endpoint, Map<String, Object> body) throws Exception {
    var builder =
        HttpRequest.newBuilder(URI.create("https://api.github.com/repos/" + REPO + endpoint))
            .timeout(Duration.ofSeconds(30))
            .header("Authorization", "Bearer " + token)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2026-03-10")
            .header("User-Agent", "explore-shoot-release");
    if (body != null)
      builder
          .header("Content-Type", "application/json")
          .POST(HttpRequest.BodyPublishers.ofString(write(body)));
    var response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() == 404 && body == null) return null;
    if (response.statusCode() < 200 || response.statusCode() >= 300)
      throw new IllegalStateException("GitHub API 返回 " + response.statusCode());
    return Json.MAPPER.readValue(response.body(), Object.class);
  }
}
