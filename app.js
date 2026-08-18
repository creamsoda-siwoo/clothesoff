// ---------- SVG helpers ----------
const rrect = (x, y, w, h, rx, fill, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
const ellipse = (cx, cy, rx, ry, fill, extra = "") =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const circle = (cx, cy, r, fill, extra = "") =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;
const poly = (points, fill, extra = "") =>
  `<polygon points="${points}" fill="${fill}" ${extra}/>`;
const lineEl = (x1, y1, x2, y2, stroke, w = 2, extra = "") =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
const pathEl = (d, fill, extra = "") => `<path d="${d}" fill="${fill}" ${extra}/>`;

function shade(hex, percent) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + percent));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + percent));
  const b = Math.min(255, Math.max(0, (n & 0xff) + percent));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// ---------- parametric body geometry ----------
// Feet stay on a fixed ground line; height/leg sliders grow the body upward from there,
// so taller settings raise the head instead of stretching the whole canvas oddly.
function computeGeometry(shape) {
  const hF = shape.height;
  const lF = shape.legLength;
  const chestF = shape.chest;
  const hipF = shape.hip;
  const legWF = shape.legWidth;

  const footCy = 540;
  const ankleY = footCy - 12;
  const legLen = 210 * hF * lF;
  const waistY = ankleY - legLen;
  const torsoLen = 150 * hF;
  const torsoTop = waistY - torsoLen;
  const neckH = 20;
  const neckY = torsoTop - neckH;
  const headRy = 40, headRx = 34;
  const headCy = neckY - (headRy - 6);
  const headCx = 150;

  // real body measurements used for the curved torso silhouette
  const shoulderW = 66;
  const chestW = 74 * chestF;
  const hipW = 78 * hipF;
  // upper-body clothing (tops/outer) sizes off shoulder+chest only; lower-body clothing
  // (pants/skirts) sizes off hip only below -- kept as separate boxes so the chest and
  // hip sliders never influence each other's garments.
  const torsoW = Math.max(shoulderW, chestW) + 6;
  const torsoX = headCx - torsoW / 2;
  const hipClothW = hipW + 8;
  const hipClothX = headCx - hipClothW / 2;

  const armW = 21;
  const armGap = 5;
  const armLX = headCx - shoulderW / 2 - armGap - armW;
  const armRX = headCx + shoulderW / 2 + armGap;
  const armY = torsoTop + 4;
  const armLen = 140 * hF;
  const armBottom = armY + armLen;
  const handLCx = armLX + armW / 2;
  const handRCx = armRX + armW / 2;
  const handCy = armBottom;

  const legW = 24 * legWF;
  const legGap = 4 * hipF;
  const legsTotalW = legW * 2 + legGap;
  const legLX = headCx - legsTotalW / 2;
  const legRX = legLX + legW + legGap;
  const footLCx = legLX + legW / 2;
  const footRCx = legRX + legW / 2;

  const neckX = headCx - 14;
  const neckW = 28;

  return {
    headCx, headCy, headRx, headRy,
    neckX, neckY, neckW, neckH,
    torsoX, torsoTop, torsoW, waistY,
    shoulderW, chestW, hipW, hipClothX, hipClothW,
    armLX, armRX, armW, armY, armBottom,
    handLCx, handRCx, handCy,
    legLX, legRX, legW, ankleY,
    footLCx, footRCx, footCy,
  };
}

let G = computeGeometry({ height: 1, legLength: 1, chest: 1, hip: 1, legWidth: 1 });

const SKIN_TONES = ["#ffe0bd", "#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#5c3a21"];

// ---------- organic body shapes ----------
// Smooth cubic-bezier silhouette through four real landmarks (shoulder -> chest -> waist -> hip)
// so chest and hip sliders bulge/narrow independently instead of one uniform torso width.
function torsoPath(cx, top, bottom, shoulderW, chestW, hipW) {
  const chestY = top + (bottom - top) * 0.26;
  const waistY = top + (bottom - top) * 0.6;
  // fixed waist width -- deliberately independent of both chestW and hipW so the
  // chest and hip sliders never pull on each other through a shared midpoint.
  const waistW = 56;
  const sL = cx - shoulderW / 2, sR = cx + shoulderW / 2;
  const cL = cx - chestW / 2, cR = cx + chestW / 2;
  const wL = cx - waistW / 2, wR = cx + waistW / 2;
  const hL = cx - hipW / 2, hR = cx + hipW / 2;
  const m1 = top + (chestY - top) * 0.55;
  const m2 = chestY + (waistY - chestY) * 0.5;
  const m3 = waistY + (bottom - waistY) * 0.45;
  return `M${sL},${top}
    C${sL},${m1} ${cL},${m1} ${cL},${chestY}
    C${cL},${m2} ${wL},${m2} ${wL},${waistY}
    C${wL},${m3} ${hL},${m3} ${hL},${bottom}
    L${hR},${bottom}
    C${hR},${m3} ${wR},${m3} ${wR},${waistY}
    C${wR},${m2} ${cR},${m2} ${cR},${chestY}
    C${cR},${m1} ${sR},${m1} ${sR},${top} Z`;
}
// smooth tapered "tube" silhouette (used for arms, legs, and fitted sleeves/pants)
// so limbs read as rounded flesh/fabric instead of a straight-edged trapezoid.
function tubeD(cx, topW, botW, yTop, yBot, bulge = 0.08) {
  const midY = yTop + (yBot - yTop) * 0.38;
  const midW = topW + (botW - topW) * 0.25 + Math.max(topW, botW) * bulge;
  const tL = cx - topW / 2, tR = cx + topW / 2;
  const mL = cx - midW / 2, mR = cx + midW / 2;
  const bL = cx - botW / 2, bR = cx + botW / 2;
  const m1 = yTop + (midY - yTop) * 0.55;
  const m2 = midY + (yBot - midY) * 0.5;
  return `M${tL},${yTop}
    C${tL},${m1} ${mL},${m1} ${mL},${midY}
    C${mL},${m2} ${bL},${m2} ${bL},${yBot}
    L${bR},${yBot}
    C${bR},${m2} ${mR},${m2} ${mR},${midY}
    C${mR},${m1} ${tR},${m1} ${tR},${yTop} Z`;
}
function tube(cx, topW, botW, yTop, yBot, fill, bulge = 0.08) {
  return pathEl(tubeD(cx, topW, botW, yTop, yBot, bulge), fill);
}

// smooth garment torso following the body curve (shoulder -> chest -> hem) with an
// "ease" allowance, instead of a bounding rectangle sitting on top of the body.
function garmentTorso(cx, top, hem, shoulderW, chestW, hemW, fill, ease = 6) {
  const chestY = top + (hem - top) * 0.32;
  const sL = cx - shoulderW / 2 - ease, sR = cx + shoulderW / 2 + ease;
  const cL = cx - chestW / 2 - ease, cR = cx + chestW / 2 + ease;
  const hL = cx - hemW / 2 - ease, hR = cx + hemW / 2 + ease;
  const m1 = top + (chestY - top) * 0.55;
  const m2 = chestY + (hem - chestY) * 0.5;
  const r = Math.min(10, shoulderW * 0.15);
  const d = `M${sL + r},${top}
    Q${sL},${top} ${sL},${top + r}
    C${sL},${m1} ${cL},${m1} ${cL},${chestY}
    C${cL},${m2} ${hL},${m2} ${hL},${hem}
    L${hR},${hem}
    C${hR},${m2} ${cR},${m2} ${cR},${chestY}
    C${cR},${m1} ${sR},${m1} ${sR},${top + r}
    Q${sR},${top} ${sR - r},${top} Z`;
  return pathEl(d, fill);
}

// one half-panel of an open-front jacket: curved outer edge follows the body,
// inner edge runs down the front opening so a gap of `gapHalf` shows between panels.
function jacketPanel(cx, top, hem, shoulderHalfW, chestHalfW, hemHalfW, gapHalf, side, fill, ease = 6) {
  const outTop = cx + side * (shoulderHalfW + ease);
  const chestY = top + (hem - top) * 0.3;
  const outChest = cx + side * (chestHalfW + ease);
  const outHem = cx + side * (hemHalfW + ease);
  const inTop = cx + side * (gapHalf + 8);
  const inHem = cx + side * gapHalf;
  const m1 = top + (chestY - top) * 0.55;
  const m2 = chestY + (hem - chestY) * 0.5;
  const d = `M${inTop},${top}
    L${outTop},${top}
    C${outTop},${m1} ${outChest},${m1} ${outChest},${chestY}
    C${outChest},${m2} ${outHem},${m2} ${outHem},${hem}
    L${inHem},${hem} Z`;
  return pathEl(d, fill);
}

function skinDefs(skin, uid) {
  return `<defs><linearGradient id="skinGrad-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="${skin}"/><stop offset="100%" stop-color="${shade(skin, -16)}"/>
  </linearGradient></defs>`;
}

