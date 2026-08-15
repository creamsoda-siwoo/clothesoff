// ---------- Closet Takeout: real 3D character renderer ----------
// Builds an actual rotatable 3D humanoid (Three.js primitives: Lathe-revolved
// torso/garments + tapered cylinders for limbs/sleeves/pants) instead of the
// flat SVG cutout used for thumbnails. Reuses window.computeGeometry /
// window.findItem from app.js so proportions stay in sync with the 2D views.

import * as THREE from "three";

const SCALE = 100; // svg px -> world units
const px = (v) => v / SCALE;

let renderer, scene, camera, characterGroup;
let rotY = 0, dragging = false, lastPointerX = 0, lastInteraction = 0;
let container, canvas;

// ---------- geometry helpers ----------
function makeToY(footCyPx) {
  return (gy) => (footCyPx - gy) / SCALE;
}
function makeToX(headCxPx) {
  return (gx) => (gx - headCxPx) / SCALE;
}

// human torsos/limbs read as flat-ish front-to-back, not perfectly round in
// cross-section, so every solid-of-revolution gets a slight Z squash.
const BODY_DEPTH = 0.8;
const LIMB_DEPTH = 0.88;

function latheFromKeypoints(keypoints, color, opts = {}) {
  const pts = keypoints.map((k) => new THREE.Vector2(Math.max(0.015, k.r), k.y));
  const spline = new THREE.SplineCurve(pts);
  const sampled = spline.getPoints(Math.max(10, keypoints.length * 6));
  const geo = new THREE.LatheGeometry(sampled, opts.segments || 28);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0.04, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.z = opts.depth ?? BODY_DEPTH;
  return mesh;
}

function tubeMesh(cxWorld, topR, botR, yTop, yBot, color, seg = 16) {
  const h = Math.max(0.02, yTop - yBot);
  const geo = new THREE.CylinderGeometry(Math.max(0.015, topR), Math.max(0.015, botR), h, seg);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.04 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cxWorld, (yTop + yBot) / 2, 0);
  mesh.scale.z = LIMB_DEPTH;
  return mesh;
}

function coneMesh(topR, botR, yTop, yBot, color, seg = 28) {
  const h = Math.max(0.02, yTop - yBot);
  const geo = new THREE.CylinderGeometry(Math.max(0.015, topR), Math.max(0.015, botR), h, seg);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.66, metalness: 0.03 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, (yTop + yBot) / 2, 0);
  mesh.scale.z = BODY_DEPTH;
  return mesh;
}

