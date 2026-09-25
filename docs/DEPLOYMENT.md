# Deployment

The app is a static PWA after build. You can run it locally, expose it on a trusted LAN for testing, publish it to a free static host, or self-host it in a container.

## Requirements

- Node.js `22.12+` recommended. The installed Vite version also supports `20.19+`.
- npm.
- Git, if you are cloning/publishing the repository.
- Docker or Podman, only if you want container self-hosting.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

The Vite development server favors fast source updates and this project does not enable its production service worker there. Test installation with a production build:

```bash
npm run build
npm run preview
```

Open the localhost URL printed by Vite, reload once if necessary, then use Chrome/Edge's address-bar install icon or browser menu. On supported macOS Safari versions use **File -> Add to Dock**. For a phone, use the deployed HTTPS site; a phone opening `http://YOUR_IP:5173` is not `localhost` and most browsers will not treat that LAN HTTP origin as installable.

Run checks:

```bash
npm test
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Phone and laptop access on the same network

Start the dev server on all interfaces:

```bash
npm run dev -- --host 0.0.0.0
```

Find your local IP address.

macOS:

```bash
ipconfig getifaddr en0
```

Linux:

```bash
hostname -I
```

Windows PowerShell:

```powershell
ipconfig
```

Open `http://YOUR_IP:5173` on the second device.

Use this for development only. Local network HTTP is not the same as a production HTTPS deployment. For installable PWA behavior, MDN says the app must be served over HTTPS or from `localhost` / `127.0.0.1`: <https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable>.

## GitHub Pages

This repo includes `.github/workflows/deploy-pages.yml`. After you push to GitHub:

1. Open the repository on GitHub.
2. Go to Settings -> Pages.
3. Set Source to GitHub Actions.
4. Do **not** select or configure the suggested Jekyll or Static HTML workflows. This repository already contains `.github/workflows/deploy-pages.yml` and needs its Vite build step.
5. Push this workflow and the application to `main`, or open Actions -> Deploy GitHub Pages -> Run workflow if it is already pushed.
6. Open Actions and wait for both the `build` and `deploy` jobs to succeed. The Pages settings screen will then show the deployed URL.

The workflow runs tests, builds the PWA, uploads `dist/`, and deploys it to Pages. It also handles the base path difference between `owner.github.io` repositories and normal project repositories.

Optional auth variables can be added as repository variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

These values are public frontend configuration. Do not add service-role keys, OAuth client secrets, SMTP passwords, or SMS provider credentials to frontend build variables.

Add them at **Repository -> Settings -> Secrets and variables -> Actions -> Variables -> New repository variable**. They are injected when GitHub Actions builds the frontend, so changing one requires another deployment. Every visitor receives the same public project URL and publishable key; individual identity and access come from the user's Supabase session, not from hiding this key.

## Cloudflare Pages

Create a Pages project from the GitHub repository and use:

- Build command: `npm ci && npm run build`
- Build output directory: `dist`
- Node.js version: `22`

Optional auth variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Cloudflare Pages gives you an HTTPS URL, so PWA install support is much closer to real user behavior than LAN HTTP.

## Static hosting

Build once:

```bash
npm ci
npm run build
```

Upload the contents of `dist/` to any static host.

The host must route unknown paths back to `index.html` for SPA navigation. Also avoid long caching for `index.html`, `manifest.webmanifest`, and the service worker. Fingerprinted JS/CSS assets can be cached aggressively.

## Container self-hosting

Build and run with Docker:

```bash
docker build -t open-request-workbench .
docker run --rm -p 8080:8080 open-request-workbench
```

Open `http://localhost:8080`.

With optional auth:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY \
  -t open-request-workbench .
```

Docker Compose:

```bash
docker compose up --build
```

For real public hosting, put the container behind HTTPS through your reverse proxy, Caddy, Nginx, Traefik, Cloudflare Tunnel, or your host platform's TLS feature.

## Data model expectation

Hosting the frontend does not create a shared backend. Each browser profile keeps its own local data. A future sync service should encrypt workspace content on the client before upload.

## Free hosting reality

Free static hosting is enough for the current app. Mandatory cost appears only when you add services that have ongoing delivery or abuse costs, such as reliable public SMS OTP, custom email at scale, managed databases beyond free quotas, or custom domains after registrar promotions expire.