function headSVG(uid, skinHex) {
  const grad = `url(#skinGrad-${uid})`;
  const light = shade(skinHex, 16);
  return `
    ${ellipse(G.headCx - G.headRx + 3, G.headCy + 4, 5, 8, grad)}
    ${ellipse(G.headCx + G.headRx - 3, G.headCy + 4, 5, 8, grad)}
    ${ellipse(G.headCx, G.headCy, G.headRx, G.headRy, grad)}
    ${ellipse(G.headCx - 11, G.headCy - 19, 10, 7, light, 'opacity="0.3"')}
  `;
}

function faceFeaturesSVG(skinHex, browColor) {
  const eyeY = G.headCy + 5, eyeDX = 13;
  const mouthY = eyeY + 15;
  const brow = shade(browColor || "#3a3346", -8);
  const noseShade = shade(skinHex, -28);
  return `
    <path d="M${G.headCx - eyeDX - 9},${eyeY - 12} Q${G.headCx - eyeDX},${eyeY - 17} ${G.headCx - eyeDX + 9},${eyeY - 11}" stroke="${brow}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M${G.headCx + eyeDX - 9},${eyeY - 11} Q${G.headCx + eyeDX},${eyeY - 17} ${G.headCx + eyeDX + 9},${eyeY - 12}" stroke="${brow}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    ${circle(G.headCx - eyeDX, eyeY, 3.3, "#3a3346")}
    ${circle(G.headCx + eyeDX, eyeY, 3.3, "#3a3346")}
    ${circle(G.headCx - eyeDX + 1.1, eyeY - 1.2, 1, "#ffffff", 'opacity="0.85"')}
    ${circle(G.headCx + eyeDX + 1.1, eyeY - 1.2, 1, "#ffffff", 'opacity="0.85"')}
    <path d="M${G.headCx - eyeDX + 6.5},${eyeY - 2.5} l3,-3" stroke="#3a3346" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M${G.headCx + eyeDX - 6.5},${eyeY - 2.5} l-3,-3" stroke="#3a3346" stroke-width="1.2" stroke-linecap="round"/>
    ${ellipse(G.headCx - eyeDX - 13, eyeY + 9, 6, 3.4, "#ffb4c6", 'opacity="0.5"')}
    ${ellipse(G.headCx + eyeDX + 13, eyeY + 9, 6, 3.4, "#ffb4c6", 'opacity="0.5"')}
    <path d="M${G.headCx - 2},${eyeY + 6} q-1,3 -2.2,4.2" stroke="${noseShade}" stroke-width="1.3" fill="none" stroke-linecap="round" opacity="0.6"/>
    <path d="M${G.headCx - 11},${mouthY} Q${G.headCx},${mouthY + 7} ${G.headCx + 11},${mouthY} Q${G.headCx},${mouthY + 3.5} ${G.headCx - 11},${mouthY} Z" fill="#e8899f" opacity="0.85"/>
    <path d="M${G.headCx - 11},${mouthY} Q${G.headCx},${mouthY + 7} ${G.headCx + 11},${mouthY}" stroke="#3a3346" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  `;
}

function bodyLowerSVG(uid, skinHex) {
  const grad = `url(#skinGrad-${uid})`;
  const dark = shade(skinHex, -25);
  const cxL = G.legLX + G.legW / 2, cxR = G.legRX + G.legW / 2;
  return `
    ${tube(cxL, G.legW * 1.2, G.legW * 0.78, G.waistY, G.ankleY, grad, 0.1)}
    ${tube(cxR, G.legW * 1.2, G.legW * 0.78, G.waistY, G.ankleY, grad, 0.1)}
    ${ellipse(G.footLCx, G.footCy, 17, 10, grad)}
    ${ellipse(G.footRCx, G.footCy, 17, 10, grad)}
    ${lineEl(G.footLCx - 9, G.footCy + 6, G.footLCx + 11, G.footCy + 6, dark, 1, 'opacity="0.4"')}
    ${lineEl(G.footRCx - 9, G.footCy + 6, G.footRCx + 11, G.footCy + 6, dark, 1, 'opacity="0.4"')}
    ${lineEl(cxL - G.legW * 0.3, G.ankleY - 3, cxL + G.legW * 0.3, G.ankleY - 3, dark, 1, 'opacity="0.3"')}
    ${lineEl(cxR - G.legW * 0.3, G.ankleY - 3, cxR + G.legW * 0.3, G.ankleY - 3, dark, 1, 'opacity="0.3"')}
  `;
}
function bodyUpperSVG(uid, skinHex) {
  const grad = `url(#skinGrad-${uid})`;
  const dark = shade(skinHex, -28);
  const cxL = G.armLX + G.armW / 2, cxR = G.armRX + G.armW / 2;
  return `
    ${tube(cxL, G.armW * 1.1, G.armW * 0.8, G.armY, G.armBottom, grad, 0.1)}
    ${tube(cxR, G.armW * 1.1, G.armW * 0.8, G.armY, G.armBottom, grad, 0.1)}
    ${ellipse(G.handLCx, G.handCy, G.armW * 0.46, G.armW * 0.62, grad)}
    ${ellipse(G.handRCx, G.handCy, G.armW * 0.46, G.armW * 0.62, grad)}
    ${lineEl(G.handLCx - 4, G.handCy - 7, G.handLCx - 4, G.handCy + 2, dark, 1, 'opacity="0.45"')}
    ${lineEl(G.handLCx + 3, G.handCy - 8, G.handLCx + 3, G.handCy + 1, dark, 1, 'opacity="0.45"')}
    ${lineEl(G.handRCx - 3, G.handCy - 8, G.handRCx - 3, G.handCy + 1, dark, 1, 'opacity="0.45"')}
    ${lineEl(G.handRCx + 4, G.handCy - 7, G.handRCx + 4, G.handCy + 2, dark, 1, 'opacity="0.45"')}
    ${pathEl(torsoPath(G.headCx, G.torsoTop, G.waistY, G.shoulderW, G.chestW, G.hipW), grad)}
    <path d="M${G.headCx - G.neckW / 2 - 5},${G.torsoTop + 7} Q${G.headCx - 11},${G.torsoTop + 13} ${G.headCx - 2},${G.torsoTop + 4}" stroke="${dark}" stroke-width="1.2" fill="none" opacity="0.35" stroke-linecap="round"/>
    <path d="M${G.headCx + G.neckW / 2 + 5},${G.torsoTop + 7} Q${G.headCx + 11},${G.torsoTop + 13} ${G.headCx + 2},${G.torsoTop + 4}" stroke="${dark}" stroke-width="1.2" fill="none" opacity="0.35" stroke-linecap="round"/>
    ${rrect(G.neckX, G.neckY, G.neckW, G.neckH, 8, grad)}
  `;
}

