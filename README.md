# charanjitsingh.ca

Source for my personal portfolio site: **[charanjitsingh.ca](https://charanjitsingh.ca)**.

I'm an SDET / Senior QA Automation Engineer in Toronto (GTA). The site covers my experience, projects, certifications and writing on test automation.

## Pages

| Page | Contents |
|---|---|
| `index.html` | Home, with an animated "regression suite" terminal intro |
| `about.html` | Background, technical toolbox and work history |
| `projects.html` | Selected automation projects |
| `certifications.html` | QA, automation and AI/agentic tooling certifications |
| `blog.html` | Articles on test automation |
| `contact.html` | Ways to get in touch |

## Tech

Plain HTML, CSS and vanilla JavaScript. No build step and no framework.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## GitHub project sync

The **From GitHub** section on `projects.html` is generated from my public repositories by `scripts/sync-projects.mjs`. The script only writes between the `<!-- AUTO-PROJECTS:START -->` and `<!-- AUTO-PROJECTS:END -->` markers and to `data/projects.json`. It refuses to run if anything outside the markers would change, so the hand-written project cards and every other page are never touched.

### How it runs

`.github/workflows/sync-projects.yml` runs every Sunday at 06:00 UTC and on demand (Actions → **Sync GitHub projects** → **Run workflow**, with an optional **Dry run** checkbox). When something changed, it commits to the `auto/sync-projects` branch and opens or updates a pull request listing added, updated, highlighted and skipped repos. Nothing is pushed to `main` until I merge the PR. If nothing changed, it exits without a commit.

One-time setup: **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests** must be enabled.

### Run it locally

```bash
node scripts/sync-projects.mjs --dry-run   # show what would change
node scripts/sync-projects.mjs             # write projects.html and data/projects.json
```

Needs Node 18+. Set `GITHUB_TOKEN` to avoid API rate limits (optional).

### Pin, hide or feature a repo

Edit `data/projects.config.json`:

| Key | Effect |
|---|---|
| `pinned` | Shown first, in this order |
| `featured` | Gets the green **Featured** badge and sorts next. Repos with a `featured` or `portfolio` topic count too |
| `hidden` | Never shown. All repos that existed before the sync was set up are listed here, so only new repos appear automatically |
| `custom` | Per-repo `title`, `description`, `tags` and `demo` link. My text always wins over GitHub's |
| `settings` | `activeDays` (default 60) for the amber **Active** badge, `starHighlight`, and whether to exclude forks and archived repos |

Order on the page: pinned → featured → active or popular → most recently pushed. Forks, archived repos and this website repo are always skipped.