// ---------- item -> dimension tables (mirrors the 2D shape params) ----------
const TOP_DIMS = {
  shirt: (G) => ({ hem: G.waistY + 4, sleeve: G.armBottom }),
  sweater: (G) => ({ hem: G.waistY + 8, sleeve: G.armBottom - 4 }),
  turtleneck: (G) => ({ hem: G.waistY, sleeve: G.armBottom - 4 }),
  crop: (G) => ({ hem: G.waistY - 40, sleeve: G.armY + 46 }),
  offshoulder: (G) => ({ hem: G.waistY - 34, sleeve: null }),
  boatneck: (G) => ({ hem: G.waistY - 10, sleeve: G.armBottom - 10 }),
  blazer: (G) => ({ hem: G.waistY + 26, sleeve: G.armBottom - 4 }),
  sport: (G) => ({ hem: G.waistY - 26, sleeve: null }),
  halter: (G) => ({ hem: G.waistY - 32, sleeve: null }),
  denimshirt: (G) => ({ hem: G.waistY + 2, sleeve: G.armBottom - 2 }),
  vest: (G) => ({ hem: G.waistY - 6, sleeve: null }),
};
const DRESS_DIMS = {
  minidress: (G) => ({ hem: G.waistY + 90, flare: 20, sleeve: G.armY + 40 }),
  sundress: (G) => ({ hem: G.waistY + 120, flare: 26, sleeve: null }),
  longdress: (G) => ({ hem: G.ankleY - 26, flare: 18, sleeve: G.armBottom - 10 }),
  knitdress: (G) => ({ hem: G.ankleY - 60, flare: 14, sleeve: G.armBottom - 6 }),
  wrapdress: (G) => ({ hem: G.waistY + 110, flare: 24, sleeve: G.armBottom - 8 }),
};
const BOTTOM_DIMS = {
  slacks: (G) => ({ type: "pants", hem: G.ankleY }),
  jeans: (G) => ({ type: "pants", hem: G.ankleY }),
  shorts: (G) => ({ type: "pants", hem: G.waistY + 70 }),
  cargo: (G) => ({ type: "pants", hem: G.ankleY }),
  miniskirt: (G) => ({ type: "skirt", hem: G.waistY + 60, flare: 22 }),
  pencil: (G) => ({ type: "skirt", hem: G.waistY + 130, flare: 4 }),
  joggers: (G) => ({ type: "pants", hem: G.ankleY - 30 }),
  pleats: (G) => ({ type: "skirt", hem: G.ankleY - 40, flare: 30 }),
  wideleg: (G) => ({ type: "pants", hem: G.ankleY, wide: true }),
  leggings: (G) => ({ type: "pants", hem: G.ankleY, fitted: true }),
  midiskirt: (G) => ({ type: "skirt", hem: G.waistY + 95, flare: 16 }),
};
const OUTER_DIMS = {
  cardigan: (G) => ({ hem: G.waistY + 10, sleeve: G.armBottom - 2, gap: 12 }),
  denimjacket: (G) => ({ hem: G.torsoTop + 60, sleeve: G.armY + 60, gap: 10 }),
  hoodie: (G) => ({ hem: G.waistY + 4, sleeve: G.armBottom - 6, gap: 10 }),
  leather: (G) => ({ hem: G.torsoTop + 56, sleeve: G.armBottom - 8, gap: 8 }),
  coat: (G) => ({ hem: G.ankleY - 30, sleeve: G.armBottom - 2, gap: 14 }),
  paddedvest: (G) => ({ hem: G.waistY + 14, sleeve: null, gap: 12 }),
  bolero: (G) => ({ hem: G.armY + 50, sleeve: G.armBottom - 20, gap: 14 }),
};
const SHOE_STYLE = {
  loafer: "flat", flat: "flat", slide: "flat", sandal: "flat",
  sneaker: "sneaker",
  heel: "heel", wedge: "heel",
  boot: "boot", chelsea: "boot",
};
// `cap` is a fraction of PI (theta sweep from the top pole): a sphere dome
// wraps the FULL 360 degrees at every latitude it covers, so it must stay
// well above the eye-line latitude (~0.44 max) or the front of the "hair"
// paints over the face. Hair "length" instead comes from the side capsules,
// which hang beside the face rather than across it. `capScale` grows a big
// rounded silhouette (e.g. an afro) without dipping the dome down further.
const HAIR_CFG = {
  bob: { cap: 0.4, side: 0.42, tail: null },
  ponytail: { cap: 0.36, side: 0.22, tail: "pony" },
  wavy: { cap: 0.42, side: 0.95, tail: null },
  pixie: { cap: 0.28, side: 0.1, tail: null },
  twintail: { cap: 0.36, side: 0.2, tail: "twin" },
  curly: { cap: 0.42, side: 0.14, tail: null, capScale: 1.5 },
  lob: { cap: 0.4, side: 0.5, tail: null },
  straight: { cap: 0.4, side: 1.1, tail: null },
  halfup: { cap: 0.38, side: 0.35, tail: "bun" },
};

