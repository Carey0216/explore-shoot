package cn.campus.checkin;

import static cn.campus.common.Json.*;
import cn.campus.common.ApiException;
import java.util.*;

/** Image-pixel polygons only; never navigation/GPS coordinates. */
final class AtlasGeometry {
  private static final double EPS = 1e-7;
  static List<List<Double>> ring(Object raw, double width, double height) {
    if (!(raw instanceof List<?> input) || input.size() < 3 || input.size() > 128)
      throw new ApiException("轮廓需要 3—128 个顶点");
    var out = new ArrayList<List<Double>>();
    for (Object item : input) {
      if (!(item instanceof List<?> p) || p.size() != 2 || !(p.get(0) instanceof Number x) || !(p.get(1) instanceof Number y))
        throw new ApiException("轮廓坐标格式无效");
      double a = x.doubleValue(), b = y.doubleValue();
      if (!Double.isFinite(a) || !Double.isFinite(b) || a < 0 || b < 0 || a > width || b > height)
        throw new ApiException("轮廓超出底图范围");
      var point = List.of(a, b);
      if (out.contains(point)) throw new ApiException("轮廓顶点不能重复");
      out.add(point);
    }
    double area = 0;
    for (int i = 0; i < out.size(); i++) {
      var a = out.get(i); var b = out.get((i + 1) % out.size());
      area += a.get(0) * b.get(1) - b.get(0) * a.get(1);
      for (int j = i + 1; j < out.size(); j++) {
        if (j == i + 1 || i == 0 && j == out.size() - 1) continue;
        if (intersects(a, b, out.get(j), out.get((j + 1) % out.size())))
          throw new ApiException("轮廓边线不能交叉");
      }
    }
    if (Math.abs(area) < 2) throw new ApiException("圈画面积过小");
    return out;
  }
  private static double cross(List<Double> a, List<Double> b, List<Double> c) {
    return (b.get(0)-a.get(0))*(c.get(1)-a.get(1))-(b.get(1)-a.get(1))*(c.get(0)-a.get(0));
  }
  private static boolean on(List<Double> a, List<Double> b, List<Double> p) {
    return Math.abs(cross(a,b,p)) < EPS && p.get(0) >= Math.min(a.get(0),b.get(0))-EPS
        && p.get(0) <= Math.max(a.get(0),b.get(0))+EPS && p.get(1) >= Math.min(a.get(1),b.get(1))-EPS
        && p.get(1) <= Math.max(a.get(1),b.get(1))+EPS;
  }
  private static boolean intersects(List<Double> a, List<Double> b, List<Double> c, List<Double> d) {
    double abC=cross(a,b,c), abD=cross(a,b,d), cdA=cross(c,d,a), cdB=cross(c,d,b);
    return (abC*abD < -EPS && cdA*cdB < -EPS) || on(a,b,c) || on(a,b,d) || on(c,d,a) || on(c,d,b);
  }
  private static boolean inside(List<Double> p, List<List<Double>> ring) {
    boolean yes = false;
    for(int i=0,j=ring.size()-1;i<ring.size();j=i++) {
      var a=ring.get(i); var b=ring.get(j);
      if (on(a,b,p)) return false;
      if ((a.get(1)>p.get(1)) != (b.get(1)>p.get(1)) && p.get(0) < (b.get(0)-a.get(0))*(p.get(1)-a.get(1))/(b.get(1)-a.get(1))+a.get(0)) yes=!yes;
    }
    return yes;
  }
  private static boolean overlap(List<List<Double>> a, List<List<Double>> b) {
    for(int i=0;i<a.size();i++) for(int j=0;j<b.size();j++)
      if(intersects(a.get(i),a.get((i+1)%a.size()),b.get(j),b.get((j+1)%b.size()))) return true;
    return false;
  }
  static Map<String,Object> validate(Object outline, Object rawHoles, double width, double height) {
    var outer=ring(outline,width,height);
    if(!(rawHoles instanceof List<?> input) || input.size()>16) throw new ApiException("内院轮廓格式无效");
    var holes=new ArrayList<List<List<Double>>>();
    for(var raw:input) {
      var hole=ring(raw,width,height);
      if(!hole.stream().allMatch(p -> inside(p,outer)) || overlap(outer,hole)) throw new ApiException("内院必须完整位于楼宇轮廓内");
      for(var previous:holes) if(overlap(previous,hole) || inside(hole.get(0),previous) || inside(previous.get(0),hole))
        throw new ApiException("内院轮廓不能重叠");
      holes.add(hole);
    }
    return obj("outline",outer,"holes",holes);
  }
}
