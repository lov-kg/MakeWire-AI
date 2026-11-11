# MakerWire AI

**From parts → pins → production code.**

MakerWire AI is a mobile-first, dark-mode electronics and industrial-automation
workspace. Pick a controller, add the modules on your bench (or in your panel),
get a pin-aware wiring guide, an SVG connection diagram, and board-aware firmware
you can copy or download.

- **Deterministic core** — pin allocation, voltage checks, power budgeting,
  fieldbus guidance, wiring guides and code generation run locally in the
  browser. No account, network, or AI key required.
- **Industrial catalogue** — **145 boards** and **335 modules** across 9 board
  packs and 11 component packs, including PLCs, DIN-rail I/O, CAN/RS-485 nodes,
  LTE, machine vision, LiDAR and motor drives. Packs load lazily so the first
  paint stays fast.
- **Optional AI enhancement** — Cloudflare Workers AI (or OpenAI) can review the
  wiring and rewrite the generated sketch. The deterministic output is always
  kept as a fallback.
- **Cloudflare-native** — static assets on Cloudflare Pages, API routes as Pages
  Functions in `functions/api/`, plus a searchable catalogue API served from
  build-time JSON.

---

## Contents

1. [Feature tour](#feature-tour)
2. [Supported hardware](#supported-hardware)
3. [Tech stack](#tech-stack)
4. [Quick start](#quick-start)
5. [Local development](#local-development)
6. [AI configuration](#ai-configuration)
7. [Deploy to Cloudflare Pages](#deploy-to-cloudflare-pages)
8. [How it works](#how-it-works)
9. [Expanding the catalogue](#expanding-the-catalogue)
10. [Project structure](#project-structure)
11. [API reference](#api-reference)
12. [Data & persistence](#data--persistence)
13. [Safety notes & limitations](#safety-notes--limitations)
14. [Validation & testing](#validation--testing)
15. [Troubleshooting](#troubleshooting)

---

## Feature tour

The workspace is split into four stages, reachable from the sticky stage nav.

### 1. Board

Searchable catalogue with specs, pinout metadata, logic voltage, ADC resolution,
connectivity, lifecycle status, operating temperature, ingress protection,
standards and board-specific safety notes. Filters include family and an
**Industrial** toggle. Selecting a board immediately re-runs the wiring engine
for the current project.

### 2. Components

Search and filter the full catalogue by category, protocol and **Industrial**.
Every module shows voltage, current, interface badges, lifecycle, addressing and
pack attribution. You can also:

- choose a power override (`auto`, 3.3, 5, 12, 24, 48 V) per component;
- create **custom components** with a name, voltage, and a `Label: role` pin list;
- look up a component by name through the AI librarian (when configured);
- import/export a whole project as JSON.

### 3. Wiring

The deterministic engine allocates power, ground and buses (I2C, SPI, UART,
one-wire, analog, PWM, GPIO, CAN and RS-485 trunks), then produces:

- a **step-by-step wiring guide in words**;
- an **SVG pin matrix / connection diagram**;
- a **power budget** for 3.3 V, 5 V and arbitrary 12/24/48 V DC rails;
- **warnings** for voltage/logic mismatches, I2C address collisions, overloaded
  rails, modules that need an external supply, high-voltage outputs on
  low-voltage logic, missing CAN/RS-485 interfaces, and camera DVP limitations.

Fieldbus H/L and A/B pins are treated as **trunk terminals**, not GPIOs. If the
controller has no native fieldbus pins, the plan says so and explains which
transceiver, communication module and termination are still required.

An optional AI review adds a second opinion without changing pin assignments.

### 4. Code

Describe the behaviour you want and choose **Auto / Arduino / MicroPython /
ESP-IDF / Python SBC / PLC ST**. The generator:

- emits the correct framework and entry points for the selected board;
- uses the exact pin codes from the wiring plan as named macros/variables;
- includes the right libraries and board-specific fallbacks;
- produces a **Python 3 scaffold for Linux SBCs** (Raspberry Pi, Jetson, Orange
  Pi…) with an exact `WIRING` dictionary and honest driver stubs;
- produces an **IEC 61131-3 Structured Text scaffold** for PLC targets with a
  symbolic field I/O map (never invented `%I`/`%Q` addresses);
- warns when a requested feature is not supported locally.

Copy the code or download it as `.ino`, `.cpp`, `.py`, or `.st`. Every generation
is saved to per-project code history.

Everything is responsive and keyboard-accessible, with a skip link, focus rings,
labelled controls, and `aria-live` status messages.

---

## Supported hardware

### Boards — 145 across 9 packs

| Pack | Count | Examples |
| --- | ---: | --- |
| Starter (core) | 7 | ESP32-S3 N16R8, ESP32 DevKit V1, Uno R3, Nano, Blue Pill, Pico W, NodeMCU |
| Espressif | 20 | ESP32-S3/C3/C6 devkits, ESP32-CAM, PSRAM boards, ESP8266 variants |
| Arduino & AVR | 18 | Mega 2560, Leonardo, Micro, Teensy 3/4, classic AVR boards |
| STM32 | 13 | Blue Pill, Black Pill, Nucleo, Discovery, CAN-enabled devkits |
| RP2040 & Pico | 12 | Pico, Pico W, Pico 2, RP2040/RP2350 boards, CAN/RS-485 carriers |
| Linux SBC | 16 | Raspberry Pi 5/4B/Zero 2 W/CM4, Jetson Orin, BeagleBone, Rock Pi, x86 |
| Industrial & PLC | 19 | Siemens S7-1200/1500/LOGO, Rockwell Micro850/CompactLogix, Schneider M2xx, Beckhoff, WAGO, Phoenix |
| Robotics controllers | 20 | Robot-arm, AGV, drone flight and motion controllers |
| Other boards | 20 | nRF, FPGA, RISC-V, LoRa and specialty controllers |

### Modules — 335 across 11 packs

| Pack | Count | Coverage |
| --- | ---: | --- |
| Starter (core) | 20 | DHT22, BME280, MPU6050, HC-SR04, MQ-2, NEO-6M, SSD1306, ILI9341, relay, SG90, A4988, WS2812B, A7670E LTE, microSD, DS3231, OV2640, potentiometer, button, buzzer, LED |
| Sensors | 93 | Environmental, motion, distance, gas, current, pressure, flow, RTD/thermocouple, vibration, pH |
| Industrial I/O | 46 | PLC I/O, 4–20 mA transmitters, proximity/photo sensors, safety devices, Modbus/CANopen/PROFINET/EtherCAT nodes |
| Actuators & motors | 35 | Servos, steppers, BLDC, solenoids, pneumatics, VFDs, motor drivers |
| Displays | 26 | OLED, TFT, e-paper, LCD, HMI panels, LED matrices |
| Connectivity | 30 | LTE, LoRa, Wi-Fi/BLE, Ethernet, CAN, RS-485, fieldbus gateways |
| Power | 19 | DIN PSUs, DC-DC converters, battery packs, UPS, breakers, SSRs |
| Storage | 10 | SD, eMMC, FRAM, EEPROM, flash, NVMe |
| Inputs | 17 | Buttons, keypads, encoders, joysticks, switches, touch panels |
| Cameras | 15 | Camera modules, depth cameras, thermal imagers, machine vision |
| Robotics | 24 | LiDAR, IMUs, GPS/RTK, motor feedback, end effectors, robot peripherals |

Core entries are hand-verified. Generated industrial entries carry
`verified: false` and are surfaced as **datasheet review** in the UI — confirm
pinout, logic levels and current limits against the vendor document before
powering hardware.

The catalogue registry lives in
[`src/catalog/registry.ts`](src/catalog/registry.ts); packs live under
`src/catalog/boards/` and `src/catalog/components/`.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| UI | React 19 + TypeScript |
| Build | Vite 7 |
| Styling | Tailwind CSS 3, dark-first slate/mint theme |
| Icons | `lucide-react` |
| Syntax highlighting | `prism-react-renderer` |
| Persistence | IndexedDB (primary) + LocalStorage (mirror/fallback) |
| API | Cloudflare Pages Functions (Workers runtime) |
| AI | Cloudflare Workers AI binding, optional OpenAI fallback |
| Hosting | Cloudflare Pages |

---

## Quick start

Requirements: **Node.js 20+** and npm.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The full deterministic experience (catalogue,
wiring, local code generation, persistence) works without any backend or API
keys. `npm run dev` exports the catalogue JSON first, then starts Vite.

The first launch seeds a demo project (ESP32-S3 + DHT22 + OLED) so you can see
every stage immediately.

---

## Local development

### Option A — Vite only (frontend, no API)

```bash
npm run dev
```

Useful for UI work. `/api/*` calls will fail; the UI catches that and falls back
to local generation.

### Option B — Vite + Pages Functions (full stack, recommended)

Terminal 1 — run the Pages/Functions runtime:

```bash
npm run build
npx wrangler login      # once; required for the remote Workers AI binding
npx wrangler pages dev dist --port 8788
```

> The `[ai]` binding in `wrangler.toml` talks to Cloudflare's remote Workers AI
> service, so `wrangler pages dev` needs an authenticated session. If you want a
> purely offline session, remove the `[ai]` block from a local copy of
> `wrangler.toml` or use Option A; the deterministic engine does not need it.

Terminal 2 — run Vite with HMR; `/api` is proxied to `127.0.0.1:8788`:

```bash
npm run dev
```

Or run a single production-like preview:

```bash
npm run pages:dev
# builds, then serves dist + /api on http://localhost:8788
```

Rebuild (`npm run build`) whenever you want the Pages preview to pick up
frontend changes. Vite HMR on port 5173 is the fast inner loop.

### Local secrets

Copy the example file and edit it:

```bash
cp .dev.vars.example .dev.vars
```

```dotenv
# .dev.vars  (git-ignored)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
WORKERS_AI_MODEL=@cf/meta/llama-3.3-70b-instruct-fp8-fast
```

`wrangler pages dev` reads `.dev.vars` automatically. The `AI` binding from
`wrangler.toml` is also available locally when you are logged into Wrangler.

### Useful scripts

```bash
npm run catalog:export       # write public/catalog/{boards,components}.json
npm run typecheck            # app TypeScript
npm run typecheck:functions  # Pages Functions TypeScript
npm run build                # catalogue export + typecheck + production build
npm run preview              # preview the Vite build
```

---

## AI configuration

AI is **optional**. The app is fully usable with local generation only.

The API resolves providers in this order:

1. `OPENAI_API_KEY` present → OpenAI chat completions.
2. `AI` binding present → Cloudflare Workers AI.
3. Neither → AI endpoints return `503`; the client keeps its deterministic output.

### Workers AI (recommended on Cloudflare)

`wrangler.toml` already declares:

```toml
[ai]
binding = "AI"
```

For a dashboard-managed Pages project, add the same binding under
**Settings → Functions → Bindings → Workers AI**, variable name `AI`.

Optional override:

```toml
[vars]
WORKERS_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
```

### OpenAI

```bash
# local
echo "OPENAI_API_KEY=sk-..." >> .dev.vars

# production
npx wrangler pages secret put OPENAI_API_KEY --project-name makerwire-ai
```

Optional: `OPENAI_MODEL` (default `gpt-4o-mini`), `ALLOWED_ORIGIN` (CORS origin,
default `*`).

Check what is live:

```bash
curl http://localhost:8788/api/health
```

```json
{
  "ok": true,
  "ai": { "workersAi": true, "openai": false, "model": "workers-ai/..." },
  "endpoints": [
    "POST /api/generate-code",
    "POST /api/generate-wiring",
    "POST /api/lookup-component",
    "GET /api/catalog/boards",
    "GET /api/catalog/components",
    "GET /api/health"
  ]
}
```

---

## Deploy to Cloudflare Pages

### Option 1 — Git integration (dashboard)

1. Push this repository to GitHub/GitLab.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Build settings:
   - **Framework preset:** Vite (or None)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Deploy command:** `npx wrangler pages deploy dist --project-name makerwire-ai`
   - **Root directory:** repository root (the folder containing `functions/`)
4. **Settings → Functions → Bindings** → add **Workers AI**, variable `AI`.
5. (Optional) **Settings → Environment variables** → add encrypted
   `OPENAI_API_KEY`.
6. Deploy.

> **Important:** the deploy command must be `wrangler pages deploy`, **not**
> `wrangler deploy`. `wrangler deploy` is the Workers command; run against this
> Pages project it fails with `Missing entry-point to Worker script or to assets
> directory`. If the dashboard offers only a build command + output directory
> (classic Pages integration), leave the deploy step to Pages and do not add a
> deploy command.

`npm run build` runs `catalog:export` first, so `dist/catalog/boards.json` and
`dist/catalog/components.json` are deployed as static assets for the catalogue
API. Pages automatically detects `functions/` and deploys the API routes with
the site. `public/_routes.json` scopes Function invocation to `/api/*`;
`public/_headers` adds security and cache headers.

### Option 2 — Direct upload with Wrangler

```bash
npm install
npx wrangler login
npm run build
npx wrangler pages deploy dist --project-name makerwire-ai
```

Wrangler bundles `functions/` automatically when run from the project root. Add
the AI binding in the dashboard after the first deploy (bindings are attached to
the Pages project, not baked into the static bundle). For subsequent deploys:

```bash
npm run deploy
```

### Custom domain

Pages → your project → **Custom domains** → add the domain and follow the DNS
instructions. No app changes are required; the frontend calls same-origin
`/api/*`.

### Routing & headers

- `public/_routes.json` → only `/api/*` goes through Functions; everything else
  is served as a static asset.
- `public/_headers` → CSP, `X-Frame-Options`, `nosniff`, permissions policy,
  immutable caching for `/assets/*`, one-hour caching for `/catalog/*`, and
  `no-store` on API responses.
- Unknown `/api/*` routes return a JSON `404` from
  `functions/api/[[path]].ts` instead of the SPA shell.

---

## How it works

### Catalogue registry and lazy packs

```
src/data (core, synchronous)
        │
        ▼
src/catalog/registry.ts  ── dynamic import per pack ──►  boards/*.ts, components/*.ts
        │                                                  (Vite chunks)
        ├─ getBoard / getComponent        synchronous lookups for wiring & codegen
        ├─ allBoards / allComponents      full catalogue after hydration
        ├─ search helpers, counts, packs  UI + diagnostics
        └─ catalogDiagnostics()           duplicate-id report (first definition wins)
```

Core boards/components are registered synchronously so the deterministic engines
always work. The larger industrial packs hydrate before the workspace renders.
Duplicate IDs never throw: the first definition wins (core beats packs, earlier
packs beat later ones) and the collision is recorded for developer tooling.
This is why the demo project always resolves even if a pack fails to load.

`scripts/catalog-source.ts` merges the same packs at build time and
`scripts/export-catalog.mjs` writes versioned JSON to `public/catalog/`. The
Pages Functions read that JSON through the Pages `ASSETS` binding, so the
Workers bundle never has to import the whole TypeScript pack graph.

### Deterministic-first architecture

```
Browser
  ├─ catalogue registry    src/catalog/registry.ts
  ├─ wiring engine         src/lib/wiring.ts
  ├─ local code generators src/lib/codegen/*
  └─ persistence           IndexedDB + localStorage
        │
        │ optional POST /api/*
        ▼
Cloudflare Pages Functions
  ├─ generate-wiring   → safety review (AI or deterministic)
  ├─ generate-code     → enhance the local sketch, pins unchanged
  ├─ lookup-component  → AI component librarian
  ├─ catalog/boards    → searchable board catalogue (static JSON)
  ├─ catalog/components→ searchable component catalogue (static JSON)
  └─ health            → provider status
```

The pin engine is the source of truth. AI endpoints receive the authoritative
wiring map and are explicitly instructed not to change pin codes.

### Wiring allocation

For each selected component the engine:

1. Reserves power/ground and matches required interfaces.
2. Selects an exact voltage rail, then the nearest valid rail inside the
   component's voltage range, and warns on fallbacks and overrides.
3. Prefers board default I2C/SPI pins, then searches for safe alternates.
4. Shares I2C, SPI (per-device CS), UART pairs, CAN transceivers and I2S buses.
5. Avoids strapping, flash, PSRAM and input-only pins based on board metadata.
6. Uses `SoftwareSerial` on AVR when hardware UART pins are restricted
   (Uno/Nano D0/D1).
7. Treats CAN H/L and RS-485 A/B as field trunk terminals and explains the
   transceiver/communication module, termination and common reference needed
   when the controller has no native fieldbus pins.
8. Computes per-rail current draw and warns when a module needs its own supply.
9. Emits structured warnings (`info` / `warning` / `danger`) and a status of
   `ready`, `attention`, or `blocked`. Any non-info warning produces
   `attention`; an unconnected required pin produces `blocked`.

### Code generation

`src/lib/codegen/index.ts` resolves the target framework and dispatches to:

- **Arduino** (`arduino.ts`) — `setup()`/`loop()`, named pin macros, sensor
  reads, OLED/TFT rendering, SD CSV logging, Wi-Fi web server or serial command
  fallback, relay/servo/stepper/NeoPixel drivers, GPS parsing, LTE AT commands.
- **MicroPython** (`micropython.ts`) — single `main.py`, `machine` APIs,
  optional `socket` web server, documented driver files.
- **ESP-IDF** (`espidf.ts`) — a reviewable native scaffold: exact GPIO defines,
  I2C bus init/scan, UART bring-up, Wi-Fi/HTTP plumbing, and honest TODOs for
  managed sensor drivers.
- **Python SBC** (`python.ts`) — Python 3 for Linux boards with an exact
  `WIRING` dictionary, header-pin references, warning comments and
  `read_sensors`/`apply_outputs` stubs that name the driver libraries to install.
- **Structured Text** (`structured-text.ts`) — IEC 61131-3 `PROGRAM` with
  symbolic BOOL declarations and a cyclic TON sampling task. Field I/O addresses
  are documented as comments because they come from the PLC device configuration.

Board-native framework resolution is enforced:

- ESP-IDF only for the ESP32 family; other boards fall back to their native
  target.
- MicroPython falls back to Arduino for boards without a practical port.
- Python and Structured Text only for boards whose platform declares them;
  requesting them on a microcontroller returns the board's native target.
- ESP8266 uses `Servo.h` instead of `ESP32Servo.h`.
- AVR `SD.begin(cs, SPI)` uses the generated SPI pin set.
- GPS-only displays show satellite/fix data instead of empty temperature rows.

---

## Expanding the catalogue

### Add a board

Create or extend a pack under `src/catalog/boards/` using the shared builders in
`src/catalog/board-builders.ts` (`makeBoard`, `mcuPins`, `espBoard`,
`picoBoard`, `stmBoard`, `linuxBoard`, `plcBoard`…). Give every pin a real
`caps` list from `src/types.ts` and prefer `verified: false` until you have
checked the vendor pinout.

### Add a module

Add an entry to a pack under `src/catalog/components/` with the helper
constructors in `src/catalog/component-builders.ts` (`makeComponent`,
`sensor`, `relay`, `servo`, `fieldbusNode`, `powerPin`, `groundPin`, `cp`).
Use `cp(id, label, role, direction, note, required)`; a boolean fifth argument is
treated as `required`.

### Register a new pack

1. Export an array of `Board[]` or `ComponentDefinition[]` from the new module.
2. Add a lazy loader to `boardPackLoaders` or `componentPackLoaders` in
   `src/catalog/registry.ts`.
3. Add the same pack to `scripts/catalog-source.ts` so the JSON catalogue and
   Pages API include it.

Then run:

```bash
npm run catalog:export
npm run typecheck
npm run build
```

Duplicate IDs are reported by `catalog:export` and by
`catalogDiagnostics()`; the first definition wins.

---

## Project structure

```
makerwire-ai/
├─ functions/
│  ├─ tsconfig.json
│  └─ api/
│     ├─ _shared.ts             # Env, AI providers, JSON/CORS helpers
│     ├─ generate-code.ts       # POST /api/generate-code
│     ├─ generate-wiring.ts     # POST /api/generate-wiring
│     ├─ lookup-component.ts    # POST /api/lookup-component
│     ├─ catalog/
│     │  ├─ boards.ts           # GET /api/catalog/boards
│     │  └─ components.ts       # GET /api/catalog/components
│     ├─ health.ts              # GET /api/health
│     └─ [[path]].ts            # JSON 404 for unknown /api routes
├─ public/
│  ├─ _headers                  # security + cache headers
│  ├─ _routes.json              # Functions routing scope
│  ├─ catalog/                  # generated JSON (build output)
│  ├─ favicon.svg
│  └─ site.webmanifest
├─ scripts/
│  ├─ catalog-source.ts         # build-time pack merge
│  └─ export-catalog.mjs        # esbuild bundle → public/catalog/*.json
├─ src/
│  ├─ catalog/
│  │  ├─ registry.ts            # lazy packs, synchronous lookups, diagnostics
│  │  ├─ board-builders.ts
│  │  ├─ component-builders.ts
│  │  ├─ boards/                # esp32, arduino, stm32, rp2040, linux, industrial, robotics, misc
│  │  └─ components/            # sensors, industrial, actuators, displays, connectivity, power,
│  │                            # storage, inputs, cameras, robotics
│  ├─ components/               # UI: board, library, wiring, code studios
│  ├─ data/
│  │  ├─ boards.ts              # core board database (synchronous)
│  │  └─ components.ts          # core module database (synchronous)
│  ├─ lib/
│  │  ├─ ai.ts                  # API clients + request builders
│  │  ├─ codegen/               # Arduino / MicroPython / ESP-IDF / Python / ST
│  │  ├─ storage.ts             # IndexedDB + localStorage persistence
│  │  ├─ utils.ts
│  │  └─ wiring.ts              # deterministic pin/bus/power engine
│  ├─ App.tsx                   # catalogue hydration + workspace state
│  ├─ main.tsx
│  ├─ styles.css
│  └─ types.ts
├─ .dev.vars.example
├─ index.html
├─ package.json
├─ tailwind.config.js
├─ vite.config.ts
└─ wrangler.toml
```

---

## API reference

All endpoints accept and return JSON. CORS preflight (`OPTIONS`) is handled.
Bodies are size-clamped and filenames sanitised. API responses use
`cache-control: no-store`; catalogue JSON is cached for one hour.

### `GET /api/catalog/boards`

Search and filter the board catalogue. Query parameters:

| Param | Meaning |
| --- | --- |
| `q` | Free-text search (name, vendor, chip, family, tags, protocols…) |
| `family` | Exact family match, e.g. `Industrial PLC` |
| `pack` | Pack id, e.g. `industrial`, `robotics`, `esp32`, `core` |
| `lifecycle` | `active`, `preview`, `nrnd`, `obsolete`, `unknown` |
| `industrial` | `1` to return industrial-tagged boards only |
| `limit` | Page size, clamped to 1–200 (default 50) |
| `offset` | Page offset, clamped to 0–100000 |

Response: `{ ok, kind, version, total, matched, limit, offset, count, packs, items }`.
Returns `503` if the catalogue JSON is missing from the deployment.

### `GET /api/catalog/components`

Same pagination and response shape. Filters: `q`, `category`, `pack`,
`lifecycle`, `industrial`, `limit`, `offset`.

### `POST /api/generate-code`

Enhances a local sketch without changing the wiring.

Request (abridged):

```json
{
  "prompt": "Read the DHT22 every 10 s and show it on the OLED",
  "framework": "arduino",
  "board": {
    "id": "esp32-s3-devkitc-n16r8",
    "name": "ESP32-S3 DevKitC-1 N16R8",
    "chip": "ESP32-S3-WROOM-1",
    "family": "Espressif",
    "logicVoltage": 3.3,
    "adcBits": 12,
    "wifi": true
  },
  "components": [{ "id": "dht22", "name": "DHT22", "interfaces": ["OneWire"], "pins": ["DATA:onewire"] }],
  "wiring": { "status": "ready", "signals": 3, "connections": [], "warnings": [] },
  "localCode": "...deterministic sketch..."
}
```

Accepted frameworks: `arduino`, `micropython`, `esp-idf`, `python`,
`structured-text`.

Response: `{ ok, source, title, code, filename, explanation, libraries, framework, model, note }`.
If no provider is configured the endpoint returns `503` and the client keeps the
local sketch.

### `POST /api/generate-wiring`

Returns a safety review of the current plan. Without AI it still returns
deterministic risks and checks.

Response: `{ ok, source, summary, risks[], checks[], model?, note? }`.

### `POST /api/lookup-component`

Returns an AI-normalised component definition with validated pin roles.

```json
{ "query": "SHT31 temperature humidity breakout" }
```

Response: `{ ok, component, candidates, note }` or `{ ok: true, component: null, note }`
when no reliable match exists. Returns `503` when AI is not configured.

### `GET /api/health`

Provider status and endpoint list. Never requires secrets.

### Unknown routes

Any other `/api/*` path returns
`404 { ok: false, error: "Unknown API route…" }`.

---

## Data & persistence

- Projects, custom components and code history are stored in **IndexedDB**
  (`makerwire-ai` database) with a **localStorage mirror** and automatic
  fallback when IndexedDB is unavailable (private mode, older browsers).
- Project JSON can be exported and re-imported from the UI.
- A demo project is seeded on first launch and can be deleted.
- Nothing is sent to a server unless you explicitly use an AI action.

---

## Safety notes & limitations

MakerWire AI is a design assistant, not a certified electrical engineer.

- Always verify pinouts, voltage ratings and current limits against the
  manufacturer datasheet before applying power.
- Generated industrial entries are deliberately marked **datasheet review**;
  they are not vendor-verified pin maps.
- 3.3 V boards are not 5 V tolerant. Use a divider or level shifter for 5 V
  outputs (MQ-2, HC-SR04 ECHO, some GPS modules, etc.).
- Motors, servos, relays, LTE radios and 24 V field devices need adequate
  external supplies with a common reference. Do not power them from a board
  regulator.
- CAN and RS-485 need a transceiver or communication module, correct A/B or H/L
  polarity, 120 Ω termination at both trunk ends and a common reference. The
  wiring engine flags this explicitly when the controller lacks native pins.
- Relay, mains and safety projects: the generated code only switches logic or
  symbolic I/O. Mains wiring must be enclosed, fused and performed by a
  qualified electrician. Safety functions belong in hardware or a safety-rated
  controller, never only in standard application code.
- Camera (OV2640/DVP) support depends on the board and is flagged as a
  limitation in the local generators.
- ESP-IDF output is a scaffold: sensor drivers marked as managed components are
  intentionally not vendored, and I2C/UART/HTTP bring-up is provided so you can
  add them deliberately.
- AI output is reviewed but not guaranteed. The deterministic local sketch and
  wiring plan remain authoritative.

---

## Validation & testing

Validated in a clean Node 20 workspace with a full install:

```bash
npm run catalog:export       # 145 boards / 9 packs, 335 components / 11 packs, 0 duplicates
npm run typecheck            # app + generators: clean
npm run typecheck:functions  # Pages Functions: clean
npm run build                # production build: clean, per-pack chunks emitted
npx wrangler pages functions build   # Functions bundle: clean
```

Headless smoke harness results:

- **Wiring matrix** — 145 boards × 335 components = **48,575** single-component
  plans, all completed with finite connection counts.
- **Codegen sweep** — all **145 boards** with an Auto target: non-empty output,
  correct extension, no `undefined`/`NaN` injection.
- **Framework matrix** — Arduino `.ino`, MicroPython `.py`, ESP-IDF `.cpp`,
  Python `.py` and IEC 61131-3 `.st` all generated for their native boards.
- **Shared buses** — two I2C devices share the same SDA/SCL pins; the ESP32-S3
  demo plan is `ready`.
- **Logic/voltage checks** — a 3.3 V module on a 5 V Uno produces the expected
  danger warning; a 24 V Modbus node on a 1200 PLC gets a 24 V rail plus an
  RS-485 interface warning; a CANopen node on an ESP32 gets a CAN interface
  warning instead of fake board pins.
- **Pages Functions** — `/api/health`, both catalogue endpoints (search,
  industrial filter, pack filter, pagination, limit clamping), wiring review,
  `OPTIONS` (204 + CORS), validation errors (400), AI-less `503`, static asset
  serving, SPA fallback and JSON `404` for unknown API routes all verified
  locally with `wrangler pages dev`.

Suggested manual smoke test:

1. `npm run pages:dev`
2. Select **ESP32-S3 N16R8**, add **DHT22** and **SSD1306 OLED**.
3. Confirm the wiring guide and SVG show SDA→GPIO 8, SCL→GPIO 9.
4. Open **Code**, choose Arduino, generate, copy and download the `.ino`.
5. Switch to MicroPython and ESP-IDF and confirm framework-specific output.
6. Switch the board to a Linux SBC and a PLC; confirm Python and Structured Text
   become the native targets.
7. Try a 5 V module (relay) on a 3.3 V board and confirm the warning appears.
8. Add a Modbus RTU node to a PLC and confirm the RS-485 trunk warning.
9. Reload the page and confirm the project/code history persists.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `/api/*` returns 404 in `npm run dev` | Start the Functions runtime on port 8788 (see [Local development](#local-development)) or use `npm run pages:dev`. |
| Cloudflare build fails: **Missing entry-point to Worker script or to assets directory** | The deploy command is `wrangler deploy` (Workers) but this is a Pages project. Change it to `npx wrangler pages deploy dist --project-name makerwire-ai`, and make sure the build command is `npm run build` so `dist/` exists. |
| Catalogue API returns 503 | Run `npm run catalog:export` (or a full `npm run build`) so `dist/catalog/*.json` exists. |
| AI actions return 503 | No `AI` binding or `OPENAI_API_KEY`. Local generation still works. |
| `wrangler pages dev` fails with "non-interactive environment" | Run `npx wrangler login` first, or remove the `[ai]` block for a local-only session. |
| Workers AI binding missing in production | Add **Workers AI → variable `AI`** under Pages → Settings → Functions → Bindings, then redeploy. |
| `npm run build` fails on types | Run `npm run typecheck` and `npm run typecheck:functions` to isolate app vs. Functions errors. |
| Port 8788 already in use | `npx wrangler pages dev dist --port 8789` and update the Vite proxy target. |
| Old assets after deploy | `_headers` caches `/assets/*` immutably; Vite hashes filenames, so a fresh build produces new URLs. Hard-refresh if needed. |
| IndexedDB unavailable | The app automatically mirrors to localStorage; check browser storage permissions. |
| Pack load warning on boot | One or more lazy catalogue chunks failed; core boards/modules still work. Check the browser network tab and redeploy. |

---

## License

No license file is bundled. Add the license that fits your distribution before
publishing the project.
