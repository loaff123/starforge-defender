import { test as base, expect } from '@playwright/test';

const test = base.extend({
  browserErrors: [async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await use(errors);
    expect(errors).toEqual([]);
  }, { auto: true }],
  pointerEvidence: [async ({ page }, use, testInfo) => {
    await page.addInitScript(() => {
      window.testPointerEvents = [];
      for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture']) {
        document.addEventListener(type, event => {
          window.testPointerEvents.push({ type, id: event.pointerId, target: event.target.id });
        }, true);
      }
    });
    await use();
    await testInfo.attach('native-pointer-events', {
      body: JSON.stringify(await page.evaluate(() => window.testPointerEvents || []), null, 2),
      contentType: 'application/json'
    });
  }, { auto: true }]
});

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
});

async function start(page) {
  await page.getByRole('button', { name: /^Training/ }).click();
  await page.locator('#autoFireCheckbox').uncheck();
  await page.getByRole('button', { name: 'Start Mission', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
}

async function screenshot(page, testInfo, name) {
  await page.clock.runFor(32);
  await testInfo.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
}

test('start, pause, upgrade and restart own focus and remain reachable', async ({ page }, testInfo) => {
  const touchLayout = testInfo.project.name !== 'desktop';
  await expect(page.locator(touchLayout ? '#touchInstructions' : '#desktopInstructions')).toBeVisible();
  await expect(page.locator(touchLayout ? '#desktopInstructions' : '#touchInstructions')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Start Mission', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Toggle Tips' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /^Training/ })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Toggle Tips' })).toBeFocused();
  await screenshot(page, testInfo, 'start');
  await start(page);
  await expect(page.locator('#gameCanvas')).toBeFocused();
  await screenshot(page, testInfo, 'combat');
  if (testInfo.project.name === 'desktop') await page.keyboard.press('p');
  else await page.getByRole('button', { name: 'Pause', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Resume Mission' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Resume Mission' })).toBeFocused();
  await screenshot(page, testInfo, 'paused');
  await page.getByRole('button', { name: 'Resume Mission' }).click();
  // Arrange wave/death conditions; the production frame loop performs transitions.
  await page.evaluate(() => { enemies.length = 0; });
  await page.clock.runFor(1100);
  await expect(page.getByRole('dialog', { name: 'Choose an upgrade' })).toBeVisible();
  await expect(page.locator('.upgrade-card').first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.upgrade-card').last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.upgrade-card').first()).toBeFocused();
  await screenshot(page, testInfo, 'upgrade');
  await page.locator('.upgrade-card').last().click();
  await expect(page.locator('#gameCanvas')).toBeFocused();
  await page.evaluate(() => { core.health = 0; });
  await page.clock.runFor(32);
  await expect(page.getByRole('button', { name: 'Restart', exact: true })).toBeFocused();
  await screenshot(page, testInfo, 'game-over');
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-state', 'playing');
  expect(await page.evaluate(() => Object.values(keys).every(value => !value))).toBe(true);
});

test('native touch pointers move and aim together, then cancel cleanly', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'This case requires touch emulation.');
  await start(page);
  const pad = await page.locator('#movePad').boundingBox();
  const width = page.viewportSize().width;
  const height = page.viewportSize().height;
  const left = { id: 1, x: pad.x + pad.width / 2, y: pad.y + pad.height / 2 };
  const right = { id: 2, x: width * 0.7, y: height * 0.45 };
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, right] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...left, x: left.x + 35 }, right] });
  const oldX = await page.evaluate(() => player.x);
  await page.clock.runFor(96);
  expect(await page.evaluate(() => player.x)).toBeGreaterThan(oldX);
  expect(await page.evaluate(() => bullets.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => input.movePointer !== input.aimPointer && mouse.isDown)).toBe(true);
  await screenshot(page, testInfo, 'two-finger-combat');
  // This Chromium driver releases the specifically named point on touchEnd.
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [right] });
  expect(await page.evaluate(() => input.aimPointer === null && input.movePointer !== null)).toBe(true);
  const dash = await page.locator('#dashButton').boundingBox();
  const dashFinger = { id: 3, x: dash.x + dash.width / 2, y: dash.y + dash.height / 2 };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [dashFinger] });
  await page.clock.runFor(32);
  expect(await page.evaluate(() => player.dashCooldown)).toBeGreaterThan(0);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [dashFinger] });
  // Move well outside the pad; pointer capture must still own and then release it.
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...left, x: 5, y: 160 }] });
  expect(await page.evaluate(() => input.movePointer !== null)).toBe(true);
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const stoppedX = await page.evaluate(() => player.x);
  await page.clock.runFor(96);
  expect(await page.evaluate(() => player.x)).toBe(stoppedX);
  expect(await page.evaluate(() => mouse.isDown || input.movePointer !== null)).toBe(false);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [right] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  expect(await page.evaluate(() => mouse.isDown || mouse.hasMoved)).toBe(false);
  await client.detach();
});

