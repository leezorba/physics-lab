# Physics Lab — Codebase Structure

```
physics-lab/
├── .gitignore
├── AGENTS.md                         # Agent/contributor instructions (146 lines)
├── CLAUDE.md                         # Claude Code imports AGENTS.md
├── README.md                         # Project overview and routes (56 lines)
├── ROADMAP.md                        # Shipped versions / direction (176 lines)
├── V3_SPEC.md                        # Solar System simulator spec (463 lines)
├── docs/
│   ├── solar-ui-lessons.md           # Solar-specific UX lessons (91 lines)
│   ├── friction-ui-lessons.md        # Friction-specific UX lessons (67 lines)
│   ├── rocket-ui-lessons.md          # Rocket-specific UX lessons (83 lines)
│   └── solar-v3-1-capture-return-plan.md # V3.1 capture/return continuity plan (242 lines)
├── package.json                      # npm config (16 lines)
├── package-lock.json
├── server.js                         # Static file server (7 lines)
└── public/                           # Served web root
    ├── index.html                    # Lab homepage / shelves (154 lines)
    ├── shared/
    │   ├── lab.css                   # Shared visual system (1,076 lines)
    │   ├── orbital.js                # V3 orbital physics + mission planner (1,539 lines)
    │   ├── orbital.test.html         # Stage 3a browser tests (935 lines)
    │   └── orbital.mission.test.html # Stage 3b browser tests (742 lines)
    ├── astro/
    │   ├── rocket.html               # Astro lab: rocket ascent sim (1,402 lines)
    │   └── solar.html                # Astro lab: solar mission sim (2,186 lines)
    └── mech/
        └── friction.html             # Mechanics lab: friction sim (1,819 lines)
```

## Notes

- **Stack:** plain HTML/CSS/JS frontend served by a tiny Node.js static server (`server.js`).
- **No build step** — files in `public/` are served as-is.
- **Lab pages are self-contained** single-file HTML (inline JS + per-lab styles), sharing only `public/shared/lab.css`.
- **V3 shared physics:** `public/shared/orbital.js` is the only shared simulator logic module. Do not modify it for UI-only Solar work.
- **Focused docs:** put transferable lessons and implementation notes under `docs/` instead of overloading `ROADMAP.md`.
- `node_modules/`, `.git/`, `.DS_Store`, and other generated/local files are not shown above.
