// Fresnel reflections sample the same cloud noise as the void; the existing panes stay in place.
import * as THREE from 'three'

export class Glass {
  readonly uniforms: Record<string, THREE.IUniform>
  constructor(m: THREE.MeshStandardMaterial, clouds: THREE.Data3DTexture) {
    this.uniforms = { uFresnel: { value: 1 }, uClouds: { value: clouds }, uGlassTime: { value: 0 }, uGlassFlash: { value: 0 }, uGlassLight: { value: new THREE.Vector3(160, 95, -100) } }
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGlassWorld;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGlassWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vGlassWorld;
          uniform sampler3D uClouds;
          uniform float uFresnel, uGlassTime, uGlassFlash;
          uniform vec3 uGlassLight;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec3 reflected = inverseTransformDirection(reflect(-normalize(vViewPosition), normal), viewMatrix);
          vec3 p = reflected * 17.0 + vec3(uGlassTime * 0.018, -uGlassTime * 0.009, 0.0);
          float cloud = texture(uClouds, p / 64.0).r * 0.66 + texture(uClouds, (p * 2.07 + 19.0) / 64.0).r * 0.34;
          float fres = (0.04 + 0.96 * pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 4.0)) * uFresnel;
          float streak = sin(vGlassWorld.x * 143.0 + sin(vGlassWorld.z * 73.0) * 1.7 + vGlassWorld.y * 0.12) * 0.5 + 0.5;
          vec3 sky = mix(vec3(0.012, 0.023, 0.035), vec3(0.14, 0.20, 0.26), smoothstep(0.25, 0.72, cloud));
          float glow = pow(max(dot(reflected, normalize(uGlassLight - vGlassWorld)), 0.0), 20.0) * uGlassFlash;
          sky += vec3(0.65, 0.78, 1.0) * glow * 1.5;
          diffuseColor.a = min(0.88, diffuseColor.a + fres * 0.6 + streak * uFresnel * 0.015);
          totalEmissiveRadiance += sky * fres * 1.8;
          roughnessFactor += streak * uFresnel * 0.035;`)
    }
    m.needsUpdate = true
  }
  set(on: boolean): void { this.uniforms.uFresnel.value = on ? 1 : 0 }
  update(t: number, flash: number, light: THREE.Vector3): void { this.uniforms.uGlassTime.value = t; this.uniforms.uGlassFlash.value = flash; this.uniforms.uGlassLight.value.copy(light) }
}
