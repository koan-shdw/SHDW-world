const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cult-ghost-render-'));
require('esbuild').buildSync({ stdin: { contents: `export {GhostAsset} from './src/world/ghost-asset.ts'; export * as THREE from 'three';`, resolveDir: path.resolve(__dirname, '..'), loader: 'ts' }, outfile: path.join(scratch, 'ghost.cjs'), bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
const {GhostAsset, THREE} = require(path.join(scratch, 'ghost.cjs'));
after(() => fs.rmSync(scratch, {recursive:true, force:true}));

function setup() {
  const model = new THREE.Group(), original = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(.6, 1.8, .3), original); mesh.position.y = .9; model.add(mesh);
  const ghost = new GhostAsset(model, {gallery:true, resolution:1536});
  const camera = new THREE.PerspectiveCamera(60, 16/9, .05, 4000); camera.position.set(0, 1.2, 4); camera.lookAt(0, .9, 0); camera.updateMatrixWorld();
  const previous = new THREE.WebGLRenderTarget(16,16); let target = previous, alpha = .7, color = new THREE.Color('#112233'), calls = 0, fail = false;
  const renderer = {
    getPixelRatio: () => 2, getRenderTarget: () => target, setRenderTarget: value => target=value,
    getClearAlpha: () => alpha, getClearColor: value => value.copy(color), setClearColor(value,a) {color.set(value);alpha=a},
    clear() {assert.equal(target.scissorTest,false,'stale poses outside the current rectangle are cleared')}, render() {calls++; if(fail) throw new Error('render failed')},
  };
  return {model,mesh,original,ghost,camera,renderer,previous,state:()=>({target,alpha,color:color.getHexString(),calls}),fail:()=>fail=true};
}

test('visitor rendering shades a bounded screen area and restores renderer/material state', () => {
  const t=setup();
  t.ghost.prepare(t.renderer,t.camera,{width:3840,height:2160});
  assert.equal(t.ghost.target.width,1536);
  assert.equal(t.ghost.target.height,864);
  assert.equal(t.ghost.target.samples,0); assert.equal(t.ghost.target.texture.type,THREE.UnsignedByteType);
  assert.equal(t.state().calls,3);
  assert.equal(t.state().target,t.previous); assert.equal(t.state().alpha,.7); assert.equal(t.state().color,'112233');
  assert.equal(t.mesh.material,t.original);
  const bounds=t.ghost.target.scissor;
  assert.ok(bounds.z>0 && bounds.z<1536*.5 && bounds.w>0 && bounds.w<864, 'offscreen passes are restricted to the visitor');
  assert.equal(t.ghost.target.scissorTest,true);
  assert.deepEqual(t.ghost.material.uniforms.viewport.value.toArray(),[3840,2160]);
  assert.equal(t.ghost.material.blendSrcAlpha,THREE.ZeroFactor,'white ink survives gallery edge processing');
  const before=t.ghost.screenBounds.clone();
  t.ghost.group.position.x=.8; t.ghost.prepare(t.renderer,t.camera,{width:3840,height:2160});
  assert.ok(t.ghost.screenBounds.x>before.x,'screen bounds follow the moving visitor');
  t.fail(); assert.throws(()=>t.ghost.prepare(t.renderer,t.camera,{width:3840,height:2160}),/render failed/);
  assert.equal(t.state().target,t.previous); assert.equal(t.mesh.material,t.original);
  t.ghost.dispose(); t.mesh.geometry.dispose(); t.original.dispose(); t.previous.dispose();
});

test('hidden and disposed visitors do not render; resources release exactly once', () => {
  const t=setup(); let released=0;
  for(const target of [t.ghost.target,t.ghost.edges,t.ghost.ink]) target.addEventListener('dispose',()=>released++);
  t.ghost.group.visible=false; t.ghost.prepare(t.renderer,t.camera,{width:1280,height:720}); assert.equal(t.state().calls,0);
  t.ghost.dispose(); t.ghost.dispose(); assert.equal(released,3);
  t.ghost.group.visible=true; t.ghost.prepare(t.renderer,t.camera,{width:1280,height:720}); assert.equal(t.state().calls,0);
  t.mesh.geometry.dispose();t.original.dispose();t.previous.dispose();
});
