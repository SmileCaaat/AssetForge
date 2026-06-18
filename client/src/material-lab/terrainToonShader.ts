/**
 * 与 server/templates/unity/ToonTerrainURP.template.shader ForwardLit 保持同步。
 * 修改 HLSL 时请同步更新此文件。
 */

export const TERRAIN_TOON_VERT = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPositionWS;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vPositionWS = worldPos.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const TERRAIN_TOON_FRAG = `
uniform sampler2D baseMap;
uniform float hasBaseMap;
uniform vec4 baseColorTint;
uniform float baseSaturation;
uniform float baseValue;
uniform float rampSteps;
uniform float rampBlend;
uniform float albedoInfluence;
uniform float albedoPosterize;
uniform float normalStrength;
uniform vec3 celShadowColor;
uniform vec3 celHighlightColor;
uniform float shadowReceiveStrength;
uniform float ambientStrength;
uniform float lightColorInfluence;
uniform float distanceSmoothStrength;
uniform float distanceSmoothFar;
uniform float slopeTintStrength;
uniform vec3 slopeRockTint;
uniform vec3 lightDir;
uniform vec3 lightColor;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPositionWS;

vec3 adjustHSV(vec3 c) {
  float gray = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(gray), c, baseSaturation);
  return clamp(c * baseValue, 0.0, 1.0);
}

float softToonRamp(float t, float steps, float blend) {
  t = clamp(t, 0.0, 1.0);
  float s = max(steps, 2.0);
  float x = t * (s - 1.0);
  float i0 = floor(x);
  float f = x - i0;
  float v0 = i0 / (s - 1.0);
  float v1 = min((i0 + 1.0) / (s - 1.0), 1.0);
  float edge = clamp(blend, 0.0, 1.0);
  float sf = smoothstep(0.5 - edge * 0.5, 0.5 + edge * 0.5, f);
  return mix(v0, v1, sf);
}

vec3 softAlbedoBands(vec3 base, float strength, float steps, float blend) {
  if (strength <= 0.001) return base;
  float luma = dot(base, vec3(0.299, 0.587, 0.114));
  float band = softToonRamp(luma, steps, blend);
  vec3 shaped = base * (band / max(luma, 0.02));
  return mix(base, shaped, clamp(strength, 0.0, 1.0));
}

vec3 sampleSHApprox(vec3 n) {
  float hemi = dot(normalize(n), vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5;
  return mix(vec3(0.12, 0.14, 0.16), vec3(0.52, 0.55, 0.58), hemi);
}

void main() {
  vec3 base = hasBaseMap > 0.5
    ? texture2D(baseMap, vUv).rgb
    : vec3(0.45, 0.55, 0.35);
  base *= baseColorTint.rgb;
  base = adjustHSV(base);
  base = softAlbedoBands(base, albedoPosterize, 4.0, rampBlend);

  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 n = normalize(vNormal);
  n = normalize(mix(up, n, clamp(normalStrength, 0.0, 1.5)));

  vec3 l = normalize(lightDir);
  float ndotl = clamp(dot(n, l), 0.0, 1.0);
  float fakeShadowAtten = smoothstep(0.12, 0.62, ndotl);
  float litRaw = ndotl * mix(1.0, fakeShadowAtten, shadowReceiveStrength);

  float lit = smoothstep(0.04, 0.96, litRaw);
  lit = mix(0.2, 0.85, lit);

  float viewDist = length(cameraPosition - vPositionWS);
  float distT = clamp(viewDist / max(distanceSmoothFar, 1.0), 0.0, 1.0);
  float rampBlendDist = mix(rampBlend, min(rampBlend + 0.2, 0.45), distT * distanceSmoothStrength);

  lit = softToonRamp(lit, rampSteps, rampBlendDist);

  vec3 celTint = mix(celShadowColor, celHighlightColor, smoothstep(0.08, 0.92, lit));
  vec3 lightTint = mix(vec3(1.0), lightColor, lightColorInfluence);
  celTint *= lightTint;

  vec3 lightingMod = mix(celTint, vec3(1.0), clamp(albedoInfluence, 0.0, 1.0));
  vec3 color = base * lightingMod;

  color += base * sampleSHApprox(n) * ambientStrength;

  float slope = 1.0 - clamp(dot(n, up), 0.0, 1.0);
  color *= mix(vec3(1.0), slopeRockTint, slope * slopeTintStrength);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
