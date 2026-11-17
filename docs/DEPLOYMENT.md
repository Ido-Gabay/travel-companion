# Deployment (zero-cost setup)

Status: development and testing only. Every service below is on a free plan.
**Nothing paid is enabled, and nothing paid should be enabled without the
owner's explicit approval.**

| Piece | Service | Plan |
| --- | --- | --- |
| API (NestJS) | Render web service, region Singapore | Free |
| Database, Auth, Storage | Supabase project `nmerwskzfceigcmedgxo`, region Singapore (ap-southeast-1) | Free |
| Source control, CI | GitHub (private repo), GitHub Actions | Free |
| Mobile app | Built locally with Xcode (free Apple ID) | Free |
| Domain | None. The API uses its `*.onrender.com` URL with Render's TLS. | — |

Facts below were checked on 2026-11-17 against the providers' pages. Plans
change; re-check the linked pages before relying on a number.

## How the API is deployed

- `render.yaml` (Render Blueprint) defines the service: free plan, Singapore,
  build and start commands, health check `/health`, and which env vars exist.
- Render watches the `main` branch and redeploys on every push that touches
  `apps/api`, `packages/shared`, the lockfile or the workspace config
  (`buildFilter`). Mobile-only commits don't trigger a deploy.
- GitHub Actions (`.github/workflows/ci.yml`) runs `pnpm test` and
  `pnpm typecheck` on every push. It doesn't block Render's deploy; check the
  green tick before relying on a deploy.
- Secrets (`DATABASE_URL`) and the project URL (`SUPABASE_URL`) are typed into
  the Render dashboard (`sync: false` in `render.yaml`). They are never in git.

## Free-tier limits and what they mean for us

### Render (Hobby workspace, Free web service)

| Limit | Effect on this app |
| --- | --- |
| Spins down after **15 minutes** without requests; the next request waits **about a minute** while it starts again. | First request after a quiet period is slow. The app pings `/health` on launch to start waking it, allows requests up to 75 s, and shows "waking up the server" after a few seconds of loading. |
| **750 free instance hours** per workspace per month. Spun-down time doesn't count. If used up, free services are **suspended until next month**. | One service running even 24/7 is ~720–744 h, so we stay under as long as it's the only free service. |
| **5 GB outbound bandwidth** per month on Hobby. Without a payment method, using it up **spins services down for the rest of the month** (no bill). | JSON responses are tiny; we're far below this. |
| **500 build pipeline minutes** per month on Hobby. | A deploy takes a few minutes; `buildFilter` skips unneeded deploys. |
| 512 MB RAM, 0.1 CPU. | Fine for a few users. Expect slower responses than on a paid instance. |
| Keeping a free service awake with a scheduled ping is discouraged by Render. | We don't do it. |
| A service's region can't be changed later. | Moving region = create a new service from the same `render.yaml` (minutes). |

**Possible costs:** none as long as no payment method is added to the Render
account. With a card on file, extra bandwidth is billed per GB and extra build
minutes can be bought; don't add a card without approval.

### Supabase (Free plan)

| Limit | Effect |
| --- | --- |
| **500 MB** database per project, shared CPU, 500 MB RAM. | Text-only trips and places use a tiny fraction. |
| **50,000** monthly active users. | Not a concern. |
| **5 GB** egress (+5 GB cached) per month, across database, auth and storage. | API ↔ database traffic counts; small. |
| **1 GB** file storage. | Photos (later) will need a plan; decide before building that. |
| **Paused after about a week with too little database activity.** Data and settings are kept; you get an email first; restore from the dashboard. | Use the app (or open the dashboard) at least every few days. After a pause the API's `/health/ready` fails until the project is restored. |
| 2 active free projects per account. | We use 1. |
| No backups you can restore yourself on Free. | Don't keep anything irreplaceable only here yet. |

**Possible costs:** none on the Free plan. Upgrading the organization to Pro is
a paid subscription; don't upgrade without approval.

### GitHub (Free for personal accounts)

- Unlimited private repositories.
- Actions on **private** repos use a monthly included allowance (GitHub now
  states it as **$12 of included compute per month** on GitHub Free; older docs
  said 2,000 minutes). Public repos use Actions for free.
- Usage beyond the allowance is billed only if a payment method is on file.
  If you ever add one, also create a **$0 budget with "Stop usage when budget
  limit is reached"** (Settings → Billing → Budgets).
- Our CI run takes a few minutes per push.

## Who can use the deployed API

Every route except the health checks needs a Supabase sign-in, and each user
only sees their own rows. But with sign-ups open, anyone who has the app (or
the public publishable key) can create an account. While testing, after your
own account exists, turn off **Authentication → Sign In / Providers → Allow new
users to sign up** in Supabase. There is no rate limiting yet.

## Region note

Supabase and Render are both in Singapore so the API's many small database
round trips stay fast. The phone talks to the API once per screen, so from
Israel or New York each request adds roughly one long-distance round trip.
Moving both to Frankfurt (or US East) later means: new Supabase project in the
new region → `supabase link` + `db push --remote` → new Render service from the
same `render.yaml` with `region:` changed → update the app's URLs. No code changes.

## Migrating off Render later (Railway, Cloud Run)

The API needs only:

- Node 24, pnpm (via Corepack)
- Build: `pnpm install --frozen-lockfile --filter "@travel-companion/api..." && pnpm --filter @travel-companion/shared build && pnpm --filter @travel-companion/api build`
- Start: `node apps/api/dist/main.js` from the repo root
- Env: `SUPABASE_URL`, `DATABASE_URL`, `DATABASE_SSL`, `DATABASE_POOL_MAX`; it listens on `PORT` (set by every host)
- Health checks: `GET /health` (liveness), `GET /health/ready` (database)

It keeps no local state, so any host that runs a Node process works.

## First-time setup

1. **Put the code on GitHub** (private repo). See README → "Deploy the API".
2. **Render:** sign up with GitHub (no card needed) → **New → Blueprint** →
   pick the repo. Render reads `render.yaml` and asks for `SUPABASE_URL` and
   `DATABASE_URL`. Use the same values as `apps/api/.env`.
3. Wait for the first deploy (several minutes), then open
   `https://<service>.onrender.com/health/ready`. It should answer
   `{"status":"ok","database":"ok"}`.
4. `API_URL=https://<service>.onrender.com pnpm smoke:api` checks the deployed
   API end to end.
5. Point the app at it: `pnpm setup:mobile` and enter the Render URL as the
   API URL, then restart Metro with `pnpm dev:mobile --clear`.

## Sources

- [Render: Deploy for Free](https://render.com/docs/free)
- [Render FAQ](https://render.com/docs/faq)
- [Render pricing](https://render.com/pricing)
- [Render regions](https://render.com/docs/regions)
- [Render: setting your Node.js version](https://render.com/docs/node-version)
- [Supabase pricing](https://supabase.com/pricing)
- [Supabase: free project pausing](https://supabase.com/kb/faqs/platform/free-project-pausing)
- [Supabase: billing](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [GitHub: product usage included with each plan](https://docs.github.com/en/billing/reference/product-usage-included)
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