// ---------- clothing shape builders ----------
function sleeves(color, sleeveEnd, widen = 4) {
  if (sleeveEnd <= G.armY) {
    return rrect(G.torsoX + 14, G.torsoTop - 2, 14, 18, 7, color) + rrect(G.torsoX + G.torsoW - 28, G.torsoTop - 2, 14, 18, 7, color);
  }
  const topW = G.armW + widen + 8;
  const botW = G.armW * 0.8 + widen * 0.6;
  const cxL = G.armLX + G.armW / 2, cxR = G.armRX + G.armW / 2;
  return tube(cxL, topW, botW, G.armY - 6, sleeveEnd, color, 0.1) + tube(cxR, topW, botW, G.armY - 6, sleeveEnd, color, 0.1);
}
function topShape(color, hem, sleeveEnd, extra = "") {
  const hemW = hem - G.waistY > 8 ? G.hipW + 14 : G.chestW * 0.88;
  return `${sleeves(color, sleeveEnd)}${garmentTorso(G.headCx, G.torsoTop - 4, hem, G.shoulderW, G.chestW, hemW, color)}${extra}`;
}
function skirtShape(color, hem, flare = 26, extra = "") {
  const topL = G.hipClothX - 4, topR = G.hipClothX + G.hipClothW + 4;
  const botL = topL - flare, botR = topR + flare;
  const midY = G.waistY + (hem - G.waistY) * 0.55;
  const midL = topL - flare * 0.45, midR = topR + flare * 0.45;
  const d = `M${topL},${G.waistY}
    L${topR},${G.waistY}
    Q${midR},${midY} ${botR},${hem}
    L${botL},${hem}
    Q${midL},${midY} ${topL},${G.waistY} Z`;
  return `${pathEl(d, color)}${extra}`;
}
function dressShape(color, hem, flare, sleeveEnd, extra = "") {
  return `${sleeves(color, sleeveEnd)}${garmentTorso(G.headCx, G.torsoTop - 4, G.waistY + 6, G.shoulderW, G.chestW, G.hipW + 6, color)}${skirtShape(color, hem, flare)}${extra}`;
}
function pantsShape(color, hem, extra = "") {
  const topW = G.legW + 12, botW = G.legW * 0.86 + 6;
  const cxL = G.legLX + G.legW / 2, cxR = G.legRX + G.legW / 2;
  return `${tube(cxL, topW, botW, G.waistY - 4, hem, color, 0.06)}${tube(cxR, topW, botW, G.waistY - 4, hem, color, 0.06)}${extra}`;
}
function outerShape(color, hem, sleeveEnd, gap = 10) {
  const hemHalfW = (hem - G.waistY > 8 ? G.hipW + 12 : G.chestW * 0.92) / 2;
  const cx = G.headCx, top = G.torsoTop - 4;
  return `${sleeves(color, sleeveEnd, 8)}${jacketPanel(cx, top, hem, G.shoulderW / 2, G.chestW / 2, hemHalfW, gap / 2, -1, color)}${jacketPanel(cx, top, hem, G.shoulderW / 2, G.chestW / 2, hemHalfW, gap / 2, 1, color)}`;
}
function shoeShape(color, style) {
  const L = G.footLCx, R = G.footRCx, y = G.footCy, ankle = G.ankleY;
  if (style === "boot") {
    const h = y - (ankle - 6) + 14;
    return rrect(L - 19, ankle - 6, 38, h, 10, color) + rrect(R - 19, ankle - 6, 38, h, 10, color);
  }
  if (style === "heel") {
    return (
      poly(`${L - 17},${y - 8} ${L + 19},${y - 11} ${L + 19},${y + 7} ${L - 17},${y + 9}`, color) + rrect(L + 11, y - 6, 6, 20, 2, shade(color, -30)) +
      poly(`${R - 17},${y - 8} ${R + 19},${y - 11} ${R + 19},${y + 7} ${R - 17},${y + 9}`, color) + rrect(R + 11, y - 6, 6, 20, 2, shade(color, -30))
    );
  }
  if (style === "sandal") {
    return lineEl(L - 15, y - 6, L + 15, y - 6, color, 5) + lineEl(L - 15, y + 2, L + 15, y + 2, color, 5) +
      lineEl(R - 15, y - 6, R + 15, y - 6, color, 5) + lineEl(R - 15, y + 2, R + 15, y + 2, color, 5);
  }
  if (style === "sneaker") {
    return rrect(L - 20, y - 12, 40, 22, 11, color) + rrect(L - 20, y + 4, 40, 7, 3, "#ffffff") +
      rrect(R - 20, y - 12, 40, 22, 11, color) + rrect(R - 20, y + 4, 40, 7, 3, "#ffffff");
  }
  if (style === "flat") return rrect(L - 17, y - 8, 34, 16, 8, color) + rrect(R - 17, y - 8, 34, 16, 8, color);
  if (style === "slide") return lineEl(L - 14, y - 3, L + 14, y - 3, color, 8) + lineEl(R - 14, y - 3, R + 14, y - 3, color, 8);
  if (style === "wedge") {
    return rrect(L - 17, y - 9, 34, 17, 6, color) + poly(`${L - 12},${y + 6} ${L + 12},${y + 6} ${L + 10},${y + 16} ${L - 10},${y + 16}`, shade(color, -22)) +
      rrect(R - 17, y - 9, 34, 17, 6, color) + poly(`${R - 12},${y + 6} ${R + 12},${y + 6} ${R + 10},${y + 16} ${R - 10},${y + 16}`, shade(color, -22));
  }
  if (style === "chelsea") {
    return rrect(L - 18, ankle - 2, 36, y - (ankle - 2) + 10, 9, color) + rrect(L - 18, ankle + 8, 36, 7, 3, shade(color, 25)) +
      rrect(R - 18, ankle - 2, 36, y - (ankle - 2) + 10, 9, color) + rrect(R - 18, ankle + 8, 36, 7, 3, shade(color, 25));
  }
  return rrect(L - 19, y - 10, 38, 20, 8, color) + rrect(R - 19, y - 10, 38, 20, 8, color); // loafer
}

// hair helpers (positions anchored to current G.headCx/headCy)
function hairTop(color, sideH) {
  const hx = G.headCx, hy = G.headCy;
  const light = shade(color, 26);
  return `${ellipse(hx, hy - 30, G.headRx + 2, 19, color)}${rrect(hx - G.headRx, hy - 22, 13, sideH, 6.5, color)}${rrect(hx + G.headRx - 13, hy - 22, 13, sideH, 6.5, color)}
    ${lineEl(hx - 11, hy - 39, hx - 7, hy - 16, light, 1.4, 'opacity="0.45"')}
    ${lineEl(hx + 7, hy - 41, hx + 11, hy - 15, light, 1.4, 'opacity="0.4"')}`;
}

// ---------- palettes ----------
const NEUTRALS = ["#2b2b2b", "#5b5b5b", "#ffffff", "#e8e2d8", "#8d6e52"];
const PASTELS = ["#ffb6c9", "#ffd9a0", "#fff3a0", "#b8f2c9", "#a6e3ff", "#c9b6ff"];
const BRIGHTS = ["#ff595e", "#ffca3a", "#3fb950", "#1982c4", "#8a4fc9", "#ff8fb1"];
const DENIM = ["#3a5a8c", "#22304a", "#6d8ab5", "#1c2333"];
const METAL = ["#d4af37", "#c0c0c0", "#b76e79"];
const HAIR_COLORS = ["#2b2320", "#5a3d26", "#8a5a2f", "#caa06a", "#e8c66b", "#c94f4f", "#8a4fc9", "#3a3a3a"];

