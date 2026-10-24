// Actual Worker + client modules, isolated SQLite/R2 and browser stubs. Node 22.13+.
const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'shdw-test-'));
require('esbuild').buildSync({ stdin: { contents: `export {default as worker} from './worker/src/index.ts'; export {Store} from './web/src/world/store.ts'; export {ArtSystem} from './web/src/world/art/art.ts'; export {Input} from './web/src/world/input.ts'; export {Walker} from './web/src/world/walk.ts'; export {buildLevel, updateDoors} from './web/src/world/room/level.ts'; export {doorAt} from './web/src/world/doors.ts'; export {sheltered, Wind} from './web/src/world/wind.ts'; export {Void} from './web/src/world/looks/void.ts'; export {Plants} from './web/src/world/looks/plants.ts'; export {EdgesPass} from './web/src/world/looks/edges.ts'; export {GhostVisitor} from './web/src/world/ghost.ts'; export * as THREE from './web/node_modules/three/build/three.module.js';`, resolveDir: root, loader: 'ts' }, outfile: path.join(scratch, 'project.cjs'), bundle: true, platform: 'node', format: 'cjs', define: { 'import.meta.env.VITE_STORE': '"http://local.test"' }, logLevel: 'silent' });
const { worker, Store, ArtSystem, Input, Walker, buildLevel, updateDoors, doorAt, sheltered, Wind, Void, Plants, EdgesPass, GhostVisitor, THREE } = require(path.join(scratch, 'project.cjs'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const memory = new Map();
global.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) };
global.window = { addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout, matchMedia: () => ({ matches: false }) };
global.document = { addEventListener() {}, removeEventListener() {} };
const level = JSON.parse(fs.readFileSync(path.join(root, 'level/level.json')));
const meta = { id: 'test-art', kind: 'painting', title: 'Test', w: 30, h: 30, d: 2, edge: 'wrap', ext: 'png', ts: 1 };
const placed = { id: 'test-item', art: meta.id, kind: 'painting', wall: 'g-north', level: 'ground', u: 1, topY: 2, snap: null };

test('ghost spectator follows its source artwork identity, placement and floor, and hides when absent', () => {
  const ghost = new GhostVisitor(level);
  const source = { ...meta, id: 'my-turn-mtqsqgyy', title: 'MY TURN', w: 91, h: 61 };
  const copy = { ...placed, art: source.id, wall: 'g-south', u: 2.7, topY: 1.805 };
  const layout = { items: [copy] };
  try {
    assert.equal(ghost.group.visible, false);
    ghost.sync([{ ...source, id: 'unrelated-work' }], layout);
    assert.equal(ghost.group.visible, false, 'a matching title is not the source artwork');
    ghost.sync([{ ...source, title: 'Updated title' }], layout);
    assert.equal(ghost.group.visible, true, 'renaming the source preserves its visitor');
    const before = ghost.group.position.clone();
    assert.ok(before.z > -2.37 && before.y === level.levels.find(f => f.id === 'ground').floorY, 'visitor stands inside the room on the source floor');
    const centre = new THREE.Vector3(-7.08 + copy.u + source.w / 200, before.y, -2.37);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(ghost.group.quaternion);
    assert.ok(forward.dot(centre.sub(before).normalize()) > .999, 'visitor faces the source painting');
    copy.u += 1; copy.level = 'first';
    ghost.sync([source], layout);
    assert.ok(Math.abs(ghost.group.position.x - before.x - 1) < 1e-9, 'moving the artwork moves its spectator');
    assert.equal(ghost.group.position.y, level.levels.find(f => f.id === 'first').floorY);
    ghost.sync([source], { items: [] });
    assert.equal(ghost.group.visible, false, 'taking the source down hides its visitor');
    ghost.sync([source], layout); ghost.sync([], layout);
    assert.equal(ghost.group.visible, false, 'removing the source from the library hides its visitor');
  } finally { ghost.dispose(); }
});

test('ghost has finite 3D geometry, reduced motion holds a neutral pose, and unique resources are released once', () => {
  const ghost = new GhostVisitor(level), scene = new THREE.Scene(); scene.add(ghost.group);
  const source = { ...meta, id: 'my-turn-mtqsqgyy' };
  ghost.sync([source], { items: [{ ...placed, art: source.id }] });
  const resources = new Set([ghost.depthTarget, ghost.depthMaterial]); let meshes = 0;
  ghost.group.traverse(object => {
    if (!object.isMesh) return;
    meshes++; resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material);
    for (const name of ['position', 'normal']) {
      const attribute = object.geometry.getAttribute(name);
      if (attribute) assert.ok(attribute.array.every(Number.isFinite), `finite ${name}`);
    }
  });
  assert.ok(meshes > 0);
  const size = new THREE.Box3().setFromObject(ghost.character.group).getSize(new THREE.Vector3());
  assert.ok(size.x > .1 && size.y > .1 && size.z > .1, 'the visitor has volume from all sides');
  const pose = () => { const matrices = []; ghost.group.updateMatrixWorld(true); ghost.group.traverse(o => matrices.push(...o.matrixWorld.elements)); return matrices; };
  ghost.update(0, true); const neutral = pose();
  for (let i = 0; i < 90; i++) ghost.update(1 / 30, false);
  assert.notDeepEqual(pose(), neutral, 'ordinary motion changes the observing pose');
  ghost.update(1 / 30, true); assert.deepEqual(pose(), neutral, 'reduced motion returns to the neutral pose');
  ghost.update(20, true); assert.deepEqual(pose(), neutral, 'reduced motion stays still');
  const disposals = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource) + 1));
  ghost.dispose(); ghost.dispose();
  assert.ok([...disposals.values()].every(count => count === 1), 'shared geometry and materials are each released once');
  assert.equal(scene.children.length, 0); assert.equal(ghost.group.children.length, 0);
});

test('ghost composites one colour field whose reconstructed coordinates follow moving and turning placements', () => {
  const ghost = new GhostVisitor(level), camera = new THREE.PerspectiveCamera(70, 16 / 9, .05, 4000);
  const source = { ...meta, id: 'my-turn-mtqsqgyy', w: 91, h: 61 };
  const copy = { ...placed, art: source.id, wall: 'g-south' };
  const layout = { items: [copy] };
  const renderer = { getRenderTarget: () => null, setRenderTarget() {}, clear() {}, render() {} };
  try {
    ghost.sync([source], layout); ghost.update(0, true);
    const bodies = ghost.depthMeshes.filter(pair => pair.copy.material === ghost.depthMaterial).map(pair => pair.source);
    assert.ok(bodies.length > 1, 'the independently posed body parts are covered');
    assert.ok(bodies.every(mesh => mesh.material === bodies[0].material), 'body parts share the mask material');
    const visible = [];
    ghost.group.traverse(object => { if (object.isMesh && object.layers.test(camera.layers)) visible.push(object); });
    assert.deepEqual(visible, [ghost.fill], 'body and contour parts are composited once instead of blending over each other');
    const surface = ghost.fill.material;
    assert.ok(surface.isShaderMaterial && surface.transparent && !surface.depthWrite && surface.depthTest, 'the fill respects room occlusion without replacing room depth');
    assert.equal(surface.uniforms.strokes.value, ghost.depthTarget.texture);
    assert.equal(surface.uniforms.ghostDepth.value, ghost.depthTarget.depthTexture);
    const samples = () => {
      camera.position.copy(ghost.group.position).add(new THREE.Vector3(0, 1, 4));
      camera.lookAt(ghost.group.position.clone().add(new THREE.Vector3(0, 1, 0)));
      ghost.prepare(renderer, camera, { width: 1920, height: 1080 });
      return bodies.map(mesh => {
        const ndc = new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'), 0).applyMatrix4(mesh.matrixWorld).project(camera);
        const local = new THREE.Vector4(ndc.x, ndc.y, ndc.z, 1).applyMatrix4(surface.uniforms.clipToGhost.value);
        return new THREE.Vector3(local.x, local.y, local.z).divideScalar(local.w);
      });
    };
    const before = samples(), previousPosition = ghost.group.position.clone(), previousRotation = ghost.group.rotation.y;
    copy.wall = 'g-north'; copy.u += 1; copy.level = 'first';
    ghost.sync([source], layout); ghost.update(0, true);
    assert.ok(ghost.group.position.distanceTo(previousPosition) > 1);
    assert.ok(Math.abs(ghost.group.rotation.y - previousRotation) > 1, 'the placement also turns the visitor');
    samples().forEach((point, i) => assert.ok(point.distanceTo(before[i]) < 1e-8, 'gradient coordinates follow the whole figure without per-part or world-space shifts'));
  } finally { ghost.dispose(); }
});

