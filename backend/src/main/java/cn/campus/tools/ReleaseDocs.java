package cn.campus.tools;

import static cn.campus.common.Json.*;

import java.nio.file.*;
import java.util.*;
import java.util.function.Function;
import java.util.regex.Pattern;

public final class ReleaseDocs {
  public static void check(Path root, String current, List<Map<String, Object>> entries)
      throws Exception {
    check(
        current,
        entries,
        file -> {
          try {
            return Files.readString(root.resolve(file));
          } catch (Exception e) {
            throw new IllegalStateException(e);
          }
        });
  }

  public static void check(
      String current, List<Map<String, Object>> entries, Function<String, String> read) {
    String display = current.endsWith(".0") ? current.substring(0, current.length() - 2) : current;
    String history = read.apply("版本考古与回退.md"), readme = read.apply("README.md");
    require(history.contains("当前 **v" + current + "**"), "回退文档的当前版本未同步");
    for (var entry : entries)
      require(
          history.contains(
              "| "
                  + entry.get("date")
                  + " | `v"
                  + entry.get("version")
                  + "` | `"
                  + str(entry.get("commit")).substring(0, 7)
                  + "` |"),
          "回退文档的源码对应错误：" + entry.get("version"));
    require(
        Pattern.compile("^# .+ v" + Pattern.quote(display) + "\\r?$", Pattern.MULTILINE)
                .matcher(readme)
                .find()
            && readme.contains("源码标签 `v" + current + "`"),
        "README 当前版本未同步");
    require(
        Pattern.compile("校园探索试点 v" + Pattern.quote(display) + "\\s*</span>")
                .matcher(read.apply("dist/user/index.html"))
                .find()
            || read.apply("dist/user/index.html")
                .contains("name=\"application-version\" content=\"" + current + "\""),
        "用户端版本显示未同步");
    String acceptance = read.apply("验收记录.md");
    require(acceptance.contains("## v" + display + " 当前发布验收"), "验收记录缺少当前发布版本");
    String[] sections = acceptance.split("\\r?\\n## ", 3);
    String currentAcceptance = sections[0] + (sections.length > 1 ? sections[1] : "");
    for (String body : List.of(readme.split("\\r?\\n## [^\\n]*历史实现", 2)[0], currentAcceptance)) {
      require(
          !Pattern.compile("此分支等待|（联调候选）|尚未正式发布|未创建正式标签或 Release").matcher(body).find(),
          "文档仍包含候选发布状态");
      var match =
          Pattern.compile("(?:Latest|当前发布版本|当前正式版本)[^。\\n]{0,30}?v(\\d+\\.\\d+(?:\\.\\d+)?)")
              .matcher(body);
      while (match.find()) {
        String version = match.group(1);
        if (version.split("\\.").length == 2) version += ".0";
        require(version.equals(current), "文档的当前版本未同步");
      }
    }
  }

  private static void require(boolean condition, String error) {
    if (!condition) throw new IllegalStateException(error);
  }
}