// ---------- item definitions ----------
const ITEMS = {
  hair: [
    { id: "bob", name: "단발", emoji: "💇‍♀️", tags: ["casual", "formal"], colors: HAIR_COLORS,
      draw: (c) => ({ back: "", front: hairTop(c, 56) }) },
    { id: "ponytail", name: "포니테일", emoji: "🎀", tags: ["sporty", "casual"], colors: HAIR_COLORS,
      draw: (c) => ({
        back: `${ellipse(G.headCx + G.headRx + 8, G.headCy + 58, 16, 60, c)}${ellipse(G.headCx + G.headRx - 2, G.headCy, 12, 8, shade(c, -20))}`,
        front: hairTop(c, 40),
      }) },
    { id: "wavy", name: "웨이브 롱헤어", emoji: "🌊", tags: ["glam", "cute"], colors: HAIR_COLORS,
      draw: (c) => ({
        back: `${ellipse(G.headCx - G.headRx - 6, G.headCy + 74, 24, 82, c)}${ellipse(G.headCx + G.headRx + 6, G.headCy + 74, 24, 82, c)}`,
        front: hairTop(c, 66),
      }) },
    { id: "pixie", name: "픽시컷", emoji: "✂️", tags: ["formal", "casual"], colors: HAIR_COLORS,
      draw: (c) => ({ back: "", front: hairTop(c, 32) }) },
    { id: "twintail", name: "양갈래", emoji: "🎗️", tags: ["cute"], colors: HAIR_COLORS,
      draw: (c) => ({
        back: `${ellipse(G.headCx - G.headRx - 10, G.headCy + 58, 13, 66, c)}${ellipse(G.headCx + G.headRx + 10, G.headCy + 58, 13, 66, c)}${ellipse(G.headCx - G.headRx, G.headCy + 6, 9, 6, shade(c, -20))}${ellipse(G.headCx + G.headRx, G.headCy + 6, 9, 6, shade(c, -20))}`,
        front: hairTop(c, 46),
      }) },
    { id: "curly", name: "곱슬 아프로", emoji: "🌀", tags: ["cute", "glam"], colors: HAIR_COLORS,
      draw: (c) => ({
        back: "",
        front: `${ellipse(G.headCx, G.headCy - 22, G.headRx + 16, 34, c)}${circle(G.headCx - G.headRx - 6, G.headCy - 6, 15, c)}${circle(G.headCx + G.headRx + 6, G.headCy - 6, 15, c)}${circle(G.headCx - G.headRx + 8, G.headCy - 38, 13, c)}${circle(G.headCx + G.headRx - 8, G.headCy - 38, 13, c)}`,
      }) },
    { id: "lob", name: "레이어드 컷", emoji: "💫", tags: ["casual", "formal"], colors: HAIR_COLORS,
      draw: (c) => ({ back: "", front: `${hairTop(c, 70)}${ellipse(G.headCx - G.headRx - 6, G.headCy + 50, 10, 20, c)}${ellipse(G.headCx + G.headRx + 6, G.headCy + 50, 10, 20, c)}` }) },
    { id: "straight", name: "긴 생머리", emoji: "🎋", tags: ["formal", "glam"], colors: HAIR_COLORS,
      draw: (c) => ({
        back: `${rrect(G.headCx - G.headRx - 8, G.headCy + 8, 16, 128, 8, c)}${rrect(G.headCx + G.headRx - 8, G.headCy + 8, 16, 128, 8, c)}`,
        front: hairTop(c, 58),
      }) },
    { id: "halfup", name: "하프업", emoji: "🌼", tags: ["cute", "casual"], colors: HAIR_COLORS,
      draw: (c) => ({
        back: `${ellipse(G.headCx, G.headCy + 58, 22, 48, c)}${ellipse(G.headCx + G.headRx - 8, G.headCy - 38, 11, 8, shade(c, -20))}`,
        front: hairTop(c, 48),
      }) },
  ],

  top: [
    { id: "shirt", name: "화이트 셔츠", emoji: "👔", tags: ["formal", "casual"], colors: ["#ffffff", "#dbe7f2", "#f2e2c8", "#2b2b2b"],
      draw: (c) => topShape(c, G.waistY + 4, G.armBottom, poly(`${G.headCx - 16},${G.torsoTop - 4} ${G.headCx},${G.torsoTop + 12} ${G.headCx + 16},${G.torsoTop - 4}`, shade(c, -18))) },
    { id: "sweater", name: "니트 스웨터", emoji: "🧶", tags: ["comfy", "casual"], colors: PASTELS,
      draw: (c) => topShape(c, G.waistY + 8, G.armBottom - 4, lineEl(G.torsoX + 8, G.waistY - 8, G.torsoX + G.torsoW - 8, G.waistY - 8, shade(c, -20), 3) + lineEl(G.torsoX + 8, G.waistY - 18, G.torsoX + G.torsoW - 8, G.waistY - 18, shade(c, -15), 3)) },
    { id: "turtleneck", name: "터틀넥", emoji: "🖤", tags: ["formal", "comfy"], colors: NEUTRALS,
      draw: (c) => topShape(c, G.waistY, G.armBottom - 4, rrect(G.neckX - 3, G.neckY - 4, G.neckW + 6, 16, 7, shade(c, -10))) },
    { id: "crop", name: "크롭 티셔츠", emoji: "👚", tags: ["casual", "cute"], colors: BRIGHTS,
      draw: (c) => topShape(c, G.waistY - 40, G.armY + 46) },
    { id: "offshoulder", name: "오프숄더 탑", emoji: "🌷", tags: ["glam", "cute"], colors: [...PASTELS, ...BRIGHTS],
      draw: (c) => `${rrect(G.armLX + 2, G.armY + 10, G.armW + 6, 40, 12, c)}${rrect(G.armRX - 8, G.armY + 10, G.armW + 6, 40, 12, c)}${rrect(G.torsoX - 6, G.torsoTop + 6, G.torsoW + 12, G.waistY - 34 - (G.torsoTop + 6), 20, c)}` },
    { id: "boatneck", name: "보트넥 스트라이프", emoji: "⛵", tags: ["casual", "formal"], colors: ["#ffffff", "#dbe7f2", "#f2e2c8"],
      draw: (c) => topShape(c, G.waistY - 10, G.armBottom - 10, lineEl(G.torsoX - 2, G.torsoTop + 16, G.torsoX + G.torsoW + 2, G.torsoTop + 16, "#2b2b2b", 4) + lineEl(G.torsoX - 2, G.torsoTop + 30, G.torsoX + G.torsoW + 2, G.torsoTop + 30, "#2b2b2b", 4) + lineEl(G.torsoX - 2, G.torsoTop + 44, G.torsoX + G.torsoW + 2, G.torsoTop + 44, "#2b2b2b", 4)) },
    { id: "blazer", name: "블레이저", emoji: "🧥", tags: ["formal", "glam"], colors: NEUTRALS,
      draw: (c) => topShape(c, G.waistY + 26, G.armBottom - 4, poly(`${G.headCx - 20},${G.torsoTop - 4} ${G.headCx},${G.torsoTop + 20} ${G.headCx - 10},${G.torsoTop + 20}`, shade(c, -25)) + poly(`${G.headCx + 20},${G.torsoTop - 4} ${G.headCx},${G.torsoTop + 20} ${G.headCx + 10},${G.torsoTop + 20}`, shade(c, -25)) + lineEl(G.headCx, G.torsoTop + 20, G.headCx, G.waistY + 20, shade(c, -35), 2)) },
    { id: "sport", name: "스포츠 탑", emoji: "🎽", tags: ["sporty", "comfy"], colors: [...BRIGHTS, ...NEUTRALS],
      draw: (c) => topShape(c, G.waistY - 26, G.armY, rrect(G.torsoX + 6, G.armY + 8, 9, 50, 4, shade(c, 40)) + rrect(G.torsoX + G.torsoW - 15, G.armY + 8, 9, 50, 4, shade(c, 40))) },
    { id: "halter", name: "반짝이 홀터탑", emoji: "✨", tags: ["glam", "cute"], colors: ["#c94f4f", "#8a4fc9", "#d4af37", "#1982c4", "#ff8fb1"],
      draw: (c) => topShape(c, G.waistY - 32, G.torsoTop, circle(G.torsoX + 16, G.torsoTop + 30, 3, "#ffffff", 'opacity="0.8"') + circle(G.headCx, G.torsoTop + 50, 3, "#ffffff", 'opacity="0.8"') + circle(G.torsoX + G.torsoW - 16, G.torsoTop + 36, 3, "#ffffff", 'opacity="0.8"')) },
    { id: "minidress", name: "미니 원피스", emoji: "👗", tags: ["cute", "glam"], colors: [...BRIGHTS, ...PASTELS], overridesBottom: true,
      draw: (c) => dressShape(c, G.waistY + 90, 20, G.armY + 40) },
    { id: "sundress", name: "썸머 원피스", emoji: "🌻", tags: ["cute", "casual"], colors: PASTELS, overridesBottom: true,
      draw: (c) => dressShape(c, G.waistY + 120, 26, G.torsoTop, lineEl(G.torsoX + 14, G.torsoTop - 2, G.headCx - 8, G.torsoTop + 16, c, 8) + lineEl(G.torsoX + G.torsoW - 14, G.torsoTop - 2, G.headCx + 8, G.torsoTop + 16, c, 8)) },
    { id: "longdress", name: "롱 원피스", emoji: "👘", tags: ["formal", "glam"], colors: [...NEUTRALS, ...PASTELS], overridesBottom: true,
      draw: (c) => dressShape(c, G.ankleY - 26, 18, G.armBottom - 10) },
    { id: "denimshirt", name: "데님 셔츠", emoji: "🧷", tags: ["casual", "sporty"], colors: DENIM,
      draw: (c) => topShape(c, G.waistY + 2, G.armBottom - 2, rrect(G.torsoX + 10, G.torsoTop + 40, 14, 16, 3, shade(c, -18)) + rrect(G.torsoX + G.torsoW - 24, G.torsoTop + 40, 14, 16, 3, shade(c, -18))) },
    { id: "vest", name: "니트 베스트", emoji: "🎽", tags: ["formal", "comfy"], colors: [...PASTELS, ...NEUTRALS],
      draw: (c) => topShape(c, G.waistY - 6, G.armY, poly(`${G.headCx - 14},${G.torsoTop - 2} ${G.headCx},${G.torsoTop + 16} ${G.headCx + 14},${G.torsoTop - 2}`, shade(c, -18))) },
    { id: "knitdress", name: "니트 원피스", emoji: "🧣", tags: ["comfy", "formal"], colors: [...PASTELS, ...NEUTRALS], overridesBottom: true,
      draw: (c) => dressShape(c, G.ankleY - 60, 14, G.armBottom - 6, lineEl(G.hipClothX + 10, G.waistY + 70, G.hipClothX + G.hipClothW - 10, G.waistY + 70, shade(c, -18), 2)) },
    { id: "wrapdress", name: "랩 원피스", emoji: "🎁", tags: ["glam", "formal"], colors: [...BRIGHTS, ...NEUTRALS], overridesBottom: true,
      draw: (c) => dressShape(c, G.waistY + 110, 24, G.armBottom - 8, lineEl(G.torsoX + 4, G.torsoTop + 10, G.headCx + 6, G.waistY - 6, shade(c, -22), 3)) },
  ],

  bottom: [
    { id: "slacks", name: "슬랙스", emoji: "👖", tags: ["formal", "casual"], colors: NEUTRALS,
      draw: (c) => pantsShape(c, G.ankleY) },
    { id: "jeans", name: "청바지", emoji: "🩳", tags: ["casual", "comfy"], colors: DENIM,
      draw: (c) => pantsShape(c, G.ankleY, lineEl(G.legLX + 2, G.waistY + 8, G.legLX + 2, G.ankleY - 6, shade(c, 25), 1.5) + lineEl(G.legRX + G.legW, G.waistY + 8, G.legRX + G.legW, G.ankleY - 6, shade(c, 25), 1.5)) },
    { id: "shorts", name: "숏 팬츠", emoji: "🩳", tags: ["casual", "sporty", "cute"], colors: [...BRIGHTS, ...DENIM],
      draw: (c) => pantsShape(c, G.waistY + 70) },
    { id: "cargo", name: "카고 팬츠", emoji: "🎒", tags: ["sporty", "casual"], colors: [...NEUTRALS, "#5c6b3a"],
      draw: (c) => pantsShape(c, G.ankleY, rrect(G.legLX - 5, G.waistY + 60, 16, 22, 4, shade(c, -20)) + rrect(G.legRX + G.legW - 11, G.waistY + 60, 16, 22, 4, shade(c, -20))) },
    { id: "miniskirt", name: "미니스커트", emoji: "🎀", tags: ["cute", "glam"], colors: [...BRIGHTS, ...PASTELS],
      draw: (c) => skirtShape(c, G.waistY + 60, 22) },
    { id: "pencil", name: "H라인 스커트", emoji: "📎", tags: ["formal", "glam"], colors: NEUTRALS,
      draw: (c) => skirtShape(c, G.waistY + 130, 4) },
    { id: "midiskirt", name: "미디스커트", emoji: "🥻", tags: ["formal", "cute"], colors: [...PASTELS, ...NEUTRALS],
      draw: (c) => skirtShape(c, G.waistY + 95, 16) },
    { id: "joggers", name: "트레이닝 팬츠", emoji: "🏃", tags: ["sporty", "comfy"], colors: [...NEUTRALS, ...BRIGHTS],
      draw: (c) => pantsShape(c, G.ankleY - 30, rrect(G.legLX - 5, G.ankleY - 46, G.legW + 10, 20, 8, shade(c, -25)) + rrect(G.legRX - 5, G.ankleY - 46, G.legW + 10, 20, 8, shade(c, -25))) },
    { id: "pleats", name: "롱 플리츠 스커트", emoji: "🌸", tags: ["formal", "cute"], colors: PASTELS,
      draw: (c) => skirtShape(c, G.ankleY - 40, 30, lineEl(G.hipClothX + 16, G.waistY + 20, G.hipClothX + 6, G.ankleY - 42, shade(c, -20), 1.2) + lineEl(G.headCx, G.waistY + 20, G.headCx, G.ankleY - 38, shade(c, -20), 1.2) + lineEl(G.hipClothX + G.hipClothW - 16, G.waistY + 20, G.hipClothX + G.hipClothW - 6, G.ankleY - 42, shade(c, -20), 1.2)) },
    { id: "wideleg", name: "와이드 팬츠", emoji: "👖", tags: ["formal", "casual"], colors: [...NEUTRALS, ...PASTELS],
      draw: (c) => tube(G.legLX + G.legW / 2, G.legW + 20, G.legW + 26, G.waistY, G.ankleY, c, 0.02) + tube(G.legRX + G.legW / 2, G.legW + 20, G.legW + 26, G.waistY, G.ankleY, c, 0.02) },
    { id: "leggings", name: "레깅스", emoji: "🤸", tags: ["sporty", "comfy"], colors: [...NEUTRALS, ...BRIGHTS],
      draw: (c) => tube(G.legLX + G.legW / 2, G.legW + 4, G.legW * 0.9, G.waistY, G.ankleY, c, 0.04) + tube(G.legRX + G.legW / 2, G.legW + 4, G.legW * 0.9, G.waistY, G.ankleY, c, 0.04) +
        lineEl(G.legLX, G.waistY + 10, G.legLX, G.ankleY - 10, shade(c, 32), 1.5) + lineEl(G.legRX + G.legW, G.waistY + 10, G.legRX + G.legW, G.ankleY - 10, shade(c, 32), 1.5) },
  ],

  outer: [
    { id: "none", name: "없음", emoji: "🚫", tags: [], colors: [], draw: () => "" },
    { id: "cardigan", name: "가디건", emoji: "🧣", tags: ["comfy", "casual"], colors: PASTELS,
      draw: (c) => outerShape(c, G.waistY + 10, G.armBottom - 2, 12) },
    { id: "denimjacket", name: "데님 자켓", emoji: "🧵", tags: ["casual", "sporty"], colors: DENIM,
      draw: (c) => outerShape(c, G.torsoTop + 60, G.armY + 60, 10) },
    { id: "hoodie", name: "후드집업", emoji: "🎣", tags: ["sporty", "comfy"], colors: [...NEUTRALS, ...BRIGHTS],
      draw: (c) => `${ellipse(G.headCx, G.neckY - 4, 22, 16, shade(c, -10))}${outerShape(c, G.waistY + 4, G.armBottom - 6, 10)}` },
    { id: "leather", name: "레더 자켓", emoji: "🖤", tags: ["glam", "casual"], colors: ["#2b2b2b", "#5b3a29", "#7a1f2b"],
      draw: (c) => outerShape(c, G.torsoTop + 56, G.armBottom - 8, 8) },
    { id: "coat", name: "롱 코트", emoji: "🧥", tags: ["formal", "glam"], colors: NEUTRALS,
      draw: (c) => outerShape(c, G.ankleY - 30, G.armBottom - 2, 14) },
    { id: "paddedvest", name: "패딩 조끼", emoji: "🦺", tags: ["sporty", "comfy"], colors: [...BRIGHTS, ...NEUTRALS],
      draw: (c) => outerShape(c, G.waistY + 14, G.armY, 12) + lineEl(G.torsoX + 2, G.torsoTop + 20, G.torsoX + G.torsoW - 2, G.torsoTop + 20, shade(c, -22), 1.5) + lineEl(G.torsoX + 2, G.torsoTop + 40, G.torsoX + G.torsoW - 2, G.torsoTop + 40, shade(c, -22), 1.5) },
    { id: "bolero", name: "볼레로", emoji: "🩱", tags: ["glam", "cute"], colors: [...PASTELS, ...NEUTRALS],
      draw: (c) => outerShape(c, G.armY + 50, G.armBottom - 20, 14) },
  ],

  shoes: [
    { id: "loafer", name: "로퍼", emoji: "🥿", tags: ["formal", "casual"], colors: ["#5b3a29", "#2b2b2b", "#8d6e52", "#c0392b"],
      draw: (c) => shoeShape(c, "loafer") },
    { id: "sneaker", name: "스니커즈", emoji: "👟", tags: ["casual", "sporty", "comfy"], colors: [...BRIGHTS, "#ffffff"],
      draw: (c) => shoeShape(c, "sneaker") },
    { id: "heel", name: "힐", emoji: "👠", tags: ["glam", "formal"], colors: ["#c0392b", "#2b2b2b", "#ff8fb1", "#d4af37"],
      draw: (c) => shoeShape(c, "heel") },
    { id: "sandal", name: "샌들", emoji: "👡", tags: ["casual", "cute"], colors: [...BRIGHTS, "#d4af37"],
      draw: (c) => shoeShape(c, "sandal") },
    { id: "boot", name: "부츠", emoji: "🥾", tags: ["glam", "casual"], colors: ["#2b2b2b", "#5b3a29", "#3a3a3a"],
      draw: (c) => shoeShape(c, "boot") },
    { id: "flat", name: "플랫슈즈", emoji: "🩰", tags: ["casual", "comfy", "cute"], colors: [...PASTELS, ...NEUTRALS],
      draw: (c) => shoeShape(c, "flat") },
    { id: "slide", name: "슬리퍼", emoji: "🛝", tags: ["comfy", "casual"], colors: BRIGHTS,
      draw: (c) => shoeShape(c, "slide") },
    { id: "wedge", name: "웨지힐", emoji: "👡", tags: ["glam", "formal"], colors: [...NEUTRALS, ...BRIGHTS],
      draw: (c) => shoeShape(c, "wedge") },
    { id: "chelsea", name: "첼시 부츠", emoji: "🥾", tags: ["formal", "casual"], colors: ["#2b2b2b", "#5b3a29", "#8d6e52"],
      draw: (c) => shoeShape(c, "chelsea") },
  ],

  accessory: [
    { id: "none", name: "없음", emoji: "🚫", tags: [], colors: [], draw: () => "" },
    { id: "glasses", name: "안경", emoji: "👓", tags: ["formal", "casual"], colors: ["#2b2b2b", "#5b3a29", "#3a3a3a"],
      draw: (c) => `${lineEl(G.headCx - 1, G.headCy + 5, G.headCx + 1, G.headCy + 5, c, 2)}${ellipse(G.headCx - 13, G.headCy + 5, 12, 10, "none", `stroke="${c}" stroke-width="2.5"`)}${ellipse(G.headCx + 13, G.headCy + 5, 12, 10, "none", `stroke="${c}" stroke-width="2.5"`)}` },
    { id: "cap", name: "볼캡", emoji: "🧢", tags: ["sporty", "casual"], colors: [...BRIGHTS, ...NEUTRALS],
      draw: (c) => `${ellipse(G.headCx, G.headCy - 28, G.headRx + 7, 24, c)}${poly(`${G.headCx - G.headRx - 6},${G.headCy - 24} ${G.headCx - G.headRx - 16},${G.headCy - 10} ${G.headCx - 2},${G.headCy - 18}`, shade(c, -15))}` },
    { id: "beret", name: "베레모", emoji: "🎨", tags: ["glam", "formal"], colors: [...PASTELS, ...NEUTRALS],
      draw: (c) => `${ellipse(G.headCx + 6, G.headCy - 30, G.headRx + 4, 20, c)}${circle(G.headCx + 6, G.headCy - 48, 5, c)}` },
    { id: "ribbon", name: "리본 헤어핀", emoji: "🎀", tags: ["cute"], colors: PASTELS,
      draw: (c) => `${poly(`${G.headCx + G.headRx - 6},${G.headCy - 30} ${G.headCx + G.headRx + 12},${G.headCy - 38} ${G.headCx + G.headRx + 12},${G.headCy - 22}`, c)}${poly(`${G.headCx + G.headRx - 6},${G.headCy - 30} ${G.headCx + G.headRx + 12},${G.headCy - 22} ${G.headCx + G.headRx + 12},${G.headCy - 6}`, c)}${circle(G.headCx + G.headRx - 6, G.headCy - 30, 5, shade(c, -15))}` },
    { id: "sunglasses", name: "선글라스", emoji: "🕶️", tags: ["glam", "casual"], colors: ["#2b2b2b", "#5b3a29", "#8a4fc9"],
      draw: (c) => `${lineEl(G.headCx - 2, G.headCy + 3, G.headCx + 2, G.headCy + 3, c, 2)}${rrect(G.headCx - 24, G.headCy - 3, 22, 14, 6, c)}${rrect(G.headCx + 2, G.headCy - 3, 22, 14, 6, c)}` },
    { id: "jewelry", name: "주얼리", emoji: "💎", tags: ["glam", "formal"], colors: METAL,
      draw: (c) => `${circle(G.headCx - G.headRx + 3, G.headCy + 14, 3.2, c)}${circle(G.headCx + G.headRx - 3, G.headCy + 14, 3.2, c)}<path d="M${G.torsoX + 16},${G.torsoTop + 6} Q${G.headCx},${G.torsoTop + 22} ${G.torsoX + G.torsoW - 16},${G.torsoTop + 6}" stroke="${c}" stroke-width="2" fill="none"/>${circle(G.headCx, G.torsoTop + 20, 3.2, c)}` },
    { id: "scarf", name: "머플러", emoji: "🧣", tags: ["comfy", "formal"], colors: [...PASTELS, ...BRIGHTS],
      draw: (c) => `${ellipse(G.headCx, G.neckY + G.neckH - 4, G.neckW / 2 + 10, 14, c)}${rrect(G.headCx - 8, G.neckY + G.neckH, 16, 34, 5, shade(c, -10))}` },
    { id: "bag", name: "크로스백", emoji: "👜", tags: ["casual", "glam"], colors: ["#5b3a29", "#2b2b2b", "#c0392b", "#8a4fc9"],
      draw: (c) => `${lineEl(G.armLX + G.armW / 2, G.torsoTop - 2, G.torsoX + G.torsoW - 10, G.waistY - 20, c, 4)}${rrect(G.torsoX + G.torsoW - 22, G.waistY - 38, 26, 22, 5, c)}` },
    { id: "headband", name: "헤어밴드", emoji: "🎽", tags: ["cute", "casual"], colors: [...PASTELS, ...BRIGHTS],
      draw: (c) => pathEl(`M${G.headCx - G.headRx - 2},${G.headCy - 14} Q${G.headCx},${G.headCy - 52} ${G.headCx + G.headRx + 2},${G.headCy - 14}`, "none", `stroke="${c}" stroke-width="8" stroke-linecap="round"`) },
    { id: "gloves", name: "장갑", emoji: "🧤", tags: ["formal", "glam"], colors: [...NEUTRALS, ...PASTELS],
      draw: (c) => `${ellipse(G.handLCx, G.handCy, G.armW * 0.5, G.armW * 0.68, c)}${ellipse(G.handRCx, G.handCy, G.armW * 0.5, G.armW * 0.68, c)}${rrect(G.handLCx - 8, G.handCy - 15, 16, 11, 4, c)}${rrect(G.handRCx - 8, G.handCy - 15, 16, 11, 4, c)}` },
  ],
};