test('ghost self-occlusion uses a bounded private target and restores the scene target on render failure', () => {
  const ghost = new GhostVisitor(level), camera = new THREE.PerspectiveCamera(70, 1, .05, 4000);
  const source = { ...meta, id: 'my-turn-mtqsqgyy' };
  ghost.sync([source], { items: [{ ...placed, art: source.id }] });
  const previous = new THREE.WebGLRenderTarget(16, 16), calls = [];
  let target = previous, fail = false;
  const renderer = {
    getDrawingBufferSize: out => out.set(3840, 2160), getRenderTarget: () => target,
    setRenderTarget: next => { target = next; }, clear() {},
    render: (scene, view) => { calls.push({ scene, view, target }); if (fail) throw new Error('test render failure'); },
  };
  try {
    ghost.prepare(renderer, camera, { width: 1920, height: 1080 });
    assert.equal(target, previous);
    assert.equal(calls.length, 1); assert.equal(calls[0].view, camera);
    assert.deepEqual(ghost.fill.material.uniforms.viewport.value.toArray(), [1920, 1080], 'mask lookup uses composer pixels rather than the larger DPR drawing buffer');
    const privateTarget = calls[0].target;
    assert.notEqual(privateTarget, previous);
    assert.ok(privateTarget.depthTexture && privateTarget.width > 0 && privateTarget.height > 0);
    assert.ok(Math.max(privateTarget.width, privateTarget.height) <= 1536, 'high-DPI windows keep the extra pass bounded');
    assert.ok(Math.abs(privateTarget.width / privateTarget.height - 3840 / 2160) < .01);
    assert.ok(calls[0].scene.children.length > 0);
    for (const { source: body, copy } of ghost.depthMeshes) {
      assert.equal(copy.geometry, body.geometry, 'self-occlusion reuses the body geometry');
      assert.deepEqual(copy.matrix.elements, body.matrixWorld.elements, 'depth rendering follows the posed figure');
      assert.ok(copy.material.depthTest && copy.material.depthWrite && !copy.material.transparent, 'body and contour masking resolves nearest surfaces before transparency');
      assert.ok(copy.layers.test(camera.layers) && !body.layers.test(camera.layers), 'only mask copies render in the private scene');
      assert.equal(copy.material.color.getHex(), copy.material === ghost.depthMaterial ? 0x000000 : 0xffffff, 'the mask distinguishes body fill and visible drawn contours');
    }
    fail = true;
    assert.throws(() => ghost.prepare(renderer, camera), /test render failure/);
    assert.equal(target, previous, 'failure cannot leave the main exhibition rendering into the ghost target');
    assert.deepEqual(ghost.fill.material.uniforms.viewport.value.toArray(), [3840, 2160], 'direct rendering falls back to drawing-buffer pixels');
    ghost.sync([], { items: [] }); ghost.prepare(renderer, camera);
    assert.equal(calls.length, 2, 'an absent spectator does not render an extra pass');
  } finally { ghost.dispose(); previous.dispose(); }
});

