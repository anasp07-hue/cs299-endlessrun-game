# Apocalypse Run

A 3D endless runner that plays entirely offline in your browser. It's built for killing time where there's no wifi, like on a plane.

You play a hacker escaping through the ruins of a futuristic city with a government agent close behind. The world scrolls toward you across three lanes. Jump over low obstacles, slide under high ones, and switch lanes around full blocks. Your speed keeps climbing. A clean head-on hit gets you caught right away. Clipping an obstacle while changing lanes makes you stumble, and a second stumble within 8 seconds also ends the run. Your score grows with distance, you can grab glowing data shards for bonus points, and your high score is saved between sessions.

The game uses [three.js](https://threejs.org/) (vendored in `libs/`) with plain HTML, CSS, and JavaScript. There's no build step and there are no npm packages, CDNs, web fonts, or remote assets. Once you have the repo, it never needs a network connection.

## Running the game

You need Python 3 and a modern browser.
CD into the folder you stored this program and run this command

```bashwhat the program does, the command to run it, and the command to run the tests.
python3 serve.py
```

Then open **http://localhost:8000**.

Opening `index.html` directly (`file://`) will **not** work, because browsers block ES-module imports from files. `serve.py` is Python's built-in `http.server` with caching turned off, so a reload always picks up the latest code. Options:

```bash
python3 serve.py 8080     # use a different port
python3 serve.py --lan    # also reachable from other devices on your network
```

## Controls

| Action | Keys |
|---|---|
| Move left / right | `←` `→` or `A` `D` |
| Jump | `↑`, `W`, or `Space` |
| Slide (fast-fall in the air) | `↓` or `S` |
| Pause / resume | `Esc` or `P` |
| Sound on/off | `M` |
| Start / play again | `Enter` or `Space` |

## Running the tests

The game rules (physics, collision, spawning, difficulty, scoring, save data, and so on) live in DOM-free modules under `js/logic/`, and the tests use Node's built-in test runner. Node is only a dev tool for tests, and the game itself never needs it. Use Node 21 or newer, which supports glob patterns in `--test`.

```bash
node --test 'tests/*.test.js'
```

## Project layout

```
index.html, style.css   UI overlays (menus, HUD, pause, game over)
game.js                 Entry point: game loop, state, input, rendering wiring
js/logic/               Pure, testable game rules (no DOM, no three.js)
js/                     View code: characters, city, obstacle models, audio
libs/                   Vendored three.js (MIT)
tests/                  node:test test files
serve.py                No-cache local dev server
SPEC.md                 Full game spec and build plan
docs/adr/               Architecture decision records
```