// ---------- themes ----------
const THEMES = [
  { name: "출근 첫날", desc: "단정하고 프로페셔널하게! 첫 출근룩을 완성해보세요.", tags: ["formal"], icon: "💼" },
  { name: "주말 데이트", desc: "설레는 주말 데이트에 어울리는 사랑스러운 룩!", tags: ["cute", "glam"], icon: "💕" },
  { name: "동네 마실", desc: "편안하고 캐주얼하게, 동네 산책 룩!", tags: ["casual", "comfy"], icon: "🚶" },
  { name: "헬스장 룩", desc: "활동적이고 스포티하게! 운동하기 좋은 룩!", tags: ["sporty", "comfy"], icon: "🏋️" },
  { name: "파티 나이트", desc: "화려하고 반짝이는 파티 룩을 완성해보세요!", tags: ["glam", "cute"], icon: "🎉" },
];
const TAG_LABEL = { formal: "포멀", casual: "캐주얼", cute: "큐트", glam: "글램", sporty: "스포티", comfy: "편안함" };
const CATS = ["hair", "top", "bottom", "outer", "shoes", "accessory"];

// ---------- backgrounds ----------
const BACKGROUNDS = [
  { id: "default", name: "기본", emoji: "🏠", css: "radial-gradient(circle at 50% 20%, #fbf4ff, #f3f0ff 70%)", swatch: "#f3f0ff" },
  { id: "cafe", name: "카페", emoji: "☕", css: "linear-gradient(180deg, #f3e0c9, #d8b88a 75%, #b98a52)", swatch: "#e0bd8e" },
  { id: "street", name: "거리", emoji: "🌆", css: "linear-gradient(180deg, #9fc9e8, #f3d9a8 70%, #c9c9c9)", swatch: "#a9cfe8" },
  { id: "party", name: "파티", emoji: "🎉", css: "radial-gradient(circle at 50% 30%, #5a3d8c, #1e1440 80%)", swatch: "#3a2a63" },
  { id: "studio", name: "스튜디오", emoji: "🎬", css: "linear-gradient(180deg, #e8e8ea, #cfcfd4)", swatch: "#dcdce0" },
];

