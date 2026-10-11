package cn.campus.tools;

import static cn.campus.Json.*;

import com.fasterxml.jackson.core.util.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Pattern;

/** Development-only public UI translations. Parsing frontend syntax remains with Acorn/parse5. */
public final class I18nGenerator {
  public static List<String> placeholders(String text) {
    List<String> slots = new ArrayList<>();
    var matcher = Pattern.compile("\\{\\w+\\}").matcher(text);
    while (matcher.find()) slots.add(matcher.group());
    Collections.sort(slots);
    return slots;
  }

  private static String extract(Path root) throws Exception {
    var process =
        new ProcessBuilder("node", root.resolve("tools/extract-i18n.cjs").toString())
            .directory(root.toFile())
            .start();
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var stdout = executor.submit(() -> process.getInputStream().readNBytes(2000001));
      var stderr = executor.submit(() -> process.getErrorStream().readAllBytes());
      if (!process.waitFor(30, TimeUnit.SECONDS)) {
        process.destroyForcibly();
        throw new IOException("界面文案提取超时");
      }
      byte[] bytes = stdout.get();
      stderr.get();
      if (process.exitValue() != 0 || bytes.length > 2000000)
        throw new IOException("界面文案提取失败；请先运行 npm ci");
      return new String(bytes, StandardCharsets.UTF_8);
    }
  }

  public static void run(Path root, String[] args) throws Exception {
    if (args.length > 1 || args.length == 1 && !args[0].equals("--check"))
      throw new IllegalArgumentException("用法：i18n [--check]");
    var input = parse(extract(root));
    var current = list(input.get("current"));
    Set<Object> manual = new HashSet<>(map(input.get("manual")).keySet());
    Map<String, Object> generated = new LinkedHashMap<>();
    for (Object value : list(input.get("known"))) {
      var row = list(value);
      if (row.size() != 2) throw new IOException("生成文案格式无效");
      if (current.contains(row.getFirst()) && !manual.contains(row.getFirst()))
        generated.put(str(row.getFirst()), row.get(1));
    }
    List<String> missing =
        current.stream()
            .map(cn.campus.Json::str)
            .filter(text -> !manual.contains(text) && !generated.containsKey(text))
            .toList();
    if (args.length == 1) {
      if (!missing.isEmpty()) throw new IllegalStateException("新增界面文案待生成：" + missing.size() + " 条");
      System.out.println("界面译文完整：无需新增");
      return;
    }
    if (!missing.isEmpty()) {
      Path python =
          root.resolve(
              "tools/bin/translation/env/"
                  + (System.getProperty("os.name").startsWith("Windows")
                      ? "Scripts/python.exe"
                      : "bin/python"));
      if (!Files.isRegularFile(python))
        throw new IllegalStateException("请先运行 tools/setup-translation.ps1 安装免费翻译模型");
      var builder =
          new ProcessBuilder(
                  python.toString(), "-u", root.resolve("tools/translation-worker.py").toString())
              .directory(root.toFile());
      builder.environment().put("PYTHONIOENCODING", "utf-8");
      var worker = builder.start();
      try (var executor = Executors.newVirtualThreadPerTaskExecutor();
          var reader =
              new BufferedReader(
                  new InputStreamReader(worker.getInputStream(), StandardCharsets.UTF_8));
          var writer = new OutputStreamWriter(worker.getOutputStream(), StandardCharsets.UTF_8)) {
        executor.submit(
            () -> {
              try {
                worker.getErrorStream().transferTo(OutputStream.nullOutputStream());
              } catch (IOException ignored) {
              }
            });
        for (int i = 0; i < missing.size(); i++) {
          String text = missing.get(i);
          List<String> targets = new ArrayList<>();
          for (String language : List.of("zh-TW", "ja", "en")) {
            writer.write(write(obj("text", text, "target", language, "source", "zh")) + "\n");
            writer.flush();
            var pending = executor.submit(reader::readLine);
            String line;
            try {
              line = pending.get(60, TimeUnit.SECONDS);
            } catch (Exception e) {
              pending.cancel(true);
              worker.destroyForcibly();
              throw new IOException("界面译文生成超时或中断", e);
            }
            if (line == null) throw new IOException("界面翻译模型中断");
            var result = parse(line);
            if (result.get("error") != null || !(result.get("text") instanceof String translated))
              throw new IOException("界面译文生成失败");
            if (!placeholders(text).equals(placeholders(translated)))
              throw new IOException("译文占位符不一致");
            targets.add(translated);
          }
          generated.put(text, targets);
          if (i % 20 == 0) System.out.println("生成界面译文 " + (i + 1) + " / " + missing.size());
        }
      } finally {
        worker.destroyForcibly();
        worker.waitFor(5, TimeUnit.SECONDS);
      }
    }
    List<Object> entries = new ArrayList<>();
    for (Object text : current)
      if (generated.containsKey(text)) entries.add(List.of(text, generated.get(text)));
    var printer = new DefaultPrettyPrinter();
    printer.indentArraysWith(new DefaultIndenter("  ", "\n"));
    String body =
        "// Generated during development; reviewed/manual messages always take precedence.\n"
            + "export const generatedMessages="
            + cn.campus.Json.MAPPER.writer(printer).writeValueAsString(entries)
            + ";\n";
    Path output = root.resolve("dist/shared/messages-generated.js");
    if (!Files.readString(output).equals(body)) Files.writeString(output, body);
    System.out.println(
        missing.isEmpty() ? "界面译文完整：无需新增" : "已自动生成 " + missing.size() + " 条四语界面文案；机器译文仍需人工校对。");
  }
}