// ---------- category builders ----------
function buildBody(ctx, skin) {
  const { G, toX, toY } = ctx;
  const group = new THREE.Group();
  const mat = () => new THREE.MeshStandardMaterial({ color: skin, roughness: 0.55, metalness: 0.02 });

  // torso (shoulder -> chest -> waist -> hip), lathe-revolved for a real rounded body
  const chestYpx = G.torsoTop + (G.waistY - G.torsoTop) * 0.26;
  const waistYpx = G.torsoTop + (G.waistY - G.torsoTop) * 0.6;
  const torso = latheFromKeypoints(
    [
      { y: toY(G.torsoTop), r: px(G.shoulderW / 2) },
      { y: toY(chestYpx), r: px(G.chestW / 2) },
      { y: toY(waistYpx), r: px(28) },
      { y: toY(G.waistY), r: px(G.hipW / 2) },
    ],
    skin
  );
  group.add(torso);

  const neckR = px(G.neckW / 2);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(neckR * 1.05, neckR, px(G.neckH), 16), mat());
  neck.position.set(0, (toY(G.neckY) + toY(G.neckY + G.neckH)) / 2, 0);
  group.add(neck);

  const headR = px((G.headRx + G.headRy) / 2);
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 24, 18), mat());
  head.scale.set(G.headRx / ((G.headRx + G.headRy) / 2), G.headRy / ((G.headRx + G.headRy) / 2), 1);
  head.position.set(0, toY(G.headCy), 0);
  group.add(head);

  const cxL = toX(G.armLX + G.armW / 2), cxR = toX(G.armRX + G.armW / 2);
  const armTopR = px(G.armW * 0.58), armBotR = px(G.armW * 0.42);
  [cxL, cxR].forEach((cx, i) => {
    const arm = tubeMesh(cx, armTopR, armBotR, toY(G.armY), toY(G.armBottom), skin);
    arm.rotation.z = i === 0 ? 0.1 : -0.1;
    group.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(px(G.armW * 0.42), 14, 12), mat());
    hand.position.set(cx + (i === 0 ? -0.05 : 0.05), toY(G.handCy), 0);
    group.add(hand);
  });

  const cxLL = toX(G.legLX + G.legW / 2), cxRL = toX(G.legRX + G.legW / 2);
  const legTopR = px(G.legW * 0.62), legBotR = px(G.legW * 0.42);
  [cxLL, cxRL].forEach((cx) => {
    const leg = tubeMesh(cx, legTopR, legBotR, toY(G.waistY), toY(G.ankleY), skin);
    group.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(px(20), 12, 10), mat());
    foot.scale.set(1, 0.55, 1.5);
    foot.position.set(cx, toY(G.footCy), px(6));
    group.add(foot);
  });

  return group;
}

function buildFace(ctx, skin) {
  const { G, toY } = ctx;
  const group = new THREE.Group();
  const headR = px((G.headRx + G.headRy) / 2);
  const hy = toY(G.headCy);
  const eyeMat = new THREE.MeshStandardMaterial({ color: "#3a3346", roughness: 0.4 });
  const cheekMat = new THREE.MeshStandardMaterial({ color: "#ffb4c6", roughness: 0.8, transparent: true, opacity: 0.5 });
  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.11, 10, 8), eyeMat);
    eye.position.set(side * headR * 0.4, hy + headR * 0.08, headR * 1.01);
    group.add(eye);
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(headR * 0.16, 12), cheekMat);
    cheek.position.set(side * headR * 0.6, hy - headR * 0.18, headR * 0.95);
    group.add(cheek);
  });
  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(headR * 0.42, headR * 0.06, headR * 0.06),
    new THREE.MeshStandardMaterial({ color: "#a35a6b" })
  );
  mouth.position.set(0, hy - headR * 0.38, headR * 1.02);
  group.add(mouth);
  return group;
}

