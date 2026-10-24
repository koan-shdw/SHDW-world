import * as THREE from 'three'
import { facingNormal, wallDir, type DoorRuntime } from './room/level'

/** Keep the threshold and the swinging leaf clear before closing around a visitor. */
export function doorOccupied(door: DoorRuntime, people: readonly { visible: boolean; x: number; y: number; z: number }[]): boolean {
  const { wall, opening } = door, radius = .34
  const [dx, dz] = wallDir(wall), [nx, nz] = facingNormal(wall.facing)
  const jamb = opening.door?.frame === false ? .005 : (opening.door?.jambW ?? .05)
  const hinge = opening.door?.hinge === 'b' ? opening.u + opening.w - jamb : opening.u + jamb
  return people.some(person => {
    if (!person.visible || person.y + 1.8 <= wall.baseY + opening.bottom || person.y >= wall.baseY + opening.bottom + opening.h) return false
    const along = (person.x - wall.a[0]) * dx + (person.z - wall.a[1]) * dz
    const across = (person.x - wall.a[0]) * nx + (person.z - wall.a[1]) * nz
    if (along < opening.u - radius || along > opening.u + opening.w + radius) return false
    if (Math.abs(across) < radius + wall.thickness / 2 + .08) return true
    const swingSide = across * (opening.door?.swingOut ? -1 : 1)
    return door.type === 'swing' && swingSide > -radius && Math.hypot(along - hinge, across) < opening.w - 2 * jamb + radius
  })
}

/** Pick the actual moving door leaf, with the room's nearer surfaces blocking the click. */
export function doorAt(doors: DoorRuntime[], room: THREE.Group, camera: THREE.PerspectiveCamera, floor: string, pointer = new THREE.Vector2()): DoorRuntime | null {
  const ray = new THREE.Raycaster(); ray.far = 2.8
  camera.updateMatrixWorld(); room.updateWorldMatrix(true, true); ray.setFromCamera(pointer, camera)
  const candidates = doors.filter(d => d.wall.level === floor)
  const hit = ray.intersectObjects(candidates.map(d => d.pivot), true)[0]
  if (!hit) return null
  const door = candidates.find(d => { let object: THREE.Object3D | null = hit.object; while (object) { if (object === d.pivot) return true; object = object.parent } return false })
  if (!door) return null
  const surfaces: THREE.Object3D[] = []
  room.traverseVisible(o => { if ((o as THREE.Mesh).isMesh) surfaces.push(o) })
  const first = ray.intersectObjects(surfaces, false)[0]
  return first && first.distance < hit.distance - 0.025 ? null : door
}