// ---------- coin / unlock economy ----------
const COIN_KEY = "closetakeout_coins";
const UNLOCK_KEY = "closetakeout_unlocked";
const BONUS_KEY = "closetakeout_last_bonus";
const BG_KEY = "closetakeout_bg";
const CAT_PRICE = { hair: 15, top: 20, bottom: 18, outer: 30, shoes: 18, accessory: 12 };
const FREE_COUNT = 2;

function getCoins() {
  const raw = localStorage.getItem(COIN_KEY);
  if (raw === null) { localStorage.setItem(COIN_KEY, "30"); return 30; }
  return Number(raw);
}
function setCoins(n) {
  localStorage.setItem(COIN_KEY, String(Math.max(0, n)));
  updateCoinDisplay();
}
function addCoins(n) { setCoins(getCoins() + n); }

function getUnlocked() {
  try { return new Set(JSON.parse(localStorage.getItem(UNLOCK_KEY)) || []); } catch { return new Set(); }
}
function saveUnlocked(set) { localStorage.setItem(UNLOCK_KEY, JSON.stringify([...set])); }
let unlockedSet = getUnlocked();

function priceFor(cat, item, idx) {
  if (item.id === "none") return 0;
  if (idx < FREE_COUNT) return 0;
  let p = CAT_PRICE[cat] || 15;
  if (item.overridesBottom) p += 15;
  return p;
}
function isUnlocked(cat, item, idx) {
  return priceFor(cat, item, idx) === 0 || unlockedSet.has(`${cat}:${item.id}`);
}

function grantDailyBonusIfNeeded() {
  const today = new Date().toDateString();
  if (localStorage.getItem(BONUS_KEY) !== today) {
    localStorage.setItem(BONUS_KEY, today);
    addCoins(20);
    showToast("🎁 출석 보너스 +20 코인!");
  }
}

// ---------- state ----------
function defaultSelections() {
  return {
    hair: { id: "bob", color: ITEMS.hair[0].colors[0] },
    top: { id: "shirt", color: ITEMS.top[0].colors[0] },
    bottom: { id: "slacks", color: ITEMS.bottom[0].colors[0] },
    outer: { id: "none", color: null },
    shoes: { id: "loafer", color: ITEMS.shoes[0].colors[0] },
    accessory: { id: "none", color: null },
  };
}
function defaultShape() { return { height: 100, legLength: 100, chest: 100, hip: 100, legWidth: 100 }; }