test('hedge uses curved leaves, shared wind and shadows, and releases its GPU resources', () => {
  const room = buildLevel(level).group, plants = new Plants(room), again = new Plants(room);
  const leaves = plants.group.getObjectByName('individual leaves'), stems = plants.group.getObjectByName('branching stems');
  assert.equal(plants.group.children.length, 2, 'foliage stays in two instanced draws');
  assert.ok(leaves.isInstancedMesh && stems.isInstancedMesh && leaves.count > 1000 && leaves.count < 5000);
  assert.deepEqual(leaves.instanceMatrix.array, again.group.getObjectByName('individual leaves').instanceMatrix.array);
  assert.ok(leaves.instanceMatrix.array.every(Number.isFinite));
  leaves.geometry.computeBoundingBox(); assert.ok(leaves.geometry.boundingBox.max.z - leaves.geometry.boundingBox.min.z > 0.1, 'leaves have curvature, not flat cards');
  assert.ok(new Set(leaves.instanceColor.array).size > 100, 'natural per-leaf color variation');
  assert.equal(leaves.material.transparent, false); assert.ok(leaves.material.map.generateMipmaps);
  assert.ok(leaves.material.map.image.data.every(v => v >= 128), 'bright veins must not overflow the byte texture into black');
  for (const mesh of [leaves, stems]) { assert.ok(mesh.castShadow && mesh.receiveShadow && mesh.customDepthMaterial); }
  const shader = () => ({ uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <lights_fragment_end>\n#include <opaque_fragment>' });
  const visible = shader(), shadow = shader(); leaves.material.onBeforeCompile(visible); leaves.customDepthMaterial.onBeforeCompile(shadow);
  assert.equal(visible.vertexShader, shadow.vertexShader, 'shadow silhouettes use the same wind as the leaves');
  plants.update(12); assert.equal(visible.uniforms.uPlantTime.value, 12); assert.equal(shadow.uniforms.uPlantTime.value, 12);
  plants.update(0); assert.equal(visible.uniforms.uPlantTime.value, 0, 'reduced motion keeps foliage still');
  const originals = room.children.filter(m => m.isMesh && m.material.name === 'foliage');
  assert.ok(originals.length > 0 && originals.every(m => !m.visible));
  plants.set(false); assert.ok(originals.every(m => m.visible)); assert.equal(plants.group.visible, false);
  plants.set(true); assert.ok(originals.every(m => !m.visible));
  let disposed = 0;
  const resources = [leaves, stems, leaves.geometry, stems.geometry, leaves.material, stems.material, leaves.material.map, leaves.customDepthMaterial];
  resources.forEach(r => r.addEventListener('dispose', () => disposed++));
  plants.dispose(); assert.equal(disposed, resources.length); again.dispose();
  room.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
});

test('volumetric smoke retains surface depth, scales quality, and respects reduced motion and sky off', () => {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 4000), room = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); room.add(wall);
  const smoke = new Void(room, camera), edges = new EdgesPass(camera);
  const read = new THREE.WebGLRenderTarget(1280, 720, { depthTexture: new THREE.DepthTexture(1280, 720) });
  const write = read.clone(), calls = []; let target;
  const renderer = { setRenderTarget: t => { target = t; }, render: mesh => calls.push({ target, material: mesh.material }) };
  edges.render(renderer, write, read);
  assert.equal(calls[0].material.uniforms.tDepth.value, read.depthTexture);
  assert.equal(calls[0].material.depthWrite, true, 'smoke must receive scene depth after the outline pass swaps targets');
  assert.match(calls[0].material.fragmentShader, /gl_FragDepth\s*=\s*texture2D\(tDepth/);
  smoke.setSize(2560, 1440); smoke.render(renderer, read, write);
  const fog = calls[1], composite = calls[2];
  assert.equal(fog.target.width, 960); assert.equal(fog.target.height, 540);
  assert.equal(fog.material.uniforms.volume.value.isData3DTexture, true);
  assert.equal(fog.material.uniforms.tDepth.value, write.depthTexture);
  assert.equal(composite.material.uniforms.tDiffuse.value, write.texture);
  assert.equal(composite.material.uniforms.smoke.value, fog.target.texture);
  assert.equal(composite.target, read);
  const fullSteps = fog.material.uniforms.steps.value;
  smoke.setQuality('balanced'); assert.ok(fog.material.uniforms.steps.value < fullSteps); assert.equal(fog.target.width, 720);
  smoke.setQuality('low'); assert.equal(fog.target.width, 480); assert.ok(fog.material.uniforms.steps.value < 40);
  smoke.setSize(390, 844); assert.equal(fog.target.width, 195); assert.equal(fog.target.height, 422);
  assert.equal(wall.castShadow, true); assert.equal(smoke.light.castShadow, true);
  smoke.update(5); smoke.update(5.4);
  assert.ok(smoke.flash > 0 && smoke.light.intensity > 0.8);
  assert.deepEqual(smoke.light.position, smoke.flashAt, 'cloud glow and exterior lighting share the source');
  smoke.update(5.5, true); assert.equal(smoke.flash, 0); assert.equal(smoke.light.intensity, 0.8);
  assert.equal(fog.material.uniforms.time.value, 0); assert.equal(fog.material.uniforms.flash.value, 0);
  smoke.set(false); smoke.update(30); assert.equal(smoke.enabled, false); assert.equal(smoke.group.visible, false); assert.equal(smoke.flash, 0);
  smoke.set(true); assert.equal(smoke.enabled, true); assert.equal(smoke.group.visible, true);
  let disposed = 0;
  for (const resource of [fog.target, fog.material.uniforms.volume.value, fog.material, composite.material]) resource.addEventListener('dispose', () => disposed++);
  smoke.dispose(); assert.equal(disposed, 4);
  edges.dispose(); read.dispose(); write.dispose(); wall.geometry.dispose(); wall.material.dispose();
});

test('lightning signals once per visible strike and never replays hidden or reduced-motion strikes', () => {
  const smoke = new Void(new THREE.Group(), new THREE.PerspectiveCamera());
  try {
    assert.equal(smoke.update(4.9), false);
    assert.equal(smoke.update(5), true, 'one thunder cue when the visible strike starts');
    assert.equal(smoke.update(5.2), false);
    assert.ok(smoke.flash > 0);
    assert.equal(smoke.update(5.4), false, 'bright frames must not schedule extra thunder');
    assert.equal(smoke.update(7), false);
    smoke.set(false);
    assert.equal(smoke.update(30), false, 'hidden lightning is silent');
    smoke.set(true);
    assert.equal(smoke.update(30.2), false, 'showing an already-started strike does not replay its cue');
    assert.equal(smoke.update(32), false);
    assert.equal(smoke.update(60, true), false, 'reduced motion suppresses lightning and its cue');
    assert.equal(smoke.flash, 0);
    assert.equal(smoke.update(61), true, 'normal motion starts a fresh visible strike');
    assert.equal(smoke.update(61.2), false);
  } finally { smoke.dispose(); }
});

test('bridge keeps its attachment and deterministic starting fragments retain their source slab thickness', () => {
  const before = JSON.stringify(level), built = buildLevel(level), rebuilt = buildLevel(level), room = built.group, again = rebuilt.group;
  assert.equal(JSON.stringify(level), before, 'rendering must not change collision or source data');
  assert.equal(room.getObjectByName('bridge end'), undefined, 'no solid end cap behind the fragments');
  const fragments = built.bridges.map(b => b.fragments);
  assert.equal(fragments.length, 4);
  const matrix = new THREE.Matrix4();
  for (const mesh of fragments) {
    assert.ok(mesh.isInstancedMesh && mesh.count > 0 && mesh.count < 500);
    assert.deepEqual(mesh.instanceMatrix.array, again.getObjectByName(mesh.name).instanceMatrix.array);
    assert.deepEqual(mesh.instanceColor.array, again.getObjectByName(mesh.name).instanceColor.array);
    assert.deepEqual(mesh.userData.bridgeLoose, again.getObjectByName(mesh.name).userData.bridgeLoose);
    const name = mesh.name.replace(' fragments', ''), source = level.objects.find(o => o.name === name);
    const axis = /floor|roof/.test(name) ? 1 : 2, thickness = source.box[1][axis] - source.box[0][axis];
    for (const cell of built.bridges.find(b => b.fragments === mesh).cells.filter(c => c.mesh === mesh)) {
      mesh.getMatrixAt(cell.index, matrix); assert.ok(matrix.elements.every(Number.isFinite));
      assert.ok(Math.abs(cell.size.getComponent(axis) - thickness) < 1e-6, 'attached and loose source fragments retain the wall, floor or roof thickness');
    }
    const base = new THREE.Box3().setFromObject(room.getObjectByName(name));
    assert.ok(Math.abs(base.min.x - source.box[0][0]) < 1e-6, 'bridge stays attached to the building');
    assert.ok(base.max.x < source.box[1][0] - 1, 'the outer end is replaced, not covered with particles');
  }
  for (const b of [...built.bridges, ...rebuilt.bridges]) b.dispose();
  for (const g of [room, again]) g.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
});

test('the opening cloud already has the age, splits and fading of material shed from the worn edge', () => {
  const built = buildLevel(level), matrix = new THREE.Matrix4();
  let parents = 0, split = 0, fading = 0;
  for (const bridge of built.bridges) {
    const source = level.objects.find(o => o.name === bridge.shell.name), [a, b] = source.box;
    let childIndex = 0;
    for (const cell of bridge.cells) {
      const loose = cell.mesh === bridge.fragments && bridge.fragments.userData.bridgeLoose.get(cell.index);
      const age = Math.max(0, -cell.release);
      if (!loose) {
        assert.ok(cell.release > 0, 'attached material waits for its own scheduled departure');
        cell.mesh.getMatrixAt(cell.index, matrix);
        assert.ok(new THREE.Vector3().setFromMatrixPosition(matrix).distanceTo(cell.position) < 1e-6, 'attached geometry is unchanged at entry');
        assert.ok(new THREE.Vector3().setFromMatrixScale(matrix).distanceTo(cell.size) < 1e-6);
        continue;
      }
      assert.ok(loose.progress > 0 && loose.progress <= 1);
      assert.ok(Math.abs(age / cell.end - loose.progress) < 1e-12, 'opening age represents its existing journey');
      assert.ok(cell.position.distanceTo(loose.origin) < 1e-12);
      loose.origin.toArray().forEach((v, axis) => assert.ok(v >= a[axis] - 1e-6 && v <= b[axis] + 1e-6, 'every source point lies in its original bridge surface'));
      assert.ok(loose.origin.x >= b[0] - 1.35, 'opening fragments come from the worn edge');
      if (/wall/.test(bridge.shell.name)) assert.ok(cell.velocity.z * (loose.origin.z < .06 ? -1 : 1) > 0, 'wall starters drift outward from their source side');
      cell.mesh.getMatrixAt(cell.index, matrix);
      if (age >= cell.end) { assert.equal(matrix.determinant(), 0); continue; }
      const expectedCentre = cell.position.clone().addScaledVector(cell.velocity, age - 4 * (1 - Math.exp(-age / 4)));
      if (age < cell.split) {
        parents++;
        assert.ok(new THREE.Vector3().setFromMatrixPosition(matrix).distanceTo(expectedCentre) < 1e-6, 'existing parent displacement matches its age');
      } else {
        split++;
        assert.equal(matrix.determinant(), 0, 'an aged parent is replaced by its already separated children');
        const centre = new THREE.Vector3();
        for (let i = 0; i < 8; i++) {
          bridge.chips.getMatrixAt(childIndex, matrix); centre.add(new THREE.Vector3().setFromMatrixPosition(matrix));
          const alpha = bridge.chips.geometry.getAttribute('bridgeFade').getX(childIndex++);
          if (age > cell.fadeAt) { assert.ok(alpha < 1); fading++; } else assert.equal(alpha, 1);
        }
        assert.ok(centre.divideScalar(8).y >= expectedCentre.y, 'split children have continued their upward drift');
      }
    }
    assert.equal(bridge.chips.count, childIndex);
    const meshes = [bridge.shell, bridge.fragments, bridge.chips];
    const opening = meshes.map(m => ({ count: m.count, matrix: m.instanceMatrix.array.slice() }));
    const openingFade = bridge.chips.geometry.getAttribute('bridgeFade').array.slice();
    bridge.update(1, true);
    meshes.forEach((m, i) => { assert.equal(m.count, opening[i].count); assert.deepEqual(m.instanceMatrix.array, opening[i].matrix); });
    assert.deepEqual(bridge.chips.geometry.getAttribute('bridgeFade').array, openingFade, 'reduced motion also freezes the opening fade');
    bridge.update(.001);
    meshes.forEach((m, i) => {
      assert.equal(m.count, opening[i].count);
      assert.ok(m.instanceMatrix.array.every((v, j) => Math.abs(v - opening[i].matrix[j]) < .001), 'the first frame continues the opening cloud without a jump');
    });
    assert.ok(bridge.chips.geometry.getAttribute('bridgeFade').array.every((v, i) => Math.abs(v - openingFade[i]) < .001), 'opening opacity also continues smoothly');
    bridge.dispose();
  }
  assert.ok(parents > 0 && split > 0 && fading > 0, 'the opening contains whole chunks, split fragments and distant fading fragments');
});

test('voxel bridge removes its actual fitted walls, rises through splitting, and finishes empty', () => {
  const before = JSON.stringify(level), built = buildLevel(level), matrix = new THREE.Matrix4();
  const read = (mesh, i) => { mesh.getMatrixAt(i, matrix); return { p: new THREE.Vector3().setFromMatrixPosition(matrix), size: new THREE.Vector3().setFromMatrixScale(matrix), volume: Math.abs(matrix.determinant()) }; };
  const timeline = new Map();
  const initialLoose = built.bridges.reduce((n, b) => n + b.fragments.userData.bridgeLoose.size, 0);
  let moved = 0, split = 0, faded = 0;
  for (const bridge of built.bridges) {
    const source = level.objects.find(o => o.name === bridge.shell.name), [a, b] = source.box;
    const bounds = new THREE.Box3().setFromObject(bridge.shell);
    const expectedMax = [b[0] - 1.35, b[1], b[2]];
    a.forEach((v, axis) => assert.ok(Math.abs(bounds.min.getComponent(axis) - v) < 1e-6));
    expectedMax.forEach((v, axis) => assert.ok(Math.abs(bounds.max.getComponent(axis) - v) < 1e-6));
    let volume = 0;
    for (let i = 0; i < bridge.shell.count; i++) volume += read(bridge.shell, i).volume;
    assert.ok(Math.abs(volume - (expectedMax[0] - a[0]) * (b[1] - a[1]) * (b[2] - a[2])) < 1e-6, 'fitted cells fill exactly the original slab');
    assert.ok(built.group.children.filter(m => m.name === bridge.shell.name).every(m => m.isInstancedMesh), 'no intact slab remains behind the moving cells');
    assert.ok(bridge.chips.count > 0, 'the opening cloud has already split');
    assert.equal(bridge.shell.material, bridge.fragments.material);
    assert.notEqual(bridge.chips.material, bridge.shell.material, 'fade must not change shared room materials');
    assert.equal(bridge.shell.material.opacity, 1);
    const times = bridge.cells.filter(c => c.release > 0).map(c => c.release).sort((a, b) => a - b);
    assert.ok(new Set(times).size > times.length * .95, 'individual cells depart instead of whole simultaneous slices');
    const previous = new Map();
    for (let t = 0; t <= Math.ceil(bridge.duration / 10) * 10; t += 10) {
      bridge.update(t);
      const tally = timeline.get(t) || { parents: 0, chips: 0 }; tally.chips += bridge.chips.count; timeline.set(t, tally);
      let chipIndex = 0;
      bridge.cells.forEach((cell, cellIndex) => {
        const age = Math.max(0, t - cell.release);
        if (age >= cell.end) return;
        const stage = age < cell.split ? 1 : 8;
        for (let i = 0; i < stage; i++) {
          const part = read(stage === 1 ? cell.mesh : bridge.chips, stage === 1 ? cell.index : chipIndex++);
          assert.ok(part.p.toArray().every(Number.isFinite) && part.volume > 0);
          const key = `${cellIndex}:${stage}:${i}`, prior = previous.get(key);
          if (prior) assert.ok(part.p.y >= prior.y - 1e-6, 'every surviving parent and child only travels upward');
          previous.set(key, part.p);
          if (stage === 1) {
            assert.ok(part.size.distanceTo(cell.size) < 1e-6, 'attached and loose chunks keep their dimensions throughout flight');
            if (age > 0) tally.parents++;
          } else {
            const ratio = part.size.clone().divide(cell.size);
            assert.ok(Math.abs(ratio.x - ratio.y) < 1e-6 && Math.abs(ratio.x - ratio.z) < 1e-6, 'every child inherits its parent aspect ratio, including during fade');
          }
          if (stage === 1 && cell.mesh === bridge.shell && age > 1) { assert.ok(part.p.y > cell.position.y); moved++; }
          if (stage !== 1) {
            split++;
            assert.ok(read(cell.mesh, cell.index).volume === 0, 'the source block has disappeared when its children exist');
            const alpha = bridge.chips.geometry.getAttribute('bridgeFade').getX(chipIndex - 1);
            assert.ok(alpha >= 0 && alpha <= 1);
            if (alpha < .999) { assert.ok(part.p.y - cell.position.y > 3, 'only distant small blocks fade'); faded++; }
          }
        }
      });
      assert.equal(bridge.chips.count, chipIndex, 'all children belong to real bridge cells');
    }
    assert.equal(bridge.shell.count, 0); assert.equal(bridge.fragments.count, 0); assert.equal(bridge.chips.count, 0);
    bridge.update(bridge.duration + 1000);
    assert.equal(bridge.shell.count + bridge.fragments.count + bridge.chips.count, 0, 'the bridge does not respawn');
    bridge.dispose();
  }
  const steady = [...timeline].filter(([t]) => t >= 210 && t <= 300).map(([, counts]) => counts);
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const activeParents = mean(steady.map(c => c.parents)), activeChips = mean(steady.map(c => c.chips));
  assert.ok(initialLoose >= activeParents * .5 && initialLoose <= activeParents * 1.5, 'starting loose blocks are comparable to the steady stream');
  const earlyChips = Math.max(...[...timeline].filter(([t]) => t <= 180).map(([, c]) => c.chips));
  assert.ok(earlyChips <= activeChips * 1.35, `startup must not create a chip burst (${earlyChips} early versus ${activeChips} steady)`);
  assert.ok(moved > 100 && split > 100 && faded > 100, 'the full sequence was exercised');
  assert.equal(JSON.stringify(level), before, 'animation preserves source and collision data');
});

test('voxel splits preserve volume and position; reduced motion freezes and owned resources are released', () => {
  const built = buildLevel(level), matrix = new THREE.Matrix4();
  const pieces = (bridge, cell, time) => {
    bridge.update(time);
    let offset = 0;
    for (const c of bridge.cells) {
      const age = Math.max(0, time - c.release), count = age < c.split || age >= c.end ? 0 : 8;
      if (c === cell) {
        const result = [];
        for (let i = 0; i < (count || 1); i++) { (count ? bridge.chips : c.mesh).getMatrixAt(count ? offset + i : c.index, matrix); result.push(matrix.clone()); }
        return result;
      }
      offset += count;
    }
  };
  const volume = matrices => matrices.reduce((n, m) => n + Math.abs(m.determinant()), 0);
  const centre = matrices => matrices.reduce((v, m) => v.add(new THREE.Vector3().setFromMatrixPosition(m)), new THREE.Vector3()).divideScalar(matrices.length);
  for (const bridge of built.bridges) {
    const cell = bridge.cells.find(c => c.mesh === bridge.fragments && c.release < 0 && -c.release < c.split);
    const earlier = pieces(bridge, cell, cell.release + cell.split - .0001), later = pieces(bridge, cell, cell.release + cell.split + .0001);
    assert.equal(later.length, 8);
    assert.ok(Math.abs(volume(earlier) - volume(later)) < 1e-7, 'splitting conserves the parent material');
    assert.ok(centre(earlier).distanceTo(centre(later)) < .0001, 'children start inside their parent without teleporting');
    const inverse = earlier[0].clone().invert(), bounds = new THREE.Box3();
    for (const m of later) for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) bounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(m).applyMatrix4(inverse));
    assert.ok(bounds.min.distanceTo(new THREE.Vector3(-.5, -.5, -.5)) < .001 && bounds.max.distanceTo(new THREE.Vector3(.5, .5, .5)) < .001, 'eight children initially tile the original rectangular chunk');
    const distant = pieces(bridge, cell, cell.release + cell.fadeAt - .001);
    assert.ok(Math.abs(volume(distant) - volume(earlier)) < 1e-7, 'chunks retain their size until the distant fade starts');
    const freeze = [bridge.shell, bridge.fragments, bridge.chips].map(m => ({ count: m.count, matrix: m.instanceMatrix.array.slice() }));
    bridge.update(bridge.duration, true);
    [bridge.shell, bridge.fragments, bridge.chips].forEach((m, i) => { assert.equal(m.count, freeze[i].count); assert.deepEqual(m.instanceMatrix.array, freeze[i].matrix); });
    let sharedDisposals = 0, ownedDisposals = 0;
    bridge.shell.material.addEventListener('dispose', () => sharedDisposals++);
    const owned = [bridge.shell, bridge.fragments, bridge.chips, bridge.shell.geometry, bridge.fragments.geometry, bridge.chips.geometry, bridge.chips.material];
    owned.forEach(resource => resource.addEventListener('dispose', () => ownedDisposals++));
    bridge.dispose();
    assert.equal(ownedDisposals, owned.length); assert.equal(sharedDisposals, 0);
    assert.ok([bridge.shell, bridge.fragments, bridge.chips].every(m => m.parent === null));
  }
});
const note = { ...placed, id: 'note-one', art: 'note', note: { text: 'PRIVATE TEST NOTE', who: 'YOZO' } };
function environment() {
  const sql = new DatabaseSync(':memory:'); sql.exec(fs.readFileSync(path.join(root, 'worker/schema.sql'), 'utf8'));
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    execute() { const q = sql.prepare(this.query); if (q.columns().length) return { results: q.all(...this.args), success: true, meta: {} }; const r = q.run(...this.args); return { results: [], success: true, meta: { changes: r.changes } }; }
    async all() { return this.execute(); }
    async run() { return this.execute(); }
    async first(col) { const r = this.execute().results[0]; return r ? col ? r[col] : r : null; }
  }
  const objects = new Map();
  return { sql, env: { DOOR: 'test-only', shdw_world: { prepare: q => new Statement(q), batch: async ss => { sql.exec('BEGIN'); try { const r = ss.map(s => s.execute()); sql.exec('COMMIT'); return r; } catch (e) { sql.exec('ROLLBACK'); throw e; } } }, ART: { get: async k => objects.get(k) ?? null, put: async (k, body) => objects.set(k, { body }), delete: async ks => { for (const k of [ks].flat()) objects.delete(k); } } } };
}
const request = (env, url, method = 'GET', body, auth = false) => worker.fetch(new Request('http://local.test' + url, { method, headers: { 'content-type': 'application/json', ...(auth ? { 'x-door': 'test-only', 'x-who': 'KOAN' } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
const read = async (env, url = '/show', auth = false) => { const r = await request(env, url, 'GET', undefined, auth); assert.equal(r.status, 200); return r.json(); };
const put = async (env, p) => { if (p.art !== 'note' && !(await read(env)).art.some(a => a.id === p.art)) await request(env, '/art/' + p.art, 'PUT', {...meta, id:p.art}, true); const r = await request(env, '/show/items/' + p.id, 'PUT', p, true); assert.equal(r.status, 200, await r.clone().text()); return r.json(); };
function art() { const a = new ArtSystem(level, new THREE.Scene(), { state: { level: 'ground', yaw: 0 } }, new THREE.PerspectiveCamera(), '', {}); a.rebuild = () => {}; return a; }
function store() { memory.clear(); const s = new Store(); s.door = { key: 'test-only', who: 'KOAN' }; return s; }

test('new edit survives completion of the request it replaced', async () => {
  let release; const sent = [];
  global.fetch = async (_, init) => { sent.push(JSON.parse(init.body)); if (sent.length === 1) await new Promise(r => release = r); return new Response('{}'); };
  const s = store(); s.queue({ op: 'put', id: placed.id, item: { ...placed, topY: 1 } }); s.queue({ op: 'put', id: placed.id, item: { ...placed, topY: 2 } });
  release(); await new Promise(setImmediate);
  assert.deepEqual(sent.map(p => p.topY), [1, 2]); assert.equal(s.pending.length, 0); s.dispose();
});
test('failed writes and debounced edits survive reload', async () => {
  global.fetch = async () => new Response('{"error":"too big"}', { status: 413 });
  const s = store(); s.put(placed); assert.ok(memory.get('shdw-world-pending'));
  s.park(); await s.flush(); assert.equal(s.pending.length, 1);
  const next = new Store(); next.door = s.door; assert.deepEqual(next.overlay([]), [placed]); s.dispose(); next.dispose();
});
test('undo/redo touches only the local action and refuses intervening edits', () => {
  const a = art(); a.setShow([placed], [meta]); a.commit(); a.layout.items[0].topY = 3; a.autosave();
  a.applyShow([{ ...placed, id: 'other-person', art: 'other-art' }], []);
  assert.equal(a.doUndo(), true); assert.equal(a.layout.items.find(p => p.id === placed.id).topY, 2); assert.ok(a.layout.items.some(p => p.id === 'other-person'));
  assert.equal(a.doRedo(), true); a.applyShow([{ ...placed, topY: 4 }], []);
  assert.equal(a.doUndo(), false); assert.equal(a.layout.items.find(p => p.id === placed.id).topY, 4);
});
test('empty show stays empty; pending edits overlay after login', () => {
  const a = art(); const s = store(); a.store = s; a.layout.items = [placed]; a.setShow([], []); assert.deepEqual(a.layout.items, []);
  s.put(placed); a.setShow([], [meta]); assert.deepEqual(a.layout.items, [placed]); s.dispose();
});
test('public full and delta reads exclude notes; editors receive them', async () => {
  const { env } = environment(); await put(env, note);
  for (const url of ['/show', '/show?since=1']) { assert.equal((await read(env, url)).items.length, 0); assert.equal((await read(env, url, true)).items[0].note.text, note.note.text); }
  const r = await request(env, '/show/history'); assert.equal(r.status, 401);
});
test('client authenticates both kinds of show read', async () => {
  const headers = []; global.fetch = async (_, init) => { headers.push(init.headers); return Response.json({ version: 1, items: [], deleted: [], art: [], artDeleted: [] }); };
  const s = store(); await s.load(); await s.since(); assert.ok(headers.every(h => h['x-door'] === 'test-only')); s.dispose();
});
test('concurrent writes get distinct committed cursors; intermediate poll misses nothing', async () => {
  const { env } = environment(); const batch = env.shdw_world.batch; let writes = 0, release;
  env.shdw_world.batch = async ss => { if (ss[0].query.includes('CASE WHEN EXISTS') && ++writes === 2) await new Promise(r => release = r); return batch(ss); };
  const now = Date.now; Date.now = () => 2000000000000;
  try {
    const first = put(env, { ...placed, id: 'one' }); const second = put(env, { ...placed, id: 'two', art: 'test-art-2' });
    const a = await first; const midway = await read(env); release(); const b = await second;
    assert.ok(b.version > a.version); const delta = await read(env, '/show?since=' + (midway.version + 1)); assert.deepEqual(delta.items.map(p => p.id), ['two']);
  } finally { Date.now = now; }
});
test('latest state wins after delete/recreate; clear allocates unique history cursors', async () => {
  const { env, sql } = environment(); await put(env, placed); await request(env, '/show/items/' + placed.id, 'DELETE', undefined, true); await put(env, placed);
  const d = await read(env, '/show?since=1'); assert.equal(d.items.length, 1); assert.deepEqual(d.deleted, []);
  await put(env, { ...note }); await request(env, '/show/items', 'DELETE', undefined, true);
  assert.equal((await read(env, '/show', true)).items.length, 0);
  const rows = sql.prepare('SELECT ts FROM log').all(); assert.equal(new Set(rows.map(r => r.ts)).size, rows.length);
});
test('notes move and import independently; exports carry uploaded artwork references', async () => {
  const a = art(); a.library = [meta]; a.layout.items = [note]; a.target = () => note; a.noteItem = p => ({ ...meta, id: 'note', note: p.note }); a.hold = x => a.held = x;
  assert.equal(a.pickup(), true); assert.equal(a.held.note.text, note.note.text);
  await a.importFile(JSON.stringify({ format: 'koan-hang-layout/2', items: [note, { ...note, id: 'note-two', u: 2 }] })); assert.equal(a.layout.items.length, 2);
  a.setShow([placed], [meta]); const out = JSON.parse(a.exportFile().json); assert.equal(out.art[0].id, meta.id); assert.match(out.art[0].data, /^http/);
});
test('cycling skips placed originals and reaches free work', () => {
  const a = art(); a.library = [meta, { ...meta, id: 'free' }]; a.layout.items = [placed]; a.hold = x => a.held = x;
  a.swap(1); assert.equal(a.held.id, 'free');
});
test('invalid placements are rejected; one original is enforced atomically', async () => {
  const { env } = environment();
  assert.equal((await request(env, '/show/items/bad', 'PUT', {}, true)).status, 400);
  assert.equal((await request(env, '/show/items/bad', 'PUT', { ...placed, u: null }, true)).status, 400);
  await request(env, '/art/' + meta.id, 'PUT', meta, true);
  const results = await Promise.all(['one', 'two'].map(id => request(env, '/show/items/' + id, 'PUT', { ...placed, id }, true)));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal((await read(env)).items.length, 1);
});
test('history pagination does not lose legacy rows with equal timestamps', async () => {
  const { env, sql } = environment(); for (let i = 0; i < 205; i++) sql.prepare('INSERT INTO log VALUES (100, ?, ?, ?, NULL)').run('KOAN', 'delete', 'old-' + i);
  const first = await read(env, '/show/history', true); assert.equal(first.rows.length, 200);
  const last = await read(env, '/show/history?beforeId=' + first.rows.at(-1).cursor, true); assert.equal(last.rows.length, 5);
  assert.equal(new Set([...first.rows, ...last.rows].map(r => r.cursor)).size, 205);
});
test('keyboard intent survives an idle gamepad and disconnected pads release keys', () => {
  let pads = [{ connected: true, axes: [0, 0, 0, 0], buttons: [] }];
  Object.defineProperty(global, 'navigator', { configurable: true, value: { getGamepads: () => pads } });
  const input = new Input({ addEventListener() {} }); input.locked = true;
  input.key({ code: 'KeyW', target: null }); input.pollPad(1/60); assert.equal(input.keys.has('KeyW'), true);
  pads[0].axes[0] = 1; input.pollPad(1/60); assert.equal(input.keys.has('KeyD'), true);
  pads = []; input.pollPad(1/60); assert.equal(input.keys.has('KeyD'), false); assert.equal(input.keys.has('KeyW'), true);
});
test('Escape works in text fields; free-mouse rings receive number keys', () => {
  const input = new Input({ addEventListener() {} }); const verbs = [], slots = [];
  input.onVerb = v => verbs.push(v); input.key({ code: 'Escape', target: { tagName: 'INPUT' } }); assert.deepEqual(verbs, ['back']);
  input.ringOpen = true; input.onSlot = n => slots.push(n); input.key({ code: 'Digit9', target: null }); assert.deepEqual(slots, [8]);
});
test('out-of-bounds nudges are rolled back before saving', () => {
  const a = art(); a.setShow([placed], [meta]); a.target = () => a.layout.items[0]; a.nudge(10000, 10000); assert.deepEqual(a.layout.items, [placed]);
});
test('rebuild reuses artwork geometry; removal disposes owned resources', () => {
  const a = new ArtSystem(level, new THREE.Scene(), { state: { level: 'ground', yaw: 0 } }, new THREE.PerspectiveCamera(), '', { image: () => new Promise(() => {}) });
  a.setShow([placed], [meta]); const mesh = a.group.children[0].children[0]; let disposed = 0; mesh.geometry.addEventListener('dispose', () => disposed++);
  for (let i = 0; i < 50; i++) { a.layout.items[0].u += .001; a.rebuild(); assert.equal(a.group.children[0].children[0].geometry, mesh.geometry); }
  a.layout.items = []; a.rebuild(); assert.equal(disposed, 1); a.dispose();
});
test('backup restores show, private notes and file bytes into an isolated empty store', async () => {
  const { pathToFileURL } = require('node:url'); const { backup, restore } = await import(pathToFileURL(path.join(root, 'worker/backup.mjs')));
  const source = environment(), dest = environment(); const base = 'http://local.test';
  const fetcher = env => (url, init) => worker.fetch(new Request(url, init), env);
  await request(source.env, '/art/' + meta.id, 'PUT', meta, true);
  await source.env.ART.put(meta.id + '.png', Buffer.from('test-file-bytes'));
  await put(source.env, placed); await put(source.env, note);
  const directory = path.join(scratch, 'backup'); await backup(base, 'test-only', directory, fetcher(source.env));
  const restored = await restore(base, 'test-only', directory, fetcher(dest.env));
  assert.equal(restored.items.length, 2); assert.equal(restored.art[0].title, meta.title); assert.equal(restored.items.find(p=>p.note).note.text, note.note.text);
  assert.equal(await (await request(dest.env, '/art/' + meta.id + '.png')).text(), 'test-file-bytes');
  await assert.rejects(restore(base, 'test-only', directory, fetcher(dest.env)), /empty destination/);
});
test('artwork sync follows server versions, regardless of browser clock', async () => {
  const a = art(); a.setShow([], [meta]); a.store = { open: true, updateArt: async () => 10 };
  await a.updateArt(meta.id, { title: 'local title' });
  assert.equal(a.applyArt([{ ...meta, title: 'remote title', ts: 11 }], []), true);
  assert.equal(a.library[0].title, 'remote title');
});

test('sculpture textures wait for decoded image data before reaching materials', async () => {
  const a = art(); let ready;
  a.loader = { image: () => new Promise(resolve => ready = resolve) };
  assert.equal(a.tile('custom', 20, 'http://local.test/tile.png'), null);
  const image = { width: 8, height: 8 }; ready(new THREE.Texture(image)); await new Promise(setImmediate);
  const texture = a.tile('custom', 20, 'http://local.test/tile.png');
  assert.equal(texture.image, image); assert.equal(texture.repeat.x, 5); texture.dispose(); a.dispose();
});

test('a rejected edit survives reload while unrelated saves continue and retry succeeds', async () => {
  const s = store(); const sent = []; let reject = true;
  global.fetch = async (url, init) => { sent.push(url); return reject && url.endsWith('/bad') ? Response.json({ error: 'invalid placement' }, { status: 400 }) : Response.json({ ok: true }); };
  s.queue({ op: 'put', id: 'bad', item: { ...placed, id: 'bad' } });
  s.queue({ op: 'put', id: 'good', item: { ...placed, id: 'good' } }); await new Promise(setImmediate);
  assert.equal(sent.length, 2); assert.equal(s.pending.length, 1); assert.equal(s.pending[0].error, 'invalid placement');
  await s.flush(); assert.equal(sent.length, 2); s.dispose();
  const reopened = new Store(); reopened.door = { key: 'test-only', who: 'KOAN' };
  assert.equal(reopened.overlay([])[0].id, 'bad'); assert.equal(reopened.pending[0].error, 'invalid placement');
  reject = false; await reopened.retry(); assert.equal(reopened.pending.length, 0); assert.equal(memory.has('shdw-world-pending'), false); reopened.dispose();
});

test('an obsolete rejection cannot block its replacement; a rejected clear preserves ordering', async () => {
  const s = store(); let release;
  global.fetch = async () => { if (!release) return new Promise(r => release = r); return Response.json({ ok: true }); };
  s.queue({ op: 'put', id: placed.id, item: placed }); s.queue({ op: 'put', id: placed.id, item: { ...placed, topY: 3 } });
  release(Response.json({ error: 'old rejected' }, { status: 409 })); await new Promise(setImmediate); assert.equal(s.pending.length, 0);
  let calls = 0; global.fetch = async () => { calls++; return Response.json({ error: 'clear rejected' }, { status: 400 }); };
  s.clear(); s.queue({ op: 'put', id: placed.id, item: placed }); await new Promise(setImmediate);
  assert.equal(calls, 1); assert.equal(s.pending.length, 2); s.dispose();
});

test('artwork removal and placement check references inside the write transaction', async () => {
  for (const heldOp of ['placement', 'removal']) {
    const { env, sql } = environment(); await request(env, '/art/' + meta.id, 'PUT', meta, true);
    const batch = env.shdw_world.batch; let release, reached; const waiting = new Promise(r => reached = r);
    env.shdw_world.batch = async ss => {
      const query = ss[0].query;
      if ((heldOp === 'placement' ? query.includes('CASE WHEN EXISTS') : query.includes("'art-delete'")) && !release) { reached(); await new Promise(r => release = r); }
      return batch(ss);
    };
    const placement = () => request(env, '/show/items/' + placed.id, 'PUT', placed, true);
    const removal = () => request(env, '/art/' + meta.id, 'DELETE', undefined, true);
    const pending = heldOp === 'placement' ? placement() : removal(); await waiting;
    const winner = await (heldOp === 'placement' ? removal() : placement()); assert.equal(winner.status, 200);
    const logs = sql.prepare('SELECT COUNT(*) AS n FROM log').get().n; release(); assert.equal((await pending).status, 409);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM log').get().n, logs);
    const show = await read(env); assert.equal(show.items.length, heldOp === 'placement' ? 0 : 1); assert.equal(show.art.length, show.items.length);
  }
  const { env } = environment(); await put(env, placed);
  assert.equal((await request(env, '/art/' + meta.id, 'PUT', { ...meta, kind: 'sculpture' }, true)).status, 409);
  assert.equal((await read(env)).art[0].kind, 'painting');
});

test('sculpture collision follows the loaded model, plinth, rotation, movement and removal', async () => {
  const camera = new THREE.PerspectiveCamera(), walker = new Walker(level, camera, {});
  let loaded;
  const a = new ArtSystem(level, new THREE.Scene(), walker, camera, '', { model: () => new Promise(resolve => loaded = resolve) });
  const sculpture = { id: 'solid-sculpture', kind: 'sculpture', title: 'Solid', w: 20, h: 100, d: 20, edge: 'wrap', ext: 'glb', ts: 1 };
  const copy = { id: 'solid-copy', art: sculpture.id, kind: 'sculpture', wall: '', level: 'ground', u: 0, topY: 0, snap: null, pos: [-3, -5.54, 0], yaw: 0, plinth: { w: 40, d: 80, h: 100, colour: '#ffffff' } };
  const walk = (x, z, yaw, keys = ['KeyW'], ticks = 180, dt = 1/120, floor = 'ground') => {
    walker.teleport(floor, x, z); walker.state.yaw = yaw; walker.setLocked(true); walker.keys = new Set(keys);
    for (let i = 0; i < ticks; i++) walker.update(dt);
    return { ...walker.state };
  };
  try {
    a.setShow([copy], [sculpture]);
    assert.ok(Math.abs(walk(-3, 1.6, 0).z - .65) < 1e-6, 'the plinth blocks the player while the model loads');
    assert.ok(Math.abs(walk(-3, 1.6, 0, ['KeyW', 'ShiftLeft'], 30, .05).z - .65) < 1e-6, 'running through a slow frame cannot skip the plinth');
    const slid = walk(-3, .66, 0, ['KeyW', 'KeyD'], 95);
    assert.ok(slid.x > -2 && slid.z < 0, 'diagonal movement slides around the sculpture');
    const model = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, .4), new THREE.MeshStandardMaterial());
    mesh.position.set(4, 3, 5); model.add(mesh); loaded(model); await new Promise(setImmediate);
    assert.ok(Math.abs(walk(-4.5, 0, -Math.PI/2).x + 3.75) < 1e-6, 'loaded model bounds use its real proportions and typed height');
    a.applyShow([{ ...copy, yaw: Math.PI/2 }], []);
    assert.ok(Math.abs(walk(-3, 1.6, 0).z - .75) < 1e-6, 'collision rotates with the model');
    a.applyShow([{ ...copy, yaw: Math.PI/4 }], []);
    const angled = walk(-3 - 1.3 * Math.SQRT1_2, 1.3 * Math.SQRT1_2, -Math.PI/4);
    assert.ok(Math.abs(angled.x + 3 + .75 * Math.SQRT1_2) < 1e-6 && Math.abs(angled.z - .75 * Math.SQRT1_2) < 1e-6, 'oblique collisions follow the rotated face rather than a world-aligned box');
    const moved = { ...copy, pos: [-1.5, -5.54, 0], yaw: Math.PI/2, plinth: { ...copy.plinth, w: 120, d: 160 } };
    a.applyShow([moved], []);
    assert.ok(walk(-3, 1.6, 0).z < -1, 'moving the sculpture clears its old location');
    assert.ok(Math.abs(walk(-1.5, 1.6, 0).z - .85) < 1e-6, 'changed plinth dimensions update collision');
    assert.ok(walk(-1.5, 1.6, 0, ['KeyW'], 180, 1/120, 'first').z < -1, 'the sculpture does not block the floor above');
    a.applyShow([], [copy.id]);
    assert.equal(walker.obstacles.length, 0);
    assert.ok(walk(-1.5, 1.6, 0).z < -1, 'taking a sculpture down clears its collision');
    a.setShow([copy], [sculpture]); assert.ok(walker.obstacles.length > 0);
  } finally { a.dispose(); }
  assert.equal(walker.obstacles.length, 0, 'leaving the scene clears its collision');
});

test('both stair flights descend against the window and remain walkable in both directions', () => {
  const built = buildLevel(level), west = level.walls.find(w => w.id === 'g-west');
  try {
    for (const stair of level.stairs) for (const dt of [1/120, .05]) {
      const walker = new Walker(level, new THREE.PerspectiveCamera(), {}); walker.doors = built.doors;
      walker.teleport(stair.to, stair.from[0], stair.from[1] + stair.run + .13);
      walker.state.yaw = 0; walker.setLocked(true); walker.keys = new Set(['KeyW', 'KeyA']);
      for (let i = 0; i < Math.ceil(5/dt); i++) {
        walker.update(dt);
        assert.ok(walker.state.x >= west.a[0] + .25 + west.thickness/2 - 1e-6, 'the player stays inside the window throughout descent');
      }
      assert.equal(walker.state.level, stair.level); assert.equal(walker.state.onStair, null);
      assert.ok(walker.state.z < stair.from[1] - .2, 'diagonal descent reaches the bottom landing');
      assert.equal(walker.state.feetY, stair.bottomY);
      walker.teleport(stair.level, stair.from[0], stair.from[1] - .25);
      walker.state.yaw = Math.PI; walker.keys = new Set(['KeyW']);
      for (let i = 0; i < Math.ceil(2.1/dt); i++) walker.update(dt);
      assert.equal(walker.state.level, stair.to); assert.equal(walker.state.onStair, null);
      assert.ok(walker.state.z > stair.from[1] + stair.run + .05, 'center ascent reaches the top landing');
      assert.equal(walker.state.feetY, stair.topY);
      walker.state.yaw = 0;
      for (let i = 0; i < Math.ceil(2.1/dt); i++) walker.update(dt);
      assert.equal(walker.state.level, stair.level); assert.equal(walker.state.onStair, null);
      assert.equal(walker.state.feetY, stair.bottomY);
    }
  } finally {
    built.bridges.forEach(b => b.dispose()); built.group.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  }
});

test('full-height walls only admit the door aperture at the current walking height', () => {
  const built = buildLevel(level), walker = new Walker(level, new THREE.PerspectiveCamera(), {});
  walker.doors = built.doors;
  const wall = level.walls.find(w => w.id === 'g-east'), door = built.doors.find(d => d.wall === wall && d.opening.bottom === 0);
  const z = wall.a[1] + door.opening.u + door.opening.w/2;
  try {
    walker.teleport('ground', -.6, z); walker.state.yaw = -Math.PI/2; walker.setLocked(true); walker.keys.add('KeyW');
    for (let i = 0; i < 100; i++) walker.update(1/120);
    assert.ok(walker.state.x > .8, 'the open ground entrance still works');
    door.open = false; door.t = 0;
    walker.teleport('ground', -.6, z);
    for (let i = 0; i < 100; i++) walker.update(1/120);
    assert.ok(walker.state.x <= wall.a[0] - .25 - wall.thickness/2 + 1e-6, 'closed doors remain solid');
    door.open = true; door.t = 1;
    walker.teleport('first', -.6, z);
    assert.ok(walker.pushOut(wall.a[0] - .1, z, wall), 'an open ground door is solid above its lintel');
    const upper = built.doors.find(d => d.wall === wall && d.opening.bottom > 0);
    const upperZ = wall.a[1] + upper.opening.u + upper.opening.w/2;
    upper.open = true; upper.t = 1;
    assert.equal(walker.pushOut(wall.a[0] - .1, upperZ, wall), null, 'an upper door aperture uses its own base height');
    walker.teleport('ground', -.6, upperZ);
    assert.ok(walker.pushOut(wall.a[0] - .1, upperZ, wall), 'an upper door does not open the glass below it');
  } finally {
    built.bridges.forEach(b => b.dispose()); built.group.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  }
});

test('touch walks and looks without pointer lock, shares collision code, and stops on pause', async () => {
  const listeners = new Map(); const oldWindow = window, oldDocument = document;
  global.window = { ...oldWindow, addEventListener: (name, fn) => listeners.set(name, fn) };
  global.document = { ...oldDocument, addEventListener: (name, fn) => listeners.set(name, fn) };
  let locks = 0;
  const dom = { addEventListener() {}, requestPointerLock() { locks++; } };
  const input = new Input(dom); input.settings.touchControls = true;
  const walker = new Walker(level, new THREE.PerspectiveCamera(), dom);
  walker.teleport('ground', 6.18, 4.3); walker.state.yaw = 0; walker.keys = input.keys;
  input.onLockChange = on => walker.setLocked(on); input.onLook = (x, y) => walker.look(x, y);
  try {
    await input.lock(); assert.equal(locks, 0); assert.equal(walker.state.locked, true);
    input.touchMove(0, -1); input.touchLook(30, -20); input.pollPad(1/60);
    assert.equal(input.keys.has('KeyW'), true); assert.ok(walker.state.yaw < 0); assert.ok(walker.state.pitch > 0);
    const start = walker.state.z; walker.update(1/60); assert.ok(walker.state.z < start);
    input.touchMove(0, 0); const stopped = walker.state.z; walker.update(1/60); assert.equal(walker.state.z, stopped);
    input.touchMove(0, -1); input.release(); assert.equal(walker.state.locked, false); assert.equal(input.keys.size, 0);
    const yaw = walker.state.yaw; input.touchLook(100, 100); assert.equal(walker.state.yaw, yaw);
    input.setTouchActive(true); input.touchMove(0, -1); listeners.get('blur')(); assert.equal(input.active, false); assert.equal(input.keys.size, 0);
    input.setTouchActive(true); input.touchMove(0, -1); document.hidden = true; listeners.get('visibilitychange')(); assert.equal(input.keys.size, 0);
    input.dispose();
  } finally { global.window = oldWindow; global.document = oldDocument; }
});


test('door clicks follow the moving leaf and cannot pass through walls, floors or distance', () => {
  const before = JSON.stringify(level), built = buildLevel(level), camera = new THREE.PerspectiveCamera(70, 1, .05, 100);
  const door = built.doors.find(d => d.wall.id === 'g-east' && d.type === 'swing');
  const centre = new THREE.Vector3(), normal = new THREE.Vector3();
  for (const open of [false, true, false]) {
    door.open = open; updateDoors(built.doors, 1); built.group.updateMatrixWorld(true);
    new THREE.Box3().setFromObject(door.pivot).getCenter(centre);
    normal.set(0, 0, 1).transformDirection(door.pivot.matrixWorld);
    camera.position.copy(centre).addScaledVector(normal, 1.2); camera.lookAt(centre);
    assert.equal(doorAt(built.doors, built.group, camera, 'ground'), door, 'actual leaf is clickable after moving');
    assert.equal(doorAt(built.doors, built.group, camera, 'upper'), null);
    const blocker = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .5), new THREE.MeshBasicMaterial());
    blocker.position.copy(centre).addScaledVector(normal, .7); built.group.add(blocker);
    assert.equal(doorAt(built.doors, built.group, camera, 'ground'), null, 'wall blocks the click');
    built.group.remove(blocker); blocker.geometry.dispose(); blocker.material.dispose();
    camera.position.copy(centre).addScaledVector(normal, 4); camera.lookAt(centre);
    assert.equal(doorAt(built.doors, built.group, camera, 'ground'), null, 'door is out of reach');
  }
  assert.equal(JSON.stringify(level), before, 'door interaction does not modify the real building');
  built.group.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
});

test('free mouse consumes door clicks before pointer lock; wind settings survive reload', () => {
  const handlers = {}, input = new Input({ addEventListener: (name, fn) => handlers[name] = fn });
  let locks = 0, clicks = 0;
  input.settings.touchControls = false; input.lock = () => { locks++; };
  input.onPointerUse = (x,y) => { assert.equal(x, 20); assert.equal(y, 30); clicks++; return true; };
  handlers.mousedown({button:0, clientX:20, clientY:30}); assert.equal(clicks, 1); assert.equal(locks, 0);
  input.onPointerUse = () => false; handlers.mousedown({button:0}); assert.equal(locks, 1);
  input.locked = true; input.onVerb = verb => { assert.equal(verb, 'do'); input.clearClick(); };
  handlers.mousedown({button:0}); assert.equal(input.takeClick(), false, 'handled click cannot also place artwork');
  input.setPlay({wind:false,windVolume:37});
  const restored = new Input({addEventListener(){}}); assert.equal(restored.settings.wind, false); assert.equal(restored.settings.windVolume, 37);
  input.dispose(); restored.dispose(); memory.delete('shdw-world-play');
});

test('thunder waits for entry, respects sound and visibility, and releases its lifetime', () => {
  const oldDocument = document, oldAudioContext = global.AudioContext, listeners = new Map();
  global.document = { hidden: false, addEventListener: (name, fn, options) => listeners.set(name, { fn, signal: options.signal }) };
  global.AudioContext = class { constructor() { throw Error('controller test must not create a real audio graph'); } };
  const settings = { wind: true, windVolume: 80 }, wind = new Wind(level, settings), cues = [];
  let cancelled = 0, disposed = 0, closed = 0;
  wind.sound = { update() {}, thunder: (...args) => cues.push(args), cancelThunder: () => cancelled++, dispose: () => disposed++ };
  wind.context = { state: 'running', currentTime: 12, suspend() { this.state = 'suspended'; return Promise.resolve(); }, resume() { this.state = 'running'; return Promise.resolve(); }, close() { closed++; return Promise.resolve(); } };
  const at = { x: 3, y: 4, z: 0 }, listener = { x: 0, y: 0, z: 0 };
  try {
    wind.thunder(at, listener); assert.equal(cues.length, 0, 'intro remains silent even after audio unlock');
    wind.enter(); wind.thunder(at, listener); assert.deepEqual(cues, [[12, 5, 0.6]]);
    wind.set({ ...settings, wind: false }); wind.thunder(at, listener);
    assert.equal(cancelled, 1); assert.equal(cues.length, 1);
    wind.set({ ...settings, windVolume: 0 }); wind.thunder(at, listener);
    assert.equal(cancelled, 2); assert.equal(cues.length, 1);
    wind.set(settings); document.hidden = true; listeners.get('visibilitychange').fn(); wind.thunder(at, listener);
    assert.equal(cancelled, 3); assert.equal(wind.context.state, 'suspended'); assert.equal(cues.length, 1);
    document.hidden = false; wind.thunder(at, listener); assert.equal(cues.length, 1, 'suspended audio cannot queue a delayed strike');
    listeners.get('visibilitychange').fn(); assert.equal(wind.context.state, 'running'); assert.equal(cues.length, 1, 'returning does not replay missed strikes');
    wind.thunder(at, listener); assert.equal(cues.length, 2, 'only a fresh strike sounds');
    wind.dispose(); assert.equal(disposed, 1); assert.equal(closed, 1);
    assert.ok([...listeners.values()].every(({ signal }) => signal.aborted));
  } finally { global.document = oldDocument; if (oldAudioContext === undefined) delete global.AudioContext; else global.AudioContext = oldAudioContext; }
});

test('wind is sheltered by the gallery and stairs while the courtyard stays exposed', () => {
  assert.equal(sheltered(level, 'ground', -3, 0), true);
  assert.equal(sheltered(level, 'ground', 3, 0), false);
  assert.equal(sheltered(level, 'ground', 6.18, 4.3), false);
  assert.equal(sheltered(level, 'missing-floor', -3, 0), false);
  for (const stair of level.stairs) {
    assert.equal(sheltered({...level, floors: []}, stair.level, ...stair.from), true);
  }
});