function buildHair(ctx, id, color) {
  const { G, toY } = ctx;
  const cfg = HAIR_CFG[id] || HAIR_CFG.bob;
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const headR = px((G.headRx + G.headRy) / 2);
  const hy = toY(G.headCy);

  // anchor the dome's own top pole just above the head, regardless of cap fraction
  const capRadius = headR * (cfg.capScale || 1.12);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(capRadius, 20, 14, 0, Math.PI * 2, 0, Math.PI * cfg.cap), mat);
  cap.position.set(0, hy + headR * 1.12 - capRadius, 0);
  group.add(cap);

  if (cfg.side > 0) {
    [-1, 1].forEach((side) => {
      const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(headR * 0.26, cfg.side, 4, 8), mat);
      capsule.position.set(side * headR * 0.88, hy - cfg.side / 2 + headR * 0.15, 0);
      group.add(capsule);
    });
  }
  if (cfg.tail === "pony") {
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(headR * 0.22, 0.85, 4, 8), mat);
    tail.position.set(0, hy - 0.35, -headR * 0.95);
    tail.rotation.x = 0.4;
    group.add(tail);
  } else if (cfg.tail === "twin") {
    [-1, 1].forEach((side) => {
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(headR * 0.18, 0.65, 4, 8), mat);
      tail.position.set(side * headR * 1.15, hy - 0.28, 0);
      group.add(tail);
    });
  } else if (cfg.tail === "bun") {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.3, 12, 12), mat);
    bun.position.set(0, hy + headR * 0.55, -headR * 0.5);
    group.add(bun);
  }
  return group;
}

function sleeveMesh(ctx, color, sleeveEndPx, widen = 4) {
  const { G, toX, toY } = ctx;
  if (sleeveEndPx == null) return null;
  const topR = px(G.armW * 0.68 + widen * 0.5);
  const botR = px(G.armW * 0.5 + widen * 0.35);
  const group = new THREE.Group();
  [toX(G.armLX + G.armW / 2), toX(G.armRX + G.armW / 2)].forEach((cx) => {
    group.add(tubeMesh(cx, topR, botR, toY(G.armY - 6), toY(sleeveEndPx), color));
  });
  return group;
}

function topLathe(ctx, topPx, hemPx, shoulderWpx, chestWpx, hemWpx, color, ease = 6) {
  const { toY } = ctx;
  const chestYpx = topPx + (hemPx - topPx) * 0.32;
  return latheFromKeypoints(
    [
      { y: toY(topPx), r: px(shoulderWpx / 2 + ease) },
      { y: toY(chestYpx), r: px(chestWpx / 2 + ease) },
      { y: toY(hemPx), r: px(hemWpx / 2 + ease) },
    ],
    color
  );
}

function buildTop(ctx, id, color) {
  const { G } = ctx;
  const group = new THREE.Group();
  if (DRESS_DIMS[id]) {
    const d = DRESS_DIMS[id](G);
    const sl = sleeveMesh(ctx, color, d.sleeve);
    if (sl) group.add(sl);
    group.add(topLathe(ctx, G.torsoTop - 4, G.waistY + 6, G.shoulderW, G.chestW, G.hipW + 6, color));
    group.add(coneMesh(px(G.hipW / 2 + 4), px(G.hipW / 2 + 4 + d.flare), ctx.toY(G.waistY + 6), ctx.toY(d.hem), color));
    return group;
  }
  const dims = (TOP_DIMS[id] || TOP_DIMS.shirt)(G);
  const sl = sleeveMesh(ctx, color, dims.sleeve);
  if (sl) group.add(sl);
  const hemW = dims.hem - G.waistY > 8 ? G.hipW + 14 : G.chestW * 0.88;
  group.add(topLathe(ctx, G.torsoTop - 4, dims.hem, G.shoulderW, G.chestW, hemW, color));
  return group;
}

function buildOuter(ctx, id, color, underColor) {
  const { G, toY } = ctx;
  if (!OUTER_DIMS[id]) return null;
  const dims = OUTER_DIMS[id](G);
  const group = new THREE.Group();
  const sl = sleeveMesh(ctx, color, dims.sleeve, 8);
  if (sl) group.add(sl);
  const top = G.torsoTop - 6;
  const hemW = dims.hem - G.waistY > 8 ? G.hipW + 16 : G.chestW * 0.98;
  group.add(topLathe(ctx, top, dims.hem, G.shoulderW + 6, G.chestW + 6, hemW, color));

  // open-front placket: a strip of the underlying color to suggest an open jacket
  const stripH = toY(top) - toY(dims.hem);
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(px(dims.gap || 10), stripH, 0.14),
    new THREE.MeshStandardMaterial({ color: underColor || "#ffffff", roughness: 0.65 })
  );
  strip.position.set(0, (toY(top) + toY(dims.hem)) / 2, px(Math.max(G.chestW, G.hipW) / 2 + 10));
  group.add(strip);
  return group;
}

