package cn.campus.tools;

import cn.campus.Json;
import com.google.zxing.*;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;

public final class PhoneEntry {
  public static Map<String, Object> make(Map<String, Object> record) throws WriterException {
    if (record == null)
      return Json.obj(
          "active", false, "url", "", "svg", "", "generatedAt", Instant.now().toString());
    String origin = Json.str(record.get("origin"));
    if (!origin.matches("https://[a-z0-9-]+\\.trycloudflare\\.com"))
      throw new IllegalArgumentException("Invalid phone origin.");
    String url = origin + "/#discover";
    var matrix =
        new QRCodeWriter()
            .encode(
                url,
                BarcodeFormat.QR_CODE,
                0,
                0,
                Map.of(
                    EncodeHintType.ERROR_CORRECTION,
                    ErrorCorrectionLevel.M,
                    EncodeHintType.MARGIN,
                    4));
    int width = matrix.getWidth();
    StringBuilder svg =
        new StringBuilder(
            "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 "
                + width
                + " "
                + width
                + "\" role=\"img\" aria-label=\"扫码打开手机测试页面\"><title>扫码打开手机测试页面</title><rect"
                + " width=\"100%\" height=\"100%\" fill=\"white\"/><path fill=\"black\" d=\"");
    for (int y = 0; y < width; y++)
      for (int x = 0; x < width; x++)
        if (matrix.get(x, y)) svg.append("M").append(x).append(' ').append(y).append("h1v1h-1z");
    svg.append("\"/></svg>");
    return Json.obj(
        "active",
        true,
        "url",
        url,
        "svg",
        svg.toString(),
        "generatedAt",
        record.getOrDefault("createdAt", Instant.now().toString()));
  }

  public static Map<String, Object> write(Path root, boolean stopped) throws Exception {
    Path record = root.resolve("data/https-test.json"), directory = root.resolve("dist/admin");
    Map<String, Object> entry =
        make(
            stopped || !Files.exists(record)
                ? null
                : Json.parse(Files.readString(record).replace("\uFEFF", "")));
    String template =
        new String(
            PhoneEntry.class.getResourceAsStream("/phone-entry.html").readAllBytes(),
            StandardCharsets.UTF_8);
    Files.createDirectories(directory);
    Files.writeString(
        directory.resolve("phone-test.html"),
        template.replace("__PHONE_ENTRY_JSON__", Json.write(entry).replace("<", "\\u003c")));
    Path temp = directory.resolve("phone-test.json.tmp"),
        target = directory.resolve("phone-test.json");
    Files.writeString(temp, Json.write(entry));
    Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    return entry;
  }
}
