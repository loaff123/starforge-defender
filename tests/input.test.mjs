import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './game-harness.mjs';

function move(g, pointerId = 10) {
  assert.ok(g.element('movePad'), 'the game must provide a movement pad');
  g.emit('movePad', 'pointerdown', { pointerId, clientX: 72, clientY: 756 });
  g.emit('movePad', 'pointermove', { pointerId, clientX: 120, clientY: 756 });
}
function aim(g, pointerId = 20) {
  g.emit('gameCanvas', 'pointerdown', { pointerId, clientX: 300, clientY: 300 });
}

function click(g, id) {
  assert.ok(g.element(id), `the game must provide ${id}`);
  g.element(id).click();
}

test('desktop movement is the positive baseline control', () => {
  const g = loadGame(); g.start();
  const x = g.read('player.x');
  g.window.dispatch('keydown', { key: 'd' });
  g.run('updatePlayer(0.1)');
  assert.equal(g.read('player.x'), x + 26);
});

test('touch movement and independent aim/fire work simultaneously', () => {
  const g = loadGame(); g.start(); g.run('setAutoFire(false, false)');
  const x = g.read('player.x'); move(g); aim(g);
  g.run('updatePlayer(0.1)');
  assert.ok(g.read('player.x') > x);
  assert.ok(g.read('bullets.length') > 0);
  g.emit('gameCanvas', 'pointerup', { pointerId: 20 });
  const nextX = g.read('player.x'); g.run('updatePlayer(0.1)');
  assert.ok(g.read('player.x') > nextX);
  assert.equal(g.read('mouse.isDown'), false);
});

test('only the owning pointer moves or releases a control', () => {
  const g = loadGame(); g.start(); move(g); aim(g);
  g.emit('movePad', 'pointerup', { pointerId: 99 });
  g.emit('gameCanvas', 'pointermove', { pointerId: 99, clientX: 1, clientY: 2 });
  g.emit('gameCanvas', 'pointerup', { pointerId: 99 });
  assert.equal(g.read('mouse.x'), 300);
  assert.equal(g.read('mouse.isDown'), true);
  const x = g.read('player.x'); g.run('updatePlayer(0.1)');
  assert.ok(g.read('player.x') > x);
});

for (const event of ['pointercancel', 'lostpointercapture']) {
  test(`${event} clears its action without leaving movement or firing stuck`, () => {
    const g = loadGame(); g.start(); g.run('setAutoFire(false, false)'); move(g); aim(g);
    g.emit('movePad', event, { pointerId: 10 });
    g.emit('gameCanvas', event, { pointerId: 20 });
    const x = g.read('player.x'); g.run('updatePlayer(0.1)');
    assert.equal(g.read('player.x'), x);
    assert.equal(g.read('mouse.isDown'), false);
    assert.equal(g.read('bullets.length'), 0);
  });
}

test('touch placement requires Place and charges exactly once', () => {
  const g = loadGame(); g.start();
  click(g, 'buildButton');
  g.emit('gameCanvas', 'pointerdown', { pointerId: 20, clientX: 100, clientY: 300 });
  g.emit('gameCanvas', 'pointerup', { pointerId: 20, clientX: 100, clientY: 300 });
  assert.equal(g.read('structures.length'), 0);
  assert.equal(g.read('mouse.isDown'), false);
  const energy = g.read('game.energy');
  click(g, 'placeButton'); click(g, 'placeButton');
  assert.equal(g.read('structures.length'), 1);
  assert.equal(g.read('game.energy'), energy - 40);
});

test('invalid placement, cancellation and touch double tap cannot spend energy', () => {
  const g = loadGame(); g.start(); const energy = g.read('game.energy');
  click(g, 'buildButton');
  g.emit('gameCanvas', 'pointerdown', { pointerId: 20, clientX: 195, clientY: 422 });
  g.emit('gameCanvas', 'pointerup', { pointerId: 20 });
  click(g, 'placeButton');
  click(g, 'cancelBuildButton');
  g.emit('gameCanvas', 'dblclick', { pointerType: 'touch', clientX: 100, clientY: 300 });
  assert.equal(g.read('game.energy'), energy);
  assert.equal(g.read('structures.length'), 0);
});

test('touch dash is one request and respects cooldown', () => {
  const g = loadGame(); g.start(); move(g);
  click(g, 'dashButton'); g.run('updatePlayer(0.01)');
  assert.ok(g.read('player.dashCooldown') > 0);
  g.run('player.dashTime = 0; player.dashCooldown = 0.5');
  click(g, 'dashButton'); g.run('updatePlayer(0.01)');
  assert.equal(g.read('player.dashTime'), 0);
  g.run('player.dashCooldown = 0; updatePlayer(0.01)');
  assert.equal(g.read('player.dashTime'), 0);
});

