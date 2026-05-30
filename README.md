# Linear Clone

A small, self-hosted issue tracker inspired by Linear. No React, no build step — just Express, SQLite, and vanilla JavaScript in the browser.

The idea is to keep things simple enough to read in an afternoon, but real enough to actually track work: teams, issues with statuses and priorities, labels, comments, and basic member management.

## Quick start

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). Sign up with an email and password — that automatically creates your first team (named something like "Ada Lovelace's Team") with a short identifier derived from your name.

To wipe the database and start fresh:

```bash
npm run reset-db
```

Stop the server first if you get a "file is busy" error — SQLite keeps the file open while the app is running.

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Server | Express 4 | Straightforward routing, JSON APIs, static file serving |
| Database | SQLite via `better-sqlite3` | Zero config, synchronous queries, fine for a single-user or small-team app |
| Auth | JWT + bcrypt | Stateless tokens in `localStorage`, passwords hashed with bcrypt |
| Frontend | Plain HTML/CSS/JS | One page, client-side rendering, no bundler |

Icons come from [Lucide](https://lucide.dev/) loaded from a CDN.

## How it's put together

```
linear_clone/
├── server.js              # Express entry point
├── middleware/auth.js     # JWT verification
├── routes/
│   ├── auth.js            # Register, login, profile, delete account
│   ├── team.js            # Teams, members, labels
│   └── issues.js          # Issues, labels on issues, comments
├── db/
│   ├── database.js        # Schema creation + db connection
│   └── helpers.js         # Team creation, membership checks
├── public/
│   ├── index.html         # Single-page shell
│   ├── css/styles.css
│   └── js/
│       ├── main.js        # Auth, state, shared helpers
│       ├── sidebar.js     # Team switcher, nav, filters
│       ├── issues.js      # Issue list + detail panel
│       └── team.js        # Team settings, members
└── scripts/reset-db.js    # Delete db files and re-run migrations
```

On startup, `database.js` creates all tables if they don't exist (idempotent migrations). The SQLite file lands at `db/data.db` by default, with WAL mode and foreign keys enabled.

The frontend is a single HTML page with two modes: an auth screen and the main app. JavaScript modules share a global `State` object (current user, teams, active team, filters). Views re-render by swapping inner HTML — no virtual DOM, no framework.

## Authentication

Registration and login return a JWT valid for 30 days. The client stores it in `localStorage` and sends it on every API call:

```
Authorization: Bearer <token>
```

Protected routes use the `requireAuth` middleware, which decodes the token and attaches `{ userId, email }` to `req.user`. A 401 clears the token and sends you back to the login screen.

When you register, the server also creates a default team and makes you the owner. New teams get four starter labels: Bug, Feature, Improvement, and Chore.

## Data model

**Users** have name, email, and a bcrypt password hash.

**Teams** belong to a creator and have a unique short `identifier` (e.g. `ENG`, `ADA`) used in issue keys like `ENG-42`. Identifiers are auto-generated from the team name, with a numeric suffix if there's a collision.

**Team members** have a role: `owner` or `member`. Only owners can add/remove members and create labels.

**Issues** are scoped to a team. Each team has its own incrementing issue number. Statuses: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `cancelled`. Priorities: `urgent`, `high`, `medium`, `low`, `none`.

**Labels** are per-team. Issues and labels connect through a join table.

**Comments** belong to an issue and track the author.

Deleting a user cascades to their teams (if they created them) and membership rows. Removing a team member clears them as assignee on that team's open issues.

## API overview

All routes under `/api` except auth registration/login require a valid JWT.

### Auth — `/api/auth`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Create account + default team |
| POST | `/login` | Returns token |
| GET | `/me` | Current user profile |
| DELETE | `/account` | Delete your account |

### Teams — `/api/teams`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Teams you're a member of (includes members list) |
| POST | `/` | Create a new team |
| GET | `/:teamId/members` | List members |
| POST | `/:teamId/members` | Add member by email (owner only) |
| DELETE | `/:teamId/members/:userId` | Remove member (owner only) |
| GET | `/:teamId/labels` | List labels |
| POST | `/:teamId/labels` | Create label (owner only) |

### Issues — `/api`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/teams/:teamId/issues` | List issues; query params: `status`, `priority`, `labelId`, `assignee` (`me` or `unassigned` or user id) |
| POST | `/teams/:teamId/issues` | Create issue |
| GET | `/issues/:id` | Issue detail with comments |
| PATCH | `/issues/:id` | Update title, description, status, priority, assignee |
| DELETE | `/issues/:id` | Delete issue |
| POST | `/issues/:id/labels` | Attach label |
| DELETE | `/issues/:id/labels/:labelId` | Detach label |
| GET | `/issues/:id/comments` | List comments |
| POST | `/issues/:id/comments` | Add comment |

Issue responses include hydrated fields: `key` (e.g. `ENG-3`), `labels`, `assignee` with initials, and optionally `comments`.

Access control is team-based: you can only read or modify issues on teams you're a member of.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP port |
| `JWT_SECRET` | `change-this-secret` | Token signing key — set this in production |
| `DB_PATH` | `db/data.db` | SQLite file location |

## What this isn't

This is a learning project / lightweight clone, not a production Linear replacement. There's no real-time sync, no email invites, no file attachments, no cycles or roadmaps, and no rate limiting. The default JWT secret is intentionally obvious so you remember to change it.

If you want to extend it, the codebase is small enough that adding webhooks, search, or a proper migration system wouldn't require untangling much.

## License

MIT
