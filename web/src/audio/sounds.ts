// Sound (GAME.md §1): every touch has a sound. Synthesised here with WebAudio (no files to ship) until he brings real
// ones; the names are the contract, the synth is the placeholder. World sounds are positional, UI sounds are flat.
// Volumes: master, ui, world. Mute. Remembered per browser.
import * as THREE from 'three'
import { bus } from '../bus'

export type SoundName = 'hover' | 'click' | 'pick' | 'snap' | 'nope' | 'land' | 'stone' | 'open' | 'close' | 'whoosh' | 'turn' | 'door-open' | 'door-close' | 'step-concrete' | 'step-checker' | 'step-wood' | 'step-gravel' | 'step' | 'menu-open' | 'menu-close' | 'putback' | 'swap' | 'nudge'
export interface SoundSettings { master: number; ui: number; world: number; muted: boolean }
const KEY = 'shdw-world-sound'

interface Recipe { kind: 'tone' | 'noise' | 'both'; freq?: number; freqEnd?: number; dur: number; attack?: number; gain?: number; noiseHz?: number; q?: number; ui?: boolean }
const RECIPES: Record<SoundName, Recipe> = {
  hover: { kind: 'tone', freq: 880, freqEnd: 1040, dur: 0.05, gain: 0.08, ui: true },
  click: { kind: 'both', freq: 520, freqEnd: 420, dur: 0.07, gain: 0.18, noiseHz: 3000, ui: true },
  pick: { kind: 'tone', freq: 420, freqEnd: 720, dur: 0.14, gain: 0.2, ui: true },
  snap: { kind: 'both', freq: 1200, freqEnd: 900, dur: 0.06, gain: 0.16, noiseHz: 5000 },
  nope: { kind: 'both', freq: 180, freqEnd: 120, dur: 0.16, gain: 0.22, noiseHz: 600, q: 2 },
  land: { kind: 'both', freq: 140, freqEnd: 70, dur: 0.22, gain: 0.35, noiseHz: 400, q: 1 },
  stone: { kind: 'both', freq: 90, freqEnd: 50, dur: 0.3, gain: 0.4, noiseHz: 900, q: 0.7 },
  open: { kind: 'tone', freq: 600, freqEnd: 900, dur: 0.12, gain: 0.14, ui: true },
  close: { kind: 'tone', freq: 800, freqEnd: 500, dur: 0.1, gain: 0.12, ui: true },
  whoosh: { kind: 'noise', dur: 0.28, gain: 0.18, noiseHz: 1200, q: 0.8 },
  turn: { kind: 'both', freq: 300, freqEnd: 360, dur: 0.1, gain: 0.14, noiseHz: 2000 },
  'door-open': { kind: 'both', freq: 110, freqEnd: 140, dur: 0.5, gain: 0.2, noiseHz: 700, q: 1.5 },
  'door-close': { kind: 'both', freq: 140, freqEnd: 90, dur: 0.35, gain: 0.28, noiseHz: 500, q: 1.5 },
  'step-concrete': { kind: 'noise', dur: 0.09, gain: 0.12, noiseHz: 900, q: 1.2 },
  'step-checker': { kind: 'both', freq: 260, freqEnd: 200, dur: 0.1, gain: 0.14, noiseHz: 2400, q: 2 },
  'step-wood': { kind: 'both', freq: 160, freqEnd: 120, dur: 0.1, gain: 0.13, noiseHz: 1200, q: 1.5 },
  'step-gravel': { kind: 'noise', dur: 0.14, gain: 0.14, noiseHz: 2600, q: 0.6 },
  step: { kind: 'noise', dur: 0.09, gain: 0.12, noiseHz: 900, q: 1.2 },
  'menu-open': { kind: 'tone', freq: 500, freqEnd: 760, dur: 0.16, gain: 0.14, ui: true },
  'menu-close': { kind: 'tone', freq: 700, freqEnd: 460, dur: 0.14, gain: 0.12, ui: true },
  putback: { kind: 'tone', freq: 640, freqEnd: 380, dur: 0.14, gain: 0.16, ui: true },
  swap: { kind: 'both', freq: 480, freqEnd: 640, dur: 0.12, gain: 0.16, noiseHz: 3000, ui: true },
  nudge: { kind: 'tone', freq: 900, freqEnd: 900, dur: 0.03, gain: 0.08 },
}

