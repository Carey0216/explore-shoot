// Generated from dist/shared/passport-card-art.js; run node tools/sync-passport-art.cjs.
// Privacy-safe canvas artwork shared with the native client by tools/sync-passport-art.cjs.
const cardStyles = [
  ['青苔原色', '#f4efdf', '#dcece5', '#275348'],
  ['月下蓝调', '#151e40', '#3e5480', '#f2edda'],
  ['樱花来信', '#fff1f0', '#edc9d7', '#754556'],
  ['秋日金箔', '#fff5d8', '#dfb963', '#614a2c'],
  ['湖面微光', '#d6f5ef', '#7fbeb9', '#184e52'],
  ['纸上建筑', '#f3eee5', '#d4c9b6', '#494c48'],
  ['黄昏胶片', '#f7c7a4', '#a87887', '#4a3654'],
  ['云间旅行', '#f2f9ff', '#c9d4ee', '#3b547d'],
  ['草木标本', '#ecf2d6', '#b7d2ad', '#3e613f'],
  ['星际手记', '#282841', '#645789', '#faf1de'],
  ['赤陶日记', '#f5e6d7', '#d8a693', '#683e34'],
];
function drawPassportCard(c, summary, earned, style, images) {
  const [name, a, b, ink] = cardStyles[style % cardStyles.length],
    W = 1080,
    H = 1350;
  c.clearRect(0, 0, W, H);
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.save();
  c.globalAlpha = 0.13;
  c.strokeStyle = ink;
  c.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    c.beginPath();
    if (style % 4 === 0) c.arc(1000, 1100, 160 + i * 58, 0, Math.PI * 2);
    else if (style % 4 === 1) {
      c.moveTo(-100, 100 + i * 115);
      c.bezierCurveTo(280, 300 + i * 50, 700, -100 + i * 130, 1200, 160 + i * 105);
    } else if (style % 4 === 2) {
      c.moveTo(70 + i * 100, 0);
      c.lineTo(1070, 700 + i * 65);
      c.lineTo(0, 1450 - i * 45);
    } else {
      c.rect(45 + i * 30, 45 + i * 30, W - 90 - i * 60, H - 90 - i * 60);
    }
    c.stroke();
  }
  c.restore();
  c.fillStyle = ink;
  c.font = '24px sans-serif';
  c.fillText('EXPLORE & SHOOT / CAMPUS PASSPORT', 72, 100);
  c.font = 'bold 64px sans-serif';
  c.fillText('我的校园打卡护照', 72, 225);
  c.font = '29px sans-serif';
  c.fillText('每一步，都是我的校园故事', 76, 288);
  c.save();
  c.globalAlpha = 0.72;
  c.fillStyle = [1, 9].includes(style % cardStyles.length) ? '#111a32' : '#fff';
  c.fillRect(72, 350, 936, 185);
  c.restore();
  c.fillStyle = ink;
  c.font = 'bold 70px sans-serif';
  c.fillText(String(summary.unique || summary.current || 0), 115, 445);
  c.fillText(String(earned.length), 590, 445);
  c.font = '27px sans-serif';
  c.fillText('处校园足迹', 115, 500);
  c.fillText('枚主题勋章', 590, 500);
  c.font = 'bold 32px sans-serif';
  c.fillText('这一次，我收集了', 76, 625);
  earned.slice(0, 6).forEach((r, i) => {
    const x = 240 + (i % 3) * 300,
      y = 755 + Math.floor(i / 3) * 230;
    const image = images[i];
    if (image) c.drawImage(image, x - 78, y - 78, 156, 156);
    c.fillStyle = ink;
    c.font = '25px sans-serif';
    c.textAlign = 'center';
    c.fillText(r.title.length > 10 ? r.title.slice(0, 9) + '…' : r.title, x, y + 111);
  });
  c.textAlign = 'left';
  c.fillStyle = ink;
  if (!earned.length) {
    c.font = '30px sans-serif';
    c.fillText('第一枚勋章，从下次出发开始。', 90, 790);
  }
  c.font = '23px sans-serif';
  c.fillText('自主打卡记录 · 留下自己的校园视角', 76, 1245);
  c.globalAlpha = 0.55;
  c.fillText(name, 76, 1290);
  c.globalAlpha = 1;
}

module.exports = { cardStyles, drawPassportCard };
