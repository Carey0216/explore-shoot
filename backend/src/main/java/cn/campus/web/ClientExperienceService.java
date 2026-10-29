package cn.campus.web;

import static cn.campus.common.Json.*;
import cn.campus.common.*;
import java.util.*;
import org.springframework.stereotype.Service;

/** Bounded, coarse operation measurements. Never stores user text, media URLs or account IDs. */
@Service
public final class ClientExperienceService {
  private final RateLimiter limits;
  private static final Set<String> METRICS=Set.of("inp","dock","photo-open","landing","upload");
  private static final Set<String> DEVICES=Set.of("mobile","desktop","tablet","unknown");
  private static final Set<String> SYSTEMS=Set.of("ios","android","windows","mac","devtools","other");
  private static final Set<String> BROWSERS=Set.of("safari","chromium","firefox","wechat","other");
  private static final Map<String, Sample> samples=new LinkedHashMap<>();
  private record Sample(String metric,String platform,String device,String os,String browser,String page,double ms,boolean ok,double dropped,long at) {}
  public ClientExperienceService(RateLimiter limits){this.limits=limits;}
  public boolean handle(ApiContext c)throws Exception{
    if(c.route("/api/client-performance","POST")){
      limits.check("client-performance:"+c.ip,120);
      accept(c.body);
      c.send(obj("ok",true));return true;
    }
    if(c.audience.equals("admin")&&c.route("/api/admin/performance/experience","GET")){
      c.need();if(!cn.campus.admin.AdminPermissions.owner(c.account))throw new ApiException("无权限",403);
      c.send(snapshot());return true;
    }
    return false;
  }
  public static synchronized void accept(Map<String,Object> b){
    RequestValues.fields(b,"id","metric","platform","device","os","browser","page","duration","ok","dropped");
    String id=str(b.get("id")),metric=str(b.get("metric")),platform=str(b.get("platform")),device=str(b.get("device")),os=str(b.get("os")),browser=str(b.get("browser")),page=str(b.get("page"));
    if(!id.matches("[A-Za-z0-9_-]{1,80}")||!METRICS.contains(metric)||!Set.of("web","mini").contains(platform)||!DEVICES.contains(device)||!SYSTEMS.contains(os)||!BROWSERS.contains(browser)||!page.matches("[a-z-]{1,40}")||!(b.get("ok") instanceof Boolean))throw new ApiException("性能诊断字段无效");
    double ms=number(b.get("duration")),dropped=number(b.getOrDefault("dropped",0));
    if(!Double.isFinite(ms)||ms<0||ms>3600000||!Double.isFinite(dropped)||dropped<0||dropped>1||metric.equals("inp")&&!platform.equals("web"))throw new ApiException("性能测量无效");
    prune();String key=platform+":"+metric+":"+id;
    if(!samples.containsKey(key)&&samples.size()>=4096)samples.remove(samples.keySet().iterator().next());
    samples.put(key,new Sample(metric,platform,device,os,browser,page,ms,Boolean.TRUE.equals(b.get("ok")),dropped,cn.campus.common.TimeSource.now()));
  }
  private static double number(Object v){if(v instanceof Number n)return n.doubleValue();throw new ApiException("性能数值无效");}
  private static void prune(){long cutoff=cn.campus.common.TimeSource.now()-86400000L;samples.values().removeIf(s->s.at<cutoff);}
  public static synchronized Map<String,Object> snapshot(){
    prune();Map<String,List<Sample>> groups=new TreeMap<>();
    for(Sample s:samples.values())groups.computeIfAbsent(String.join(":",s.platform,s.device,s.os,s.browser,s.metric,s.page),k->new ArrayList<>()).add(s);
    List<Map<String,Object>> rows=new ArrayList<>();
    for(var entry:groups.entrySet()){
      var list=entry.getValue();var first=list.get(0);var values=list.stream().filter(s->s.ok).map(s->s.ms).sorted().toList();
      long failures=list.stream().filter(s->!s.ok).count();
      Object p75=values.isEmpty()?null:values.get(Math.max(0,(int)Math.ceil(values.size()*.75)-1));
      rows.add(obj("platform",first.platform,"device",first.device,"os",first.os,"browser",first.browser,"metric",first.metric,"page",first.page,"samples",list.size(),"successes",values.size(),"failures",failures,"p75Ms",p75,"maxMs",values.isEmpty()?null:values.getLast(),"averageDropped",list.stream().mapToDouble(s->s.dropped).average().orElse(0),"assessment",values.size()<20?"insufficient":first.metric.equals("inp")&&p75 instanceof Double n?n<=200?"good":n<=500?"needs-improvement":"poor":"observed"));
    }
    return obj("rows",rows,"windowHours",24,"capacity",4096,"notice","仅最近24小时内存样本，服务重启归零；网页INP按页面访问更新去重，小程序响应与动画另计。无数据不代表已达标，少于20个样本不评级。仅粗分设备/系统/浏览器，不含账号、输入文字、照片地址或精确机型。");
  }
}
