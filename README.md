# Physics Lab

A single Railway-deployable service for interactive physics simulators.

## Included Labs

- **Astrophysics:** Cross-Planet Rocket Ascent (`/astro/rocket.html`)
- **Mechanics:** Friction Lab (`/mech/friction.html`)

The original source projects remain untouched:

- `/Users/hwalee/Desktop/rocket-sim/`
- `/Users/hwalee/Desktop/friction-lab/`

## Local Testing

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Health check:

```bash
curl http://localhost:3000/health
```

## Railway Deploy

Railway can deploy this project directly:

1. Push this folder to a GitHub repo.
2. Create a Railway project from that repo.
3. Railway runs `npm install`, then `npm start`.
4. `server.js` listens on `process.env.PORT` or `3000` locally.

## Project Shape

- No build step.
- No React or bundler.
- Express serves the static `public/` tree.
- Shared visual system lives in `public/shared/lab.css`.
- Each simulator keeps its JavaScript inline so reviewed physics stays local to the page.
