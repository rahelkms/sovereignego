import type { APIRoute } from 'astro';

export const prerender = false;

// ---------------------------------------------------------------------------
// The only write path on the site.
//
// HTML form → this function → one new file in `inbox/` of the GitHub repo.
// Nothing is published; a person moves inbox files into src/content by hand.
//
// Defences, in order of cheapness:
//   1. method / content-type / size gate
//   2. honeypot field must be empty
//   3. hard length limits per field, control characters stripped
//   4. model-authored text must carry a prompt and settings
//   5. best-effort per-IP rate limit (in-memory; resets on cold start)
//   6. inbox size cap (refuse when the folder is already large)
//   7. GitHub token comes from env only and never leaves this function
// ---------------------------------------------------------------------------

const LIMITS = {
  body: 4000,
  prompt: 12000,
  model: 80,
  sampling: 200,
  about: 80,
  submitted_by: 40,
  lang: 8,
  question: 7, // YYYY-MM
  replies_to: 12,
  totalBytes: 24_000,
};

const RATE = { windowMs: 10 * 60_000, max: 3 }; // 3 per 10 min per IP
const INBOX_MAX = 300;

const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < RATE.windowMs);
  if (arr.length >= RATE.max) return true;
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear(); // crude memory bound
  return false;
}

// Keep tabs/newlines, drop every other control character and the Unicode
// line/paragraph separators that can confuse YAML/Markdown renderers.
function clean(s: string, max: number): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, max);
}

function decline(reason: string) {
  // The reason is logged server-side only; the visitor gets a generic page.
  console.warn('[submit] declined:', reason);
  return new Response(null, { status: 303, headers: { Location: '/declined' } });
}

// YAML block scalar: safe for arbitrary text because every line is indented
// under a literal `|` and no line can escape the block.
function yamlBlock(key: string, value: string): string {
  const lines = value.split('\n').map((l) => '  ' + l);
  return `${key}: |\n${lines.join('\n')}`;
}
function yamlStr(key: string, value: string): string {
  return `${key}: ${JSON.stringify(value)}`;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded') {
    return decline('content-type');
  }
  const len = Number(request.headers.get('content-length') ?? 0);
  if (len > LIMITS.totalBytes) return decline('too large');

  const token = import.meta.env.GITHUB_TOKEN as string | undefined;
  const repo = import.meta.env.GITHUB_REPO as string | undefined; // "owner/name"
  if (!token || !repo) return decline('inbox not configured');

  const form = await request.formData();
  const get = (k: string) => String(form.get(k) ?? '');

  if (get('website') !== '') return decline('honeypot');

  const ip = clientAddress || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) return decline('rate');

  const kind = get('kind') === 'letter' ? 'letter' : 'answer';
  const authorKind = get('author_kind') === 'model' ? 'model' : 'human';
  const body = clean(get('body'), LIMITS.body);
  if (body.length < 20) return decline('body too short');

  const question = clean(get('question'), LIMITS.question);
  if (kind === 'answer' && !/^\d{4}-\d{2}$/.test(question)) return decline('bad question id');

  const repliesTo = clean(get('replies_to'), LIMITS.replies_to);
  if (repliesTo && !/^[a-z0-9-]+$/.test(repliesTo)) return decline('bad replies_to');

  const lang = clean(get('lang'), LIMITS.lang).toLowerCase() || 'en';
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,4})?$/.test(lang)) return decline('bad lang');

  const submittedBy = clean(get('submitted_by'), LIMITS.submitted_by) || 'anonymous';
  const about = clean(get('about'), LIMITS.about);

  let model = '', sampling = '', prompt = '';
  if (authorKind === 'model') {
    model = clean(get('model'), LIMITS.model);
    sampling = clean(get('sampling'), LIMITS.sampling);
    prompt = clean(get('prompt'), LIMITS.prompt);
    if (!model || !sampling || prompt.length < 10) return decline('model answer without disclosure');
  }

  // --- Compose the inbox file -------------------------------------------
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const rand = Math.random().toString(36).slice(2, 8);
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const filename = `inbox/${stamp}-${kind}-${authorKind}-${rand}.md`;

  const fm: string[] = ['---'];
  fm.push(yamlStr('kind', kind));
  if (kind === 'answer') fm.push(yamlStr('question', question));
  if (kind === 'letter' && repliesTo) fm.push(yamlStr('replies_to', repliesTo));
  fm.push(yamlStr('author_kind', authorKind));
  if (authorKind === 'model') {
    fm.push(yamlStr('model', model));
    fm.push(yamlStr('sampling', sampling));
    fm.push(yamlBlock('prompt', prompt));
  } else if (about) {
    fm.push(yamlStr('about', about));
  }
  fm.push(yamlStr('submitted_by', submittedBy));
  fm.push(yamlStr('lang', lang));
  fm.push(`date: ${date}`);
  fm.push('---', '', body, '');
  const content = fm.join('\n');

  // --- Inbox size cap -----------------------------------------------------
  const gh = (path: string, init?: RequestInit) =>
    fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'sovereignego-inbox',
        ...(init?.headers ?? {}),
      },
    });

  try {
    const list = await gh('inbox');
    if (list.ok) {
      const items = (await list.json()) as unknown[];
      if (Array.isArray(items) && items.length >= INBOX_MAX) return decline('inbox full');
    } else if (list.status !== 404) {
      return decline(`inbox list ${list.status}`);
    }

    const put = await gh(filename, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `inbox: ${kind} (${authorKind}) via form`,
        content: Buffer.from(content, 'utf8').toString('base64'),
      }),
    });
    if (!put.ok) return decline(`github put ${put.status}`);
  } catch (e) {
    return decline(`github error ${(e as Error).message}`);
  }

  return new Response(null, { status: 303, headers: { Location: '/submitted' } });
};

// Anything but POST gets sent to the form.
export const GET: APIRoute = () => new Response(null, { status: 303, headers: { Location: '/submit' } });
