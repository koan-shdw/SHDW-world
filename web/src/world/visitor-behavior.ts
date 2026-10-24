import type { ArtItem, Layout } from './art/art'
import { facingNormal, inRect, pointInPoly, stairRect, wallDir, wallLength, type DoorRuntime, type Level } from './room/level'
import type { WalkObstacle } from './walk'

export type VisitorPhase = 'study' | 'echo' | 'read' | 'walk' | 'yield' | 'acknowledge' | 'pair' | 'thunder'
export interface VisitorState {
  id: number; visible: boolean; level: string; x: number; y: number; z: number; yaw: number
  phase: VisitorPhase; lookYaw: number; lookPitch: number; nod: number; gesture: number; echo: number; gait: number; speed: number; time: number; strafe: number; forward: number; passage: number
}
export interface VisitorPlayer { x: number; z: number; level: string; yaw: number }
export interface VisitorEnvironment { reduceMotion: boolean; thunder?: { x: number; z: number } }
export interface ReadingTarget { level: string; x: number; y: number; z: number }
interface Point { x: number; z: number }
interface ViewingSpot extends Point { id: string; art: string; kind: 'painting' | 'reading'; level: string; y: number; target: Point; targetY: number; echoPose?: 'my-turn' }
interface Visitor extends VisitorState {
  spot: ViewingSpot | null; route: Point[]; remaining: number; cooldown: number; yieldCooldown: number; nearby: number; partner: number | null; thunderAt: Point | null
  excursion: boolean; studyTime: number; resumeWalk: boolean
}

const RADIUS = .34
const TAU = Math.PI * 2
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const angle = (value: number) => ((value + Math.PI) % TAU + TAU) % TAU - Math.PI
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z)
const toward = (a: Point, b: Point) => Math.atan2(b.x - a.x, b.z - a.z)
const segmentDistance = (p: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x, dz = b.z - a.z
  const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1)
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t)
}

/** Quiet visitors use artwork viewing positions and validated, floor-local paths. */
export class VisitorBehavior {
  readonly agents: Visitor[]
  private spots: ViewingSpot[] = []
  private pending: ViewingSpot[] = []
  private signature = ''
  private obstacleSignature = ''
  private dirty = false
  private obstacles: WalkObstacle[] = []
  private doors: DoorRuntime[] = []
  private stormCount = 0
  private readingTarget: ReadingTarget | null = null
  private readingSpots: ViewingSpot[] = []
  private readingCooldown = 24
  private echoCooldown = 18
  private previousPlayer: VisitorPlayer | null = null

  constructor(private level: Level, count = 5) {
    this.agents = Array.from({ length: count }, (_, id) => ({
      id, visible: false, level: '', x: 0, y: 0, z: 0, yaw: 0, phase: 'study', lookYaw: 0, lookPitch: 0,
      nod: 0, gesture: 0, echo: 0, gait: 0, speed: 0, time: id * 1.37, strafe: 0, forward: 1, passage: 0, spot: null, route: [], remaining: 12 + id * 5,
      cooldown: 0, yieldCooldown: 0, nearby: 0, partner: null, thunderAt: null, excursion: false, studyTime: 0, resumeWalk: false,
    }))
  }

  sync(library: ArtItem[], layout: Layout, readingTarget: ReadingTarget | null = null): void {
    const works = new Map(library.map(work => [work.id, work]))
    const spots: ViewingSpot[] = []
    const paintings = layout.items.filter(item => item.kind === 'painting' && !item.note)
      .sort((a, b) => Number(b.art === 'my-turn-mtqsqgyy') - Number(a.art === 'my-turn-mtqsqgyy'))
    for (const placed of paintings) {
      const work = works.get(placed.art), wall = this.level.walls.find(w => w.id === placed.wall)
      // Saved placements can reuse a wall's plan coordinates on another floor, like ArtSystem.
      if (!work || !wall) continue
      const floor = this.level.levels.find(f => f.id === placed.level)
      if (!floor) continue
      const [dx, dz] = wallDir(wall), [nx, nz] = facingNormal(wall.facing)
      const u = placed.u + work.w / 200
      const target = { x: wall.a[0] + dx * u, z: wall.a[1] + dz * u }
      // Two side positions keep the central view open and permit a shared conversation.
      for (const side of [-.67, .67]) for (const standOff of [1.6, 1.95, 1.3]) {
        spots.push({ id: `${placed.id}:${side}:${standOff}`, art: placed.id, kind: 'painting', level: placed.level, y: floor.floorY,
          x: target.x + nx * standOff + dx * side, z: target.z + nz * standOff + dz * side,
          target, targetY: floor.floorY + placed.topY - work.h / 200,
          echoPose: work.id === 'my-turn-mtqsqgyy' ? 'my-turn' : undefined })
      }
    }
    const signature = JSON.stringify([spots, readingTarget])
    if (signature === this.signature) return
    this.signature = signature; this.pending = spots; this.readingTarget = readingTarget; this.dirty = true
  }

