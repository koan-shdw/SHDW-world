// Layered wind and delayed thunder share the gallery's shelter and sound controls.
import type { PlaySettings } from '../bus'
import { pointInPoly, inRect, stairRect, type Level } from './room/level'

export function sheltered(level: Level, floor: string, x: number, z: number): boolean {
  return level.floors.some(f => f.level === floor && f.name !== 'courtyard' && pointInPoly(x, z, f.poly))
    || level.stairs.some(s => (s.level === floor || s.to === floor) && inRect(x, z, stairRect(s), 0))
}

export function createWind(context: BaseAudioContext) {
  const buffer = context.createBuffer(2, context.sampleRate * 16, context.sampleRate)
  let seed = 1026
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1 }
  }
  const sources: AudioBufferSourceNode[] = [], nodes: AudioNode[] = []
  const windMix = context.createGain(), mix = context.createGain(), muffler = context.createBiquadFilter(), compressor = context.createDynamicsCompressor(), master = context.createGain()
  windMix.gain.value = 0.35; windMix.connect(mix)
  muffler.type = 'lowpass'; muffler.frequency.value = 3200; muffler.Q.value = 0.5
  compressor.threshold.value = -7; compressor.knee.value = 12; compressor.ratio.value = 8; compressor.attack.value = 0.012; compressor.release.value = 0.3
  master.gain.value = 0
  mix.connect(muffler).connect(compressor).connect(master).connect(context.destination)
  nodes.push(windMix, mix, muffler, compressor, master)
  const layer = (type: BiquadFilterType, frequency: number, q: number, offset: number) => {
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain(), pan = context.createStereoPanner()
    source.buffer = buffer; source.loop = true; filter.type = type; filter.frequency.value = frequency; filter.Q.value = q; gain.gain.value = 0
    source.connect(filter).connect(gain).connect(pan).connect(windMix); source.start(0, offset)
    sources.push(source); nodes.push(source, filter, gain, pan)
    return { filter, gain, pan }
  }
  const pressure = layer('lowpass', 135, 0.65, 0), gust = layer('bandpass', 400, 0.6, 3.17), howl = layer('bandpass', 470, 1.2, 7.41), air = layer('bandpass', 1100, 0.55, 11.23)
  const thunder = new Set<{ source: AudioBufferSourceNode; gain: GainNode; release: () => void }>()
  return {
    master,
    thunder(time: number, distance: number, pan = 0) {
      const start = time + 1.4 + distance / 343, strength = 2.8 / (1 + distance / 450)
      const source = context.createBufferSource(), low = context.createBiquadFilter(), high = context.createBiquadFilter(), gain = context.createGain(), stereo = context.createStereoPanner()
      source.buffer = buffer
      high.type = 'highpass'; high.frequency.value = 28; high.Q.value = 0.5
      low.type = 'lowpass'; low.Q.value = 0.65
      low.frequency.setValueAtTime(900, start); low.frequency.exponentialRampToValueAtTime(110, start + 7.5)
      stereo.pan.value = Math.max(-0.8, Math.min(0.8, pan))
      gain.gain.value = 0; gain.gain.setValueAtTime(0, start)
      for (const [t, level] of [[0.09, 1], [0.45, 0.4], [1.3, 0.7], [2.8, 0.22], [4.1, 0.32], [6, 0.07], [8, 0]]) gain.gain.linearRampToValueAtTime(strength * level, start + t)
      source.connect(high).connect(low).connect(gain).connect(stereo).connect(mix)
      const voice = { source, gain, release: () => { for (const node of [source, high, low, gain, stereo]) node.disconnect(); thunder.delete(voice) } }
      source.onended = voice.release; thunder.add(voice)
      source.start(start, Math.random() * 6, 8)
    },
    cancelThunder() {
      for (const voice of thunder) {
        voice.gain.gain.cancelAndHoldAtTime(context.currentTime)
        voice.gain.gain.linearRampToValueAtTime(0, context.currentTime + 0.06)
        voice.source.stop(context.currentTime + 0.06)
      }
    },
    update(time: number, inside: number, volume: number, yaw = 0) {
      const swell = Math.pow(0.5 + (Math.sin(time * 0.23) + Math.sin(time * 0.097 + 1.7) * 0.6 + Math.sin(time * 0.61 + 0.4) * 0.25) / 3.7, 2)
      const breathe = 0.5 + 0.5 * Math.sin(time * 0.17 + 1.4)
      const set = (param: AudioParam, value: number, fade = 0.7) => param.setTargetAtTime(value, time, fade)
      set(pressure.gain.gain, 1.1 + swell * 1.6); set(pressure.filter.frequency, 85 + swell * 70)
      set(gust.gain.gain, 0.6 + swell * 1.7); set(gust.filter.frequency, 210 + swell * 540, 1.8)
      set(howl.gain.gain, 0.08 + breathe ** 3 * 0.22); set(howl.filter.frequency, 220 + breathe * 240 + Math.sin(time * 0.43) * 25, 2)
      set(howl.pan.pan, Math.sin(time * 0.11 - yaw) * 0.5); set(gust.pan.pan, Math.sin(time * 0.071 - yaw) * 0.25)
      set(air.gain.gain, 0.025 + swell * 0.06)
      set(mix.gain, 1 - inside * 0.79); set(muffler.frequency, 3200 - inside * 2450)
      set(master.gain, 0.5 * Math.pow(Math.max(0, Math.min(100, Number.isFinite(volume) ? volume : 0)) / 100, 1.4), volume === 0 ? 0.045 : 0.8)
    },
    dispose() { for (const voice of thunder) { voice.source.stop(); voice.release() } for (const source of sources) source.stop(); for (const node of nodes) node.disconnect() },
  }
}

