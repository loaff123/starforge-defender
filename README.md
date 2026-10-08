# Starforge Defender

Single-file browser game built with HTML, CSS, and Canvas.

## Play

Open `index.html` in a browser.

## Desktop controls

- Move: `WASD` or arrow keys
- Aim: mouse
- Fire: hold mouse or press `Space`
- Auto fire: `F`
- Build: choose `1`, `2`, or `3`, then Shift-click, right-click, or double-click
- Dash: `Shift`
- Pause: `P`

Click the arena to return keyboard focus after using a button. Space and Enter
activate focused buttons normally.

## Touch controls

The on-screen controls appear on compact screens and touch devices.

- Move: drag the circular **MOVE** pad with one thumb.
- Aim/fire: hold and drag another finger on the arena while moving.
- Dash: keep moving and tap **Dash**. The button shows the remaining cooldown.
- Build: tap **Build**, select Turret, Barrier, or Pulse Mine, and touch/drag the
  arena to preview a position. Tap **Place** to spend the shown energy once.
  Blocked or unaffordable positions cannot be confirmed. Select a new position
  for the next defense, or tap **Cancel** to return to combat.
- Pause/resume: tap **Pause**, then **Resume Mission**.

Auto Fire is selected before starting a mission. When enabled, shooting continues
toward the last aim point after you lift your aiming finger. Disable it in the
start menu for hold-to-fire play. Building temporarily suppresses firing.

Switching away from the game pauses the mission. Returning does not resume it
automatically. Canceled touches, screen resizing, and menu transitions clear held
input; aim or move again after resuming. Menus and upgrade choices scroll on small
screens, and keyboard focus stays inside the active dialog.

### Orientation limitation

Choose portrait or landscape before starting. Changing the viewport size pauses
the game and clears held input, but existing defenses keep their original arena
coordinates. Rotating during a mission can therefore leave defenses offscreen.
Restore the previous orientation before resuming, or reload to start a new mission
in the new orientation. Fresh portrait and landscape runs are separate test
targets; mid-run rotation does not preserve the arena layout.

## Features

- Three difficulty modes: Training, Standard, Veteran
- Auto fire toward the mouse cursor
- Wave-based survival combat
- Turrets, barriers, and pulse mines
- Upgrade choices between waves
- Programmatic Canvas art with no external asset dependency
- Local high score storage
- Independent touch movement and aiming, explicit placement, and on-screen actions

## Development checks

The game itself needs no dependencies or build step. For deterministic input and
state tests with Node.js 20 or newer:

```sh
npm test
```

These tests execute the real inline game script with a small DOM/audio/rendering
harness. They cover input routing and simulation state, not native browser layout,
hit testing, pointer capture delivery, or physical touch hardware.

The separate browser regression suite uses Chromium touch emulation at 390×844
and 844×390, plus a 1280×800 desktop viewport:

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:browser
```

It exercises native mouse/keyboard and emulated multi-touch input, checks layout
and modal reachability, and captures screenshots in the Playwright report.
Emulated touch still needs complementary physical-device testing.

## Files

- `index.html`: complete playable game
- `assets/preview.png`: screenshot preview
- `tests/`: deterministic checks, test-only HTTP server, and browser regression suite
- `playwright.config.mjs`: browser test matrix (test dependencies only)
