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
const shareFooterHeight = 230;
const posterStyles = [
  ['原色', '#f4f5ef', '#1c3546', '#526975'],
  ['暖纸', '#fcf0dc', '#583e32', '#685647'],
  ['夜蓝', '#182638', '#e4edf7', '#bacbdb'],
];
const shareInk = ['#ffffff', '#254c61', '#d05269', '#edb54e'];

function pointCodeAreas(hasMini) {
  return hasMini
    ? [
        [48, 950, 200],
        [270, 950, 200],
      ]
    : [[48, 950, 200]];
}

function campusCodeAreas(width, top, { qr, mini } = {}) {
  if (!qr) return [];
  const edge = 142;
  const right = [width - 48 - edge, top + 26, edge];
  return mini ? [[right[0] - edge - 28, right[1], edge], right] : [right];
}

function drawShareArtwork(c, image, width, height, marks, codes) {
  c.clearRect(0, 0, width, height);
  c.drawImage(image, 0, 0);
  drawShareMarks(c, width, height, marks);
  for (const [x, y, edge] of codes) c.drawImage(image, x, y, edge, edge, x, y, edge, edge);
}

function drawShareMarks(c, width, height, marks) {
  c.save();
  c.beginPath();
  c.rect(0, 0, width, height);
  c.clip();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const { kind, color, points } of marks) {
    const [x, y] = [points[0][0] * width, points[0][1] * height];
    c.fillStyle = c.strokeStyle = color;
    c.beginPath();
    if (kind === 'pen') {
      c.lineWidth = width * 0.009;
      if (points.length === 1) {
        c.arc(x, y, c.lineWidth / 2, 0, Math.PI * 2);
        c.fill();
      } else {
        c.moveTo(x, y);
        for (const [u, v] of points.slice(1)) c.lineTo(u * width, v * height);
        c.stroke();
      }
      continue;
    }
    const size = width * 0.043;
    if (kind === 'sparkle') {
      c.moveTo(x, y - size);
      c.quadraticCurveTo(x + size * 0.15, y - size * 0.15, x + size, y);
      c.quadraticCurveTo(x + size * 0.15, y + size * 0.15, x, y + size);
      c.quadraticCurveTo(x - size * 0.15, y + size * 0.15, x - size, y);
      c.quadraticCurveTo(x - size * 0.15, y - size * 0.15, x, y - size);
    } else if (kind === 'heart') {
      c.moveTo(x, y + size * 0.9);
      c.bezierCurveTo(
        x - size * 2,
        y - size * 0.35,
        x - size * 0.65,
        y - size * 1.3,
        x,
        y - size * 0.35,
      );
      c.bezierCurveTo(
        x + size * 0.65,
        y - size * 1.3,
        x + size * 2,
        y - size * 0.35,
        x,
        y + size * 0.9,
      );
    } else {
      c.moveTo(x - size, y + size * 0.7);
      c.lineTo(x - size * 0.27, y - size * 0.57);
      c.lineTo(x + size * 0.04, y);
      c.lineTo(x + size * 0.4, y - size * 0.9);
      c.lineTo(x + size, y + size * 0.7);
      c.closePath();
    }
    c.fill();
  }
  c.restore();
}
function paintShareQR(c, qr, x, y, edge) {
  const quiet = 4,
    cell = Math.floor(edge / (qr.size + quiet * 2)),
    offset = Math.floor((edge - cell * (qr.size + quiet * 2)) / 2);
  c.fillStyle = '#fff';
  c.fillRect(x, y, edge, edge);
  c.fillStyle = '#000';
  for (let row = 0; row < qr.size; row++)
    for (let col = 0; col < qr.size; col++)
      if (qr.getModule(col, row))
        c.fillRect(
          x + offset + (col + quiet) * cell,
          y + offset + (row + quiet) * cell,
          cell,
          cell,
        );
}
function drawCampusShareFooter(c, width, top, { qr, mini } = {}) {
  const edge = 142,
    padding = 48,
    start = width - padding - edge * (mini ? 2 : 1) - (mini ? 28 : 0);
  c.save();
  c.fillStyle = '#edf1ed';
  c.fillRect(0, top, width, shareFooterHeight);
  c.fillStyle = '#23454b';
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  c.font = 'bold 42px sans-serif';
  c.fillText('景遇 JINGYU', padding, top + 84, start - padding - 24);
  c.font = '24px sans-serif';
  c.fillText('在校园，遇见更多美好', padding, top + 126, start - padding - 24);
  if (qr && !mini) c.fillText('小程序码暂不可用', padding, top + 171, start - padding - 24);
  if (qr) {
    const y = top + 26;
    paintShareQR(c, qr, start, y, edge);
    if (mini) {
      c.fillStyle = '#fff';
      c.fillRect(start + edge + 28, y, edge, edge);
      c.drawImage(mini, start + edge + 35, y + 7, edge - 14, edge - 14);
    }
    c.textAlign = 'center';
    c.fillStyle = '#23454b';
    c.font = '21px sans-serif';
    c.fillText('网页二维码', start + edge / 2, top + 198);
    if (mini) c.fillText('微信小程序码', start + edge * 1.5 + 28, top + 198);
  }
  c.restore();
}

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

module.exports={cardStyles,drawPassportCard,drawCampusShareFooter,shareFooterHeight,paintShareQR,posterStyles,shareInk,drawShareArtwork,pointCodeAreas,campusCodeAreas};