const state = {
  mode: "free",
  skin: SKIN_TONES[0],
  themeIndex: 0,
  bodyShape: defaultShape(),
  selections: defaultSelections(),
  activeCat: "hair",
  background: localStorage.getItem(BG_KEY) || "default",
  filters: { search: "", tags: new Set() },
};

function findItem(cat, id) { return ITEMS[cat].find((i) => i.id === id); }

// ---------- render character ----------
function renderCharacter(sel = state.selections, skin = state.skin, shapePct = state.bodyShape, uid = "main") {
  G = computeGeometry({
    height: shapePct.height / 100,
    legLength: shapePct.legLength / 100,
    chest: shapePct.chest / 100,
    hip: shapePct.hip / 100,
    legWidth: shapePct.legWidth / 100,
  });

  const hairItem = findItem("hair", sel.hair.id);
  const topItem = findItem("top", sel.top.id);
  const bottomItem = findItem("bottom", sel.bottom.id);
  const outerItem = findItem("outer", sel.outer.id);
  const shoesItem = findItem("shoes", sel.shoes.id);
  const accItem = findItem("accessory", sel.accessory.id);

  const hair = hairItem.draw(sel.hair.color);

  const parts = [
    skinDefs(skin, uid),
    hair.back,
    bodyLowerSVG(uid, skin),
    topItem.overridesBottom ? "" : bottomItem.draw(sel.bottom.color),
    shoesItem.draw(sel.shoes.color),
    bodyUpperSVG(uid, skin),
    topItem.draw(sel.top.color),
    outerItem.id === "none" ? "" : outerItem.draw(sel.outer.color),
    headSVG(uid, skin),
    hair.front,
    faceFeaturesSVG(skin, sel.hair.color),
    accItem.id === "none" ? "" : accItem.draw(sel.accessory.color),
  ];
  return parts.join("\n");
}

function paintStage() {
  if (window.Character3D) window.Character3D.update(state.selections, state.skin, state.bodyShape);
}

// ---------- UI: skin picker ----------
function buildSkinPicker() {
  const el = document.getElementById("skinPicker");
  el.innerHTML = "";
  SKIN_TONES.forEach((tone) => {
    const b = document.createElement("div");
    b.className = "skin-swatch" + (tone === state.skin ? " selected" : "");
    b.style.background = tone;
    b.title = "피부톤";
    b.addEventListener("click", () => { state.skin = tone; buildSkinPicker(); paintStage(); });
    el.appendChild(b);
  });
}

// ---------- UI: body shape sliders ----------
function buildShapeSliders() {
  const map = [
    { id: "sliderHeight", val: "valHeight", key: "height" },
    { id: "sliderLeg", val: "valLeg", key: "legLength" },
    { id: "sliderChest", val: "valChest", key: "chest" },
    { id: "sliderHip", val: "valHip", key: "hip" },
    { id: "sliderLegWidth", val: "valLegWidth", key: "legWidth" },
  ];
  map.forEach(({ id, val, key }) => {
    const input = document.getElementById(id);
    const label = document.getElementById(val);
    input.value = state.bodyShape[key];
    label.textContent = `${state.bodyShape[key]}%`;
    input.addEventListener("input", () => {
      state.bodyShape[key] = Number(input.value);
      label.textContent = `${input.value}%`;
      paintStage();
      hideScorePanel();
    });
  });
}

// ---------- UI: category tabs + item grid ----------
function buildTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeCat = btn.dataset.cat;
      buildItemGrid();
      buildColorRow();
    });
  });
}

function buildItemGrid() {
  const grid = document.getElementById("itemGrid");
  grid.innerHTML = "";
  const cat = state.activeCat;
  const query = state.filters.search.trim().toLowerCase();
  const activeTags = state.filters.tags;
  let shown = 0;

  ITEMS[cat].forEach((item, idx) => {
    const matchesSearch = !query || item.name.toLowerCase().includes(query) || item.tags.some((t) => TAG_LABEL[t].includes(query));
    const matchesTags = activeTags.size === 0 || item.tags.some((t) => activeTags.has(t));
    if (!matchesSearch || !matchesTags) return;
    shown++;

    const locked = !isUnlocked(cat, item, idx);
    const price = priceFor(cat, item, idx);
    const card = document.createElement("div");
    const isSelected = state.selections[cat].id === item.id;
    card.className = "item-card" + (isSelected ? " selected" : "") + (locked ? " locked" : "");
    const swatchColor = item.id === "none" ? "#f1edf7" : (isSelected ? state.selections[cat].color : (item.colors[0] || "#f1edf7"));
    card.innerHTML = `
      <div class="item-swatch" style="background:${swatchColor}">${locked ? "🔒" : item.emoji}</div>
      <div class="item-name">${item.name}</div>
      ${locked ? `<div class="lock-price">🪙 ${price}</div>` : `<div class="item-tags">${item.tags.map((t) => TAG_LABEL[t]).join(" · ")}</div>`}
    `;
    card.addEventListener("click", () => {
      if (locked) { attemptUnlock(cat, item, idx); return; }
      state.selections[cat] = { id: item.id, color: item.id === "none" ? null : item.colors[0] };
      buildItemGrid();
      buildColorRow();
      paintStage();
      hideScorePanel();
    });
    grid.appendChild(card);
  });

  if (shown === 0) {
    grid.innerHTML = `<p class="empty-note">검색 결과가 없어요.</p>`;
  }
}

function attemptUnlock(cat, item, idx) {
  const price = priceFor(cat, item, idx);
  const coins = getCoins();
  if (coins < price) {
    showToast(`🪙 코인이 부족해요! (필요 ${price}, 보유 ${coins})`);
    return;
  }
  setCoins(coins - price);
  unlockedSet.add(`${cat}:${item.id}`);
  saveUnlocked(unlockedSet);
  showToast(`🔓 ${item.name} 잠금 해제! (-${price} 코인)`);
  state.selections[cat] = { id: item.id, color: item.colors[0] };
  buildItemGrid();
  buildColorRow();
  paintStage();
  hideScorePanel();
}

// ---------- UI: search + tag filter ----------
function buildFilterUI() {
  const input = document.getElementById("searchInput");
  input.addEventListener("input", () => {
    state.filters.search = input.value;
    buildItemGrid();
  });

  const row = document.getElementById("tagFilterRow");
  row.innerHTML = "";
  Object.entries(TAG_LABEL).forEach(([tag, label]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tag-filter-chip";
    chip.textContent = label;
    chip.addEventListener("click", () => {
      if (state.filters.tags.has(tag)) state.filters.tags.delete(tag);
      else state.filters.tags.add(tag);
      chip.classList.toggle("active");
      buildItemGrid();
    });
    row.appendChild(chip);
  });
}

// ---------- UI: background picker ----------
function buildBgPicker() {
  const el = document.getElementById("bgPicker");
  el.innerHTML = "";
  BACKGROUNDS.forEach((bg) => {
    const b = document.createElement("div");
    b.className = "bg-swatch" + (bg.id === state.background ? " selected" : "");
    b.style.background = bg.swatch;
    b.title = bg.name;
    b.textContent = bg.emoji;
    b.addEventListener("click", () => {
      state.background = bg.id;
      localStorage.setItem(BG_KEY, bg.id);
      buildBgPicker();
      applyBackground();
    });
    el.appendChild(b);
  });
}
function applyBackground() {
  const bg = BACKGROUNDS.find((b) => b.id === state.background) || BACKGROUNDS[0];
  document.getElementById("stageFrame").style.background = bg.css;
}

// ---------- coins / toast ----------
function updateCoinDisplay() {
  const el = document.getElementById("coinDisplay");
  if (el) el.textContent = `🪙 ${getCoins()}`;
}
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

function buildColorRow() {
  const row = document.getElementById("colorRow");
  row.innerHTML = "";
  const cat = state.activeCat;
  const item = findItem(cat, state.selections[cat].id);
  if (!item.colors.length) return;
  item.colors.forEach((c) => {
    const sw = document.createElement("div");
    sw.className = "color-swatch" + (state.selections[cat].color === c ? " selected" : "");
    sw.style.background = c;
    sw.addEventListener("click", () => {
      state.selections[cat].color = c;
      buildColorRow();
      buildItemGrid();
      paintStage();
      hideScorePanel();
    });
    row.appendChild(sw);
  });
}

// ---------- mode toggle ----------
function buildModeToggle() {
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.mode = btn.dataset.mode;
      document.getElementById("themeCard").classList.toggle("hidden", state.mode !== "challenge");
      document.getElementById("scoreBtn").classList.toggle("hidden", state.mode !== "challenge");
      hideScorePanel();
      if (state.mode === "challenge") renderTheme();
    });
  });
  document.getElementById("nextThemeBtn").addEventListener("click", () => {
    state.themeIndex = (state.themeIndex + 1) % THEMES.length;
    renderTheme();
    hideScorePanel();
  });
}