  /** Capsule clearance uses the same floor, wall, door and sculpture data as the player. */
  isClear(level: string, x: number, z: number, radius = RADIUS): boolean {
    const floor = this.level.levels.find(f => f.id === level)
    if (!floor) return false
    const surfaces = this.level.floors.filter(f => f.level === level && !/bridge|landing|stair/i.test(f.name ?? ''))
    for (let i = 0; i < 9; i++) {
      const px = x + (i ? Math.cos((i - 1) * Math.PI / 4) * radius : 0)
      const pz = z + (i ? Math.sin((i - 1) * Math.PI / 4) * radius : 0)
      if (!surfaces.some(f => pointInPoly(px, pz, f.poly))) return false
      if (this.level.blockers.some(b => b.level === level && pointInPoly(px, pz, b.poly))) return false
    }
    for (const stair of this.level.stairs) {
      if ((stair.level === level || stair.to === level) && inRect(x, z, stairRect(stair), radius)) return false
    }
    for (const wall of this.level.walls) {
      if (wall.baseY >= floor.floorY + 1.8 || wall.topY <= floor.floorY + .1) continue
      const [dx, dz] = wallDir(wall), u = clamp((x - wall.a[0]) * dx + (z - wall.a[1]) * dz, 0, wallLength(wall))
      if (Math.hypot(x - wall.a[0] - dx * u, z - wall.a[1] - dz * u) >= radius + wall.thickness / 2) continue
      const doorway = wall.openings.some(opening => {
        // Sideways passage uses the body depth at framed doors; elsewhere keep the wider walking buffer.
        const margin = opening.door?.frame ? Math.min(radius, .28) + (opening.door.jambW ?? .05) : radius
        if (opening.kind !== 'door' || u <= opening.u + margin || u >= opening.u + opening.w - margin) return false
        if (wall.baseY + opening.bottom > floor.floorY + .05 || wall.baseY + opening.bottom + opening.h < floor.floorY + 1.85) return false
        const runtime = this.doors.find(door => door.wall.id === wall.id && Math.abs(door.opening.u - opening.u) < .001)
        return runtime ? runtime.open && runtime.t > .9 : !opening.door?.leaf || !!opening.door.open
      })
      if (!doorway) return false
    }
    for (const obstacle of this.obstacles) {
      const { min, max } = obstacle.bounds
      if (max.y <= floor.floorY + .01 || min.y >= floor.floorY + 1.85) continue
      const c = Math.cos(obstacle.yaw), s = Math.sin(obstacle.yaw)
      const lx = c * (x - obstacle.x) - s * (z - obstacle.z), lz = s * (x - obstacle.x) + c * (z - obstacle.z)
      if (Math.hypot(lx - clamp(lx, min.x, max.x), lz - clamp(lz, min.z, max.z)) < radius) return false
    }
    return true
  }

  private segmentClear(level: string, a: Point, b: Point, radius = RADIUS): boolean {
    const steps = Math.max(1, Math.ceil(distance(a, b) / .12))
    for (let i = 0; i <= steps; i++) if (!this.isClear(level, a.x + (b.x - a.x) * i / steps, a.z + (b.z - a.z) * i / steps, radius)) return false
    return true
  }

  private unoccupied(level: string, point: Point, except: number): boolean {
    return this.agents.every(other => !other.visible || other.id === except || other.level !== level || distance(point, other) >= .83)
  }

