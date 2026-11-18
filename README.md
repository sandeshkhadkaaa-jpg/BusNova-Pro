# BusNova Pro 🚌

**A GitHub Pages-ready interactive bus reservation college demo** featuring C17 booking logic compiled to WebAssembly, a 2D seat map and a navigable 3D bus using Three.js.

## What works

- 4 sample routes across Nepal and a browser-local route management demo.
- 32 standard seats and 4 rear sleeper berths, mapped to both 2D and 3D views.
- Walk inside the bus using **W/S** to move, **A/D** to strafe and **←/→** to turn; click a 3D seat to select it.
- Passenger details, travel date, departure time, fare calculation, unique reservation number, printable demo ticket and cancellation.
- Reservation records saved via browser `localStorage` and rehydrated into the **C WebAssembly** seat engine when selecting a trip or reloading.
- No SQLite, MSYS2, GCC, VS Code, or other software needed **on your computer to deploy** when using GitHub Actions.

## Deploy using GitHub only (no local installation)

1. Sign in to GitHub and create a **public repository** named `BusNova-Pro` (leave initialization unchecked).
2. In the repository, click **Add file → Upload files**. Upload everything from the project folder, including `.github/workflows/deploy.yml`. **Important:** GitHub's browser upload may not include hidden folders automatically; use **Add file → Create new file** and enter `.github/workflows/deploy.yml`, then paste the workflow content if needed. Alternatively upload files using the GitHub web editor.
3. Commit the files to the `main` branch.
4. Open **Settings → Pages → Build and deployment → Source → GitHub Actions**.
5. Open **Actions** and allow the `Build C WebAssembly and deploy GitHub Pages` workflow to finish successfully. If a workflow has not started, use **Actions → Build C WebAssembly and deploy GitHub Pages → Run workflow**.
6. Visit `https://YOUR-USERNAME.github.io/BusNova-Pro/`.

The workflow installs Emscripten in GitHub's runner, compiles `src/booking.c` into `booking.wasm`, and deploys all the static files through GitHub Pages. None of those developer tools have to be installed on your own laptop.

### Important: the browser-upload ZIP trap

**Do not upload only `BusNova-Pro.zip` to a repository.** GitHub Pages will not unpack the ZIP into a website. Upload the **extracted files** at the repository root, including `index.html`, `app.js`, `styles.css`, `src/booking.c`, and `.github/workflows/deploy.yml`.

## Running locally without a C compiler

You can preview the site using a local static HTTP server (e.g., an editor's Live Server or Python's `python -m http.server` if already available). If `booking.wasm` is absent, the app automatically uses a JavaScript seat-engine fallback **for preview only**. Opening the page with `file://` is not supported for 3D module imports or WebAssembly.

## Important limitations

This is a **college demonstration**, not a ticket-selling production application.

- GitHub Pages hosts static files only; it does **not** provide a server-side database, an API server, or real payment processing.
- Reservations are saved only inside the current browser profile and are **not synchronized across users/devices**. Two visitors can choose the same seat because they each have independent local demo data. There is no real-time global seat-locking system.
- The demo admin dashboard is unprotected and should **not** be used for real passenger records.
- The payment options are labels for simulation; they do not accept funds.
- Do not enter real personal data; stored data is available to anyone who can access this browser profile.
- A network connection is needed to load Three.js and hosted fonts. For production hosting, pin and self-host your frontend dependencies.

## Technical structure

```text
BusNova-Pro/
├── index.html                 Main multi-page dashboard
├── styles.css                 Responsive design
├── app.js                     UI, 2D/3D interactions and storage
├── src/
│   └── booking.c              C17 reservation state machine
├── assets/
│   └── logo.svg               Custom icon
└── .github/
    └── workflows/
        └── deploy.yml         WebAssembly build + GitHub Pages deployment
```

### C integration details

The browser fetches `booking.wasm` and calls exported C functions `bn_reset`, `bn_status`, `bn_import`, `bn_reserve`, `bn_cancel`, and `bn_available`. JavaScript manages the UI, route context and local persistence. The C module validates seat status transitions for the currently active trip. The GitHub workflow provides the C-to-WASM build, using Emscripten's standalone WebAssembly output.

## Troubleshooting

- **The site displays JS fallback:** Confirm Actions completed successfully and `booking.wasm` was included in the Pages artifact.
- **3D view fails:** Check browser internet access; Three.js loads from a CDN.
- **Site gives 404:** Confirm `index.html` is in the repository root, the Pages source is **GitHub Actions**, and the deployment workflow succeeded.
- **Deploy workflow missing:** Check that `.github/workflows/deploy.yml` exists exactly at that path on `main`.
