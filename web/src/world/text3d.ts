// Text in the space (owner 09-06: "they should be floating in the actual space"): a canvas-drawn text plane, metres wide,
// transparent, no box. Lines wrap to the width. `progress` writes it in character by character.
import * as THREE from 'three'

export interface TextOpts { width: number; font?: string; size?: number; colour?: string; shadow?: string; align?: 'left' | 'center'; lineHeight?: number; weight?: number; letterSpacing?: number; sheen?: boolean }

export class Text3D {
  readonly mesh: THREE.Mesh
  private canvas = document.createElement('canvas')
  private tex: THREE.CanvasTexture
  private mat: THREE.MeshBasicMaterial
  private time = { value: 0 }
  private flash = { value: 0 }
  private lastKey = ''
  readonly height: number
  private ppm = 384                                      // canvas pixels per metre, capped for giant blocks

  constructor(private lines: string[], private opts: TextOpts) {
    this.ppm = Math.min(384, 4096 / opts.width)
    const wpx = Math.round(opts.width * this.ppm)
    this.canvas.width = wpx
    const laid = this.layout()
    this.canvas.height = Math.max(64, Math.round(laid.height))
    this.height = this.canvas.height / this.ppm
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0, fog: false })   // the void's fog never greys the words
    if (opts.sheen) {
      // light moving across the letters: two slow bands and a slow breath, on the colour, alpha untouched
      this.mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.time; sh.uniforms.uFlash = this.flash
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
uniform float uTime; uniform float uFlash;`)
          .replace('#include <map_fragment>', `#include <map_fragment>
            float b1 = 0.55 + 0.45 * sin(vMapUv.x * 5.0 - uTime * 0.35 + vMapUv.y * 2.0);
            float b2 = 0.6 + 0.4 * sin(vMapUv.y * 9.0 + uTime * 0.21 - vMapUv.x * 3.0);
            float breath = 0.85 + 0.15 * sin(uTime * 0.6);
            diffuseColor.rgb *= (0.7 + 0.5 * b1 * b2) * breath * 1.25 * (1.0 + uFlash * 2.2);`)
      }
    }
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(opts.width, this.height), this.mat)
    this.mesh.renderOrder = 5
    this.draw(1)
  }

  private fontPx(): number { return (this.opts.size ?? 0.12) * this.ppm }
  private font(): string { return `${this.opts.weight ?? 800} ${this.fontPx()}px ${this.opts.font ?? "'Nunito', 'Segoe UI', sans-serif"}` }

  /** wrap every line to the width; returns the rows and the total height in px */
  private layout(): { rows: { text: string; para: number }[]; height: number } {
    const g = this.canvas.getContext('2d')!
    g.font = this.font()
    const maxW = this.canvas.width - 8
    const rows: { text: string; para: number }[] = []
    this.lines.forEach((line, para) => {
      const words = line.split(' '); let cur = ''
      for (const w of words) {
        const t = cur ? `${cur} ${w}` : w
        if (g.measureText(t).width > maxW && cur) { rows.push({ text: cur, para }); cur = w } else cur = t
      }
      rows.push({ text: cur, para })
    })
    const lh = this.fontPx() * (this.opts.lineHeight ?? 1.25)
    const paraGap = this.fontPx() * 0.6
    const paras = new Set(rows.map((r) => r.para)).size
    return { rows, height: rows.length * lh + (paras - 1) * paraGap + lh * 0.5 }
  }

  /** draw the first `progress` share of the characters */
  draw(progress: number): void {
    const key = progress.toFixed(3); if (key === this.lastKey) return; this.lastKey = key
    const g = this.canvas.getContext('2d')!
    g.clearRect(0, 0, this.canvas.width, this.canvas.height)
    g.font = this.font(); g.textBaseline = 'top'
    if (this.opts.letterSpacing) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${this.opts.letterSpacing}px`
    const { rows } = this.layout()
    const lh = this.fontPx() * (this.opts.lineHeight ?? 1.25), paraGap = this.fontPx() * 0.6
    const total = rows.reduce((n, r) => n + r.text.length, 0)
    let left = Math.floor(total * progress)
    let y = lh * 0.25, para = rows[0]?.para ?? 0
    for (const r of rows) {
      if (r.para !== para) { y += paraGap; para = r.para }
      const text = r.text.slice(0, Math.max(0, left)); left -= r.text.length
      const x = this.opts.align === 'center' ? (this.canvas.width - g.measureText(text).width) / 2 : 4
      if (text) {
        if (this.opts.shadow) { g.fillStyle = this.opts.shadow; g.fillText(text, x + 3, y + 4) }
        g.fillStyle = this.opts.colour ?? '#ffffff'; g.fillText(text, x, y)
      }
      y += lh
      if (left <= 0) break
    }
    this.tex.needsUpdate = true
  }
  update(t: number, flash = 0): void { this.time.value = t; this.flash.value = flash }
  set opacity(v: number) { this.mat.opacity = v; this.mesh.visible = v > 0.005 }
  get opacity(): number { return this.mat.opacity }
}