  private canStudyFrom(point: Point & { level: string }, spot: ViewingSpot): boolean {
    if (point.level !== spot.level) return false
    // Stop before the painting's own wall, while rejecting intervening walls and sculptures.
    const length = distance(spot, spot.target) || 1
    const nearArt = { x: spot.target.x + (spot.x - spot.target.x) / length * .55,
      z: spot.target.z + (spot.z - spot.target.z) / length * .55 }
    return this.segmentClear(point.level, point, nearArt)
  }

  private courtyardExits(level: string): { inside: Point; centre: Point; outside: Point; dx: number; dz: number }[] {
    const floor = this.level.levels.find(f => f.id === level)
    const yards = this.level.floors.filter(f => f.level === level && /courtyard/i.test(f.name ?? ''))
    if (!floor || !yards.length) return []
    const exits: { inside: Point; centre: Point; outside: Point; dx: number; dz: number }[] = []
    for (const wall of this.level.walls) for (const opening of wall.openings) {
      if (opening.kind !== 'door' || opening.w < RADIUS * 2 + .08 || wall.baseY + opening.bottom > floor.floorY + .05
        || wall.baseY + opening.bottom + opening.h < floor.floorY + 1.85) continue
      const [dx, dz] = wallDir(wall), [nx, nz] = facingNormal(wall.facing)
      const hingeOffset = opening.door?.type === 'swing' ? (opening.door.hinge === 'b' ? -.0125 : .0125) : 0
      const centre = { x: wall.a[0] + dx * (opening.u + opening.w / 2 + hingeOffset), z: wall.a[1] + dz * (opening.u + opening.w / 2 + hingeOffset) }
      const offset = RADIUS + wall.thickness / 2 + .25
      const a = { x: centre.x + nx * offset, z: centre.z + nz * offset }, b = { x: centre.x - nx * offset, z: centre.z - nz * offset }
      const aYard = yards.some(yard => pointInPoly(a.x, a.z, yard.poly)), bYard = yards.some(yard => pointInPoly(b.x, b.z, yard.poly))
      if (aYard === bYard) continue
      const outside = aYard ? a : b
      // Stay centred until past the open door leaf before turning toward the text.
      if (opening.door?.type === 'swing' && opening.door.swingOut) {
        const reach = opening.w + RADIUS + .08
        outside.x = centre.x + (outside.x - centre.x) / offset * reach
        outside.z = centre.z + (outside.z - centre.z) / offset * reach
      }
      exits.push({ inside: aYard ? b : a, centre, outside, dx, dz })
    }
    return exits
  }

  private refreshReadingSpots(): void {
    this.readingSpots = []
    const target = this.readingTarget
    if (!target || ![target.x, target.y, target.z].every(Number.isFinite)) return
    const floor = this.level.levels.find(f => f.id === target.level)
    if (!floor) return
    for (const [index, exit] of this.courtyardExits(target.level).entries()) {
      const length = distance(exit.centre, exit.outside)
      for (const side of [1, -1]) {
        const x = exit.centre.x + (exit.outside.x - exit.centre.x) / length * 2 + exit.dx * side
        const z = exit.centre.z + (exit.outside.z - exit.centre.z) / length * 2 + exit.dz * side
        if (!this.isClear(target.level, x, z)) continue
        this.readingSpots.push({ id: `reading:${index}:${side}`, art: 'yozo-words', kind: 'reading', level: target.level,
          x, y: floor.floorY, z, target, targetY: target.y })
      }
    }
  }