test('a non-primary touch can dash without relying on a compatibility click', () => {
  const g = loadGame(); g.start(); move(g); aim(g);
  g.emit('dashButton', 'pointerdown', { pointerId: 30, isPrimary: false });
  g.run('updatePlayer(0.01)');
  assert.ok(g.read('player.dashCooldown') > 0);
  g.run('player.dashCooldown = 0; player.dashTime = 0');
  g.emit('dashButton', 'click', { pointerType: 'touch', detail: 1 });
  g.run('updatePlayer(0.01)');
  assert.equal(g.read('player.dashTime'), 0);
});

for (const interruption of ['blur', 'visibilitychange']) {
  test(`${interruption} pauses and resume starts with released input`, () => {
    const g = loadGame(); g.start(); move(g); aim(g);
    if (interruption === 'blur') g.window.dispatch('blur');
    else { g.document.hidden = true; g.document.dispatch('visibilitychange'); }
    assert.equal(g.read('game.state'), 'paused');
    assert.equal(g.read('mouse.isDown'), false);
    g.document.hidden = false; click(g, 'resumeButton');
    assert.equal(g.read('game.state'), 'playing');
    const x = g.read('player.x'); g.run('updatePlayer(0.1)');
    assert.equal(g.read('player.x'), x);
    assert.equal(g.read('mouse.hasMoved'), false);
  });
}

test('pause and autofire ignore repeated keydown events', () => {
  const g = loadGame(); g.start();
  g.window.dispatch('keydown', { key: 'p' });
  g.window.dispatch('keydown', { key: 'p', repeat: true });
  assert.equal(g.read('game.state'), 'paused');
  g.window.dispatch('keydown', { key: 'p' });
  const auto = g.read('game.autoFire');
  g.window.dispatch('keydown', { key: 'f', repeat: true });
  assert.equal(g.read('game.autoFire'), auto);
});

for (const [width, height] of [[390, 844], [844, 390]]) {
  test(`${width}x${height}: modal focus, upgrade and restart clear gameplay input`, () => {
    const g = loadGame(width, height); g.start();
    g.window.dispatch('keydown', { key: 'd' }); aim(g);
    g.run('openUpgradeScreen()');
    assert.equal(g.document.activeElement, g.element('upgradeGrid').children[0]);
    g.window.dispatch('keydown', { key: 'd' });
    g.element('upgradeGrid').children[0].click();
    assert.equal(g.read('keys.right'), false);
    assert.equal(g.read('mouse.isDown'), false);
    assert.equal(g.document.activeElement, g.element('gameCanvas'));
    g.run('endGame()');
    assert.equal(g.document.activeElement, g.element('restartButton'));
    g.element('restartButton').click();
    assert.equal(g.read('game.state'), 'playing');
    assert.equal(g.read('keys.right'), false);
    click(g, 'pauseButton');
    assert.equal(g.document.activeElement, g.element('resumeButton'));
    g.window.dispatch('keydown', { key: 'Tab' });
    assert.equal(g.document.activeElement, g.element('resumeButton'));
  });
}

test('desktop hover, manual fire and building shortcuts retain their targets', () => {
  const g = loadGame(1280, 800); g.start(); g.run('setAutoFire(false, false)');
  const mouse = { pointerType: 'mouse', pointerId: 1, clientX: 100, clientY: 300 };
  g.emit('gameCanvas', 'pointermove', mouse);
  assert.equal(g.read('mouse.x'), 100);
  g.emit('gameCanvas', 'pointerdown', mouse); g.run('updatePlayer(0.01)');
  assert.equal(g.read('bullets.length'), 1);
  g.emit('gameCanvas', 'pointerup', mouse);
  g.emit('gameCanvas', 'pointerdown', { ...mouse, button: 2 });
  assert.equal(g.read('structures[0].x'), 100);
  g.run('game.energy = 100');
  g.emit('gameCanvas', 'dblclick', { clientX: 250, clientY: 300, pointerType: undefined, pointerId: undefined });
  assert.equal(g.read('structures.length'), 2);
  assert.equal(g.read('structures[1].x'), 250);
});

test('resize clears captured input and canceled placement cannot be confirmed', () => {
  const g = loadGame(); g.start(); move(g); aim(g);
  g.window.dispatch('resize');
  assert.equal(g.read('input.movePointer'), null);
  assert.equal(g.read('input.aimPointer'), null);
  assert.equal(g.read('mouse.isDown'), false);
  click(g, 'buildButton');
  g.emit('gameCanvas', 'pointerdown', { pointerId: 3, clientX: 100, clientY: 300 });
  g.emit('gameCanvas', 'pointercancel', { pointerId: 3 });
  click(g, 'placeButton');
  assert.equal(g.read('structures.length'), 0);
});