export class Sounds {
  settings: SoundSettings = { master: 0.8, ui: 0.8, world: 1.0, muted: false }
  private ctx: AudioContext | null = null
  private master!: GainNode; private uiGain!: GainNode; private worldGain!: GainNode
  private noiseBuf: AudioBuffer | null = null
  private listener = new THREE.Vector3(); private forward = new THREE.Vector3(0, 0, -1)
  private lastAt = new Map<string, number>()

  constructor() {
    try { const s = localStorage.getItem(KEY); if (s) Object.assign(this.settings, JSON.parse(s)) } catch { /* private */ }
      bus.on('sfx', ({ name, at, pitch }) => this.play(name as SoundName, at ? new THREE.Vector3(at[0], at[1], at[2]) : undefined, pitch))
    bus.on('set_sound', ({ patch }) => this.set(patch))
    const wake = () => { this.ensure(); window.removeEventListener('mousedown', wake); window.removeEventListener('keydown', wake) }
    window.addEventListener('mousedown', wake); window.addEventListener('keydown', wake)
  }
  private ensure(): AudioContext | null {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return this.ctx }
    try {
      const ctx = new AudioContext(); this.ctx = ctx
      this.master = ctx.createGain(); this.master.connect(ctx.destination)
      this.uiGain = ctx.createGain(); this.uiGain.connect(this.master)
      this.worldGain = ctx.createGain(); this.worldGain.connect(this.master)
      const n = ctx.sampleRate; const buf = ctx.createBuffer(1, n, ctx.sampleRate); const d = buf.getChannelData(0)
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
      this.noiseBuf = buf
      this.apply()
      bus.emit('sound', { settings: { ...this.settings } })
      return ctx
    } catch { return null }
  }
  private apply(): void {
    if (!this.ctx) return
    const s = this.settings
    this.master.gain.value = s.muted ? 0 : s.master; this.uiGain.gain.value = s.ui; this.worldGain.gain.value = s.world
  }
  set(patch: Partial<SoundSettings>): void {
    Object.assign(this.settings, patch); this.apply()
    try { localStorage.setItem(KEY, JSON.stringify(this.settings)) } catch { /* private */ }
    bus.emit('sound', { settings: { ...this.settings } })
  }
  /** where the ears are, every frame */
  setListener(pos: THREE.Vector3, forward: THREE.Vector3): void { this.listener.copy(pos); this.forward.copy(forward) }

  play(name: SoundName, at?: THREE.Vector3, pitch = 1): void {
    const ctx = this.ensure(); if (!ctx) return
    const r = RECIPES[name]; if (!r) return
    const now = performance.now(); if (now - (this.lastAt.get(name) ?? 0) < 25) return; this.lastAt.set(name, now)
    const t0 = ctx.currentTime
    // positional: volume by distance, a little pan by side
    let vol = r.gain ?? 0.2, pan = 0
    if (at) {
      const d = at.distanceTo(this.listener); vol *= 1 / (1 + d * d * 0.25)
      const right = new THREE.Vector3().crossVectors(this.forward, new THREE.Vector3(0, 1, 0)); const rel = at.clone().sub(this.listener); pan = THREE.MathUtils.clamp(rel.dot(right) / Math.max(1, d), -1, 1) * 0.6
    }
    const out = ctx.createGain(); out.gain.setValueAtTime(0.0001, t0)
    out.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + (r.attack ?? 0.006))
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + r.dur)
    let tail: AudioNode = out
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; out.connect(p); tail = p }
    tail.connect(r.ui ? this.uiGain : this.worldGain)
    if (r.kind !== 'noise') {
      const o = ctx.createOscillator(); o.type = name === 'land' || name === 'stone' ? 'triangle' : 'sine'
      o.frequency.setValueAtTime((r.freq ?? 440) * pitch, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, (r.freqEnd ?? r.freq ?? 440) * pitch), t0 + r.dur)
      o.connect(out); o.start(t0); o.stop(t0 + r.dur + 0.02)
    }
    if (r.kind !== 'tone' && this.noiseBuf) {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = (r.noiseHz ?? 1000) * pitch; f.Q.value = r.q ?? 1
      const g = ctx.createGain(); g.gain.value = r.kind === 'both' ? 0.5 : 1
      src.connect(f); f.connect(g); g.connect(out); src.start(t0); src.stop(t0 + r.dur + 0.02)
    }
  }
}
