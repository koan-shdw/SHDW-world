const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cult-visitors-'));
require('esbuild').buildSync({ stdin: { contents: `export { VisitorBehavior } from './src/world/visitor-behavior.ts'; export * as THREE from 'three';`, resolveDir: path.resolve(__dirname, '..'), loader: 'ts' }, outfile: path.join(scratch, 'visitors.cjs'), bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
const { VisitorBehavior, THREE } = require(path.join(scratch, 'visitors.cjs'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const wall = (id, a, b, facing) => ({ id, name: id, level: 'ground', a, b, facing, baseY: 0, topY: 3, thickness: .1, openings: [], noHang: [] });
const level = () => ({ format: 'koan-hang-level/3', eyeHeight: 1.6, levels: [{ id: 'ground', floorY: 0, ceilY: 3 }, { id: 'first', floorY: 4, ceilY: 7 }],
  floors: [{ level: 'ground', name: 'gallery', poly: [[-6,-6],[6,-6],[6,6],[-6,6]] }], ceilings: [], stairs: [], blockers: [], objects: [],
  walls: [wall('south', [-6,-6], [6,-6], '+z'), wall('north', [-6,6], [6,6], '-z'), wall('west', [-6,-6], [-6,6], '+x'), wall('east', [6,-6], [6,6], '-x')] });
const library = [0,1,2].map(i => ({ id: i ? `work-${i}` : 'my-turn-mtqsqgyy', kind: 'painting', title: `work ${i}`, w: 100, h: 100, d: 2, edge: 'wrap' }));
const layout = () => ({ items: library.map((art, i) => ({ id: `placed-${i}`, art: art.id, kind: 'painting', wall: i === 2 ? 'north' : 'south', level: 'ground', u: i === 0 ? 2 : i === 1 ? 8 : 5, topY: 2, snap: null })) });
const away = { x: 5, z: 4, level: 'ground', yaw: 0 };
const options = { reduceMotion: false };
const tick = (behavior, seconds, player = away, env = options, obstacles = [], doors = []) => { for (let n = 0; n < seconds * 60; n++) behavior.update(1/60, player, env, obstacles, doors); };
const setup = (count = 5) => { const behavior = new VisitorBehavior(level(), count); behavior.sync(library, layout()); behavior.update(0, away, options); return behavior; };

test('five approved visitors get safe viewing positions; first two share MY TURN', () => {
  const behavior = setup();
  assert.equal(behavior.agents.filter(a => a.visible).length, 5);
  assert.equal(behavior.agents[0].spot.art, 'placed-0');
  assert.equal(behavior.agents[1].spot.art, 'placed-0');
  for (const a of behavior.agents) assert.ok(behavior.isClear(a.level, a.x, a.z));
  const original = { x: behavior.agents[0].x, z: behavior.agents[0].z };
  const seen = new Set();
  for (let i = 0; i < 60 * 100; i++) {
    behavior.update(1/60, away, options);
    for (const a of behavior.agents) { seen.add(a.phase); assert.ok(behavior.isClear(a.level, a.x, a.z)); assert.ok([a.x,a.z,a.yaw,a.lookYaw,a.lookPitch,a.gait].every(Number.isFinite)); }
  }
  assert.ok(seen.has('pair'), 'shared visitors exchange gestures');
  assert.ok(seen.has('walk'), 'other visitors browse the show');
  assert.deepEqual({ x: behavior.agents[0].x, z: behavior.agents[0].z }, original, 'original posed model stays planted');
});

test('a visitor yields and rechecks sculpture clearance while stepping', () => {
  const behavior = setup(), visitor = behavior.agents[1];
  const before = { x: visitor.x, z: visitor.z };
  const player = { x: visitor.x + .8, z: visitor.z + .1, level: visitor.level, yaw: 0 };
  behavior.update(1/60, player, options);
  assert.equal(visitor.phase, 'yield');
  tick(behavior, 2, player);
  assert.ok(Math.hypot(visitor.x - before.x, visitor.z - before.z) > .2, 'visitor steps out of the way');
  assert.ok(Math.hypot(visitor.x - player.x, visitor.z - player.z) > 1);
  const obstacle = { level: 'ground', x: visitor.x, z: visitor.z, yaw: .3, bounds: new THREE.Box3(new THREE.Vector3(-.4,0,-.4), new THREE.Vector3(.4,2,.4)) };
  behavior.update(1/60, player, options, [obstacle]);
  for (const a of behavior.agents) if (a.visible) assert.ok(behavior.isClear(a.level, a.x, a.z), 'new sculpture cannot trap a visitor inside its geometry');
});

test('shared attention produces a nod only on the player floor', () => {
  const behavior = setup(1), visitor = behavior.agents[0];
  const player = { x: visitor.x + 1.6, z: visitor.z, level: 'first', yaw: Math.PI / 2 };
  tick(behavior, 3, player); assert.equal(visitor.phase, 'study');
  player.level = 'ground'; tick(behavior, 2.15, player);
  assert.equal(visitor.phase, 'acknowledge');
  tick(behavior, .8, player); assert.ok(visitor.nod > .2);
});

test('social cooldown never stops a conversing visitor giving the player room', () => {
  const behavior = setup(), visitor = behavior.agents[1];
  tick(behavior, 6.2);
  assert.equal(visitor.phase, 'pair'); assert.ok(visitor.cooldown > 30);
  behavior.update(1/60, { x: visitor.x + .8, z: visitor.z + .1, level: visitor.level, yaw: 0 }, options);
  assert.equal(visitor.phase, 'yield');
});

test('a thunder event selects one nearby visitor and reduced motion is stable', () => {
  const behavior = setup();
  behavior.update(1/60, away, { reduceMotion: false, thunder: { x: 20, z: 0 } });
  assert.equal(behavior.agents.filter(a => a.phase === 'thunder').length, 1);
  tick(behavior, 1);
  behavior.update(1/60, away, { reduceMotion: true });
  const frozen = JSON.stringify(behavior.agents);
  tick(behavior, 3, away, { reduceMotion: true, thunder: { x: 20, z: 0 } });
  assert.equal(JSON.stringify(behavior.agents), frozen);
});

test('moving or removing artworks retargets visitors without resetting unrelated positions', () => {
  const behavior = setup(), revised = layout(), visitor = behavior.agents[1], other = behavior.agents[2];
  const otherBefore = { x: other.x, z: other.z, time: other.time };
  revised.items[0].u += .6;
  behavior.sync(library, revised); behavior.update(0, away, options);
  assert.equal(visitor.spot.target.x, -6 + revised.items[0].u + .5);
  assert.equal(visitor.phase, 'walk');
  assert.deepEqual({ x: other.x, z: other.z, time: other.time }, otherBefore);
  revised.items.shift(); behavior.sync(library, revised); behavior.update(0, away, options);
  for (const a of behavior.agents) if (a.visible) assert.notEqual(a.spot.art, 'placed-0');
  behavior.sync(library, { items: [] }); behavior.update(0, away, options);
  assert.ok(behavior.agents.every(a => !a.visible));
});

test('saved upper-floor placements may reuse a ground wall plan without sending visitors downstairs', () => {
  const lv = level();
  lv.floors.push({ ...lv.floors[0], level: 'first' });
  const behavior = new VisitorBehavior(lv, 1), single = { items: [layout().items[0]] };
  behavior.sync(library, single); behavior.update(0, away, options);
  assert.equal(behavior.agents[0].level, 'ground');
  single.items[0].level = 'first';
  behavior.sync(library, single); behavior.update(0, away, options);
  assert.equal(behavior.agents[0].visible, true);
  assert.equal(behavior.agents[0].level, 'first');
  assert.equal(behavior.agents[0].y, 4);
  assert.equal(behavior.agents[0].spot.targetY, 5.5);
});

test('moving a painting behind a divider selects reachable art instead of studying through the wall', () => {
  const lv = level(); lv.walls.push(wall('divider', [0,-6], [0,6], '+x'));
  const revised = layout(); revised.items = [revised.items[0], { ...revised.items[2], u: 2 }];
  const behavior = new VisitorBehavior(lv, 2);
  behavior.sync(library, revised); behavior.update(0, away, options);
  const original = behavior.agents[0], moving = behavior.agents[1];
  const originalBefore = { x: original.x, z: original.z }, movingBefore = { x: moving.x, z: moving.z };
  revised.items[0].u = 8;
  behavior.sync(library, revised); behavior.update(0, away, options);
  assert.equal(original.spot.art, 'placed-2', 'stationary visitor picks a painting visible from its existing position');
  assert.deepEqual({ x: original.x, z: original.z }, originalBefore);
  assert.equal(moving.spot.art, 'placed-2', 'walking visitor skips the unreachable moved work');
  assert.equal(moving.phase, 'walk');
  assert.ok(moving.route.every(point => point.x < 0), 'all new route points remain in the reachable room');
  assert.deepEqual({ x: moving.x, z: moving.z }, movingBefore);
  revised.items.pop();
  behavior.sync(library, revised); behavior.update(0, away, options);
  assert.equal(original.visible, true); assert.ok(original.x > 0, 'stationary model can be safely re-placed after its last visible artwork is removed');
  assert.equal(moving.visible, false, 'mobile visitor never teleports across the blocked divider to an unreachable target');
});

test('walls, closed doors, windows, stairs and floor edges prevent navigation', () => {
  const lv = level(), divider = wall('divider', [0,-6], [0,6], '+x');
  divider.openings.push({ kind: 'door', u: 5, w: 2, bottom: 0, h: 2.3, door: { leaf: true, open: false } });
  lv.walls.push(divider);
  lv.stairs.push({ id: 'stair', level: 'ground', to: 'first', from: [3,2], dir: '+z', width: 1, run: 2 });
  const behavior = new VisitorBehavior(lv);
  behavior.update(0, away, options);
  assert.equal(behavior.isClear('ground', 5.9, 0), false);
  assert.equal(behavior.isClear('ground', 0, 0), false);
  assert.equal(behavior.isClear('ground', 3, 3), false);
  const door = { wall: divider, opening: divider.openings[0], open: true, t: 1 };
  behavior.update(0, away, options, [], [door]);
  assert.equal(behavior.isClear('ground', 0, 0), true);
  assert.equal(behavior.isClear('ground', 0, -4), false);
  door.open = false; behavior.update(0, away, options, [], [door]);
  assert.equal(behavior.isClear('ground', 0, 0), false);
  divider.openings[0].kind = 'window'; door.open = true;
  behavior.update(0, away, options, [], [door]);
  assert.equal(behavior.isClear('ground', 0, 0), false);
});

const courtyardSetup = (count = 5) => {
  const lv = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../level/level.json'), 'utf8'));
  const revised = layout();
  revised.items[0] = { ...revised.items[0], wall: 'g-south', u: 2.2 };
  revised.items[1] = { ...revised.items[1], wall: 'g-north', u: 1 };
  revised.items[2] = { ...revised.items[2], wall: 'g-south', u: 4.8 };
  const target = { level: 'ground', x: 400, y: 500, z: 0 };
  const facade = lv.walls.find(w => w.id === 'g-east');
  const opening = facade.openings.find(o => o.kind === 'door' && o.bottom === 0);
  const door = { wall: facade, opening, open: true, t: 1 };
  const behavior = new VisitorBehavior(lv, count);
  const player = { level: 'ground', x: 6.18, z: 4.3, yaw: 0 };
  behavior.sync(library, revised, target); behavior.update(0, player, options, [], [door]);
  return { behavior, revised, target, door, player };
};

test('real courtyard trips cross the framed doorway, read the text and return to paintings', () => {
  const { behavior, door, player } = courtyardSetup();
  const original = { x: behavior.agents[0].x, z: behavior.agents[0].z };
  const readers = new Set(), returned = new Set(); let crossings = 0;
  for (let n = 0; n < 60 * 240; n++) {
    const before = behavior.agents.map(a => ({ x: a.x, z: a.z, excursion: a.excursion }));
    behavior.update(1/60, player, options, [], [door]);
    assert.ok(behavior.agents.filter(a => a.excursion).length <= 1, 'only one visitor goes outside at a time');
    for (const a of behavior.agents) {
      if (!a.visible) continue;
      assert.ok(behavior.isClear(a.level, a.x, a.z), 'all walking positions have floor and obstacle clearance');
      if (a.phase === 'read') { readers.add(a.id); assert.ok(a.x > 1.5); assert.ok(a.lookPitch < 0); }
      if (readers.has(a.id) && before[a.id].excursion && !a.excursion) {
        returned.add(a.id); assert.equal(a.spot.kind, 'painting'); assert.ok(a.x < .22);
      }
      const previous = before[a.id];
      if ((previous.x < .22) !== (a.x < .22)) {
        const z = previous.z + (a.z - previous.z) * (.22 - previous.x) / (a.x - previous.x);
        assert.ok(z >= .78 && z <= .845, 'crossing is centred between physical jambs and open leaf');
        assert.equal(a.passage, 1); assert.ok(Math.abs(Math.sin(a.yaw)) < .025, 'body stays sideways through the doorway');
        assert.ok(Math.abs(a.strafe) > .99 && Math.abs(a.forward) < .03, 'foot cycle follows lateral passage'); crossings++;
      }
    }
  }
  assert.ok(readers.size > 0, 'a visitor reads the text'); assert.ok(returned.size > 0, 'a reader returns to the show'); assert.ok(crossings >= 2);
  assert.deepEqual({ x: behavior.agents[0].x, z: behavior.agents[0].z }, original);
});

test('closed courtyard door prevents departures and outdoor readers wait for reopening', () => {
  const { behavior, door, player, revised, target } = courtyardSetup(2);
  door.open = false; door.t = 0;
  tick(behavior, 100, player, options, [], [door]);
  assert.ok(behavior.agents.every(a => !a.excursion && a.x < .22));
  door.open = true; door.t = 1;
  let reader;
  for (let n = 0; n < 60 * 180 && !reader; n++) {
    behavior.update(1/60, player, options, [], [door]);
    reader = behavior.agents.find(a => a.phase === 'read');
  }
  assert.ok(reader, 'visitor enters the courtyard after the door reopens');
  door.open = false; door.t = 0;
  const outside = { x: reader.x, z: reader.z };
  revised.items.shift(); revised.items[0].u = 2.2;
  behavior.sync(library, revised, target);
  tick(behavior, 40, player, options, [], [door]);
  assert.equal(reader.phase, 'read'); assert.equal(reader.excursion, true);
  assert.deepEqual({ x: reader.x, z: reader.z }, outside, 'closed door cannot teleport the reader indoors');
  door.open = true; door.t = 1;
  for (let n = 0; n < 60 * 90 && reader.excursion; n++) behavior.update(1/60, player, options, [], [door]);
  assert.equal(reader.excursion, false); assert.equal(reader.spot.kind, 'painting');
  assert.notEqual(reader.spot.art, 'placed-0', 'return follows the current artwork layout');
  const placed = revised.items.find(item => item.id === reader.spot.art);
  assert.ok(placed, 'returned artwork still exists');
});

test('outdoor reading and its route stay frozen with reduced motion', () => {
  const { behavior, door, player } = courtyardSetup(2);
  for (let n = 0; n < 60 * 150 && !behavior.agents.some(a => a.phase === 'read'); n++) behavior.update(1/60, player, options, [], [door]);
  assert.ok(behavior.agents.some(a => a.phase === 'read'));
  behavior.update(1/60, player, { reduceMotion: true }, [], [door]);
  const frozen = JSON.stringify(behavior.agents);
  tick(behavior, 5, player, { reduceMotion: true }, [], [door]);
  assert.equal(JSON.stringify(behavior.agents), frozen);
});

const waitForEcho = behavior => {
  for (let n = 0; n < 60 * 60; n++) {
    behavior.update(1/60, away, options);
    const visitor = behavior.agents.find(a => a.phase === 'echo');
    if (visitor) return visitor;
  }
  assert.fail('a mobile visitor should echo MY TURN after studying it');
};

test('MY TURN echo builds slowly, holds, releases and resumes browsing', () => {
  const behavior = setup(), visitor = waitForEcho(behavior);
  assert.notEqual(visitor.id, 0); assert.equal(visitor.spot.art, 'placed-0');
  const feet = { x: visitor.x, z: visitor.z };
  tick(behavior, 1); assert.ok(visitor.echo > 0 && visitor.echo < .4);
  tick(behavior, 2.5); assert.equal(visitor.echo, 1);
  tick(behavior, 3); assert.equal(visitor.echo, 1);
  tick(behavior, 2.5); assert.ok(visitor.echo > 0 && visitor.echo < .4);
  assert.deepEqual({ x: visitor.x, z: visitor.z }, feet, 'pose stays planted');
  tick(behavior, 1.2); assert.equal(visitor.phase, 'study'); assert.equal(visitor.echo, 0);
  const ordinary = setup();
  ordinary.sync(library, { items: layout().items.slice(1) });
  for (let n = 0; n < 60 * 120; n++) {
    ordinary.update(1/60, away, options);
    assert.ok(ordinary.agents.every(a => a.phase !== 'echo'), 'pose belongs only to its referenced painting');
  }
});

test('echo gives way to a nearby player and follows moved or removed artwork', () => {
  for (const action of ['approach', 'move', 'remove']) {
    const behavior = setup(), visitor = waitForEcho(behavior);
    tick(behavior, 3.5); assert.equal(visitor.echo, 1);
    if (action === 'approach') {
      behavior.update(1/60, { ...away, x: visitor.x + .8, z: visitor.z + .1 }, options);
      assert.equal(visitor.phase, 'yield');
    } else {
      const revised = layout();
      if (action === 'move') revised.items[0].u += .6;
      else revised.items.shift();
      behavior.sync(library, revised); behavior.update(0, away, options);
      assert.notEqual(visitor.phase, 'echo');
      if (action === 'move') assert.equal(visitor.spot.target.x, -6 + revised.items[0].u + .5);
      else assert.notEqual(visitor.spot.art, 'placed-0');
    }
    assert.equal(visitor.echo, 0);
  }
});

test('reduced motion stops the echo and thunder can interrupt it', () => {
  const behavior = setup(), visitor = waitForEcho(behavior);
  tick(behavior, 3.5);
  behavior.update(1/60, away, { reduceMotion: true });
  assert.equal(visitor.echo, 0);
  const frozen = JSON.stringify(behavior.agents);
  tick(behavior, 3, away, { reduceMotion: true });
  assert.equal(JSON.stringify(behavior.agents), frozen);
  behavior.agents.forEach(a => { if (a !== visitor) a.visible = false; });
  behavior.update(1/60, away, { reduceMotion: false, thunder: { x: 20, z: 0 } });
  assert.equal(visitor.phase, 'thunder'); assert.equal(visitor.echo, 0);
});

const isolateVisitor = (id, x = 0, z = 0) => {
  const behavior = setup(), visitor = behavior.agents[id];
  behavior.agents.forEach(a => { a.visible = a === visitor; });
  Object.assign(visitor, { x, z, phase: 'study', route: [], remaining: 30, cooldown: 0, yieldCooldown: 0 });
  return { behavior, visitor };
};

test('every visitor including the briefcase model escapes an exactly overlapping player', () => {
  for (let id = 0; id < 5; id++) {
    const { behavior, visitor } = isolateVisitor(id);
    const player = { level: visitor.level, x: visitor.x, z: visitor.z, yaw: 0 };
    behavior.update(1/60, player, options);
    assert.equal(visitor.phase, 'yield', `visitor ${id} starts yielding`);
    let separation = Math.hypot(visitor.x - player.x, visitor.z - player.z);
    assert.ok(separation > 0, `visitor ${id} can take its first escape step inside the usual player buffer`);
    for (let n = 0; n < 90; n++) {
      behavior.update(1/60, player, options);
      const next = Math.hypot(visitor.x - player.x, visitor.z - player.z);
      assert.ok(next >= separation - 1e-6, `visitor ${id} never moves farther into the player`);
      assert.ok(behavior.isClear(visitor.level, visitor.x, visitor.z)); separation = next;
    }
    assert.ok(separation > .9, `visitor ${id} moves clear instead of freezing in the overlap`);
    assert.ok(visitor.gait > 0, `visitor ${id} advances its stepping cycle`);
  }
});

test('approaching players trigger an early sidestep while receding players do not', () => {
  for (const approaching of [true, false]) {
    const { behavior, visitor } = isolateVisitor(0);
    const player = { level: visitor.level, x: 0, z: approaching ? 2.4 : 2.35, yaw: 0 };
    behavior.update(0, player, options);
    player.z += approaching ? -.05 : .05;
    behavior.update(1/60, player, options);
    assert.ok(Math.hypot(visitor.x - player.x, visitor.z - player.z) > 1.4, 'reaction occurs outside the close-proximity threshold');
    assert.equal(visitor.phase === 'yield', approaching, 'yield follows the approaching trajectory');
  }
});

test('a yielding walker resumes its destination after the player passes', () => {
  const { behavior, visitor } = isolateVisitor(1);
  const target = visitor.spot, expected = { id: target.id, x: target.x, z: target.z };
  Object.assign(visitor, { x: target.x, z: target.z + 2.5, phase: 'walk', route: [target] });
  const player = { level: visitor.level, x: visitor.x + .8, z: visitor.z + .1, yaw: 0 };
  behavior.update(1/60, player, options);
  assert.equal(visitor.phase, 'yield'); assert.equal(visitor.resumeWalk, true);
  tick(behavior, 1, player);
  for (let n = 0; n < 60 * 30 && (visitor.phase === 'yield' || visitor.phase === 'walk'); n++) behavior.update(1/60, away, options);
  assert.equal(visitor.phase, 'study'); assert.equal(visitor.resumeWalk, false);
  assert.equal(visitor.spot.id, expected.id);
  assert.ok(Math.hypot(visitor.x - expected.x, visitor.z - expected.z) < .05, 'walker reaches its original viewing destination');
});

test('near-wall player awareness yields on the same floor and respects reduced motion', () => {
  const { behavior, visitor } = isolateVisitor(0, 0, -4.4);
  const player = { level: 'first', x: 0, z: -5.7, yaw: 0 };
  tick(behavior, .2, player); assert.equal(visitor.phase, 'study', 'another floor cannot trigger a step');
  player.level = 'ground';
  assert.equal(behavior.isClear('ground', player.x, player.z), false, 'player is closer to the wall than a visitor walking footprint permits');
  const before = { x: visitor.x, z: visitor.z };
  tick(behavior, .2, player, { reduceMotion: true });
  assert.deepEqual({ x: visitor.x, z: visitor.z }, before);
  behavior.update(1/60, player, options); assert.equal(visitor.phase, 'yield', 'thin visibility reaches the near-wall player');
  tick(behavior, 1, player);
  assert.ok(Math.hypot(visitor.x - before.x, visitor.z - before.z) > .4);
});

test('doorway yielding stays on its centre line and preserves outward and return trips', () => {
  const { behavior, door, player: awayFromDoor } = courtyardSetup(2);
  const walker = behavior.agents[1];
  for (const returning of [false, true]) {
    let atDoor = false;
    for (let n = 0; n < 60 * 180; n++) {
      behavior.update(1/60, awayFromDoor, options, [], [door]);
      if (walker.excursion && walker.phase === 'walk' && walker.spot.kind === (returning ? 'painting' : 'reading')
        && walker.passage === 1 && walker.x > .05 && walker.x < .35) { atDoor = true; break; }
    }
    assert.ok(atDoor, `${returning ? 'returning' : 'outbound'} visitor reaches the doorway`);
    const blocked = { level: walker.level, x: walker.x + (returning ? -.8 : .8), z: walker.z, yaw: 0 };
    const targetKind = walker.spot.kind, centreZ = walker.z;
    behavior.update(1/60, blocked, options, [], [door]);
    assert.equal(walker.phase, 'yield'); assert.equal(walker.resumeWalk, true); assert.equal(walker.excursion, true);
    for (let n = 0; n < 60 * 1.5; n++) {
      behavior.update(1/60, blocked, options, [], [door]);
      assert.ok(Math.abs(walker.z - centreZ) < .03, 'retreat follows the narrow doorway centre line');
      assert.ok(Math.abs(Math.sin(walker.yaw)) < .025, 'retreat maintains the safe sideways body orientation');
      assert.equal(walker.excursion, true); assert.equal(walker.spot.kind, targetKind);
    }
    let resumed = false;
    for (let n = 0; n < 60 * 90; n++) {
      behavior.update(1/60, awayFromDoor, options, [], [door]);
      if (returning ? !walker.excursion : walker.phase === 'read') { resumed = true; break; }
    }
    assert.ok(resumed, `${returning ? 'returning' : 'outbound'} trip resumes after yielding`);
    assert.equal(walker.spot.kind, returning ? 'painting' : 'reading');
  }
});

test('moving a painting during a walking yield replaces the suspended destination', () => {
  const { behavior, visitor } = isolateVisitor(1);
  const target = visitor.spot;
  Object.assign(visitor, { x: target.x, z: target.z + 2.5, phase: 'walk', route: [target] });
  behavior.update(1/60, { level: visitor.level, x: visitor.x + .8, z: visitor.z + .1, yaw: 0 }, options);
  assert.equal(visitor.phase, 'yield'); assert.equal(visitor.resumeWalk, true);
  const revised = layout(); revised.items[0].u += .6;
  behavior.sync(library, revised); behavior.update(0, away, options);
  assert.equal(visitor.spot.target.x, -6 + revised.items[0].u + .5);
  assert.equal(visitor.resumeWalk, false, 'layout retargeting clears the suspended route');
  behavior.agents.forEach(a => { a.visible = a === visitor; });
  for (let n = 0; n < 60 * 30 && visitor.phase === 'walk'; n++) behavior.update(1/60, away, options);
  assert.equal(visitor.phase, 'study');
  assert.ok(Math.hypot(visitor.x - visitor.spot.x, visitor.z - visitor.spot.z) < .05);
});
