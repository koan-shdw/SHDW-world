// The renderer (REMAKE.md §2): renderer, composer, quality tier, resize, render_active. One render loop, never a second timer.
// Post stack (§4): render (depth texture) → outline → dither → LUT → SMAA. R1 ships render → SMAA; R2 adds the looks.
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { bus } from '../bus'

export type Quality = 'full' | 'balanced' | 'low'
const QUALITY_KEY = 'koan-hang-quality'
const DPR: Record<Quality, number> = { full: 2, balanced: 1.5, low: 1 }

export class Renderer {
  readonly gl: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 4000)   // the far background is kilometres out (owner 09-07)
  readonly composer: EffectComposer
  readonly smaa: SMAAPass
  quality: Quality = 'full'                       // highest quality is the default; the lower tiers are visible dials
  active = true                                    // false while the tab is hidden: the loop sleeps
  private container: HTMLElement
  private frame = 0
  private tick: ((dt: number) => void) | null = null
  private clock = new THREE.Clock()

  constructor(container: HTMLElement) {
    this.container = container
    this.gl = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false })
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.toneMapping = THREE.ACESFilmicToneMapping
    this.gl.toneMappingExposure = 1.0
    container.appendChild(this.gl.domElement)
    this.scene.add(this.camera)                    // the held work rides on the camera
    // the composer's targets carry a depth texture: the edges pass reads the render pass's depth
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) })
    this.composer = new EffectComposer(this.gl, rt)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new OutputPass())
    this.smaa = new SMAAPass(); this.composer.addPass(this.smaa)
    try { const q = localStorage.getItem(QUALITY_KEY); if (q === 'full' || q === 'balanced' || q === 'low') this.quality = q } catch { /* private */ }
    this.setQuality(this.quality, false)
    window.addEventListener('resize', () => this.resize())
    document.addEventListener('visibilitychange', () => this.setActive(!document.hidden))
    bus.on('render_active', ({ active }) => this.setActive(active))
    bus.on('set_quality', ({ quality }) => this.setQuality(quality))
    this.resize()
  }

  setQuality(q: Quality, persist = true): void {
    this.quality = q
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, DPR[q]))
    this.smaa.enabled = q !== 'low'
    bus.emit('quality', { quality: q })
    if (persist) { try { localStorage.setItem(QUALITY_KEY, q) } catch { /* private */ } }
    this.resize()
  }

  resize(): void {
    const w = this.container.clientWidth, h = this.container.clientHeight
    if (!w || !h) return   // hidden pane, collapsed container: keep the last real size
    this.gl.setSize(w, h, false); this.composer.setSize(w, h)
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix()
  }

  /** the loop: one rAF, sleeps while hidden, wakes on render_active */
  start(tick: (dt: number) => void): void {
    this.tick = tick
    const loop = () => {
      this.frame = 0
      if (!this.active) return
      const dt = Math.min(0.05, this.clock.getDelta())
      this.tick?.(dt)
      this.composer.render()
      this.frame = requestAnimationFrame(loop)
    }
    this.frame = requestAnimationFrame(loop)
  }
  private setActive(on: boolean): void {
    if (on === this.active) return
    this.active = on
    if (on) this.resize()
    if (on && !this.frame && this.tick) { this.clock.getDelta(); this.start(this.tick) }
  }

  /** one frame now, for shots and audits */
  renderOnce(): void { this.composer.render() }
  get size(): THREE.Vector2 { return this.gl.getSize(new THREE.Vector2()) }
}