function buildBottom(ctx, id, color) {
  const { G, toX, toY } = ctx;
  const dims = (BOTTOM_DIMS[id] || BOTTOM_DIMS.slacks)(G);
  const group = new THREE.Group();
  if (dims.type === "skirt") {
    group.add(coneMesh(px(G.hipW / 2 + 4), px(G.hipW / 2 + 4 + dims.flare), toY(G.waistY), toY(dims.hem), color));
    return group;
  }
  const topR = dims.wide ? px(G.legW / 2 + 12) : px(G.legW * 0.62 + (dims.fitted ? 1 : 5));
  const botR = dims.wide ? px(G.legW / 2 + 15) : px(G.legW * 0.5 + (dims.fitted ? 0 : 3));
  [toX(G.legLX + G.legW / 2), toX(G.legRX + G.legW / 2)].forEach((cx) => {
    group.add(tubeMesh(cx, topR, botR, toY(G.waistY - 16), toY(dims.hem), color));
  });
  return group;
}

function buildShoes(ctx, id, color) {
  const { G, toX, toY } = ctx;
  const style = SHOE_STYLE[id] || "flat";
  const group = new THREE.Group();
  [toX(G.footLCx), toX(G.footRCx)].forEach((cx) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
    if (style === "boot") {
      const boot = new THREE.Mesh(new THREE.CylinderGeometry(px(19), px(17), toY(G.ankleY - 24) - toY(G.footCy) + px(6), 14), mat);
      boot.position.set(cx, (toY(G.ankleY - 24) + toY(G.footCy)) / 2, px(4));
      group.add(boot);
    } else if (style === "heel") {
      const base = new THREE.Mesh(new THREE.SphereGeometry(px(18), 12, 10), mat);
      base.scale.set(1, 0.4, 1.6);
      base.position.set(cx, toY(G.footCy), px(4));
      group.add(base);
      const heel = new THREE.Mesh(new THREE.CylinderGeometry(px(2.5), px(4), px(24), 8), mat);
      heel.position.set(cx, toY(G.footCy) - px(10), px(14));
      group.add(heel);
    } else if (style === "sneaker") {
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(px(38), px(20), px(50)), mat);
      shoe.position.set(cx, toY(G.footCy), px(2));
      group.add(shoe);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(px(40), px(7), px(52)), new THREE.MeshStandardMaterial({ color: "#ffffff" }));
      sole.position.set(cx, toY(G.footCy) - px(13), px(2));
      group.add(sole);
    } else {
      const flat = new THREE.Mesh(new THREE.SphereGeometry(px(17), 12, 10), mat);
      flat.scale.set(1, 0.45, 1.5);
      flat.position.set(cx, toY(G.footCy), px(4));
      group.add(flat);
    }
  });
  return group;
}

function buildAccessory(ctx, id, color) {
  const { G, toY } = ctx;
  if (id === "none") return null;
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15 });
  const headR = px((G.headRx + G.headRy) / 2);
  const hy = toY(G.headCy);
  if (id === "glasses" || id === "sunglasses") {
    [-1, 1].forEach((side) => {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(headR * 0.16, headR * 0.03, 8, 16), mat);
      lens.position.set(side * headR * 0.4, hy + headR * 0.08, headR * 0.96);
      group.add(lens);
    });
  } else if (id === "cap" || id === "beret") {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.12, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), mat);
    cap.position.set(0, hy + headR * 0.55, 0);
    group.add(cap);
  } else if (id === "ribbon" || id === "headband") {
    const band = new THREE.Mesh(new THREE.TorusGeometry(headR * 1.02, headR * 0.08, 8, 20, Math.PI), mat);
    band.position.set(0, hy + headR * 0.2, 0);
    band.rotation.z = Math.PI;
    group.add(band);
  } else if (id === "jewelry" || id === "scarf") {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(px(G.neckW / 2 + 4), headR * 0.06, 8, 20), mat);
    ring.position.set(0, toY(G.neckY + G.neckH), 0);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  } else if (id === "bag") {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(px(26), px(22), px(12)), mat);
    bag.position.set(px(G.torsoW / 2 + 8), toY(G.waistY - 20), px(14));
    group.add(bag);
  } else if (id === "gloves") {
    [ctx.toX(G.handLCx), ctx.toX(G.handRCx)].forEach((cx) => {
      const glove = new THREE.Mesh(new THREE.SphereGeometry(px(G.armW * 0.46), 12, 10), mat);
      glove.position.set(cx, toY(G.handCy), 0);
      group.add(glove);
    });
  }
  return group;
}

