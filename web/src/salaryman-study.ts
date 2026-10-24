import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { Renderer } from './world/renderer'
import { GhostAsset } from './world/ghost-asset'

const host = document.querySelector<HTMLElement>('#stage')!
const status = document.querySelector<HTMLElement>('#status')!
for (const id of ['lit', 'clay', 'ghost']) document.querySelector<HTMLButtonElement>('#' + id)!.disabled = true
const models = [
  { id: 'tripo', label: 'Tripo 01 · Original', url: new URL('./assets/characters/salaryman-tripo.glb', import.meta.url).href, yaw: -Math.PI / 2 },
  { id: 'tripo-02', label: 'Tripo 02 · T-pose', url: new URL('./assets/characters/salaryman-tripo-02.glb', import.meta.url).href, yaw: -Math.PI / 2 },
  { id: 'tripo-03', label: 'Tripo 03 · T-pose', url: new URL('./assets/characters/salaryman-tripo-03.glb', import.meta.url).href, yaw: -Math.PI / 2 },
  { id: 'tripo-04', label: 'Tripo 04 · T-pose', url: new URL('./assets/characters/salaryman-tripo-04.glb', import.meta.url).href, yaw: -Math.PI / 2 },
  { id: 'tripo-05', label: 'Tripo 05 · T-pose', url: new URL('./assets/characters/salaryman-tripo-05.glb', import.meta.url).href, yaw: -Math.PI / 2 },
]
const selectedModel = models.find(model => model.id === new URLSearchParams(location.search).get('model')) ?? models[0]
const modelSelect = document.querySelector<HTMLSelectElement>('#character')!
for (const model of models) modelSelect.add(new Option(model.label, model.id, false, model === selectedModel))
modelSelect.onchange = () => {
  const url = new URL(location.href)
  url.searchParams.set('model', modelSelect.value)
  location.assign(url.href)
}
const renderer = new Renderer(host)
const { gl, scene, camera } = renderer
scene.background = new THREE.Color('#292f39')
camera.fov = 32; camera.far = 30; camera.updateProjectionMatrix()
gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFSoftShadowMap
scene.add(new THREE.HemisphereLight('#e8edf8', '#302921', 1.7))
for (const [position, intensity, color] of [
  [[-2, 3.5, 3], 3, '#fff3e6'], [[3, 2, 1], 1.2, '#d7e6ff'], [[1, 3, -3], 3, '#e4eaff'],
] as const) {
  const light = new THREE.DirectionalLight(color, intensity)
  light.position.set(position[0], position[1], position[2]); scene.add(light)
  if (intensity === 3 && position[2] > 0) {
    light.castShadow = true; light.shadow.mapSize.set(2048, 2048)
    light.shadow.camera.left = -1.2; light.shadow.camera.right = 1.2
    light.shadow.camera.top = 2; light.shadow.camera.bottom = -1.2
    light.shadow.normalBias = .005
  }
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: '#30343b', roughness: .9 }))
floor.rotation.x = -Math.PI / 2; floor.position.y = -.001; floor.receiveShadow = true; scene.add(floor)
// A textured contrast wall exposes transparency and outline problems at every viewing angle.
const wallCanvas = document.createElement('canvas'); wallCanvas.width = 1024; wallCanvas.height = 512
const wallContext = wallCanvas.getContext('2d')!
const pixels = wallContext.createImageData(1024, 512)
for (let y = 0; y < 512; y++) for (let x = 0; x < 1024; x++) {
  const band = Math.floor(x / 128) % 4
  const base = [192, 132, 52, 106][band]
  const grain = Math.sin(x * 78.233 + y * 12.9898) * 4
  const mortar = y % 70 < 2 || (x + (Math.floor(y / 70) % 2) * 64) % 128 < 2 ? -12 : 0
  const i = (y * 1024 + x) * 4
  pixels.data[i] = base + grain + mortar; pixels.data[i + 1] = base + grain + mortar
  pixels.data[i + 2] = base + grain + mortar; pixels.data[i + 3] = 255
}
wallContext.putImageData(pixels, 0, 0)
const wallTexture = new THREE.CanvasTexture(wallCanvas); wallTexture.colorSpace = THREE.SRGBColorSpace
const wall = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 3, 64, 1, true), new THREE.MeshBasicMaterial({ map: wallTexture, side: THREE.BackSide }))
wall.position.y = 1.5; wall.visible = false; scene.add(wall)
document.querySelector<HTMLButtonElement>('#backdrop')!.onclick = event => {
  wall.visible = !wall.visible
  const button = event.currentTarget as HTMLButtonElement
  button.setAttribute('aria-pressed', String(wall.visible))
}
const controls = new OrbitControls(camera, gl.domElement)
controls.enableDamping = true; controls.minDistance = .35; controls.maxDistance = 12
controls.maxPolarAngle = Math.PI * .56
const params = new URLSearchParams(location.search)
let view = params.get('view') ?? 'body', motion = false, mixer: THREE.AnimationMixer | undefined
let ghost: GhostAsset | undefined
const headTarget = new THREE.Vector3(0, 1.64, .035)
const fit = () => {
  const narrow = Math.max(1, 1 / camera.aspect)
  if (view === 'face') { controls.target.copy(headTarget); camera.position.copy(headTarget).add(new THREE.Vector3(.36 * narrow, 0, .80 * narrow)) }
  else if (view === 'face-profile') { controls.target.copy(headTarget); camera.position.copy(headTarget).add(new THREE.Vector3(.90 * narrow, 0, 0)) }
  else if (view === 'front') { camera.position.set(0, 1.0, 3.9 * narrow); controls.target.set(0, .96, 0) }
  else if (view === 'profile') { camera.position.set(3.3 * narrow, 1.1, 0); controls.target.set(0, .93, 0) }
  else if (view === 'back') { camera.position.set(-1.5 * narrow, 1.15, -3.2 * narrow); controls.target.set(0, .93, 0) }
  else { camera.position.set(1.6 * narrow, 1.13, 3.5 * narrow); controls.target.set(0, .96, 0) }
  controls.update()
}
fit()
window.addEventListener('resize', fit)
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.onclick = () => {
  view = button.dataset.view!; fit()
  const url = new URL(location.href); url.searchParams.set('view', view); history.replaceState(null, '', url)
})
document.querySelector<HTMLButtonElement>('#motion')!.onclick = event => {
  motion = !motion
  const button = event.currentTarget as HTMLButtonElement
  button.textContent = motion ? 'Motion on' : 'Motion off'; button.setAttribute('aria-pressed', String(motion))
}
const clay = new THREE.MeshStandardMaterial({ color: '#a6a8aa', roughness: .75 })
try {
  const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(selectedModel.url)
  // Preserve the supplied geometry; position and scale it through its scene root.
  const modelRoot = new THREE.Group()
  modelRoot.add(asset.scene)
  modelRoot.rotation.y = selectedModel.yaw
  modelRoot.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(modelRoot)
  const size = bounds.getSize(new THREE.Vector3())
  if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('The supplied model has invalid bounds')
  const centre = bounds.getCenter(new THREE.Vector3()), scale = 1.8 / size.y
  modelRoot.scale.setScalar(scale)
  modelRoot.position.set(-centre.x * scale, -bounds.min.y * scale, -centre.z * scale)
  modelRoot.updateMatrixWorld(true)
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
  let triangles = 0
  asset.scene.traverse(object => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    originals.set(mesh, mesh.material)
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const ink = materials.every(material => material.name === 'Ghost feature ink')
    mesh.castShadow = !ink; mesh.receiveShadow = !ink
    for (const material of materials) if (material.name === 'Ghost feature ink') {
      material.transparent = true; material.opacity = 0; material.depthWrite = false
    }
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3
  })
  scene.add(modelRoot)
  ghost = new GhostAsset(modelRoot)
  scene.add(ghost.group); ghost.group.visible = false
  scene.add(ghost.releaseModel())
  mixer = new THREE.AnimationMixer(asset.scene)
  const idleClip = asset.animations.find(clip => /idle|observe/i.test(clip.name)) ?? asset.animations[0]
  if (idleClip) mixer.clipAction(idleClip).play()
  const motionButton = document.querySelector<HTMLButtonElement>('#motion')!
  motionButton.disabled = !idleClip
  if (!idleClip) motionButton.textContent = 'Static pose'
  mixer.update(0)
  // Frame the exported posed head itself, so profile views also fit narrow screens.
  modelRoot.updateMatrixWorld(true)
  const headBounds = new THREE.Box3(), point = new THREE.Vector3()
  asset.scene.traverse(object => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) (mesh as THREE.SkinnedMesh).skeleton.update()
    for (let index = 0; index < mesh.geometry.attributes.position.count; index++) {
      mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld)
      if (point.y > 1.53) headBounds.expandByPoint(point)
    }
  })
  if (!headBounds.isEmpty()) headBounds.getCenter(headTarget)
  fit()
  const setMaterialMode = (id: string) => {
    if (id === 'ghost') ghost!.captureModel()
    else scene.add(ghost!.releaseModel())
    ghost!.group.visible = id === 'ghost'
    for (const [mesh, original] of originals) mesh.material = id === 'clay'
      ? Array.isArray(original) ? original.map(material => material.name === 'Ghost feature ink' ? material : clay) : original.name === 'Ghost feature ink' ? original : clay
      : original
    for (const mode of ['lit', 'clay', 'ghost']) document.querySelector('#' + mode)!.setAttribute('aria-pressed', String(id === mode))
    const url = new URL(location.href); url.searchParams.set('mode', id); history.replaceState(null, '', url)
  }
  for (const id of ['lit', 'clay', 'ghost']) {
    const button = document.querySelector<HTMLButtonElement>('#' + id)!
    button.onclick = () => setMaterialMode(id); button.disabled = false
  }
  const initialMode = params.get('mode')
  setMaterialMode(initialMode === 'lit' || initialMode === 'clay' ? initialMode : 'ghost')
  status.textContent = `${selectedModel.label.toUpperCase()} · ${Math.round(triangles / 1000)}K TRIANGLES · ${idleClip ? 'ANIMATED' : 'STATIC POSE'}`
} catch (error) {
  status.textContent = 'The character could not load. Reload to retry.'
  console.error(error)
}
renderer.start(dt => {
  if (motion) mixer?.update(dt)
  controls.update()
  ghost?.prepare(gl, camera, renderer.composer.readBuffer)
})