test('touch build previews, confirms once and does not buy on double tap', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'This case requires touch controls.');
  await start(page);
  const point = { x: 100, y: page.viewportSize().height / 2 };
  await page.getByRole('button', { name: 'Build', exact: true }).tap();
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.getByRole('button', { name: 'Place', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => structures.length)).toBe(0);
  const energy = await page.evaluate(() => game.energy);
  await screenshot(page, testInfo, 'placement-preview');
  await page.getByRole('button', { name: 'Place', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Place', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => structures.length)).toBe(1);
  expect(await page.evaluate(() => game.energy)).toBe(energy - 40);
  await page.getByRole('button', { name: 'Cancel', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Build', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Place', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeHidden();
  const emptyPoint = { x: 100, y: point.y - 90 };
  expect(await page.evaluate(p => canBuildAt(p.x, p.y) && game.energy >= buildCosts[game.selectedTool], emptyPoint)).toBe(true);
  await page.touchscreen.tap(emptyPoint.x, emptyPoint.y);
  await page.touchscreen.tap(emptyPoint.x, emptyPoint.y);
  expect(await page.evaluate(() => structures.length)).toBe(1);
});

test('touch controls fit the viewport without overlapping each other', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'Desktop controls use the keyboard.');
  await start(page);
  await page.getByRole('button', { name: 'Build', exact: true }).tap();
  const hud = await page.locator('.top-bar').boundingBox();
  const notification = await page.locator('#toast').boundingBox();
  expect(notification.y).toBeGreaterThanOrEqual(hud.y + hud.height + 8);
  const rectangles = await page.locator('.touch-controls button, #movePad').evaluateAll(elements =>
    elements.map(element => {
      const r = element.getBoundingClientRect();
      return { id: element.id, x: r.x, y: r.y, width: r.width, height: r.height };
    })
  );
  const viewport = page.viewportSize();
  for (const rect of rectangles) {
    expect(rect.width, rect.id).toBeGreaterThanOrEqual(44);
    expect(rect.height, rect.id).toBeGreaterThanOrEqual(44);
    expect(rect.x, rect.id).toBeGreaterThanOrEqual(0);
    expect(rect.y, rect.id).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width, rect.id).toBeLessThanOrEqual(viewport.width);
    expect(rect.y + rect.height, rect.id).toBeLessThanOrEqual(viewport.height);
  }
  for (let i = 0; i < rectangles.length; i++) for (let j = i + 1; j < rectangles.length; j++) {
    const a = rectangles[i], b = rectangles[j];
    const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
  }
});

test('desktop toolbar-to-arena focus and movement/build shortcuts', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop-only regression.');
  await start(page);
  await page.getByRole('button', { name: /Turret/ }).click();
  await page.mouse.click(300, 300);
  await expect(page.locator('#gameCanvas')).toBeFocused();
  const oldX = await page.evaluate(() => player.x);
  await page.keyboard.down('d'); await page.clock.runFor(96); await page.keyboard.up('d');
  expect(await page.evaluate(() => player.x)).toBeGreaterThan(oldX);
  await page.keyboard.down('Space'); await page.clock.runFor(192); await page.keyboard.up('Space');
  expect(await page.evaluate(() => bullets.length)).toBeGreaterThan(0);
  await page.mouse.click(200, 300, { button: 'right' });
  await page.mouse.dblclick(320, 300);
  expect(await page.evaluate(() => structures.length)).toBe(2);
});

test('actual lost capture clears held fire', async ({ page }) => {
  await start(page);
  await page.mouse.move(100, 250);
  await page.mouse.down();
  expect(await page.evaluate(() => mouse.isDown)).toBe(true);
  // setPointerCapture is pending until the next pointer event. Establish actual
  // capture first, so release tests a real loss rather than canceling a pending grant.
  await page.mouse.move(110, 250);
  expect(await page.evaluate(() => window.testPointerEvents.some(event => event.type === 'gotpointercapture'))).toBe(true);
  // Releasing the browser's real capture generates lostpointercapture on the next input.
  await page.evaluate(() => canvas.releasePointerCapture(input.aimPointer));
  await page.mouse.move(120, 250);
  expect(await page.evaluate(() => window.testPointerEvents.some(event => event.type === 'lostpointercapture'))).toBe(true);
  expect(await page.evaluate(() => mouse.isDown)).toBe(false);
  expect(await page.evaluate(() => input.aimPointer)).toBe(null);
  await page.mouse.up();
});

test('a size change pauses rather than running with held inputs', async ({ page }) => {
  await start(page);
  await page.keyboard.down('d');
  await page.mouse.move(100, 250); await page.mouse.down();
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: viewport.height, height: viewport.width });
  await expect(page.locator('body')).toHaveAttribute('data-state', 'paused');
  expect(await page.evaluate(() => mouse.isDown || keys.right)).toBe(false);
  await expect(page.locator('#pauseReason')).toContainText('Defenses keep their old positions');
  const time = await page.evaluate(() => game.time);
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => game.time)).toBe(time);
  await page.keyboard.up('d'); await page.mouse.up();
});

test('touch menu swipes reach instructions and return to the title', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'Native touch scrolling case.');
  const client = await page.context().newCDPSession(page);
  const viewport = page.viewportSize();
  const scroll = distance => client.send('Input.synthesizeScrollGesture', {
    x: viewport.width / 2, y: viewport.height / 2, yDistance: distance,
    speed: 1200, preventFling: true, gestureSourceType: 'touch'
  });
  const title = page.getByRole('heading', { name: 'Starforge Defender', exact: true });
  await scroll(1000);
  await expect(title).toBeInViewport({ ratio: 1 });
  await scroll(-1000);
  await expect(page.locator('#touchInstructions')).toBeInViewport({ ratio: 1 });
  await screenshot(page, testInfo, 'touch-menu-scrolled');
  await scroll(1000);
  await expect(title).toBeInViewport({ ratio: 1 });
  await client.detach();
});
