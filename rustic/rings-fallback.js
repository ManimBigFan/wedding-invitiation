/* Software 3D fallback for browsers without WebGL. No timers or input handlers. */
(() => {
  'use strict';

  const clamp = value => Math.min(1, Math.max(0, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const between = (value, start, end) => smooth((value - start) / (end - start));
  const radians = value => value * Math.PI / 180;
  const power = value => Math.sign(value) * Math.pow(Math.abs(value), .62);
  const normalize = vector => { const length = Math.hypot(...vector); return vector.map(value => value / length); };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  function lightBox(axis, width, height, feather) {
    axis = normalize(axis);
    const right = normalize([axis[2], 0, -axis[0]]);
    const up = [axis[1] * right[2], axis[2] * right[0] - axis[0] * right[2], -axis[1] * right[0]];
    return { axis, right, up, width, height, feather };
  }
  const boxes = [
    lightBox([.1, -.1, 1], .27, .85, .25),
    lightBox([-.65, .45, 1], .2, .83, .15),
    lightBox([.5, 1, .32], .72, .22, .28),
    lightBox([.95, .15, -.3], .13, .76, .16)
  ];
  const keyDirection = normalize([-.6, .9, 1]);

  function boxReflection(direction, box) {
    const facing = dot(direction, box.axis);
    if (facing <= 0) return 0;
    const x = Math.abs(dot(direction, box.right) / Math.max(facing, .01)) / box.width;
    const y = Math.abs(dot(direction, box.up) / Math.max(facing, .01)) / box.height;
    return (1 - between(x, 1 - box.feather, 1 + box.feather)) *
      (1 - between(y, 1 - box.feather, 1 + box.feather));
  }

  const reflection = new Float32Array(3);
  const lowEnvironment = [.105, .085, .06], highEnvironment = [.67, .64, .57];
  const keyColor = [2.4, 2.28, 2.04], ceilingColor = [1.25, 1.2, 1.08], edgeColor = [1.55, 1.45, 1.23];

  function shade(x, y, z, nx, ny, nz, inner, gold, colors, offset) {
    const inverse = 1 / Math.hypot(x, y, 6.9 - z);
    const vx = -x * inverse, vy = -y * inverse, vz = (6.9 - z) * inverse;
    const facing = Math.max(0, nx * vx + ny * vy + nz * vz);
    reflection[0] = 2 * facing * nx - vx;
    reflection[1] = 2 * facing * ny - vy;
    reflection[2] = 2 * facing * nz - vz;
    const sky = between(reflection[1], -.65, .85);
    const dark = 1 - boxReflection(reflection, boxes[0]) * .72;
    const key = boxReflection(reflection, boxes[1]);
    const ceiling = boxReflection(reflection, boxes[2]);
    const edge = boxReflection(reflection, boxes[3]);
    const fresnel = Math.pow(1 - facing, 5);
    const diffuse = Math.max(0, nx * keyDirection[0] + ny * keyDirection[1] + nz * keyDirection[2]);
    for (let channel = 0; channel < 3; channel++) {
      const environment = mix(lowEnvironment[channel], highEnvironment[channel], sky) * dark + keyColor[channel] * key + ceilingColor[channel] * ceiling + edgeColor[channel] * edge;
      let value = environment * (gold[channel] + (1 - gold[channel]) * fresnel) + gold[channel] * (.075 + diffuse * .13);
      value *= 1 - inner * .18;
      value /= 1 + value * .48;
      colors[offset + channel] = Math.round(Math.min(1, Math.pow(Math.max(0, value), .4545)) * 255);
    }
  }

  function band(major, radial, halfWidth, gold) {
    const around = 80, across = 16, count = around * across;
    const local = new Float32Array(count * 3), normals = new Float32Array(count * 3);
    const inner = new Float32Array(count), faces = [];
    const profile = angle => [radial * power(Math.cos(angle)), halfWidth * power(Math.sin(angle))];
    for (let i = 0; i < around; i++) {
      const angle = i / around * Math.PI * 2, ca = Math.cos(angle), sa = Math.sin(angle);
      for (let j = 0; j < across; j++) {
        const index = i * across + j, offset = index * 3, angle2 = j / across * Math.PI * 2;
        const point = profile(angle2), before = profile(angle2 - .003), after = profile(angle2 + .003);
        const nr = after[1] - before[1], nz = before[0] - after[0], length = Math.hypot(nr, nz);
        local.set([(major + point[0]) * ca, (major + point[0]) * sa, point[1]], offset);
        normals.set([nr / length * ca, nr / length * sa, nz / length], offset);
        inner[index] = Math.max(0, -nr / length);
        faces.push([index, ((i + 1) % around) * across + j, ((i + 1) % around) * across + (j + 1) % across, i * across + (j + 1) % across]);
      }
    }
    return { local, normals, inner, faces, gold, world: new Float32Array(count * 3), worldNormals: new Float32Array(count * 3), screen: new Float32Array(count * 2), colors: new Uint8Array(count * 3) };
  }

  function rotation(angles) {
    const [x, y, z] = angles.map(radians);
    const sx = Math.sin(x), cx = Math.cos(x), sy = Math.sin(y), cy = Math.cos(y), sz = Math.sin(z), cz = Math.cos(z);
    return [cz * cy, sz * cy, -sy, cz * sy * sx - sz * cx, sz * sy * sx + cz * cx, cy * sx, cz * sy * cx + sz * sx, sz * sy * cx - cz * sx, cy * cx];
  }

  function create(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    let context;
    try { context = canvas.getContext('2d', { alpha: true }); } catch { return null; }
    if (!context) return null;
    let disposed = false;
    const meshes = [band(.96, .108, .178, [.84, .64, .355]), band(1, .114, .205, [.83, .68, .43])];
    const visible = [];

    function project(mesh, translation, angles, scale, focal, width, height) {
      const r = rotation(angles);
      for (let offset = 0; offset < mesh.local.length; offset += 3) {
        const x = mesh.local[offset], y = mesh.local[offset + 1], z = mesh.local[offset + 2];
        const X = (r[0] * x + r[3] * y + r[6] * z) * scale + translation[0];
        const Y = (r[1] * x + r[4] * y + r[7] * z) * scale + translation[1];
        const Z = (r[2] * x + r[5] * y + r[8] * z) * scale + translation[2];
        mesh.world[offset] = X; mesh.world[offset + 1] = Y; mesh.world[offset + 2] = Z;
        const depth = 6.9 - Z, index = offset / 3;
        mesh.screen[index * 2] = width / 2 + X * focal / depth;
        mesh.screen[index * 2 + 1] = height / 2 - Y * focal / depth;
        const nx = mesh.normals[offset], ny = mesh.normals[offset + 1], nz = mesh.normals[offset + 2];
        const NX = r[0] * nx + r[3] * ny + r[6] * nz;
        const NY = r[1] * nx + r[4] * ny + r[7] * nz;
        const NZ = r[2] * nx + r[5] * ny + r[8] * nz;
        mesh.worldNormals[offset] = NX; mesh.worldNormals[offset + 1] = NY; mesh.worldNormals[offset + 2] = NZ;
        shade(X, Y, Z, NX, NY, NZ, mesh.inner[index], mesh.gold, mesh.colors, offset);
      }
      for (const face of mesh.faces) {
        let x = 0, y = 0, z = 0, nx = 0, ny = 0, nz = 0;
        for (const index of face) {
          const offset = index * 3;
          x += mesh.world[offset]; y += mesh.world[offset + 1]; z += mesh.world[offset + 2];
          nx += mesh.worldNormals[offset]; ny += mesh.worldNormals[offset + 1]; nz += mesh.worldNormals[offset + 2];
        }
        if (nx * -x + ny * -y + nz * (27.6 - z) <= 0) continue;
        visible.push({ mesh, face, depth: 6.9 - z / 4 });
      }
    }

    const rgb = (colors, index) => `rgb(${colors[index * 3]},${colors[index * 3 + 1]},${colors[index * 3 + 2]})`;

    function paintFace(item) {
      const { screen, colors } = item.mesh, face = item.face;
      context.beginPath();
      context.moveTo(screen[face[0] * 2], screen[face[0] * 2 + 1]);
      for (let i = 1; i < 4; i++) context.lineTo(screen[face[i] * 2], screen[face[i] * 2 + 1]);
      context.closePath();
      let darkest = face[0], brightest = face[0], min = Infinity, max = -Infinity;
      let red = 0, green = 0, blue = 0, centerX = 0, centerY = 0, averageLight = 0;
      for (const index of face) {
        const offset = index * 3;
        const luminance = colors[offset] * .2126 + colors[offset + 1] * .7152 + colors[offset + 2] * .0722;
        if (luminance < min) { min = luminance; darkest = index; }
        if (luminance > max) { max = luminance; brightest = index; }
        red += colors[offset]; green += colors[offset + 1]; blue += colors[offset + 2];
        centerX += screen[index * 2]; centerY += screen[index * 2 + 1]; averageLight += luminance;
      }
      let fill = `rgb(${Math.round(red / 4)},${Math.round(green / 4)},${Math.round(blue / 4)})`;
      // Fit one continuous light gradient to all four corners. This avoids a
      // separate bright/dark tile pattern on a smoothly polished metal surface.
      centerX /= 4; centerY /= 4; averageLight /= 4;
      let xx = 0, yy = 0, xy = 0, xl = 0, yl = 0;
      for (const index of face) {
        const x = screen[index * 2] - centerX, y = screen[index * 2 + 1] - centerY;
        const offset = index * 3;
        const light = colors[offset] * .2126 + colors[offset + 1] * .7152 + colors[offset + 2] * .0722 - averageLight;
        xx += x * x; yy += y * y; xy += x * y; xl += x * light; yl += y * light;
      }
      const determinant = xx * yy - xy * xy;
      if (max - min > 7 && determinant > .01) {
        const gx = (xl * yy - yl * xy) / determinant;
        const gy = (yl * xx - xl * xy) / determinant;
        const magnitude = gx * gx + gy * gy;
        if (magnitude > .001) {
          const low = (min - averageLight) / magnitude, high = (max - averageLight) / magnitude;
          fill = context.createLinearGradient(centerX + gx * low, centerY + gy * low, centerX + gx * high, centerY + gy * high);
          fill.addColorStop(0, rgb(colors, darkest));
          fill.addColorStop(1, rgb(colors, brightest));
        }
      }
      context.fillStyle = fill;
      context.strokeStyle = fill;
      context.lineWidth = .55;
      context.fill();
      context.stroke();
    }

    function render(progress) {
      if (disposed) return false;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return false;
      const p = clamp(Number.isFinite(progress) ? progress : 0), dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const pixelsWide = Math.max(1, Math.round(width * dpr)), pixelsHigh = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) { canvas.width = pixelsWide; canvas.height = pixelsHigh; }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const approach = between(p, .3, .88), turn = between(p, .04, .62), settle = between(p, .58, .96), depth = between(p, .08, .42);
      const scaleBack = 1 - between(p, .72, 1) * .035;
      const fov = 2 * Math.atan(Math.tan(radians(mix(39, 36, approach)) / 2) * Math.max(1, .95 / (width / height)));
      const focal = height / (2 * Math.tan(fov / 2));

      context.save();
      context.translate(width * .5, height * .865);
      context.scale(width * mix(.4, .32, approach), height * .052);
      const shadow = context.createRadialGradient(0, 0, 0, 0, 0, 1);
      shadow.addColorStop(0, 'rgba(74,59,38,.105)'); shadow.addColorStop(.45, 'rgba(74,59,38,.05)'); shadow.addColorStop(1, 'rgba(74,59,38,0)');
      context.fillStyle = shadow; context.beginPath(); context.arc(0, 0, 1, 0, Math.PI * 2); context.fill();
      context.restore();

      visible.length = 0;
      project(meshes[0], [mix(-.91, -.46, approach), mix(.72, .13, approach), mix(-.05, .6, depth)],
        [mix(mix(64, -76, turn), 24, settle), mix(mix(-36, 64, turn), -19, settle), mix(-31, -28, approach)], scaleBack, focal, width, height);
      project(meshes[1], [mix(.91, .62, approach), mix(-.72, -.15, approach), mix(.15, -1.45, depth)],
        [mix(mix(-58, 84, turn), 58, settle), mix(mix(34, -70, turn), 30, settle), mix(27, 42, approach)], 1.08 * scaleBack, focal, width, height);
      visible.sort((a, b) => b.depth - a.depth);
      visible.forEach(paintFace);
      return true;
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      visible.length = 0;
      meshes.length = 0;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    return { render, dispose };
  }

  window.WeddingRingsFallback = Object.freeze({ create });
})();