  private refresh(): void {
    this.spots = this.pending.filter(spot => this.isClear(spot.level, spot.x, spot.z) && this.canStudyFrom(spot, spot))
    this.refreshReadingSpots()
    // Keep settled visitors in place when unrelated artwork changes.
    for (const visitor of this.agents) {
      if (visitor.excursion && visitor.visible && this.isClear(visitor.level, visitor.x, visitor.z)) {
        const replacement = [...this.spots, ...this.readingSpots].find(spot => spot.id === visitor.spot?.id)
        const route = replacement ? this.routeTo(visitor, replacement) : null
        if (replacement && route) {
          const changed = !visitor.spot || distance(replacement, visitor.spot) > .001 || distance(replacement.target, visitor.spot.target) > .001 || replacement.targetY !== visitor.spot.targetY
          const blocked = visitor.route.some((point, index) => !this.segmentClear(visitor.level, index ? visitor.route[index - 1] : visitor, point))
          visitor.spot = replacement
          if (changed || blocked) this.walkTo(visitor, replacement, route)
        } else if (!this.returnToArt(visitor) && !this.goReading(visitor)) {
          visitor.route = []; visitor.phase = 'read'; visitor.remaining = 3
        }
        continue
      }
      const retained = this.spots.find(spot => spot.id === visitor.spot?.id)
      if (visitor.visible && this.isClear(visitor.level, visitor.x, visitor.z)) {
        const candidates = this.spots
          .filter(spot => spot.level === visitor.level && this.unoccupied(spot.level, spot, visitor.id))
          .sort((a, b) => Number(b === retained) - Number(a === retained) || distance(visitor, a) - distance(visitor, b))
        let kept = false
        for (const replacement of candidates) {
          const route = visitor.id === 0 ? (this.canStudyFrom(visitor, replacement) ? [] : null) : this.routeTo(visitor, replacement)
          if (!route) continue
          const changed = !visitor.spot || replacement.id !== visitor.spot.id || distance(replacement, visitor.spot) > .001 || distance(replacement.target, visitor.spot.target) > .001 || replacement.targetY !== visitor.spot.targetY
          visitor.spot = replacement
          const routeBlocked = visitor.route.some((point, index) => !this.segmentClear(visitor.level, index ? visitor.route[index - 1] : visitor, point))
          if (changed || routeBlocked) {
            this.study(visitor, 14); visitor.cooldown = 6
            if (visitor.id !== 0 && distance(visitor, replacement) > .04) { visitor.route = route; visitor.phase = 'walk' }
          }
          kept = true; break
        }
        if (kept) continue
      }
      visitor.visible = false; visitor.route = []; visitor.spot = null; visitor.excursion = false; visitor.resumeWalk = false
    }
    for (const visitor of this.agents) {
      if (visitor.visible) continue
      const keepFloor = visitor.id !== 0 && visitor.level && this.isClear(visitor.level, visitor.x, visitor.z)
      const available = this.spots.filter(spot => this.unoccupied(spot.level, spot, visitor.id)
        && (!keepFloor || spot.level === visitor.level && this.routeTo(visitor, spot)))
      const first = this.agents[0].spot
      const preferred = visitor.id === 1 && first ? available.find(spot => spot.art === first.art && distance(spot, first) > .9) : null
      const fresh = available.find(spot => !this.agents.some(other => other.visible && other.spot?.art === spot.art))
      const spot = preferred ?? fresh ?? available[0]
      if (!spot) continue
      Object.assign(visitor, { visible: true, level: spot.level, x: spot.x, y: spot.y, z: spot.z, yaw: toward(spot, spot.target), spot,
        phase: 'study', remaining: 14 + visitor.id * 5, cooldown: 0, yieldCooldown: 0, nearby: 0, partner: null, speed: 0, nod: 0, gesture: 0, echo: 0, studyTime: 0 })
    }
    this.dirty = false
  }

  private study(visitor: Visitor, seconds = 24): void {
    visitor.phase = visitor.spot?.kind === 'reading' ? 'read' : 'study'
    visitor.remaining = visitor.phase === 'read' ? clamp(seconds + visitor.id * 3, 20, 35) : seconds + visitor.id * 3
    visitor.route = []; visitor.partner = null; visitor.thunderAt = null; visitor.studyTime = 0; visitor.resumeWalk = false
  }

  private shortRoute(level: string, start: Point, target: Point): Point[] | null {
    if (this.segmentClear(level, start, target)) return [target]
    // One bend around a sculpture is sufficient in these small gallery rooms; never cross floors.
    const via = this.spots.filter(spot => spot.level === level && spot !== target)
      .sort((a, b) => distance(start, a) + distance(a, target) - distance(start, b) - distance(b, target))
      .find(spot => distance(start, spot) + distance(spot, target) < 12 && this.segmentClear(level, start, spot) && this.segmentClear(level, spot, target))
    return via ? [via, target] : null
  }

