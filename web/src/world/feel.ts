// Feel (GAME.md §1): the response envelope of every 3D action, on GSAP (Messenger's animation library). One table of
// durations and eases, shared with the UI's motion tokens. Reduce motion = every tween lands at once.
import * as THREE from 'three'
import gsap from 'gsap'

export const DUR = { micro: 0.07, snap: 0.12, pop: 0.18, move: 0.22, land: 0.35, door: 0.6, ambience: 2 } as const
export const EASE = { out: 'power2.out', inOut: 'power2.inOut', in: 'power2.in', land: 'elastic.out(1, 0.75)', idle: 'sine.inOut', back: 'back.out(1.7)' } as const

export class Feel {
  reduce = false
  private d(x: number): number { return this.reduce ? 0 : x }

  /** the ghost has met a wall or the floor: a 1.04 → 1 settle */
  snap(g: THREE.Object3D): void {
    gsap.killTweensOf(g.scale)
    g.scale.setScalar(1.04); gsap.to(g.scale, { x: 1, y: 1, z: 1, duration: this.d(DUR.snap), ease: EASE.out })
  }
  /** a click that cannot land: two shakes, sideways, in 160 ms. `axis` is the wall's direction */
  refuse(g: THREE.Object3D, axis: THREE.Vector3): void {
    const home = g.position.clone(); const a = axis.clone().normalize().multiplyScalar(0.06)
    gsap.killTweensOf(g.position)
    if (this.reduce) return
    gsap.timeline()
      .to(g.position, { x: home.x + a.x, z: home.z + a.z, duration: 0.04, ease: 'sine.inOut' })
      .to(g.position, { x: home.x - a.x, z: home.z - a.z, duration: 0.04, ease: 'sine.inOut' })
      .to(g.position, { x: home.x + a.x, z: home.z + a.z, duration: 0.04, ease: 'sine.inOut' })
      .to(g.position, { x: home.x, z: home.z, duration: 0.04, ease: 'sine.inOut' })
  }
  /** a work lands on the wall or the floor: Messenger's pop */
  land(g: THREE.Object3D): void {
    gsap.killTweensOf(g.scale)
    g.scale.setScalar(1.06); gsap.to(g.scale, { x: 1, y: 1, z: 1, duration: this.d(DUR.land), ease: EASE.land })
  }
  /** a work leaves the wall for the bar: it shrinks toward a point (the camera's lower right) and is removed */
  takeDown(g: THREE.Object3D, toward: THREE.Vector3, done: () => void): void {
    if (this.reduce) { done(); return }
    gsap.timeline({ onComplete: done })
      .to(g.position, { x: toward.x, y: toward.y, z: toward.z, duration: 0.3, ease: EASE.in }, 0)
      .to(g.scale, { x: 0.05, y: 0.05, z: 0.05, duration: 0.3, ease: EASE.in }, 0)
  }
  /** a turn: 15° in 180 ms */
  turn(g: THREE.Object3D, toYaw: number): void {
    gsap.killTweensOf(g.rotation); gsap.to(g.rotation, { y: toYaw, duration: this.d(DUR.pop), ease: EASE.out })
  }
  /** a nudge: the new place in 90 ms */
  nudge(g: THREE.Object3D, to: THREE.Vector3): void {
    gsap.killTweensOf(g.position); gsap.to(g.position, { x: to.x, y: to.y, z: to.z, duration: this.d(0.09), ease: EASE.out })
  }
  /** the hands view rises from below when the hands fill, sinks when they empty */
  handsIn(g: THREE.Object3D, restY: number): void {
    gsap.killTweensOf(g.position); g.position.y = restY - 0.25; gsap.to(g.position, { y: restY, duration: this.d(DUR.move), ease: EASE.out })
  }
  /** a material's opacity, for the hands view fading as a wall takes the work */
  fade(mats: THREE.Material[], to: number, dur = DUR.snap): void {
    for (const m of mats) { gsap.killTweensOf(m); gsap.to(m, { opacity: to, duration: this.d(dur), ease: EASE.out }) }
  }
  /** FOV changes glide */
  fov(cam: THREE.PerspectiveCamera, to: number): void {
    gsap.killTweensOf(cam); gsap.to(cam, { fov: to, duration: this.d(DUR.move), ease: EASE.out, onUpdate: () => cam.updateProjectionMatrix() })
  }
  /** a one-shot camera dip (a step, a landing) applied through an offset the walker adds */
  dip(target: { y: number }, amount = 0.03): void {
    if (this.reduce) return
    gsap.killTweensOf(target); target.y = -amount; gsap.to(target, { y: 0, duration: 0.25, ease: EASE.out })
  }
}
