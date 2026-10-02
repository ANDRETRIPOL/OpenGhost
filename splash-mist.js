(() => {
'use strict';

// The opening's mist, set going as soon as its canvas is on the page, while the app's scripts are still loading. A shader
// like this takes a while to compile; started here, it is usually ready by the time the opening plays, and with the
// browser's parallel compile it never holds up a frame. splash.js draws with it.
const root = document.documentElement;
const canvas = document.querySelector('.splash-mist');
if (!canvas || !root.classList.contains('is-splash')) return;

// How many points of the ghost's trail the shader looks at.
const KEEP = 24;
const VERTEX = 'attribute vec2 corner; void main() { gl_Position = vec4(corner, 0.0, 1.0); }';
// Everything behind the ghost, in one pass: the night, the mist lit from the middle and by the ghost, the trail it
// leaves in the mist, the ring of light at the landing, and the motes in the air.
const FRAGMENT = `
precision highp float;
uniform vec2 view;
uniform float density, time, show, pulse, count, life;
uniform vec4 ghost, box;
uniform vec3 trail[${KEEP}];
uniform vec3 base, night, deep, lit, glow, core;
uniform float mistAlpha, glowAlpha, trailGlow, shade, motes;

float hash(vec2 p) {
 p = fract(p * vec2(123.34, 456.21));
 p += dot(p, p + 45.32);
 return fract(p.x * p.y);
}

float noise(vec2 p) {
 vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
 return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
 float v = 0.0, a = 0.5;
 for (int i = 0; i < 5; i++) {
  v += a * noise(p);
  p = mat2(1.6, 1.2, -1.2, 1.6) * p;
  a *= 0.5;
 }
 return v;
}

void main() {
 vec2 px = vec2(gl_FragCoord.x, view.y * density - gl_FragCoord.y) / density;
 vec2 c = px - view * 0.5;

 // The trail is mist lit from within where the ghost has just flown: it gathers softly behind the ghost, spreads and
 // fades as it ages, and breaks up into wisps. It is measured from the nearest point of the whole way, so its stretches
 // join without a seam. The mist parts around it, pushed aside the more the farther from the middle of the trail, so
 // nothing tears along its line.
 float band = 0.0;
 vec2 push = vec2(0.0);
 if (px.x > box.x && px.y > box.y && px.x < box.z && px.y < box.w) {
  float best = 1e8, age = 9.0;
  vec2 away = vec2(0.0);
  for (int i = 0; i < ${KEEP - 1}; i++) {
   if (float(i) >= count - 1.0) break;
   vec3 a = trail[i], b = trail[i + 1];
   vec2 ab = b.xy - a.xy;
   float h = clamp(dot(px - a.xy, ab) / max(dot(ab, ab), 0.001), 0.0, 1.0);
   vec2 d = px - a.xy - ab * h;
   float dd = dot(d, d);
   if (dd < best) {
    best = dd;
    age = mix(a.z, b.z, h);
    away = d;
   }
  }
  float width = 32.0 + 110.0 * age;
  band = exp(-best / (width * width)) * smoothstep(0.0, 0.14, age) * clamp(1.0 - age / life, 0.0, 1.0);
  push = away / width * band;
  band *= 0.55 + 0.7 * fbm((px + push * 20.0) / 72.0 + vec2(time * 0.5, -time * 0.3));
 }

 // The mist: noise folded into itself, drifting slowly, thicker where the trail hangs.
 vec2 p = (px + push * 60.0) / 300.0;
 vec2 warp = vec2(fbm(p + vec2(0.0, time * 0.06)), fbm(p + vec2(5.2, 1.3) - vec2(time * 0.05, 0.0)));
 float fog = smoothstep(0.32, 0.9, fbm(p * 1.4 + warp * 1.8 + vec2(time * 0.025, -time * 0.015)));
 fog = clamp(fog + band * 0.55, 0.0, 1.0);

 // The light: the middle of the stage, the ghost's own glow, the trail, and the ring that runs out when it lands.
 vec2 g = px - ghost.xy;
 float near = exp(-dot(g, g) / (170.0 * 170.0 * ghost.z * ghost.z)) * ghost.w;
 float middle = exp(-dot(c, c) / (440.0 * 440.0));
 float ring = 0.0;
 if (pulse > 0.0) {
  float k = length(c) - pulse * 520.0;
  ring = exp(-k * k / 3600.0) * max(0.0, 1.0 - pulse / 1.4);
 }
 float light = 0.35 + 0.65 * middle + 1.2 * near + 1.1 * band + 0.6 * ring;

 // Motes of light, rising slowly and twinkling, brighter where the light is.
 vec2 q = px / 52.0 + vec2(0.0, time * 0.22);
 vec2 cell = floor(q), f = fract(q);
 float seed = hash(cell);
 vec2 dm = (f - vec2(hash(cell + 3.1), hash(cell + 7.7)) * 0.8 - 0.1) * 52.0;
 float mote = step(0.86, seed) * exp(-dot(dm, dm) / 3.0) * (0.5 + 0.5 * sin(time * (1.3 + seed * 2.4) + seed * 40.0)) * (0.35 + light * 0.5);

 vec3 color = mix(base, night, show);
 // The mist takes its deep tone where little light reaches it and its lit tone where much does.
 color = mix(color, mix(deep, lit, clamp(light * 0.55, 0.0, 1.0)), clamp(fog * mistAlpha * show, 0.0, 1.0));
 color = mix(color, glow, clamp((near * 0.55 + band * trailGlow + ring * 0.3 + middle * 0.1) * glowAlpha * show, 0.0, 1.0));
 color = mix(color, core, clamp(mote * motes * show, 0.0, 1.0));
 color *= 1.0 - shade * show * smoothstep(0.55, 1.35, length(c / (view * 0.5)));
 gl_FragColor = vec4(color, 1.0);
}`;

const gl = canvas.getContext('webgl', { antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
if (!gl) return;
const parallel = gl.getExtension('KHR_parallel_shader_compile');
const program = gl.createProgram();
const shaders = [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]].map(([type, source]) => {
 const shader = gl.createShader(type);
 gl.shaderSource(shader, source);
 gl.compileShader(shader);
 gl.attachShader(program, shader);
 return shader;
});
gl.linkProgram(program);

window.SplashMist = {
 gl, program, keep: KEEP,
 // Whether the shader is compiled yet; without the parallel compile, asking waits for it.
 done: () => !parallel || gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR),
 // Only once done: whether it compiled at all, and if not, why.
 failed: () => gl.getProgramParameter(program, gl.LINK_STATUS) ? '' : gl.getProgramInfoLog(program) || shaders.map(s => gl.getShaderInfoLog(s)).join(' ') || 'link failed',
};
})();
