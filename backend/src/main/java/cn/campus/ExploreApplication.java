package cn.campus;

import java.util.Map;
import org.apache.catalina.connector.Connector;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.tomcat.servlet.TomcatServletWebServerFactory;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
@org.springframework.scheduling.annotation.EnableScheduling
public class ExploreApplication {
  @Bean
  jakarta.servlet.MultipartConfigElement multipartConfigElement() {
    return new jakarta.servlet.MultipartConfigElement("",10L*1024*1024,16L*1024*1024,0);
  }
  public static int port(String name, int fallback) {
    return Integer.parseInt(System.getenv().getOrDefault(name, String.valueOf(fallback)));
  }

  public static void main(String[] args) throws Exception {
    String tool =
        java.util.Arrays.stream(args)
            .filter(a -> a.startsWith("--tool="))
            .map(a -> a.substring(7))
            .findFirst()
            .orElse(null);
    if (tool != null) {
      cn.campus.tools.ProjectTools.run(
          tool,
          java.util.Arrays.stream(args)
              .filter(a -> !a.startsWith("--tool="))
              .toArray(String[]::new));
      return;
    }
    SpringApplication app = new SpringApplication(ExploreApplication.class);
    app.setDefaultProperties(
        Map.of(
            "server.address",
            "127.0.0.1",
            "server.port",
            port("PORT", 4174),
            "spring.web.resources.add-mappings",
            false,
            "server.forward-headers-strategy",
            "NONE",
            "spring.main.banner-mode",
            "off",
            "logging.level.root",
            "WARN",
            "server.shutdown",
            "immediate"));
    app.run(args);
  }

  @Bean
  TomcatServletWebServerFactory webServer() {
    TomcatServletWebServerFactory factory = new TomcatServletWebServerFactory();
    factory.setPort(port("PORT", 4174));
    try {
      factory.setAddress(java.net.InetAddress.getByName("127.0.0.1"));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
    Connector admin = new Connector(TomcatServletWebServerFactory.DEFAULT_PROTOCOL);
    admin.setPort(port("ADMIN_PORT", 4176));
    admin.setProperty("address", "127.0.0.1");
    factory.addAdditionalConnectors(admin);
    return factory;
  }

  @Bean
  org.springframework.boot.ApplicationRunner parentMonitor(
      org.springframework.context.ConfigurableApplicationContext context) {
    return args -> {
      String parent = System.getenv("EXPLORE_PARENT_PID");
      if (parent == null) return;
      Thread.startVirtualThread(
          () -> {
            try {
              while (ProcessHandle.of(Long.parseLong(parent))
                  .map(ProcessHandle::isAlive)
                  .orElse(false)) Thread.sleep(200);
              context.close();
              System.exit(0);
            } catch (InterruptedException ignored) {
              Thread.currentThread().interrupt();
            }
          });
    };
  }
}