export class Wind {
  private context: AudioContext | null = null
  private sound: ReturnType<typeof createWind> | null = null
  private entered = false
  private lifetime = new AbortController()
  private lastUpdate = -1
  private inside = 0
  private yaw = 0
  private enabled: boolean
  private volume: number
  constructor(private level: Level, settings: PlaySettings) {
    this.enabled = settings.wind; this.volume = settings.windVolume
    const resume = () => { if (this.entered) this.unlock() }
    document.addEventListener('pointerdown', resume, { signal: this.lifetime.signal })
    document.addEventListener('keydown', resume, { signal: this.lifetime.signal })
    document.addEventListener('visibilitychange', () => {
      if (!this.context) return
      if (document.hidden) { this.sound?.cancelThunder(); void this.context.suspend().catch(() => undefined) }
      else if (this.entered) this.unlock()
    }, { signal: this.lifetime.signal })
  }
  unlock(): void {
    if (typeof AudioContext === 'undefined' || document.hidden) return
    try {
      if (!this.context) { this.context = new AudioContext(); this.sound = createWind(this.context) }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined)
    } catch { /* Audio support must not prevent entry into the gallery. */ }
  }
  enter(): void { this.entered = true; this.unlock(); this.apply() }
  set(settings: PlaySettings): void {
    this.enabled = settings.wind; this.volume = settings.windVolume
    if (!this.enabled || this.volume <= 0) this.sound?.cancelThunder()
    this.apply()
  }
  thunder(at: { x: number; y: number; z: number }, listener: { x: number; y: number; z: number }): void {
    if (!this.entered || !this.enabled || this.volume <= 0 || document.hidden || this.context?.state !== 'running') return
    const dx = at.x - listener.x, dy = at.y - listener.y, dz = at.z - listener.z
    const distance = Math.hypot(dx, dy, dz)
    this.sound?.thunder(this.context.currentTime, distance, (dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw)) / Math.max(1, distance))
  }
  private apply(): void { if (this.context && this.sound) this.sound.update(this.context.currentTime, this.inside, this.entered && this.enabled ? this.volume : 0, this.yaw) }
  update(floor: string, x: number, z: number, yaw: number): void {
    this.inside = sheltered(this.level, floor, x, z) ? 1 : 0; this.yaw = yaw
    if (!this.context || this.context.currentTime - this.lastUpdate < 0.1) return
    this.lastUpdate = this.context.currentTime; this.apply()
  }
  dispose(): void { this.lifetime.abort(); this.sound?.dispose(); void this.context?.close().catch(() => undefined) }
}
