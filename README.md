# Manipulator Teardown

An interactive 3D exploded view of three robot arms: the **Universal Robots UR5e**, the **Franka Emika Panda** and the **ARX5 (X5)**. Pull each arm apart link by link, then actuator by actuator, then screw by screw. Every part is labelled with where its data comes from.

**Live demo:** <https://markus-learning.github.io/manipulator-teardown/>.

## Features

- **Exploded view:** a three-stage explode. Links separate along their joint offsets, actuator stacks slide out along their joint axes, and fasteners back out along their own axes.
- **Provenance on every part:** colour-coded as *official mesh*, *documented spec*, *standard ISO/DIN part* or *estimated*, with links to the source documents.
- **Inspector and parts index:** search for parts (e.g. `M3`, `encoder`, `flange`) and see each one's dimensions, connection type and sources.
- **Inspect 360°:** lift any part out of the arm and turn it on its own.
- **Flashcards:** a study deck for each arm that renders the real part mesh.
- **Joint space:** drive every joint, in single-arm or bimanual (teleop) layout.
- **Import:** drop in your own `.urdf` or `.glb` file. It is parsed entirely in your browser, and nothing is uploaded.

## Run locally

It's a static site with no build step. Serve the folder with any static file server, for example:

```bash
ruby -run -e httpd . -p 8000
```

Then open <http://localhost:8000>. Opening `index.html` directly from disk won't work, because browsers block `fetch()` for `file://` URLs.

## Project layout

```
index.html          page markup
css/style.css       styles (light and dark themes)
js/app.js           3D scene, explode, inspector, parts index, import
js/flashcards.js    flashcard deck
js/inspect.js       Inspect 360° overlay
models/*.glb        merged meshes for each arm
models/*.json       kinematics, part metadata and sources
models/*.cards.json flashcard decks
```

## Security

- Fully static: no backend, no accounts, no cookies, no analytics.
- A strict Content-Security-Policy allows scripts only from this site and the version-pinned three.js on jsDelivr.
- Every CDN script is pinned with Subresource Integrity (SRI) hashes, so a tampered file won't run.
- All text from data files is HTML-escaped before display, and source links are limited to `http(s)` URLs.

## Data sources and credits

Meshes and kinematics come from the manufacturers' public robot descriptions:

- UR5e: [UniversalRobots/Universal_Robots_ROS2_Description](https://github.com/UniversalRobots/Universal_Robots_ROS2_Description) (BSD-3-Clause)
- Franka Panda: [frankaemika/franka_description](https://github.com/frankaemika/franka_description) (Apache-2.0)
- ARX5: [ARXroboticsX/ARX_Model](https://github.com/ARXroboticsX/ARX_Model), with motor data from [real-stanford/arx5-sdk](https://github.com/real-stanford/arx5-sdk) (MIT)

Fastener and internal details come from the service manuals, datasheets, patents and ISO/DIN standards linked inside the app. Sealed joint internals aren't published by any of the three manufacturers, so they're reconstructed from patents and datasheets and marked **Estimated**. All trademarks and meshes belong to their respective owners.

Rendering uses [three.js](https://threejs.org) r147.

## How it was made

I built this project with the help of [Claude](https://claude.ai), Anthropic's AI assistant, which I used for coding, research and data extraction.
