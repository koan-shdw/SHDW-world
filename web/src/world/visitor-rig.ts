import * as THREE from 'three'

export interface VisitorPose {
  /** Gait phase in radians, advanced from distance travelled. Speed is metres/second. */
  gait: number
  speed: number
  lookYaw: number
  lookPitch: number
  gesture: number
  nod: number
  time: number
  strafe?: number
  forward?: number
  passage?: number
  echo?: number
}

export interface VisitorRig {
  update(dt: number, pose: VisitorPose): void
  /** Releases only the rig's cloned geometries and skeleton. Materials belong to the caller. */
  dispose(): void
}

const smooth = (a: number, b: number, v: number) => THREE.MathUtils.smoothstep(v, a, b)
const clamp = THREE.MathUtils.clamp

/** Skin a normalized, +Z-facing working copy. The supplied GLB and its geometry remain unchanged. */
export function createVisitorRig(model: THREE.Object3D, originalPose = false): VisitorRig {
  model.updateWorldMatrix(true, true)
  const parentInverse = model.parent ? model.parent.matrixWorld.clone().invert() : new THREE.Matrix4()
  const sources: THREE.Mesh[] = []
  model.traverse(object => { if ((object as THREE.Mesh).isMesh) sources.push(object as THREE.Mesh) })
  const geometries: THREE.BufferGeometry[] = []
  const meshes: THREE.SkinnedMesh[] = []
  const point = new THREE.Vector3()
  let chestHalf = 0, span = 0, armY = 0, armZ = 0, armSamples = 0
  // Work in metres so the skeleton and its falloffs do not depend on the GLB's quantization transform.
  for (const source of sources) {
    const geometry = source.geometry.clone()
    const positions = source.geometry.getAttribute('position')
    const values = new Float32Array(positions.count * 3)
    const transform = parentInverse.clone().multiply(source.matrixWorld)
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(transform)
      values.set([point.x, point.y, point.z], i * 3)
      span = Math.max(span, Math.abs(point.x))
      if (point.y > 1.20 && point.y < 1.27) chestHalf = Math.max(chestHalf, Math.abs(point.x))
      if (Math.abs(point.x) > .33 && Math.abs(point.x) < .52 && point.y > 1.20) {
        armY += point.y; armZ += point.z; armSamples++
      }
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(values, 3))
    const normal = source.geometry.getAttribute('normal')
    if (normal) {
      const normals = new Float32Array(normal.count * 3), normalMatrix = new THREE.Matrix3().getNormalMatrix(transform)
      for (let i = 0; i < normal.count; i++) {
        point.fromBufferAttribute(normal, i).applyNormalMatrix(normalMatrix)
        normals.set([point.x, point.y, point.z], i * 3)
      }
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    }
    geometry.deleteAttribute('tangent')
    geometry.computeBoundingBox(); geometry.computeBoundingSphere()
    geometries.push(geometry)
    const mesh = new THREE.SkinnedMesh(geometry, source.material)
    mesh.name = source.name; mesh.castShadow = source.castShadow; mesh.receiveShadow = source.receiveShadow
    // The rest-pose bounds are too narrow for a pointing arm or a walking foot.
    mesh.frustumCulled = false
    meshes.push(mesh)
  }
  model.clear(); model.position.set(0, 0, 0); model.quaternion.identity(); model.scale.setScalar(1)
  model.matrix.identity(); model.matrixAutoUpdate = true
  const shoulderX = clamp(chestHalf * .98, .175, .27)
  const shoulderY = clamp(armSamples ? armY / armSamples : 1.40, 1.36, 1.43)
  const shoulderZ = clamp(armSamples ? armZ / armSamples : -.035, -.07, .015)
  const elbowX = shoulderX + (span - shoulderX) * .45
  const wristX = shoulderX + (span - shoulderX) * .80
  const hipX = clamp(chestHalf * .55, .095, .145)
  const bones: THREE.Bone[] = []
  function bone(name: string, parent: THREE.Bone | null, x: number, y: number, z: number): THREE.Bone {
    const item = new THREE.Bone(); item.name = name
    if (parent) { parent.add(item); item.position.set(x, y, z).sub(parent.getWorldPosition(new THREE.Vector3())) }
    else item.position.set(x, y, z)
    item.updateWorldMatrix(true, false); bones.push(item); return item
  }
  const root = bone('visitor_root', null, 0, .94, -.025)
  const chest = bone('visitor_chest', root, 0, 1.12, -.025)
  const head = bone('visitor_head', chest, 0, 1.535, -.005)
  const arms = [-1, 1].map(side => {
    const upper = bone(`upper_arm_${side}`, chest, side * shoulderX, shoulderY, shoulderZ)
    const lower = bone(`forearm_${side}`, upper, side * elbowX, shoulderY, shoulderZ)
    const hand = bone(`hand_${side}`, lower, side * wristX, shoulderY, shoulderZ)
    return { side, upper, lower, hand, shoulderRest: upper.position.clone() }
  })
  const legs = [-1, 1].map(side => {
    const thigh = bone(`thigh_${side}`, root, side * hipX, .92, -.035)
    const shin = bone(`shin_${side}`, thigh, side * hipX, .47, -.035)
    const foot = bone(`foot_${side}`, shin, side * hipX, .09, -.035)
    return { side, thigh, shin, foot }
  })
  const indexOf = (item: THREE.Bone) => bones.indexOf(item)
  const indexes = {
    root: indexOf(root), chest: indexOf(chest), head: indexOf(head),
    arms: arms.map(a => [indexOf(a.upper), indexOf(a.lower), indexOf(a.hand)]),
    legs: legs.map(a => [indexOf(a.thigh), indexOf(a.shin), indexOf(a.foot)]),
  }
  for (const mesh of meshes) {
    const positions = mesh.geometry.getAttribute('position'), count = positions.count
    const skinIndexes = new Uint16Array(count * 4), skinWeights = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      const x = positions.getX(i), y = positions.getY(i), ax = Math.abs(x), side = x < 0 ? 0 : 1
      let ids: number[], weights: number[]
      if (y > 1.49 && ax < .21) {
        const w = smooth(1.50, 1.585, y)
        ids = [indexes.chest, indexes.head]; weights = [1 - w, w]
      } else if (!originalPose && y > shoulderY - .17 && ax > shoulderX - .055) {
        // Keep the lapels and centre chest out of the arm weights; blend through the sleeve root.
        const arm = smooth(shoulderX - .045, shoulderX + .105, ax)
        const elbow = smooth(elbowX - .065, elbowX + .065, ax)
        const wrist = smooth(wristX - .035, wristX + .035, ax)
        ids = [indexes.chest, ...indexes.arms[side]]
        weights = [1 - arm, arm * (1 - elbow), arm * elbow * (1 - wrist), arm * elbow * wrist]
      } else if (y < .91) {
        // The jacket hem stays on the pelvis. Only the exposed trousers follow the legs.
        // The briefcase is fused to the left thigh; hold that contact still and step below the knee.
        const bag = originalPose ? smooth(.40, .46, y) * (1 - smooth(0, .04, x)) : 0
        const leg = (1 - smooth(originalPose ? .69 : .78, originalPose ? .79 : .89, y)) * (1 - bag)
        const knee = 1 - smooth(.405, .535, y)
        const ankle = 1 - smooth(.065, .14, y)
        ids = [indexes.root, ...indexes.legs[side]]
        weights = [1 - leg, leg * (1 - knee), leg * knee * (1 - ankle), leg * knee * ankle]
      } else {
        const w = smooth(.94, 1.24, y)
        ids = [indexes.root, indexes.chest]; weights = [1 - w, w]
      }
      for (let j = 0; j < ids.length; j++) { skinIndexes[i * 4 + j] = ids[j]; skinWeights[i * 4 + j] = weights[j] }
    }
    mesh.geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndexes, 4))
    mesh.geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeights, 4))
    model.add(mesh)
  }
  model.add(root); model.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(bones)
  for (const mesh of meshes) mesh.bind(skeleton, new THREE.Matrix4())
  let yaw = 0, pitch = 0, gesture = 0, nod = 0, movement = 0, passage = 0, echo = 0
  const downAxis = new THREE.Vector3(0, -1, 0), forwardAxis = new THREE.Vector3(0, 0, 1)
  const footTarget = new THREE.Vector3(), legAxis = new THREE.Vector3(), kneePole = new THREE.Vector3()
  const upperDirection = new THREE.Vector3(), lowerDirection = new THREE.Vector3()
  const upperRotation = new THREE.Quaternion(), lowerRotation = new THREE.Quaternion()
  const neutralRotation = new THREE.Quaternion()
  const update = (dt: number, pose: VisitorPose) => {
    const blend = 1 - Math.exp(-Math.min(.1, Math.max(0, dt)) * 7)
    yaw += (clamp(pose.lookYaw, -.65, .65) - yaw) * blend
    pitch += (clamp(pose.lookPitch, -.26, .30) - pitch) * blend
    gesture += (clamp(pose.gesture, 0, 1) - gesture) * blend
    nod += (clamp(pose.nod, -1, 1) - nod) * blend
    passage += (clamp(pose.passage ?? 0, 0, 1) - passage) * blend
    echo += ((originalPose ? 0 : clamp(pose.echo ?? 0, 0, 1)) - echo) * blend
    movement += (clamp(pose.speed / .12, 0, 1) - movement) * blend
    const moving = movement
    const echoPose = echo * (1 - moving) * (1 - passage)
    const breath = Math.sin(pose.time * 1.15)
    // MY TURN's upper-left suited figure: lowered chin, slight left gaze and rounded shoulders.
    chest.rotation.set(.005 * breath + echoPose * .08, yaw * .10, .006 * Math.sin(pose.time * .67) * (1 - moving))
    head.rotation.set(pitch * (1 - echoPose * .65) + nod * .11 + echoPose * .19,
      yaw * .90 * (1 - echoPose * .65) - echoPose * .16, .008 * Math.sin(pose.time * .41))
    if (!originalPose) {
      for (const arm of arms) {
        const phase = pose.gait + (arm.side < 0 ? Math.PI : 0)
        const pointing = arm.side < 0 ? gesture * (1 - passage) * (1 - echoPose) : 0
        // Shoulder protraction brings the sleeves inward and forward for the narrow entrance.
        arm.upper.position.copy(arm.shoulderRest)
        arm.upper.position.x -= arm.side * (passage * .018 + echoPose * .006)
        arm.upper.position.z += passage * .025 + echoPose * .015
        // A relaxed elbow and a little shoulder clearance keep the sleeve beside the jacket.
        arm.upper.rotation.set(-.03 - passage * .10 + Math.sin(phase) * moving * .10 * (1 - passage) - pointing * .30, arm.side * pointing * .28,
          -arm.side * (1.36 + passage * .20 + echoPose * .06 - pointing * .38))
        arm.lower.rotation.set(0, -arm.side * (.10 + passage * .18 + pointing * .68), -arm.side * .025)
        arm.hand.rotation.set(0, -arm.side * pointing * .10, 0)
      }
    }
    for (const leg of legs) {
        const phase = pose.gait + (leg.side < 0 ? Math.PI : 0)
        const swing = Math.max(0, Math.sin(phase))
        const strafe = clamp(pose.strafe ?? 0, -1, 1)
        const forward = clamp(pose.forward ?? Math.sqrt(1 - strafe * strafe), -1, 1)
        const stride = Math.cos(phase) * (originalPose ? .075 : .12) * moving
        // Sideways and backward yielding use the actual travel direction. Keep the feet from crossing.
        const x = leg.side < 0 ? Math.min(stride * strafe, hipX - .05) : Math.max(stride * strafe, .05 - hipX)
        const z = stride * forward
        const rise = swing * (originalPose ? .025 : .043) * moving
        const down = .83 - rise
        footTarget.set(x, -down, z)
        const distance = clamp(footTarget.length(), .10, .83)
        legAxis.copy(footTarget).normalize(); footTarget.copy(legAxis).multiplyScalar(distance)
        kneePole.copy(forwardAxis).addScaledVector(legAxis, -forwardAxis.dot(legAxis)).normalize()
        const cosHip = clamp((.45 ** 2 + distance ** 2 - .38 ** 2) / (.9 * distance), -1, 1)
        upperDirection.copy(legAxis).multiplyScalar(cosHip).addScaledVector(kneePole, Math.sqrt(Math.max(0, 1 - cosHip * cosHip)))
        lowerDirection.copy(footTarget).addScaledVector(upperDirection, -.45).normalize()
        upperRotation.setFromUnitVectors(downAxis, upperDirection)
        lowerRotation.setFromUnitVectors(downAxis, lowerDirection)
        leg.thigh.quaternion.identity().slerp(upperRotation, moving)
        leg.shin.quaternion.copy(upperRotation).invert().multiply(lowerRotation)
        leg.shin.quaternion.slerp(neutralRotation, 1 - moving)
        leg.foot.quaternion.copy(lowerRotation).invert().slerp(neutralRotation, 1 - moving)
    }
    model.updateMatrixWorld(true); skeleton.update()
  }
  update(0, { gait: 0, speed: 0, lookYaw: 0, lookPitch: 0, gesture: 0, nod: 0, time: 0 })
  return { update, dispose() { geometries.forEach(g => g.dispose()); skeleton.dispose() } }
}