  private routeTo(visitor: Visitor, target: ViewingSpot): Point[] | null {
    if (visitor.level !== target.level) return null
    const yards = this.level.floors.filter(f => f.level === visitor.level && /courtyard/i.test(f.name ?? ''))
    const outside = yards.some(yard => pointInPoly(visitor.x, visitor.z, yard.poly))
    const crossesDoor = outside !== yards.some(yard => pointInPoly(target.x, target.z, yard.poly))
    if (!crossesDoor) return this.shortRoute(visitor.level, visitor, target)
    if (!visitor.excursion && target.kind !== 'reading') return null
    for (const exit of this.courtyardExits(visitor.level)) {
      const [near, far] = outside ? [exit.outside, exit.inside] : [exit.inside, exit.outside]
      if (!this.segmentClear(visitor.level, near, far)) continue
      const before = this.shortRoute(visitor.level, visitor, near), after = this.shortRoute(visitor.level, far, target)
      if (before && after) return [...before, exit.centre, far, ...after]
    }
    return null
  }

  private walkTo(visitor: Visitor, target: ViewingSpot, route: Point[]): void {
    visitor.spot = target; visitor.route = route; visitor.phase = 'walk'; visitor.partner = null; visitor.thunderAt = null; visitor.resumeWalk = false
  }

  private goReading(visitor: Visitor): boolean {
    if (visitor.id === 0 || visitor.level !== this.readingTarget?.level) return false
    for (const target of this.readingSpots) {
      if (!this.unoccupied(visitor.level, target, visitor.id)) continue
      const route = this.routeTo(visitor, target)
      if (!route) continue
      visitor.excursion = true; this.walkTo(visitor, target, route); return true
    }
    return false
  }

  private returnToArt(visitor: Visitor): boolean {
    const choices = this.spots.filter(spot => spot.level === visitor.level && this.unoccupied(visitor.level, spot, visitor.id))
      .sort((a, b) => distance(visitor, a) - distance(visitor, b))
    for (const target of choices) {
      const route = this.routeTo(visitor, target)
      if (!route) continue
      this.walkTo(visitor, target, route); return true
    }
    return false
  }

  private makeRoom(visitor: Visitor, player: Point, pathEnd = player): boolean {
    if (!visitor.spot) return false
    const yaw = distance(player, pathEnd) > .05 ? toward(player, pathEnd) : toward(player, visitor)
    const passage = visitor.excursion ? this.courtyardExits(visitor.level).find(exit => segmentDistance(visitor, exit.inside, exit.outside) < .18) : null
    const options = (passage ? [passage.inside, passage.outside] : [[-1, .05], [1, .05], [-.75, -.65], [.75, -.65], [0, -.95], [-.75, .65], [.75, .65]].map(([side, back]) => ({ x: visitor.x + Math.cos(yaw) * side - Math.sin(yaw) * back,
      z: visitor.z - Math.sin(yaw) * side - Math.cos(yaw) * back })))
      .filter(point => distance(point, visitor) > .15 && segmentDistance(player, visitor, point) >= Math.min(distance(player, visitor), .62) - .001)
      .sort((a, b) => segmentDistance(b, player, pathEnd) - segmentDistance(a, player, pathEnd) || distance(b, player) - distance(a, player))
    const target = options.find(point => distance(point, player) > 1 && this.unoccupied(visitor.level, point, visitor.id)
      && this.agents.every(other => !other.visible || other.id === visitor.id || other.level !== visitor.level
        || segmentDistance(other, visitor, point) >= Math.min(.83, distance(other, visitor)) - .001)
      && this.segmentClear(visitor.level, visitor, point, visitor.id === 0 ? .44 : RADIUS))
    if (!target) return false
    visitor.resumeWalk ||= visitor.phase === 'walk'
    visitor.route = [target]; visitor.phase = 'yield'; visitor.cooldown = 16; visitor.yieldCooldown = .7; visitor.nearby = 0; visitor.partner = null
    return true
  }