test('a changed viewport pauses combat and clears both held pointers', () => {
  const g = loadGame(); g.start(); move(g); aim(g);
  g.window.innerWidth = 844; g.window.innerHeight = 390;
  g.window.dispatch('resize');
  assert.equal(g.read('game.state'), 'paused');
  assert.equal(g.read('input.movePointer'), null);
  assert.equal(g.read('input.aimPointer'), null);
  assert.equal(g.read('mouse.isDown'), false);
  const time = g.read('game.time');
  g.run('updateGame(0.5)');
  assert.equal(g.read('game.time'), time);
  assert.equal(g.document.activeElement, g.element('resumeButton'));
});

test('resizing during an upgrade requires an explicit warned resume after selection', () => {
  const g = loadGame(); g.start(); g.run('openUpgradeScreen()');
  g.window.innerWidth = 844; g.window.innerHeight = 390;
  g.window.dispatch('resize');
  g.element('upgradeGrid').children[0].click();
  assert.equal(g.read('game.state'), 'paused');
  assert.match(g.element('pauseReason').textContent, /Defenses keep their old positions/);
});

test('resizing while already paused updates the orientation warning', () => {
  const g = loadGame(); g.start(); click(g, 'pauseButton');
  g.window.innerWidth = 844; g.window.innerHeight = 390;
  g.window.dispatch('resize');
  assert.equal(g.read('game.state'), 'paused');
  assert.match(g.element('pauseReason').textContent, /Defenses keep their old positions/);
});

test('placement preview rejects out-of-arena positions and insufficient energy', () => {
  const g = loadGame(); g.start(); click(g, 'buildButton');
  g.emit('gameCanvas', 'pointerdown', { pointerId: 3, clientX: -50, clientY: 300 });
  assert.equal(g.element('placeButton').disabled, true);
  g.emit('gameCanvas', 'pointermove', { pointerId: 3, clientX: 100, clientY: 300 });
  g.run('game.energy = 10; updateUi()');
  assert.equal(g.element('placeButton').disabled, true);
  click(g, 'placeButton');
  assert.equal(g.read('structures.length'), 0);
});

test('movement deadzone, clamping and diagonal input never exceed normal speed', () => {
  const g = loadGame(); g.start();
  const x = g.read('player.x');
  g.emit('movePad', 'pointerdown', { pointerId: 3, clientX: 73, clientY: 756 });
  g.run('updatePlayer(0.1)');
  assert.equal(g.read('player.x'), x);
  g.emit('movePad', 'pointermove', { pointerId: 3, clientX: 500, clientY: 400 });
  g.window.dispatch('keydown', { key: 'd' });
  const old = g.read('({x: player.x, y: player.y})');
  g.run('updatePlayer(0.1)');
  assert.ok(Math.hypot(g.read('player.x') - old.x, g.read('player.y') - old.y) <= 26.00001);
});

test('releasing one pointer does not cancel the other pointer or auto-fire preference', () => {
  const g = loadGame(); g.start(); move(g); aim(g);
  g.emit('movePad', 'pointerup', { pointerId: 10 });
  assert.equal(g.read('mouse.isDown'), true);
  g.emit('gameCanvas', 'pointerup', { pointerId: 20 });
  assert.equal(g.read('game.autoFire'), true);
  assert.equal(g.read('shouldAutoFireAtMouse()'), true);
});

test('keyboard activation of a focused button does not fire the weapon', () => {
  const g = loadGame(); g.start();
  g.window.dispatch('keydown', { key: ' ', target: g.element('toolTurret') });
  assert.equal(g.read('keys.shoot'), false);
});

test('an arena pointer press returns keyboard focus from the toolbar to gameplay', () => {
  const g = loadGame(); g.start(); g.element('toolTurret').focus();
  aim(g);
  assert.equal(g.document.activeElement, g.element('gameCanvas'));
});

test('actual render and simulation functions run through every game state', () => {
  const g = loadGame(); g.run('renderGame()');
  g.start(); g.run('updateGame(0.016); renderGame()');
  click(g, 'buildButton');
  g.emit('gameCanvas', 'pointerdown', { pointerId: 3, clientX: 100, clientY: 300 });
  g.run('renderGame()'); click(g, 'placeButton');
  g.run('updateGame(0.016); renderGame()');
  click(g, 'pauseButton'); g.run('renderGame()');
  click(g, 'resumeButton'); g.run('openUpgradeScreen(); renderGame()');
  g.element('upgradeGrid').children[0].click();
  g.run('endGame(); renderGame()');
});
