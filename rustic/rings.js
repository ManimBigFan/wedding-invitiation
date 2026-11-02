/* Original, dependency-free WebGL wedding bands. The page owns time and scrolling. */
(() => {
  'use strict';

  const vertexSource = `
    precision mediump float;
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    uniform mat4 uModel;
    uniform mat4 uProjection;
    uniform vec3 uCamera;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying float vInner;
    void main() {
      vec4 world = uModel * vec4(aPosition, 1.0);
      vPosition = world.xyz;
      vNormal = normalize(mat3(uModel) * aNormal);
      vInner = max(0.0, -dot(normalize(aPosition.xy), aNormal.xy));
      gl_Position = uProjection * vec4(world.xyz - uCamera, 1.0);
    }
  `;

  const fragmentSource = `
    precision mediump float;
    uniform vec3 uCamera;
    uniform vec3 uGold;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying float vInner;

    // Analytic studio lights: broad reflections with a fine polished edge.
    float softbox(vec3 direction, vec3 axis, vec2 size, float feather) {
      axis = normalize(axis);
      vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), axis));
      vec3 up = cross(axis, right);
      float facing = dot(direction, axis);
      vec2 point = vec2(dot(direction, right), dot(direction, up)) / max(facing, 0.01);
      vec2 edge = abs(point) / size;
      vec2 light = 1.0 - smoothstep(vec2(1.0 - feather), vec2(1.0 + feather), edge);
      return light.x * light.y * step(0.0, facing);
    }

    vec3 studio(vec3 direction) {
      float sky = smoothstep(-0.65, 0.85, direction.y);
      vec3 environment = mix(vec3(0.105, 0.085, 0.06), vec3(0.67, 0.64, 0.57), sky);
      float darkCard = softbox(direction, vec3(0.1, -0.1, 1.0), vec2(0.27, 0.85), 0.25);
      environment *= 1.0 - darkCard * 0.72;
      float key = softbox(direction, vec3(-0.65, 0.45, 1.0), vec2(0.2, 0.83), 0.15);
      float ceiling = softbox(direction, vec3(0.5, 1.0, 0.32), vec2(0.72, 0.22), 0.28);
      float edge = softbox(direction, vec3(0.95, 0.15, -0.3), vec2(0.13, 0.76), 0.16);
      environment += vec3(2.4, 2.28, 2.04) * key;
      environment += vec3(1.25, 1.2, 1.08) * ceiling;
      environment += vec3(1.55, 1.45, 1.23) * edge;
      return environment;
    }

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 view = normalize(uCamera - vPosition);
      vec3 reflected = reflect(-view, normal);
      float facing = max(dot(normal, view), 0.0);
      vec3 fresnel = uGold + (vec3(1.0) - uGold) * pow(1.0 - facing, 5.0);
      vec3 light = studio(reflected) * fresnel;
      float diffuse = max(dot(normal, normalize(vec3(-0.6, 0.9, 1.0))), 0.0);
      light += uGold * (0.075 + diffuse * 0.13);
      light *= 1.0 - vInner * 0.18;
      light = light / (vec3(1.0) + light * 0.48);
      gl_FragColor = vec4(pow(max(light, vec3(0.0)), vec3(0.4545)), 1.0);
    }
  `;

  const shadowVertex = `
    precision mediump float;
    attribute vec2 aPosition;
    varying vec2 vUV;
    void main() { vUV = aPosition * 0.5 + 0.5; gl_Position = vec4(aPosition, 0.0, 1.0); }
  `;
  const shadowFragment = `
    precision mediump float;
    varying vec2 vUV;
    uniform float uTogether;
    void main() {
      vec2 size = mix(vec2(0.4, 0.052), vec2(0.32, 0.048), uTogether);
      vec2 point = (vUV - vec2(0.5, 0.135)) / size;
      float shade = exp(-dot(point, point) * 2.6) * 0.105;
      gl_FragColor = vec4(0.29, 0.23, 0.15, shade);
    }
  `;

  const clamp = value => Math.max(0, Math.min(1, value));
  const mix = (start, end, amount) => start + (end - start) * amount;
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const interval = (value, start, end) => smooth((value - start) / (end - start));
  const radians = degrees => degrees * Math.PI / 180;
  const signedPower = value => Math.sign(value) * Math.pow(Math.abs(value), 0.62);

  function compose(out, position, rotation, scale) {
    const sx = Math.sin(rotation[0]), cx = Math.cos(rotation[0]);
    const sy = Math.sin(rotation[1]), cy = Math.cos(rotation[1]);
    const sz = Math.sin(rotation[2]), cz = Math.cos(rotation[2]);
    out[0] = cz * cy * scale;
    out[1] = sz * cy * scale;
    out[2] = -sy * scale;
    out[3] = 0;
    out[4] = (cz * sy * sx - sz * cx) * scale;
    out[5] = (sz * sy * sx + cz * cx) * scale;
    out[6] = cy * sx * scale;
    out[7] = 0;
    out[8] = (cz * sy * cx + sz * sx) * scale;
    out[9] = (sz * sy * cx - cz * sx) * scale;
    out[10] = cy * cx * scale;
    out[11] = 0;
    out[12] = position[0];
    out[13] = position[1];
    out[14] = position[2];
    out[15] = 1;
  }

  function create(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    canvas.dataset.rendererStatus = 'initializing';
    let gl;
    try {
      gl = canvas.getContext('webgl', {
        alpha: true, antialias: true, depth: true, stencil: false,
        premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power'
      });
    } catch { canvas.dataset.rendererStatus = 'context-error'; return null; }
    if (!gl) { canvas.dataset.rendererStatus = 'webgl-unavailable'; return null; }

    const buffers = [], programs = [], shaders = [];
    let disposed = false;
    let verified = false;
    const model = new Float32Array(16);
    const projection = new Float32Array(16);
    const camera = new Float32Array([0, 0, 6.9]);

    function dispose() {
      if (disposed) return;
      disposed = true;
      buffers.forEach(buffer => gl.deleteBuffer(buffer));
      programs.forEach(program => gl.deleteProgram(program));
      shaders.forEach(shader => gl.deleteShader(shader));
    }

    function program(vertex, fragment) {
      const result = gl.createProgram();
      if (!result) throw new Error('WebGL program unavailable');
      programs.push(result);
      [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]].forEach(([type, source]) => {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('WebGL shader unavailable');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          canvas.dataset.rendererStatus = 'shader-error';
          canvas.dataset.rendererDetail = gl.getShaderInfoLog(shader) || '';
          throw new Error('WebGL shader could not compile');
        }
        gl.attachShader(result, shader);
      });
      gl.linkProgram(result);
      if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
        canvas.dataset.rendererStatus = 'link-error';
        canvas.dataset.rendererDetail = gl.getProgramInfoLog(result) || '';
        throw new Error('WebGL program could not link');
      }
      return result;
    }

    function buffer(target, data) {
      const result = gl.createBuffer();
      if (!result) throw new Error('WebGL buffer unavailable');
      buffers.push(result);
      gl.bindBuffer(target, result);
      gl.bufferData(target, data, gl.STATIC_DRAW);
      return result;
    }

    function band(major, radial, halfWidth) {
      // The superellipse gives each band a broad wall and gently rounded bevels.
      const around = 128, across = 32;
      const positions = [], normals = [], indices = [];
      const profile = angle => [radial * signedPower(Math.cos(angle)), halfWidth * signedPower(Math.sin(angle))];
      for (let i = 0; i <= around; i++) {
        const angle = i / around * Math.PI * 2;
        const ca = Math.cos(angle), sa = Math.sin(angle);
        for (let j = 0; j <= across; j++) {
          const cross = j / across * Math.PI * 2;
          const point = profile(cross);
          const before = profile(cross - 0.003), after = profile(cross + 0.003);
          const nr = after[1] - before[1], nz = -(after[0] - before[0]);
          const length = Math.hypot(nr, nz);
          positions.push((major + point[0]) * ca, (major + point[0]) * sa, point[1]);
          normals.push(nr / length * ca, nr / length * sa, nz / length);
          if (i < around && j < across) {
            const a = i * (across + 1) + j;
            const b = (i + 1) * (across + 1) + j;
            indices.push(a, b, a + 1, b, b + 1, a + 1);
          }
        }
      }
      return {
        position: buffer(gl.ARRAY_BUFFER, new Float32Array(positions)),
        normal: buffer(gl.ARRAY_BUFFER, new Float32Array(normals)),
        indices: buffer(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices)),
        count: indices.length
      };
    }

    let metal, shadow, metalLocations, shadowLocations, bands, shadowBuffer;
    try {
      metal = program(vertexSource, fragmentSource);
      shadow = program(shadowVertex, shadowFragment);
      metalLocations = {
        position: gl.getAttribLocation(metal, 'aPosition'),
        normal: gl.getAttribLocation(metal, 'aNormal'),
        model: gl.getUniformLocation(metal, 'uModel'),
        projection: gl.getUniformLocation(metal, 'uProjection'),
        camera: gl.getUniformLocation(metal, 'uCamera'),
        gold: gl.getUniformLocation(metal, 'uGold')
      };
      shadowLocations = {
        position: gl.getAttribLocation(shadow, 'aPosition'),
        together: gl.getUniformLocation(shadow, 'uTogether')
      };
      bands = [band(0.96, 0.108, 0.178), band(1.0, 0.114, 0.205)];
      shadowBuffer = buffer(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]));
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.depthFunc(gl.LEQUAL);
      gl.frontFace(gl.CCW);
      gl.cullFace(gl.BACK);
    } catch {
      dispose();
      return null;
    }

    function drawBand(mesh, position, angles, scale, color) {
      compose(model, position, angles.map(radians), scale);
      gl.uniformMatrix4fv(metalLocations.model, false, model);
      gl.uniform3fv(metalLocations.gold, color);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.position);
      gl.enableVertexAttribArray(metalLocations.position);
      gl.vertexAttribPointer(metalLocations.position, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normal);
      gl.enableVertexAttribArray(metalLocations.normal);
      gl.vertexAttribPointer(metalLocations.normal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }

    function render(progress) {
      if (disposed || gl.isContextLost()) return false;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return false;
      const p = clamp(Number.isFinite(progress) ? progress : 0);
      const dpr = Math.min(1.75, window.devicePixelRatio || 1);
      const pixelsWide = Math.max(1, Math.round(width * dpr));
      const pixelsHigh = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
        canvas.width = pixelsWide;
        canvas.height = pixelsHigh;
      }
      gl.viewport(0, 0, pixelsWide, pixelsHigh);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const approach = interval(p, 0.3, 0.88);
      const turn = interval(p, 0.04, 0.62);
      const settle = interval(p, 0.58, 0.96);
      const depth = interval(p, 0.08, 0.42);
      const scaleBack = 1.0 - interval(p, 0.72, 1.0) * 0.035;
      const aspect = width / height;
      // Maintain breathing room at unusually narrow widths without distorting the bands.
      const fieldOfView = 2 * Math.atan(Math.tan(radians(mix(39, 36, approach)) / 2) * Math.max(1, 0.95 / aspect));
      const focal = 1 / Math.tan(fieldOfView / 2);
      const near = 0.1, far = 30;
      projection.fill(0);
      projection[0] = focal / aspect;
      projection[5] = focal;
      projection[10] = (far + near) / (near - far);
      projection[11] = -1;
      projection[14] = 2 * far * near / (near - far);

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(shadow);
      gl.bindBuffer(gl.ARRAY_BUFFER, shadowBuffer);
      gl.enableVertexAttribArray(shadowLocations.position);
      gl.vertexAttribPointer(shadowLocations.position, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1f(shadowLocations.together, approach);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.useProgram(metal);
      gl.uniformMatrix4fv(metalLocations.projection, false, projection);
      gl.uniform3fv(metalLocations.camera, camera);

      // A moves in front while B moves behind before their silhouettes overlap.
      // The final pair is layered in depth, not two solids passing through each other.
      const ax = mix(mix(64, -76, turn), 24, settle);
      const ay = mix(mix(-36, 64, turn), -19, settle);
      const bx = mix(mix(-58, 84, turn), 58, settle);
      const by = mix(mix(34, -70, turn), 30, settle);
      drawBand(bands[1],
        [mix(0.91, 0.62, approach), mix(-0.72, -0.15, approach), mix(0.15, -1.45, depth)],
        [bx, by, mix(27, 42, approach)], 1.08 * scaleBack,
        new Float32Array([0.83, 0.68, 0.43]));
      drawBand(bands[0],
        [mix(-0.91, -0.46, approach), mix(0.72, 0.13, approach), mix(-0.05, 0.60, depth)],
        [ax, ay, mix(-31, -28, approach)], scaleBack,
        new Float32Array([0.84, 0.64, 0.355]));

      if (!verified) {
        if (gl.getError() !== gl.NO_ERROR) { canvas.dataset.rendererStatus = 'draw-error'; return false; }
        verified = true;
        canvas.dataset.rendererStatus = 'drawn';
      }
      return true;
    }

    return { render, dispose };
  }

  window.WeddingRings = Object.freeze({ create });
})();
