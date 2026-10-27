using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Text;
public static class JingyuLines812 {
 public static Bitmap Canvas(int w,int h){return new Bitmap(w,h,PixelFormat.Format32bppArgb);}
 public static Graphics G(Bitmap b,float scale){var g=Graphics.FromImage(b);g.SmoothingMode=SmoothingMode.AntiAlias;g.PixelOffsetMode=PixelOffsetMode.HighQuality;g.ScaleTransform(scale,scale);return g;}
 public static void Shape(Graphics g,Pen pen,string type,float[] p){
  if(type=="line")g.DrawLine(pen,p[0],p[1],p[2],p[3]);
  else if(type=="poly"){var points=new PointF[p.Length/2];for(int i=0;i<points.Length;i++)points[i]=new PointF(p[i*2],p[i*2+1]);g.DrawLines(pen,points);}
  else if(type=="circle")g.DrawEllipse(pen,p[0]-p[2],p[1]-p[2],p[2]*2,p[2]*2);
  else if(type=="arc")g.DrawArc(pen,p[0],p[1],p[2],p[3],p[4],p[5]);
  else if(type=="bezier")g.DrawBezier(pen,p[0],p[1],p[2],p[3],p[4],p[5],p[6],p[7]);
  else if(type=="rect"){float r=p.Length>4?p[4]:0;using(var q=new GraphicsPath()){if(r<=0)q.AddRectangle(new RectangleF(p[0],p[1],p[2],p[3]));else{q.AddArc(p[0],p[1],r*2,r*2,180,90);q.AddArc(p[0]+p[2]-r*2,p[1],r*2,r*2,270,90);q.AddArc(p[0]+p[2]-r*2,p[1]+p[3]-r*2,r*2,r*2,0,90);q.AddArc(p[0],p[1]+p[3]-r*2,r*2,r*2,90,90);q.CloseFigure();}g.DrawPath(pen,q);}}
 }
 public static Pen Pen(Color c,float w){var p=new Pen(c,w);p.StartCap=p.EndCap=LineCap.Round;p.LineJoin=LineJoin.Round;return p;}
 static string N(float v){return v.ToString("0.###",System.Globalization.CultureInfo.InvariantCulture);}
 public static string Path(GraphicsPath p){var s=new StringBuilder();var a=p.PathPoints;var t=p.PathTypes;for(int i=0;i<a.Length;i++){var v=t[i]&7;if(v==0)s.Append("M"+N(a[i].X)+" "+N(a[i].Y));else if(v==1)s.Append("L"+N(a[i].X)+" "+N(a[i].Y));else if(v==3){s.Append("C");for(int k=0;k<3;k++,i++)s.Append(N(a[i].X)+" "+N(a[i].Y)+" ");i--;}if((t[i]&128)!=0)s.Append("Z");}return s.ToString();}
}
