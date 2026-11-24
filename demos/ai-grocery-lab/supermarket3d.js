/**
 * Polished Three.js Isometric 3D Supermarket for AI Grocery Lab.
 * Visually inspired by the AI-Grocery-Lab-Demo.mp4 architectural diorama:
 *   - Elevated isometric OrthographicCamera + smooth follow/overview transitions
 *   - Tiled warm-ivory floor on dark architectural plinth
 *   - L-shaped walls: storefront windows on left, deep emerald "AI GROCERY LAB" & "CHILLED" wall on back
 *   - Produce wooden crate islands, 3 double-sided stocked emerald gondolas, 3 chilled fridges, 2 checkout lanes
 *   - 12 animated shoppers (6 Group A, 6 Group B) pushing rolling amber carts that fill with picked products
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

function makeTileFloorTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#eae9e2";
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "#d5d3c8";
  ctx.lineWidth = 3;
  for (let i = 0; i <= 512; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4.5, 3.4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSignTexture(text, bg = "#0d5e47", fg = "#f8fafc", width = 512, height = 112, fontSize = 54) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = fg;
  ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildCorridorPath(x0, z0, x1, z1) {
  // Route shoppers cleanly around gondolas (gondolas occupy z in [-2.3, 1.5] around x = -2.0, 1.2, 4.4)
  const pts = [{ x: x0, z: z0 }];
  const needsCross = Math.abs(x1 - x0) > 1.3 && (z0 > -2.5 && z0 < 1.8) && (z1 > -2.5 && z1 < 1.8);
  if (needsCross) {
    const corridorZ = (z0 + z1) / 2 < -0.4 ? -2.9 : 2.35;
    pts.push({ x: x0, z: corridorZ });
    pts.push({ x: x1, z: corridorZ });
  } else if (Math.abs(x1 - x0) > 2.2 && Math.abs(z1 - z0) > 1.8) {
    // L-shaped corridor bend
    const midZ = z1 > 2.5 ? 2.55 : (z1 < -2.6 ? -3.0 : z0);
    pts.push({ x: x0, z: midZ });
    pts.push({ x: x1, z: midZ });
  }
  pts.push({ x: x1, z: z1 });
  return pts;
}

function samplePolyline(pts, u) {
  if (pts.length === 1) return { x: pts[0].x, z: pts[0].z, dx: 0, dz: 1 };
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    segs.push({ a: pts[i], b: pts[i + 1], len });
    total += len;
  }
  if (total < 1e-4) return { x: pts[0].x, z: pts[0].z, dx: 0, dz: 1 };
  let target = Math.max(0, Math.min(1, u)) * total;
  for (const s of segs) {
    if (target <= s.len || s === segs[segs.length - 1]) {
      const f = s.len > 1e-4 ? Math.max(0, Math.min(1, target / s.len)) : 1;
      return {
        x: s.a.x + (s.b.x - s.a.x) * f,
        z: s.a.z + (s.b.z - s.a.z) * f,
        dx: s.b.x - s.a.x,
        dz: s.b.z - s.a.z,
      };
    }
    target -= s.len;
  }
  const last = pts[pts.length - 1];
  return { x: last.x, z: last.z, dx: 0, dz: 1 };
}

export class Supermarket3D {
  constructor(canvas, badgeLayer, onSelectShopper) {
    this.canvas = canvas;
    this.badgeLayer = badgeLayer;
    this.onSelectShopper = onSelectShopper;
    this.shopperNodes = new Map();
    this.selectedId = null;
    this.matchedId = null;
    this.followMode = false;
    this.targetLook = new THREE.Vector3(-0.3, 0.4, 0.2);
    this.currentLook = new THREE.Vector3(-0.3, 0.4, 0.2);
    this.targetZoom = 1.05;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this._initScene();
    this._buildSupermarket();
    this._bindEvents();
    this._resize();
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x141d24);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    const frustum = 11.2;
    this.frustum = frustum;
    this.camera = new THREE.OrthographicCamera(
      -frustum * aspect, frustum * aspect, frustum, -frustum, 0.1, 120
    );
    this.cameraOffset = new THREE.Vector3(-14.5, 14.2, 16.5);
    this.camera.position.copy(this.currentLook).add(this.cameraOffset);
    this.camera.zoom = this.targetZoom;
    this.camera.lookAt(this.currentLook);
    this.camera.updateProjectionMatrix();

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enableRotate = true;
    this.controls.maxPolarAngle = Math.PI / 2.25;
    this.controls.minPolarAngle = Math.PI / 5.5;
    this.controls.minZoom = 0.72;
    this.controls.maxZoom = 2.6;
    this.controls.target.copy(this.currentLook);

    // Warm studio lighting matching reference MP4
    const hemi = new THREE.HemisphereLight(0xf8fafc, 0x334155, 0.95);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfffbeb, 1.35);
    key.position.set(-10, 20, 12);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -15;
    key.shadow.camera.right = 15;
    key.shadow.camera.top = 15;
    key.shadow.camera.bottom = -15;
    key.shadow.bias = -0.0005;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x99f6e4, 0.35);
    fill.position.set(14, 10, -8);
    this.scene.add(fill);
  }

  _buildSupermarket() {
    const store = new THREE.Group();
    this.scene.add(store);

    // 1. Thick architectural plinth + tiled floor
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(19.0, 0.7, 13.6),
      new THREE.MeshStandardMaterial({ color: 0x0f171d, roughness: 0.9 })
    );
    plinth.position.set(0, -0.36, 0);
    plinth.receiveShadow = true;
    store.add(plinth);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(18.6, 13.2),
      new THREE.MeshStandardMaterial({ map: makeTileFloorTexture(), roughness: 0.75, metalness: 0.02 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    store.add(floor);

    // 2. Back-left ivory wall with 3 storefront glass windows
    const leftWallMat = new THREE.MeshStandardMaterial({ color: 0xe6e5de, roughness: 0.85 });
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.32, 3.4, 13.2), leftWallMat);
    leftWall.position.set(-9.15, 1.7, 0);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    store.add(leftWall);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.3 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.15, metalness: 0.5, transparent: true, opacity: 0.65 });
    for (const wz of [-3.6, -0.4, 2.8]) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.75, 2.35), frameMat);
      frame.position.set(-9.13, 1.85, wz);
      store.add(frame);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.5, 2.1), glassMat);
      pane.position.set(-9.12, 1.85, wz);
      store.add(pane);
    }

    // 3. Back emerald feature wall ("AI GROCERY LAB" & "CHILLED")
    const emeraldMat = new THREE.MeshStandardMaterial({ color: 0x0d5e47, roughness: 0.65 });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(18.6, 3.4, 0.32), emeraldMat);
    backWall.position.set(0, 1.7, -6.45);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    store.add(backWall);

    // Top dark cap trim along both walls
    const cap1 = new THREE.Mesh(new THREE.BoxGeometry(18.95, 0.12, 0.38), frameMat);
    cap1.position.set(0, 3.42, -6.45);
    store.add(cap1);
    const cap2 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 13.45), frameMat);
    cap2.position.set(-9.15, 3.42, 0);
    store.add(cap2);

    // Signage on emerald wall
    const brandSign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8, 0.85),
      new THREE.MeshBasicMaterial({ map: makeSignTexture("AI GROCERY LAB", "#0d5e47", "#f8fafc", 640, 112, 54) })
    );
    brandSign.position.set(-4.0, 2.85, -6.27);
    store.add(brandSign);

    const chillSign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.55),
      new THREE.MeshBasicMaterial({ map: makeSignTexture("CHILLED", "#0d5e47", "#a7f3d0", 420, 96, 48) })
    );
    chillSign.position.set(4.1, 2.95, -6.27);
    store.add(chillSign);

    // 4. Three glass-front chilled fridge cabinets along back-right wall
    const fridgeBodyMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.25 });
    const fridgeInnerMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 });
    const chilledColors = [0x38bdf8, 0xfde047, 0x2dd4bf, 0x60a5fa, 0xa3e635, 0xfb7185];
    for (let f = 0; f < 3; f++) {
      const fx = 2.0 + f * 2.15;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.85, 2.45, 0.92), fridgeBodyMat);
      cab.position.set(fx, 1.225, -5.82);
      cab.castShadow = true;
      cab.receiveShadow = true;
      store.add(cab);

      const inner = new THREE.Mesh(new THREE.BoxGeometry(1.62, 2.1, 0.12), fridgeInnerMat);
      inner.position.set(fx, 1.22, -5.38);
      store.add(inner);

      // Shelves & colorful chilled items inside each fridge
      for (let row = 0; row < 4; row++) {
        const sy = 0.48 + row * 0.48;
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.52), frameMat);
        shelf.position.set(fx, sy, -5.6);
        store.add(shelf);
        for (let item = 0; item < 5; item++) {
          const box = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, 0.28, 0.2),
            new THREE.MeshStandardMaterial({ color: chilledColors[(f * 4 + row + item) % chilledColors.length], roughness: 0.4 })
          );
          box.position.set(fx - 0.6 + item * 0.3, sy + 0.16, -5.54);
          store.add(box);
        }
      }
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 2.16), glassMat);
      door.position.set(fx, 1.22, -5.35);
      store.add(door);
    }

    // 5. Front-left Produce wooden crate tables (matching reference MP4)
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xc29b6c, roughness: 0.8 });
    const producePalette = [0x22c55e, 0xef4444, 0xfacc15, 0xf97316, 0x15803d, 0x84cc16];
    for (let t = 0; t < 2; t++) {
      const tz = 0.95 + t * 1.35;
      const table = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.85, 1.05), woodMat);
      table.position.set(-5.35, 0.425, tz);
      table.castShadow = true;
      table.receiveShadow = true;
      store.add(table);

      for (let b = 0; b < 4; b++) {
        const bx = -6.2 + b * 0.56;
        const crate = new THREE.Mesh(
          new THREE.BoxGeometry(0.46, 0.24, 0.78),
          new THREE.MeshStandardMaterial({ color: producePalette[(t * 4 + b) % producePalette.length], roughness: 0.65 })
        );
        crate.position.set(bx, 0.95, tz);
        crate.castShadow = true;
        store.add(crate);
      }
    }
    const prodSign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.34),
      new THREE.MeshBasicMaterial({ map: makeSignTexture("PRODUCE", "#146c53", "#ffffff", 320, 90, 44) })
    );
    prodSign.position.set(-5.35, 1.48, 0.42);
    store.add(prodSign);

    // 6. Three parallel double-sided emerald-green gondolas (aisle_1, aisle_2, aisle_3)
    const gondolaMat = new THREE.MeshStandardMaterial({ color: 0x136f56, roughness: 0.55 });
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.7 });
    const skuColors = [0xdc2626, 0xeab308, 0x0ea5e9, 0xf97316, 0x22c55e, 0xf8fafc, 0x8b5cf6, 0x14b8a6];
    const aisleXs = [-2.0, 1.2, 4.4];

    aisleXs.forEach((ax, aIdx) => {
      // Spine & endcaps
      const spine = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.85, 3.6), gondolaMat);
      spine.position.set(ax, 0.925, -0.4);
      spine.castShadow = true;
      spine.receiveShadow = true;
      store.add(spine);

      for (const ez of [-2.22, 1.42]) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.9, 0.14), gondolaMat);
        cap.position.set(ax, 0.95, ez);
        cap.castShadow = true;
        store.add(cap);
      }
      const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.12, 3.74), gondolaMat);
      topBar.position.set(ax, 1.92, -0.4);
      store.add(topBar);

      // 4 tiers of shelves + colorful stocked products on both sides
      for (let tier = 0; tier < 4; tier++) {
        const sy = 0.28 + tier * 0.42;
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.05, 3.52), shelfMat);
        plank.position.set(ax, sy, -0.4);
        plank.receiveShadow = true;
        store.add(plank);

        for (const side of [-0.26, 0.26]) {
          for (let slot = 0; slot < 9; slot++) {
            const pz = -1.9 + slot * 0.37;
            // Intentionally leave a small visible gap on Aisle 1 top shelf for sold-out Tomato Sauce!
            if (aIdx === 0 && tier === 2 && side < 0 && slot === 1) continue;
            const h = 0.18 + ((aIdx + tier + slot) % 3) * 0.05;
            const itemMesh = new THREE.Mesh(
              new THREE.BoxGeometry(0.22, h, 0.24),
              new THREE.MeshStandardMaterial({ color: skuColors[(aIdx * 7 + tier * 3 + slot) % skuColors.length], roughness: 0.45 })
            );
            itemMesh.position.set(ax + side, sy + 0.03 + h / 2, pz);
            itemMesh.castShadow = true;
            store.add(itemMesh);
          }
        }
      }
    });

    // CHECKOUT sign mounted on front of middle gondola (just like reference MP4!)
    const chkSign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.35, 0.38),
      new THREE.MeshBasicMaterial({ map: makeSignTexture("CHECKOUT", "#136f56", "#ffffff", 360, 96, 46) })
    );
    chkSign.position.set(1.2, 1.62, 1.52);
    store.add(chkSign);

    // 7. Two Checkout Lanes (front-center & front-right)
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });
    for (const cx of [0.2, 3.4]) {
      const counter = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.88, 2.35), gondolaMat);
      counter.position.set(cx, 0.44, 4.35);
      counter.castShadow = true;
      counter.receiveShadow = true;
      store.add(counter);

      const topWhite = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.08, 2.38), whiteMat);
      topWhite.position.set(cx, 0.9, 4.35);
      store.add(topWhite);

      const belt = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.04, 1.5), beltMat);
      belt.position.set(cx - 0.15, 0.95, 4.05);
      store.add(belt);

      // POS monitor
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.08), frameMat);
      stand.position.set(cx + 0.25, 1.1, 4.95);
      store.add(stand);
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.05), whiteMat);
      screen.position.set(cx + 0.25, 1.32, 4.95);
      screen.rotation.y = -0.3;
      store.add(screen);
    }
  }

  _createShopperMesh(shopper) {
    const group = new THREE.Group();
    group.userData.shopperId = shopper.shopper_id;

    // Selection glow ring under shopper
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.62, 28),
      new THREE.MeshBasicMaterial({
        color: shopper.arm === "B" ? 0x10b981 : 0xf59e0b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.0,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    group.add(ring);

    // Stylized low-poly shopper figure
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(shopper.shirt_color), roughness: 0.6 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.7 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.85 });

    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.56, 0.14), pantsMat);
    leftLeg.position.set(-0.1, 0.28, 0);
    leftLeg.castShadow = true;
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.56, 0.14), pantsMat);
    rightLeg.position.set(0.1, 0.28, 0);
    rightLeg.castShadow = true;

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.24), shirtMat);
    torso.position.set(0, 0.84, 0);
    torso.castShadow = true;

    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.42, 0.11), shirtMat);
    leftArm.position.set(-0.27, 0.82, 0.12);
    leftArm.rotation.x = -0.65;
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.42, 0.11), shirtMat);
    rightArm.position.set(0.27, 0.82, 0.12);
    rightArm.rotation.x = -0.65;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), skinMat);
    head.position.set(0, 1.32, 0);
    head.castShadow = true;

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.188, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hair.position.set(0, 1.34, -0.02);

    // Warm orange/amber shopping cart pushed in front (+Z)
    const cart = new THREE.Group();
    cart.position.set(0, 0, 0.62);
    const cartMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.45, metalness: 0.25 });
    const wireMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.4, transparent: true, opacity: 0.72 });
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.62), wireMat);
    basket.position.set(0, 0.52, 0);
    basket.castShadow = true;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 0.05), cartMat);
    handle.position.set(0, 0.74, -0.32);
    const baseFrame = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.58), cartMat);
    baseFrame.position.set(0, 0.22, 0);

    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
    for (const [wx, wz] of [[-0.2, -0.22], [0.2, -0.22], [-0.2, 0.22], [0.2, 0.22]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 10), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.06, wz);
      cart.add(wheel);
    }

    const cartItemsGroup = new THREE.Group();
    cartItemsGroup.position.set(0, 0.44, 0);
    cart.add(basket, handle, baseFrame, cartItemsGroup);

    group.add(leftLeg, rightLeg, torso, leftArm, rightArm, head, hair, cart);
    group.traverse((obj) => {
      if (obj.isMesh) obj.userData.shopperId = shopper.shopper_id;
    });

    // Floating HTML A/B badge
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = `shopper-badge arm-${shopper.arm.toLowerCase()}`;
    badge.dataset.shopperId = shopper.shopper_id;
    badge.innerHTML = `<span>${shopper.shopper_id}</span><span class="b-state"></span>`;
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onSelectShopper(shopper.shopper_id, true);
    });
    this.badgeLayer.append(badge);

    // Precompute corridor segments for every timeline transition
    const segments = [];
    const tl = shopper.timeline;
    for (let i = 0; i < tl.length - 1; i++) {
      segments.push({
        t0: tl[i].t,
        t1: Math.max(tl[i + 1].t, tl[i].t + 0.01),
        pts: buildCorridorPath(tl[i].x, tl[i].z, tl[i + 1].x, tl[i + 1].z),
      });
    }

    this.scene.add(group);
    return {
      shopper,
      group,
      ring,
      leftLeg,
      rightLeg,
      cartItemsGroup,
      badge,
      segments,
      renderedCartCount: 0,
      lastYaw: 0,
    };
  }

  loadShoppers(shoppers) {
    for (const node of this.shopperNodes.values()) {
      this.scene.remove(node.group);
      node.badge.remove();
    }
    this.shopperNodes.clear();
    for (const s of shoppers) {
      this.shopperNodes.set(s.shopper_id, this._createShopperMesh(s));
    }
  }

  setSelection(shopperId, matchedId, follow = false) {
    this.selectedId = shopperId;
    this.matchedId = matchedId;
    this.followMode = follow;
    this.targetZoom = follow ? 1.42 : 1.05;
    if (!follow) {
      this.targetLook.set(0.3, 0.4, 0.2);
    }
    for (const [id, node] of this.shopperNodes.entries()) {
      const isSel = id === shopperId;
      const isMatch = id === matchedId;
      node.badge.classList.toggle("selected", isSel);
      node.badge.classList.toggle("matched", isMatch);
      node.ring.material.opacity = isSel ? 0.92 : (isMatch ? 0.45 : 0.0);
    }
  }

  resetOverview() {
    this.followMode = false;
    this.targetZoom = 1.05;
    this.targetLook.set(-0.3, 0.4, 0.2);
  }

  update(simTime) {
    for (const node of this.shopperNodes.values()) {
      const tl = node.shopper.timeline;
      if (!tl.length) continue;

      let pos = { x: tl[0].x, z: tl[0].z, dx: 0, dz: 1 };
      let moving = false;

      if (simTime <= tl[0].t) {
        pos = { x: tl[0].x, z: tl[0].z, dx: 1, dz: 0 };
      } else if (simTime >= tl[tl.length - 1].t) {
        const last = tl[tl.length - 1];
        pos = { x: last.x, z: last.z, dx: 0, dz: 1 };
      } else {
        for (const seg of node.segments) {
          if (simTime >= seg.t0 && simTime <= seg.t1) {
            const u = (simTime - seg.t0) / (seg.t1 - seg.t0);
            pos = samplePolyline(seg.pts, u);
            moving = Math.hypot(pos.dx, pos.dz) > 0.02;
            break;
          }
        }
      }

      node.group.position.set(pos.x, 0, pos.z);
      if (moving) {
        const yaw = Math.atan2(pos.dx, pos.dz);
        node.lastYaw = yaw;
        node.group.rotation.y = yaw;
        const swing = Math.sin(simTime * 11.0) * 0.42;
        node.leftLeg.rotation.x = swing;
        node.rightLeg.rotation.x = -swing;
      } else {
        node.group.rotation.y = node.lastYaw;
        node.leftLeg.rotation.x = 0;
        node.rightLeg.rotation.x = 0;
      }

      // Sync visible product boxes inside cart from pickup events up to simTime
      const picked = tl.filter(
        (ev) => ev.t <= simTime && (ev.type === "pickup" || ev.type === "substitute_accepted")
      );
      if (picked.length !== node.renderedCartCount) {
        node.cartItemsGroup.clear();
        picked.forEach((ev, i) => {
          const color = ev.payload?.color_hex || "#22c55e";
          const cube = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 0.16, 0.16),
            new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.45 })
          );
          cube.position.set(
            (i % 2 === 0 ? -0.1 : 0.1),
            Math.floor(i / 4) * 0.14,
            -0.14 + (Math.floor(i / 2) % 2) * 0.22
          );
          node.cartItemsGroup.add(cube);
        });
        node.renderedCartCount = picked.length;
      }

      // Update floating A/B badge outcome icon
      const lastReached = [...tl].reverse().find((ev) => ev.t <= simTime) || tl[0];
      const stateEl = node.badge.querySelector(".b-state");
      if (lastReached.type === "checkout_complete") stateEl.textContent = "✓";
      else if (lastReached.type === "abandon" || lastReached.type === "checkout_failed") stateEl.textContent = "×";
      else if (lastReached.type === "stockout") stateEl.textContent = "!";
      else stateEl.textContent = "";

      // Follow selected shopper smoothly, shifted slightly left of the right-hand inspector
      if (this.followMode && node.shopper.shopper_id === this.selectedId) {
        this.targetLook.set(pos.x + 1.35, 0.5, pos.z - 0.35);
      }

      // Project 3D head to 2D screen badge
      const worldHead = new THREE.Vector3(pos.x, 1.88, pos.z);
      worldHead.project(this.camera);
      const sx = (worldHead.x * 0.5 + 0.5) * this.canvas.clientWidth;
      const sy = (-worldHead.y * 0.5 + 0.5) * this.canvas.clientHeight;
      node.badge.style.left = `${sx.toFixed(1)}px`;
      node.badge.style.top = `${sy.toFixed(1)}px`;
    }

    // Smooth camera pan & zoom interpolation
    this.currentLook.lerp(this.targetLook, 0.08);
    if (this.followMode) {
      this.controls.target.copy(this.currentLook);
      this.camera.position.copy(this.currentLook).add(this.cameraOffset);
    } else {
      this.controls.target.lerp(this.targetLook, 0.06);
    }
    this.camera.zoom += (this.targetZoom - this.camera.zoom) * 0.08;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  _bindEvents() {
    window.addEventListener("resize", () => this._resize());
    this.canvas.addEventListener("click", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const meshes = [];
      for (const n of this.shopperNodes.values()) {
        n.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
      }
      const hits = this.raycaster.intersectObjects(meshes, false);
      if (hits.length && hits[0].object.userData.shopperId) {
        this.onSelectShopper(hits[0].object.userData.shopperId, true);
      }
    });
  }

  _resize() {
    const w = window.innerWidth;
    const h = Math.max(window.innerHeight, 1);
    const aspect = w / h;
    this.camera.left = -this.frustum * aspect;
    this.camera.right = this.frustum * aspect;
    this.camera.top = this.frustum;
    this.camera.bottom = -this.frustum;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
}
