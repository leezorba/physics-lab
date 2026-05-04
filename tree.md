# Physics Lab — Codebase Structure

```
physics-lab/
├── .gitignore
├── AGENTS.md                   # Agent/contributor instructions
├── CLAUDE.md                   # Claude Code project instructions
├── README.md                   # Project overview
├── ROADMAP.md                  # Planned features / direction
├── package.json                # npm config (deps, scripts)
├── package-lock.json
├── server.js                   # Static file server (7 lines)
└── public/                     # Served web root
    ├── index.html              # Landing page / lab index (105 lines)
    ├── shared/
    │   └── lab.css             # Shared styles across labs (900 lines)
    ├── astro/
    │   └── rocket.html         # Astro lab: rocket simulation (1,251 lines)
    └── mech/
        └── friction.html       # Mechanics lab: friction sim (1,439 lines)
```

## Notes
- **Stack:** plain HTML/CSS/JS frontend served by a tiny Node.js static server (`server.js`).
- **No build step** — files in `public/` are served as-is.
- **Lab pages are self-contained** single-file HTML (inline JS + per-lab styles), sharing only `public/shared/lab.css`.
- **Conventions:** labs are organized by physics topic folder (`astro/`, `mech/`, …). Adding a new lab = new HTML file under the appropriate topic folder.
- `node_modules/` exists but is not tracked / not shown above.
```
