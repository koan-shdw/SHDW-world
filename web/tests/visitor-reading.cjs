const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cult-reading-'));
require('esbuild').buildSync({ stdin: { contents: `export {Mountain} from './src/world/mountain.ts'; export {doorOccupied} from './src/world/doors.ts'; export * as THREE from 'three';`, resolveDir: path.resolve(__dirname, '..'), loader: 'ts' }, outfile: path.join(scratch, 'reading.cjs'), bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
const {Mountain, doorOccupied, THREE} = require(path.join(scratch, 'reading.cjs'));
after(() => fs.rmSync(scratch, {recursive:true, force:true}));

test('the reading target follows the actual loaded text geometry and its world placement', async () => {
  const originalFetch = global.fetch;
  const font = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/brand/helvetica-bold.typeface.json'), 'utf8'));
  global.fetch = async () => ({json: async () => font});
  let mountain;
  try {
    mountain = new Mountain(['YOZO', 'CULT'], 400, -255, '/');
    assert.equal(mountain.readingPoint, null, 'no target before the text exists');
    await mountain.ready;
    const initial = mountain.readingPoint;
    assert.ok(initial && initial.toArray().every(Number.isFinite));
    const geometryCentre = new THREE.Box3().setFromObject(mountain.group).getCenter(new THREE.Vector3());
    assert.ok(initial.distanceTo(geometryCentre) < .0001);
    const delta = new THREE.Vector3(7, 13, -11);
    mountain.group.position.add(delta);
    assert.ok(mountain.readingPoint.distanceTo(initial.add(delta)) < .0001, 'moving the text moves its gaze target');
  } finally {
    global.fetch = originalFetch;
    mountain?.group.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  }
});

test('the entrance stays open for a visitor in the threshold or outward leaf sweep', () => {
  const level = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../level/level.json'), 'utf8'));
  const wall = level.walls.find(w => w.id === 'g-east');
  const opening = wall.openings.find(o => o.kind === 'door' && o.bottom === 0);
  const door = {wall, opening, type: 'swing'};
  const person = (x, z, y = wall.baseY) => ({visible:true, x, y, z});
  assert.equal(doorOccupied(door, [person(.22, .825)]), true);
  assert.equal(doorOccupied(door, [person(.72, .95)]), true);
  assert.equal(doorOccupied(door, [person(-.55, .825)]), false, 'a visitor safely inside does not hold an outward door open');
  assert.equal(doorOccupied(door, [person(2.3, .825)]), false, 'door closes after the visitor clears it');
  assert.equal(doorOccupied(door, [person(.22, .825, -2.14)]), false, 'upper floor visitors do not block the ground door');
  assert.equal(doorOccupied(door, [{...person(.22, .825), visible:false}]), false);
});
