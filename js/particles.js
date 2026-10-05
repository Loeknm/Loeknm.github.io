/* =========================================================
   PARTICLES
   A lightweight 3D particle field drawn on a 2D canvas
   (no libraries). The particles morph into a different
   shape for every view and react to the mouse.
   ========================================================= */

const Particles = (() => {
  const canvas = document.getElementById("particles");
  const ctx = canvas.getContext("2d");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0, H = 0, count = 0;
  let pos, speed;          // current positions + per-particle morph speed
  const targets = {};      // cached target positions per shape
  let shape = "sphere";
  let view = "home";
  let color = "255,255,255";
  let time = 0;
  let rotation = 0;

  const mouse = { x: -9999, y: -9999, nx: 0, ny: 0, sx: 0, sy: 0 };

  // Animated scene settings (eased towards `goal` every frame)
  const scene = { x: 0, y: 0, scale: 0.4, tilt: 0.25, alpha: 1 };
  let goal = { ...scene };

  /* ---------- Scene per view ----------
     shape  : which formation the particles make
     x / y  : offset from the screen center (fraction of the screen)
     scale  : size of the formation
     tilt   : rotation around the X axis (radians)
     alpha  : opacity of the whole field                        */
  function preset(name) {
    const m = W < 860;
    const presets = {
      home:    { shape: "sphere", x: m ? 0 : 0.18, y: m ? -0.22 : -0.04, scale: m ? 1.15 : 1.05, tilt: 0.25, alpha: 1 },
      work:    { shape: "wave",   x: 0,            y: 0.3,               scale: 1.1,              tilt: 0.95, alpha: 0.6 },
      project: { shape: "cloud",  x: 0,            y: 0,                 scale: 1.2,              tilt: 0.2,  alpha: 0.25 },
      about:   { shape: "torus",  x: m ? 0 : 0.26, y: m ? -0.2 : 0,      scale: m ? 0.8 : 1.15,   tilt: 1.15, alpha: 0.45 },
      contact: { shape: "galaxy", x: m ? 0 : 0.24, y: m ? -0.2 : -0.02,  scale: m ? 1 : 1.35,     tilt: 1.05, alpha: 0.75 }
    };
    return presets[name] || presets.home;
  }

  /* ---------- Shape generators ---------- */

  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

  const generators = {
    sphere(i, n) {
      const y = 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = i * GOLDEN;
      return [Math.cos(t) * r, y, Math.sin(t) * r];
    },
    wave(i, n) {
      const side = Math.ceil(Math.sqrt(n));
      const gx = i % side, gz = Math.floor(i / side);
      return [(gx / (side - 1) - 0.5) * 3.6, 0, (gz / (side - 1) - 0.5) * 3.6];
    },
    torus() {
      const u = Math.random() * Math.PI * 2, v = Math.random() * Math.PI * 2;
      const R = 0.85, r = 0.3;
      return [(R + r * Math.cos(v)) * Math.cos(u), r * Math.sin(v), (R + r * Math.cos(v)) * Math.sin(u)];
    },
    cloud() {
      const r = 2.4 * Math.cbrt(Math.random());
      const t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1);
      return [r * Math.sin(p) * Math.cos(t), r * Math.cos(p), r * Math.sin(p) * Math.sin(t)];
    },
    galaxy(i) {
      const arms = 3, t = Math.random();
      const a = t * Math.PI * 4 + (i % arms) * (Math.PI * 2 / arms);
      const rad = 0.08 + t * 1.3;
      const spread = 0.1 * (0.4 + t);
      return [Math.cos(a) * rad + gauss() * spread, gauss() * 0.06, Math.sin(a) * rad + gauss() * spread];
    }
  };

  function getTargets(name) {
    if (!targets[name]) {
      const arr = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) arr.set(generators[name](i, count), i * 3);
      targets[name] = arr;
    }
    return targets[name];
  }

  /* ---------- Setup ---------- */

  function resize() {
    W = innerWidth;
    H = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const p = preset(view);
    goal = { x: p.x, y: p.y, scale: p.scale, tilt: p.tilt, alpha: p.alpha };
  }

  function init() {
    W = innerWidth;
    count = W < 860 ? 1200 : 2400;
    pos = new Float32Array(count * 3);
    speed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Start collapsed in the center -> "big bang" intro
      pos[i * 3] = (Math.random() - 0.5) * 0.05;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.05;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
      speed[i] = 0.015 + Math.random() * 0.035;
    }
    resize();
    addEventListener("resize", resize);

    addEventListener("pointermove", (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.nx = (e.clientX / W - 0.5) * 2;
      mouse.ny = (e.clientY / H - 0.5) * 2;
    });
    const reset = () => { mouse.x = mouse.y = -9999; };
    document.documentElement.addEventListener("pointerleave", reset);
    addEventListener("pointerup", (e) => { if (e.pointerType === "touch") reset(); });

    requestAnimationFrame(frame);
  }

  /* ---------- Render loop ---------- */

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    time += dt;

    for (const k in scene) scene[k] += (goal[k] - scene[k]) * 0.045;
    rotation += dt * (reduceMotion ? 0.02 : 0.12);
    mouse.sx += (mouse.nx - mouse.sx) * 0.04;
    mouse.sy += (mouse.ny - mouse.sy) * 0.04;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = `rgb(${color})`;

    const tgt = getTargets(shape);
    const cx = W / 2 + scene.x * W;
    const cy = H / 2 + scene.y * H;
    const unit = Math.min(W, H) * 0.3 * scene.scale;
    const ry = rotation + mouse.sx * 0.6;
    const rx = scene.tilt + mouse.sy * 0.25;
    const cY = Math.cos(ry), sY = Math.sin(ry), cX = Math.cos(rx), sX = Math.sin(rx);
    const CAM = 3.4, R = 110, R2 = R * R;

    for (let i = 0; i < count; i++) {
      const j = i * 3;
      let tx = tgt[j], ty = tgt[j + 1], tz = tgt[j + 2];

      // Living motion per shape
      if (shape === "wave") {
        ty = Math.sin(tx * 2 + time * 1.1) * 0.16 + Math.cos(tz * 2.4 + time * 0.8) * 0.12;
      } else if (shape === "sphere") {
        const k = 1 + 0.07 * Math.sin(tx * 3 + time * 1.2) * Math.sin(ty * 3 + time * 0.9);
        tx *= k; ty *= k; tz *= k;
      }

      const s = speed[i];
      pos[j] += (tx - pos[j]) * s;
      pos[j + 1] += (ty - pos[j + 1]) * s;
      pos[j + 2] += (tz - pos[j + 2]) * s;

      const x = pos[j], y = pos[j + 1], z = pos[j + 2];

      // Rotate around Y, then X
      const x1 = x * cY - z * sY;
      const z1 = x * sY + z * cY;
      const y1 = y * cX - z1 * sX;
      const z2 = y * sX + z1 * cX;

      const depth = CAM - z2;
      if (depth < 0.4) continue;
      const p = CAM / depth;

      let sx = cx + x1 * unit * p;
      let sy = cy - y1 * unit * p;

      // Push particles away from the cursor
      const dx = sx - mouse.x, dy = sy - mouse.y, d2 = dx * dx + dy * dy;
      if (d2 < R2 && d2 > 0.01) {
        const d = Math.sqrt(d2), f = (1 - d / R) * 28;
        sx += (dx / d) * f;
        sy += (dy / d) * f;
      }

      const a = Math.min(1, Math.max(0.08, 0.2 + ((z2 + 1.4) / 2.8) * 0.8)) * scene.alpha;
      const size = Math.max(0.7, p * 1.25);
      ctx.globalAlpha = a;
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }

  /* ---------- Public API ---------- */

  function setView(name) {
    view = name;
    const p = preset(name);
    shape = p.shape;
    goal = { x: p.x, y: p.y, scale: p.scale, tilt: p.tilt, alpha: p.alpha };
  }

  function setColor(rgb) {
    if (rgb) color = rgb;
  }

  // Scatter the particles outward; they drift back into shape
  function burst() {
    if (reduceMotion) return;
    for (let i = 0; i < count * 3; i++) pos[i] *= 1.4 + Math.random() * 1.2;
  }

  init();
  return { setView, setColor, burst };
})();
