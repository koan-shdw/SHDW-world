// The looks (REMAKE.md §4): LUT, sky, plants, glass, surface noise, outline, dither, SMAA. Every one a visible dial,
// on by default (highest quality is the default), remembered in this browser. Composer order:
// render (depth) → edges (outline + dither) → output (tone map, sRGB) → LUT → SMAA.
import * as THREE from 'three'
import { bus } from '../../bus'
import type { Renderer } from '../renderer'
import { EdgesPass } from './edges'
import { makeLUTPass, loadCube } from './lut'
import { Sky } from './sky'
import { Void } from './void'
import { Plants } from './plants'
import { Glass } from './glass'
import { Surface } from './surface'
import { mat, MAPS } from '../room/level'

import type { FxKey, FxState } from '../../bus'
const FX_KEY = 'koan-hang-fx'

export class Looks {
  state: FxState = { lut: true, sky: true, plants: true, glass: true, surface: true, outline: true, dither: true, smaa: true }
  readonly edges: EdgesPass
  readonly lutPass = makeLUTPass()
  readonly sky: Sky
  readonly void: Void
  readonly plants: Plants
  readonly glass: Glass
  readonly surface: Surface
  private flatBackground: THREE.Color | THREE.Texture | null

  constructor(private r: Renderer, room: THREE.Group, fogColor: THREE.Color, data: string) {
    try { const s = localStorage.getItem(FX_KEY); if (s) Object.assign(this.state, JSON.parse(s)) } catch { /* private */ }
    // passes: edges right after the render pass (it reads that pass's depth), LUT after the output pass, before SMAA
    this.edges = new EdgesPass(r.camera)
    r.composer.insertPass(this.edges, 1)
    r.composer.insertPass(this.lutPass, r.composer.passes.indexOf(r.smaa))
    void loadCube(this.lutPass, `${data}textures/lut.cube`).then((ok) => { if (ok) bus.toast('lut.cube loaded · his grade') })
    // scene looks
    this.flatBackground = r.scene.background
    this.sky = new Sky(fogColor); this.sky.mesh.visible = false
    this.void = new Void(room); r.scene.add(this.void.group)         // owner 09-06: swirling black clouds under and over, with depth
    this.plants = new Plants(room); r.scene.add(this.plants.group)
    this.glass = new Glass(mat('glass'))
    this.surface = new Surface(Object.keys(MAPS).map((n) => mat(n)))
    this.applyAll()
    bus.on('set_fx', ({ key, on }) => this.set(key, on))
    bus.emit('fx', { state: { ...this.state } })
  }

  set(key: FxKey, on: boolean): void {
    this.state[key] = on
    this.applyAll()
    try { localStorage.setItem(FX_KEY, JSON.stringify(this.state)) } catch { /* private */ }
    bus.emit('fx', { state: { ...this.state } })
  }

  /** the panorama or flat colour the sky dial falls back to */
  setFlatBackground(bg: THREE.Color | THREE.Texture | null): void { this.flatBackground = bg; this.applyAll() }

  private applyAll(): void {
    const s = this.state
    this.lutPass.enabled = s.lut
    this.edges.uniforms.outline.value = s.outline ? 1 : 0
    this.edges.uniforms.dither.value = s.dither ? 0.35 : 0
    this.edges.enabled = s.outline || s.dither
    this.r.smaa.enabled = s.smaa && this.r.quality !== 'low'
    this.void.set(s.sky)
    this.r.scene.background = s.sky ? null : this.flatBackground
    this.plants.set(s.plants)
    this.glass.set(s.glass)
    this.surface.set(s.surface)
  }

  update(t: number): void { this.void.update(t); this.plants.update(t) }
}