// ---------- scene setup ----------
function initScene() {
  container = document.getElementById("character");
  if (!container) return;
  scene = new THREE.Scene();
  // world Y=0 is the feet (see makeToY); frame from just below the floor to
  // just above the head with the camera sitting level with the feet so the
  // ortho top/bottom offsets map directly onto that range.
  camera = new THREE.OrthographicCamera(-1.45, 1.45, 5.4, -0.25, 0.1, 50);
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(600, 1160, false);
  canvas = renderer.domElement;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.borderRadius = "12px";
  container.innerHTML = "";
  container.appendChild(canvas);

  scene.add(new THREE.HemisphereLight(0xfff3ea, 0xd9c8e8, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(3, 6, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.32);
  fill.position.set(-4, 3, 3);
  scene.add(fill);

  characterGroup = new THREE.Group();
  scene.add(characterGroup);

  container.style.cursor = "grab";
  container.style.touchAction = "none";
  container.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastPointerX = e.clientX;
    lastInteraction = performance.now();
    container.setPointerCapture(e.pointerId);
    container.style.cursor = "grabbing";
  });
  container.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastPointerX;
    lastPointerX = e.clientX;
    rotY += dx * 0.009;
    lastInteraction = performance.now();
  });
  const endDrag = () => { dragging = false; container.style.cursor = "grab"; };
  container.addEventListener("pointerup", endDrag);
  container.addEventListener("pointercancel", endDrag);
  container.addEventListener("pointerleave", endDrag);

  function loop() {
    requestAnimationFrame(loop);
    if (!dragging && performance.now() - lastInteraction > 3500) {
      rotY += 0.0032;
    }
    characterGroup.rotation.y = rotY;
    renderer.render(scene, camera);
  }
  loop();
}

function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  });
}

function update(sel, skin, shapePct) {
  if (!renderer) return;
  const G = window.computeGeometry({
    height: shapePct.height / 100,
    legLength: shapePct.legLength / 100,
    chest: shapePct.chest / 100,
    hip: shapePct.hip / 100,
    legWidth: shapePct.legWidth / 100,
  });
  const toY = makeToY(G.footCy);
  const toX = makeToX(G.headCx);
  const ctx = { G, toY, toX };

  while (characterGroup.children.length) {
    const child = characterGroup.children.pop();
    disposeGroup(child);
  }

  const findItem = window.findItem;
  const topItem = findItem("top", sel.top.id);
  const hairItem = findItem("hair", sel.hair.id);

  characterGroup.add(buildBody(ctx, skin));
  characterGroup.add(buildHair(ctx, sel.hair.id, sel.hair.color));

  if (!topItem.overridesBottom) {
    characterGroup.add(buildBottom(ctx, sel.bottom.id, sel.bottom.color));
  }
  characterGroup.add(buildShoes(ctx, sel.shoes.id, sel.shoes.color));
  characterGroup.add(buildTop(ctx, sel.top.id, sel.top.color));
  if (sel.outer.id !== "none") {
    const outerMesh = buildOuter(ctx, sel.outer.id, sel.outer.color, sel.top.color);
    if (outerMesh) characterGroup.add(outerMesh);
  }
  characterGroup.add(buildFace(ctx, skin));
  const acc = buildAccessory(ctx, sel.accessory.id, sel.accessory.color);
  if (acc) characterGroup.add(acc);

  renderer.render(scene, camera);
}

initScene();

window.Character3D = {
  update,
  getCanvas: () => canvas,
};