  update(dt: number, player: VisitorPlayer, environment: VisitorEnvironment, obstacles: WalkObstacle[] = [], doors: DoorRuntime[] = []): void {
    this.obstacles = obstacles; this.doors = doors
    const obstacleSignature = obstacles.map(o => `${o.level}:${o.x}:${o.z}:${o.yaw}:${o.bounds.min.toArray()}:${o.bounds.max.toArray()}`).join('|')
      + doors.map(door => `${door.wall.id}:${door.opening.u}:${door.open && door.t > .9}`).join('|')
    if (obstacleSignature !== this.obstacleSignature) { this.obstacleSignature = obstacleSignature; this.dirty = true }
    if (this.dirty) this.refresh()
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .05)
    const travel = this.previousPlayer?.level === player.level ? distance(player, this.previousPlayer) : 0
    const approaching = dt > 0 && travel > .001 && travel < .45
    const reach = approaching ? Math.min(2.4, travel / dt * .85) / travel : 0
    const pathEnd = { x: player.x + (player.x - (this.previousPlayer?.x ?? player.x)) * reach,
      z: player.z + (player.z - (this.previousPlayer?.z ?? player.z)) * reach }
    this.previousPlayer = { ...player }
    if (environment.reduceMotion) {
      for (const visitor of this.agents) { visitor.speed = 0; visitor.lookYaw = 0; visitor.lookPitch = 0; visitor.nod = 0; visitor.gesture = 0; visitor.echo = 0 }
      return
    }
    this.readingCooldown = Math.max(0, this.readingCooldown - dt)
    this.echoCooldown = Math.max(0, this.echoCooldown - dt)
    if (environment.thunder) {
      const candidates = this.agents.filter(visitor => visitor.visible && visitor.level === player.level && visitor.phase !== 'walk' && visitor.phase !== 'yield')
      const visitor = candidates[this.stormCount++ % Math.max(1, candidates.length)]
      if (visitor) { visitor.phase = 'thunder'; visitor.remaining = 2.6; visitor.route = []; visitor.thunderAt = environment.thunder; visitor.cooldown = 12 }
    }
    for (const visitor of this.agents) {
      if (!visitor.visible || !visitor.spot) continue
      visitor.time += dt; visitor.remaining -= dt; visitor.cooldown = Math.max(0, visitor.cooldown - dt)
      visitor.yieldCooldown = Math.max(0, visitor.yieldCooldown - dt)
      visitor.nod = 0; visitor.gesture = 0; visitor.speed = 0; visitor.echo = 0
      visitor.studyTime = visitor.phase === 'study' ? visitor.studyTime + dt : 0
      visitor.passage = 0
      const sameFloor = visitor.level === player.level, proximity = sameFloor ? distance(visitor, player) : Infinity
      const aware = proximity < 2.7 && this.segmentClear(visitor.level, visitor, player, .02)
      let look: Point = visitor.spot.target, pitch = clamp(Math.atan2(visitor.y + 1.62 - visitor.spot.targetY, distance(visitor, look)), -.18, .24)
      if (visitor.phase === 'read') {
        const text = this.readingTarget ?? { ...visitor.spot.target, y: visitor.spot.targetY }
        const reach = distance(visitor, text)
        look = { x: text.x + Math.cos(visitor.yaw) * reach * Math.sin(visitor.time * .21) * .025,
          z: text.z - Math.sin(visitor.yaw) * reach * Math.sin(visitor.time * .21) * .025 }
        pitch = clamp(Math.atan2(visitor.y + 1.62 - text.y, reach), -.38, -.12) + Math.sin(visitor.time * .14) * .025
      }
      if (visitor.yieldCooldown <= 0 && aware) {
        const inSightline = distance(player, visitor.spot.target) > distance(visitor, visitor.spot.target) && segmentDistance(visitor, player, visitor.spot.target) < .46
        const inPath = approaching && segmentDistance(visitor, player, pathEnd) < .70
        const threatened = proximity < 1.4 || inPath || inSightline && proximity < 2.1
        const escaping = visitor.phase === 'yield' && visitor.route[0] && distance(visitor.route[0], player) > 1.1
          && (!approaching || segmentDistance(visitor.route[0], player, pathEnd) > .85)
        if (threatened && !escaping) this.makeRoom(visitor, player, pathEnd)
      }
      if ((visitor.phase === 'study' || visitor.phase === 'read') && visitor.cooldown <= 0 && aware) {
        const gaze = toward(player, visitor), facing = Math.abs(angle(gaze - (player.yaw + Math.PI))) < .8
        visitor.nearby = facing && proximity < 2.2 ? visitor.nearby + dt : Math.max(0, visitor.nearby - dt)
        if (visitor.nearby > 2) { visitor.phase = 'acknowledge'; visitor.remaining = 2.4; visitor.cooldown = 25; visitor.nearby = 0 }
      }
      if (visitor.phase === 'walk' || visitor.phase === 'yield') {
        const destination = visitor.route[0]
        if (!destination) {
          if (visitor.phase === 'yield' && visitor.resumeWalk) {
            const route = proximity > 1.5 ? this.routeTo(visitor, visitor.spot) : null
            if (route) this.walkTo(visitor, visitor.spot, route)
          } else this.study(visitor)
        }
        else {
          const passage = visitor.excursion ? this.courtyardExits(visitor.level).find(exit =>
            Math.abs((visitor.x - exit.centre.x) * exit.dx + (visitor.z - exit.centre.z) * exit.dz) < .7
            && [exit.centre, exit.inside, exit.outside].some(point => distance(point, destination) < .001)
            && Math.abs((destination.x - visitor.x) * exit.dx + (destination.z - visitor.z) * exit.dz) < .06) : null
          const passageYaw = passage ? Math.atan2(passage.dx, passage.dz) : null
          if (passage) visitor.passage = 1
          const aligned = passageYaw === null || Math.abs(angle(passageYaw - visitor.yaw)) < .02
          if (passageYaw !== null) visitor.yaw += angle(passageYaw - visitor.yaw) * Math.min(1, dt * 4)
          const length = distance(visitor, destination), step = aligned ? Math.min(length, (visitor.phase === 'yield' ? .72 : .43 + visitor.id * .025) * dt) : 0
          const next = { x: visitor.x + (destination.x - visitor.x) / (length || 1) * step, z: visitor.z + (destination.z - visitor.z) / (length || 1) * step }
          const clear = this.isClear(visitor.level, next.x, next.z, visitor.id === 0 ? .44 : RADIUS) && this.unoccupied(visitor.level, next, visitor.id)
            && (!sameFloor || distance(next, player) > .62 || visitor.phase === 'yield' && distance(next, player) > proximity + .00001)
          if (!clear && visitor.excursion) {
            const blocker = this.agents.find(other => other.visible && other.id !== visitor.id && other.level === visitor.level && distance(next, other) < .83)
            if (blocker && blocker.phase !== 'yield' && blocker.yieldCooldown <= 0) this.makeRoom(blocker, visitor)
          }
          if (clear) {
            visitor.x = next.x; visitor.z = next.z; visitor.speed = dt > 0 ? step / dt : 0; visitor.gait += step * (TAU / (visitor.id === 0 ? .30 : .48))
            if (visitor.phase === 'walk' && passageYaw === null) visitor.yaw += angle(toward(visitor, destination) - visitor.yaw) * Math.min(1, dt * 3.5)
            const direction = angle(toward(visitor, destination) - visitor.yaw)
            visitor.strafe = Math.sin(direction); visitor.forward = Math.cos(direction)
            if (length < .04) {
              visitor.route.shift()
              if (!visitor.route.length) {
                if (visitor.phase === 'walk' && visitor.excursion && visitor.spot.kind === 'painting') {
                  visitor.excursion = false; this.readingCooldown = 50
                }
                if (!visitor.resumeWalk) this.study(visitor, visitor.spot.kind === 'reading' ? 20 : 28)
              }
            }
          } else if (visitor.phase === 'yield') { visitor.route = []; visitor.yieldCooldown = 0 }
          else if (!visitor.excursion) { this.study(visitor, 5); visitor.cooldown = 6 }
          if (visitor.phase === 'walk') look = destination
          if (visitor.phase === 'yield') look = player
        }
      } else if (visitor.phase === 'acknowledge') {
        look = player; pitch = 0
        visitor.nod = Math.sin(clamp((2.4 - visitor.remaining - .45) / 1.1, 0, 1) * Math.PI)
        if (visitor.remaining <= 0) this.study(visitor)
      } else if (visitor.phase === 'thunder') {
        look = visitor.thunderAt ?? look; pitch = -.12
        if (visitor.remaining <= 0) this.study(visitor)
      } else if (visitor.phase === 'pair') {
        const partner = this.agents.find(other => other.id === visitor.partner && other.visible && other.phase === 'pair')
        if (!partner || visitor.remaining <= 0 || proximity < .9) this.study(visitor)
        else {
          const progress = clamp((6 - visitor.remaining) / 6, 0, 1)
          if (visitor.id > partner.id) { visitor.gesture = Math.sin(progress * Math.PI) * .65; if (progress < .25 || progress > .8) look = partner }
          else { look = progress < .45 ? visitor.spot.target : partner; visitor.nod = Math.sin(clamp((progress - .48) / .24, 0, 1) * Math.PI) * .7 }
        }
      } else if (visitor.phase === 'echo') {
        // MY TURN's upper-left salaryman: ease into his bow, hold, then release.
        const blend = clamp(Math.min((10 - visitor.remaining) / 3, visitor.remaining / 3), 0, 1)
        visitor.echo = blend * blend * (3 - 2 * blend)
        if (visitor.remaining <= 0 || visitor.spot.echoPose !== 'my-turn') { visitor.echo = 0; this.study(visitor, 8) }
      } else if (visitor.phase === 'read') {
        if (visitor.remaining <= 0) {
          if (!this.returnToArt(visitor)) visitor.remaining = 3
        }
      } else if (visitor.phase === 'study') {
        if (visitor.id !== 0 && !visitor.excursion && visitor.spot.echoPose === 'my-turn'
          && visitor.studyTime >= 5 && this.echoCooldown <= 0 && proximity > 1.8) {
          visitor.phase = 'echo'; visitor.remaining = 10; visitor.partner = null; visitor.cooldown = 20
          this.echoCooldown = 90
        }
        if (visitor.phase === 'study' && visitor.cooldown <= 0 && visitor.time > 6) {
          const partner = this.agents.find(other => other.visible && other.id !== visitor.id && other.phase === 'study' && other.cooldown <= 0 && other.spot?.art === visitor.spot?.art && distance(other, visitor) < 2.05)
          if (partner) {
            for (const [a, b] of [[visitor, partner], [partner, visitor]]) { a.phase = 'pair'; a.partner = b.id; a.remaining = 6; a.cooldown = 42 + a.id * 5 }
          }
        }
        if (visitor.phase === 'study' && visitor.id !== 0 && visitor.remaining <= 0 && proximity > 1.8) {
          if (this.readingCooldown <= 0 && !this.agents.some(other => other.excursion) && this.goReading(visitor)) continue
          const choices = this.spots.filter(spot => spot.level === visitor.level && spot.art !== visitor.spot!.art && this.unoccupied(spot.level, spot, visitor.id))
          const offset = Math.floor(visitor.time / 23 + visitor.id) % Math.max(1, choices.length)
          for (let i = 0; i < choices.length; i++) {
            const target = choices[(offset + i) % choices.length], route = this.routeTo(visitor, target)
            if (!route) continue
            visitor.spot = target; visitor.route = route; visitor.phase = 'walk'; break
          }
          visitor.remaining = 20 + visitor.id * 4
        }
      }
      if (visitor.phase === 'study' || visitor.phase === 'echo' || visitor.phase === 'read' || visitor.phase === 'pair') visitor.yaw += angle(toward(visitor, visitor.spot.target) - visitor.yaw) * Math.min(1, dt * 1.6)
      const desiredYaw = clamp(angle(toward(visitor, look) - visitor.yaw), -.65, .65)
      visitor.lookYaw += (desiredYaw - visitor.lookYaw) * Math.min(1, dt * 3)
      visitor.lookPitch += (pitch - visitor.lookPitch) * Math.min(1, dt * 2.5)
    }
  }
}
