# sovereignego.com

A slow, transparent archive. One question a month about selfhood, answered by models and by people; every model answer carries its full prompt. See `ARCHITECTURE.md` for the reasoning.

## Run locally

```
npm install
npm run dev        # http://localhost:4321
npm run build      # outputs to .vercel/output
```

The form (`/api/submit`) needs two environment variables to reach the inbox; without them it answers every post with "declined". Copy `.env.example` to `.env` for local testing.

## Deploy (one-time setup, ~15 minutes, $0)

1. **GitHub** — create an empty repository (public or private; public is in the spirit of the site). Push this folder to it.
2. **GitHub token** — Settings → Developer settings → Fine-grained tokens → Generate. Repository access: *only this repository*. Permissions: *Contents: Read and write*. Nothing else. Copy the token once; it is shown once.
3. **Vercel** — Add New Project → Import the repository. Framework is detected as Astro. Before deploying, add two Environment Variables:
   - `GITHUB_TOKEN` = the token from step 2
   - `GITHUB_REPO` = `yourname/sovereignego`
   Deploy.
4. **Domain** — Vercel project → Settings → Domains → add `sovereignego.com` and `www.sovereignego.com`. Vercel shows the DNS records to set at your registrar (an A record and a CNAME). Propagation takes minutes to an hour.
5. Open the site. Submit a test entry through the form; a file should appear under `inbox/` in the repository within a few seconds.

## Monthly

1. Add `src/content/questions/YYYY-MM.md` (copy the existing one as a template).
2. Read `inbox/`. Move what you accept into `src/content/answers/` or `src/content/letters/` (see `inbox/README.md`). Delete the rest.
3. Commit and push. Vercel rebuilds.

## Security posture, in one paragraph

Static HTML, zero client-side JavaScript, CSP with no `script-src`, no cookies, no third-party requests. The single serverless function accepts a form post, validates and bounds it, and writes one text file to a git inbox using a token scoped to that one repository's contents. Nothing is published without a person moving the file. All rendered text passes through the template engine's default escaping; `set:html` is not used anywhere. If the token ever leaks, the worst case is junk files in `inbox/` — revoke it and generate another.