function renderTheme() {
  const t = THEMES[state.themeIndex];
  document.getElementById("themeIcon").textContent = t.icon;
  document.getElementById("themeName").textContent = t.name;
  document.getElementById("themeDesc").textContent = t.desc;
  document.getElementById("themeTags").innerHTML = t.tags.map((tag) => `<span class="tag-chip">${TAG_LABEL[tag]}</span>`).join("");
}

// ---------- scoring ----------
function computeScore() {
  const t = THEMES[state.themeIndex];
  const topItem = findItem("top", state.selections.top.id);
  const slots = ["hair", "top", "shoes"];
  if (!topItem.overridesBottom) slots.push("bottom");
  if (state.selections.outer.id !== "none") slots.push("outer");
  if (state.selections.accessory.id !== "none") slots.push("accessory");

  let matched = 0;
  slots.forEach((cat) => {
    const item = findItem(cat, state.selections[cat].id);
    if (item.tags.some((tag) => t.tags.includes(tag))) matched++;
  });
  return Math.round((matched / slots.length) * 100);
}

function hideScorePanel() { document.getElementById("scorePanel").classList.add("hidden"); }

const SCORE_COIN_REWARD = [2, 4, 7, 12, 18];

function showScore() {
  const pct = computeScore();
  const starsCount = pct >= 100 ? 5 : pct >= 80 ? 4 : pct >= 60 ? 3 : pct >= 40 ? 2 : 1;
  const messages = [
    "음... 테마와는 조금 다른 방향이네요! 다시 골라볼까요? 🙂",
    "나쁘지 않아요! 조금만 더 테마에 맞춰볼까요?",
    "괜찮은 코디예요! 포인트 아이템 하나만 더 바꿔보세요.",
    "훌륭해요! 테마에 잘 어울리는 스타일이에요. 👏",
    "완벽해요! 스타일리스트 인정! 🌟",
  ];
  const reward = SCORE_COIN_REWARD[starsCount - 1];
  addCoins(reward);
  document.getElementById("stars").textContent = "★".repeat(starsCount) + "☆".repeat(5 - starsCount);
  document.getElementById("scoreText").textContent = `테마 적합도 ${pct}점`;
  document.getElementById("scoreFeedback").textContent = `${messages[starsCount - 1]} (🪙 +${reward})`;
  document.getElementById("scorePanel").classList.remove("hidden");
}

// ---------- actions ----------
function unlockedItems(cat) {
  return ITEMS[cat].filter((item, idx) => isUnlocked(cat, item, idx));
}

function randomizeOutfit() {
  ["hair", "top", "bottom", "shoes"].forEach((cat) => {
    const pool = unlockedItems(cat);
    const item = pool[Math.floor(Math.random() * pool.length)];
    state.selections[cat] = { id: item.id, color: item.colors[Math.floor(Math.random() * item.colors.length)] };
  });
  ["outer", "accessory"].forEach((cat) => {
    const pool = unlockedItems(cat).filter((i) => i.id !== "none");
    const use = pool.length > 0 && Math.random() > 0.4;
    const item = use ? pool[Math.floor(Math.random() * pool.length)] : ITEMS[cat][0];
    state.selections[cat] = { id: item.id, color: item.id === "none" ? null : item.colors[Math.floor(Math.random() * item.colors.length)] };
  });
  state.skin = SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];
  buildSkinPicker();
  buildItemGrid();
  buildColorRow();
  paintStage();
  hideScorePanel();
}

function resetOutfit() {
  state.selections = defaultSelections();
  state.bodyShape = defaultShape();
  buildShapeSliders();
  buildItemGrid();
  buildColorRow();
  paintStage();
  hideScorePanel();
}

// ---------- save / load (localStorage) ----------
const STORAGE_KEY = "closetakeout_saves";
function getSaves() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}
function setSaves(list) { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }

function saveOutfit() {
  const name = prompt("코디 이름을 입력하세요", `내 코디 ${getSaves().length + 1}`);
  if (!name) return;
  const saves = getSaves();
  saves.unshift({
    id: Date.now().toString(),
    name,
    skin: state.skin,
    background: state.background,
    bodyShape: JSON.parse(JSON.stringify(state.bodyShape)),
    selections: JSON.parse(JSON.stringify(state.selections)),
  });
  setSaves(saves.slice(0, 30));
  buildSavedGrid();
  showToast("📖 룩북에 저장했어요!");
}

function loadOutfit(id) {
  const found = getSaves().find((s) => s.id === id);
  if (!found) return;
  state.skin = found.skin;
  state.background = found.background || "default";
  state.bodyShape = found.bodyShape || defaultShape();
  state.selections = JSON.parse(JSON.stringify(found.selections));
  buildSkinPicker();
  buildShapeSliders();
  buildBgPicker();
  applyBackground();
  buildItemGrid();
  buildColorRow();
  paintStage();
  hideScorePanel();
}

function deleteOutfit(id) {
  setSaves(getSaves().filter((s) => s.id !== id));
  buildSavedGrid();
}

function buildSavedGrid() {
  const grid = document.getElementById("savedGrid");
  const saves = getSaves();
  if (!saves.length) {
    grid.innerHTML = `<p class="empty-note">아직 저장한 코디가 없어요.</p>`;
    return;
  }
  grid.innerHTML = "";
  saves.forEach((s, idx) => {
    const card = document.createElement("div");
    card.className = "saved-card";
    card.innerHTML = `
      <svg viewBox="0 0 300 580">${renderCharacter(s.selections, s.skin, s.bodyShape || defaultShape(), s.id)}</svg>
      <div class="saved-name">${s.name}</div>
      <div class="saved-card-actions">
        <button data-act="load">입히기</button>
        <button data-act="del">삭제</button>
      </div>
    `;
    card.querySelector("svg").addEventListener("click", () => openLookbook(idx));
    card.querySelector('[data-act="load"]').addEventListener("click", () => loadOutfit(s.id));
    card.querySelector('[data-act="del"]').addEventListener("click", () => deleteOutfit(s.id));
    grid.appendChild(card);
  });
}

// ---------- lookbook viewer ----------
let lookbookIndex = 0;
function openLookbook(idx) {
  if (!getSaves().length) return;
  lookbookIndex = idx;
  renderLookbook();
  document.getElementById("lookbookModal").classList.remove("hidden");
}
function closeLookbook() {
  document.getElementById("lookbookModal").classList.add("hidden");
}
function renderLookbook() {
  const saves = getSaves();
  if (!saves.length) { closeLookbook(); return; }
  lookbookIndex = ((lookbookIndex % saves.length) + saves.length) % saves.length;
  const s = saves[lookbookIndex];
  document.getElementById("lookbookSvg").innerHTML = renderCharacter(s.selections, s.skin, s.bodyShape || defaultShape(), "lb-" + s.id);
  document.getElementById("lookbookName").textContent = s.name;
  const d = new Date(Number(s.id));
  document.getElementById("lookbookDate").textContent = Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}
function buildLookbookControls() {
  document.getElementById("lookbookClose").addEventListener("click", closeLookbook);
  document.getElementById("lookbookModal").addEventListener("click", (e) => {
    if (e.target.id === "lookbookModal") closeLookbook();
  });
  document.getElementById("lookbookPrev").addEventListener("click", () => { lookbookIndex--; renderLookbook(); });
  document.getElementById("lookbookNext").addEventListener("click", () => { lookbookIndex++; renderLookbook(); });
}

// ---------- screenshot export ----------
function exportScreenshot() {
  const canvas3d = window.Character3D && window.Character3D.getCanvas();
  if (!canvas3d) return;
  const bgColor = (BACKGROUNDS.find((b) => b.id === state.background) || BACKGROUNDS[0]).swatch;
  const canvas = document.createElement("canvas");
  canvas.width = 600; canvas.height = 1160;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 600, 1160);
  ctx.drawImage(canvas3d, 0, 0, 600, 1160);
  const a = document.createElement("a");
  a.download = "my-outfit.png";
  a.href = canvas.toDataURL("image/png");
  a.click();
}

// ---------- init ----------
function init() {
  buildSkinPicker();
  buildBgPicker();
  applyBackground();
  buildShapeSliders();
  buildTabs();
  buildFilterUI();
  buildItemGrid();
  buildColorRow();
  buildModeToggle();
  buildSavedGrid();
  buildLookbookControls();
  paintStage();
  renderTheme();
  updateCoinDisplay();
  grantDailyBonusIfNeeded();

  document.getElementById("randomBtn").addEventListener("click", randomizeOutfit);
  document.getElementById("resetBtn").addEventListener("click", resetOutfit);
  document.getElementById("saveOutfitBtn").addEventListener("click", saveOutfit);
  document.getElementById("screenshotBtn").addEventListener("click", exportScreenshot);
  document.getElementById("scoreBtn").addEventListener("click", showScore);
  document.getElementById("scoreBtn").classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", init);
