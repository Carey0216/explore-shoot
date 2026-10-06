const points = [
 ['p1','图书馆前庭','建筑','立面线条与入口的对称关系','仅室外前庭；保持入口通畅',24,65],
 ['p2','梧桐步道','自然','树叶、树影与步道的重复节奏','在铺装步道内活动，不进入绿化带',42,53],
 ['p3','中心草坪','自然','草地边缘与天空的色彩层次','在外围步道拍摄，不踩踏草坪',61,62],
 ['p4','艺术长廊','建筑','廊柱与光影形成的纵深','避开通行人流，不攀爬或倚靠展品',64,33],
 ['p5','校园文化墙','人文','墙面图案的色彩与局部细节','仅观察公开墙面，不编造图案历史',39,27],
 ['p6','湖畔观景台','自然','水面与岸边景物的倒影','只在护栏内侧拍摄，不靠近水边',81,48],
 ['p7','教学楼广场','建筑','建筑转角与空间留白','仅室外公共广场，不拍摄教室内部',17,31],
 ['p8','校园南入口','人文','入口标识与道路的视觉关系','不进入车道，不拍摄可识别路人',18,83]
].map(([id,name,theme,fact,condition,x,y])=>({id,name,theme,fact,condition,x,y,open:true,source:'虚构校园演示资料，待实地采集替换',verifiedAt:null,allowed:'在公共步道站立观察、使用手机拍摄静物',version:1}));
const routes = [
 {id:'r1',name:'光影里的校园',subtitle:'从建筑线条到树间光影，把熟悉的日常重新看一遍。',theme:'建筑',points:['p1','p2','p3'],walk:6,stay:6,distance:480,intensity:'轻松',active:true,image:'campus.jpg',timings:[],version:1},
 {id:'r2',name:'慢下来，遇见绿意',subtitle:'沿着树影走向湖畔，收集属于此刻的自然细节。',theme:'自然',points:['p2','p3','p6'],walk:9,stay:6,distance:720,intensity:'适中',active:true,image:'campus.jpg',timings:[],version:1},
 {id:'r3',name:'建筑与校园叙事',subtitle:'读一面墙，观察一条长廊，记录校园的另一种表情。',theme:'人文',points:['p8','p7','p5','p4'],walk:14,stay:8,distance:1100,intensity:'适中',active:true,image:'campus.jpg',timings:[],version:1}
];
const templates=points.flatMap((p,i)=>[
 {id:`t${i*2+1}`,pointId:p.id,title:p.theme==='自然'?'收集一处自然细节':p.theme==='建筑'?'寻找画面里的线条':'记录一处校园符号',steps:[`在${p.name}的公共步道停下，观察${p.fact}。`,'选择一个主体，拍下一张全景与一张局部特写。','比较两张照片，留下你更喜欢的视角。'],duo:'两人分别拍摄远景和细节，再交换手机说说各自发现。',minutes:2,approved:true,version:1},
 {id:`t${i*2+2}`,pointId:p.id,title:'换一个角度看日常',steps:[`从安全站立的位置观察${p.fact}。`,'保持在允许区域内，调整手机高低，寻找不同构图。','拍摄两张照片，选择主体更清晰的一张。'],duo:'两人从相同位置选择不同构图，互相解释选择。',minutes:2,approved:true,version:1}
]);
module.exports=()=>({version:1,points,routes,templates,sessions:[],logs:[],audit:[]});
