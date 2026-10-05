import * as THREE from 'three'
import type { DoorRuntime } from './room/level'

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
