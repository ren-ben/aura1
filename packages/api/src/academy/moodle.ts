// univie Moodle, reached the way its own app reaches it: weblogin
// (Shibboleth) once for a token, then the web services. The flashcard
// plugin's card lists are only on its pages, read through a browser session
// the app token buys. docs/superpowers/specs/2026-10-04-folios-design.md
export const MOODLE = 'https://moodle.univie.ac.at';
export type Http = (url: string, init?: RequestInit) => Promise<Response>;

export class MoodleError extends Error {}
// Moodle no longer takes the token: the link is broken, not the request.
export class Refused extends MoodleError {}

const AGENT = 'Mozilla/5.0 (AURA-1) MoodleMobile';
const unescape = (s: string) => s.replace(/&#x3a;/gi, ':').replace(/&#x2f;/gi, '/').replace(/&#x3d;/gi, '=').replace(/&amp;/g, '&');

// A page's first form as a browser would send it: hidden fields kept,
// unticked boxes left out, the username and password filled in.
export function formOf(html: string, user: string, pass: string): { action: string; fields: URLSearchParams; login: boolean } | null {
  const form = html.match(/<form[^>]*action="([^"]*)"[^>]*>([\s\S]*?)<\/form>/i);
  if (!form) return null;
  const fields = new URLSearchParams();
  let login = false;
  for (const [tag] of form[2]!.matchAll(/<(?:input|button)[^>]*>/gi)) {
    const name = tag.match(/name="([^"]*)"/)?.[1];
    if (!name) continue;
    const type = tag.match(/type="([^"]*)"/)?.[1]?.toLowerCase();
    if ((type === 'checkbox' || type === 'radio') && !/checked/.test(tag)) continue;
    if (type === 'password') { fields.set(name, pass); login = true; } else if (/user/i.test(name) && type !== 'hidden') fields.set(name, user);
    else fields.set(name, unescape(tag.match(/value="([^"]*)"/)?.[1] ?? ''));
  }
  if (form[2]!.includes('_eventId_proceed') && !fields.has('_eventId_proceed')) fields.set('_eventId_proceed', '');
  return { action: unescape(form[1]!), fields, login };
}

// The app's login: launch.php sends us to weblogin, its forms are filled,
// and Moodle answers with moodlemobile://token=base64(sig:::token:::private).
// The password is sent once; a login form shown twice means it was refused.
export async function login(http: Http, user: string, pass: string, service: string): Promise<{ token: string; privateToken: string | null }> {
  const jars = new Map<string, Map<string, string>>();
  const cookies = (u: string) => [...(jars.get(new URL(u).host) ?? [])].map(([k, v]) => `${k}=${v}`).join('; ');
  let url = `${MOODLE}/admin/tool/mobile/launch.php?service=${service}&passport=${Math.floor(Math.random() * 1e9)}&urlscheme=moodlemobile`;
  let init: RequestInit = {};
  let logins = 0;
  for (let step = 0; step < 16; step++) {
    const res = await http(url, { ...init, redirect: 'manual', headers: { ...(init.headers as Record<string, string> ?? {}), cookie: cookies(url), 'User-Agent': AGENT } });
    const jar = jars.get(new URL(url).host) ?? new Map<string, string>();
    for (const c of res.headers.getSetCookie()) { const kv = c.split(';')[0]!; const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    jars.set(new URL(url).host, jar);
    const loc = res.headers.get('location');
    if (loc?.startsWith('moodlemobile://token=')) {
      const [, token, priv] = Buffer.from(loc.slice('moodlemobile://token='.length), 'base64').toString().split(':::');
      if (!token) break;
      return { token, privateToken: priv || null };
    }
    if (loc) { url = new URL(loc, url).href; init = {}; continue; }
    const form = formOf(await res.text(), user, pass);
    if (!form) break;
    if (form.login && ++logins > 1) throw new MoodleError('weblogin refused the u:account ID or password');
    url = new URL(form.action, url).href;
    init = { method: 'POST', body: form.fields, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
  }
  throw new MoodleError(`weblogin did not hand back a token for ${service}`);
}

// One web service call. Arrays and objects go as Moodle wants them:
// courseids[0]=..., options[0][name]=...
export async function ws<T>(http: Http, token: string, fn: string, params: Record<string, unknown> = {}): Promise<T> {
  const body = new URLSearchParams({ wstoken: token, wsfunction: fn, moodlewsrestformat: 'json' });
  const flat = (p: Record<string, unknown>, pre = '') => {
    for (const [k, v] of Object.entries(p)) {
      const key = pre ? `${pre}[${k}]` : k;
      if (v && typeof v === 'object') flat(v as Record<string, unknown>, key); else body.append(key, String(v));
    }
  };
  flat(params);
  const res = await http(`${MOODLE}/webservice/rest/server.php`, { method: 'POST', body, headers: { 'User-Agent': AGENT } });
  const json = await res.json() as T & { errorcode?: string; message?: string };
  if (json && typeof json === 'object' && 'errorcode' in json && json.errorcode) {
    if (json.errorcode === 'invalidtoken' || json.errorcode === 'accessexception') throw new Refused(json.message ?? json.errorcode);
    throw new MoodleError(json.message ?? json.errorcode);
  }
  return json;
}

// A browser session, bought with the private token (Moodle sells one every
// six minutes): the session cookie, for the plugin's own pages.
export async function session(http: Http, token: string, privateToken: string, userId: number): Promise<string> {
  const key = await ws<{ key: string; autologinurl: string }>(http, token, 'tool_mobile_get_autologin_key', { privatetoken: privateToken });
  const res = await http(key.autologinurl, {
    method: 'POST', redirect: 'manual', headers: { 'User-Agent': AGENT },
    body: new URLSearchParams({ userid: String(userId), key: key.key, urltogo: `${MOODLE}/my/` }),
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  if (!cookie.includes('MoodleSession')) throw new MoodleError('Moodle gave no session');
  return cookie;
}

// A course's shortname: "WS2026-261603-1" is 2026W, course 261603, group 1.
export function courseOf(shortname: string): { nr: string; semester: string } | null {
  const m = shortname.match(/^(WS|SS)(\d{4})-(\d{6})-\d+/);
  return m ? { nr: m[3]!, semester: `${m[2]}${m[1] === 'WS' ? 'W' : 'S'}` } : null;
}

type Contents = { name: string; modules?: { id: number; instance: number; name: string; modname: string; contents?: { type: string; filename: string; fileurl: string; mimetype?: string; filesize: number; timemodified: number }[] }[] }[];
export type MoodleFile = { url: string; key: string; title: string; section: string; modified: Date; size: number };
export type MoodleDeck = { cmid: number; instance: number; name: string };

// The PDFs of a course and its flashcard activities. A file's URL carries
// its revision; the key leaves it out, so a new revision replaces the old.
export function contentsOf(contents: Contents): { files: MoodleFile[]; decks: MoodleDeck[] } {
  const files: MoodleFile[] = [], decks: MoodleDeck[] = [];
  for (const s of contents) for (const m of s.modules ?? []) {
    if (m.modname === 'flashcards') decks.push({ cmid: m.id, instance: m.instance, name: m.name });
    for (const f of m.contents ?? []) {
      if (f.type !== 'file' || !(f.mimetype === 'application/pdf' || /\.pdf$/i.test(f.filename))) continue;
      files.push({ url: f.fileurl, key: f.fileurl.replace(/\/content\/\d+\//, '/content/0/').replace(/\?.*$/, ''), title: f.filename, section: s.name, modified: new Date(f.timemodified * 1000), size: f.filesize });
    }
  }
  return { files, decks };
}

// The plugin's card list: one row a card, with its question id, its name,
// and its box as "Fach n" or "-" while it is still in the pool (box 0).
export type PoolCard = { qid: number; name: string; box: number };
export function poolRows(html: string): PoolCard[] {
  return [...html.matchAll(/<tr[^>]*id="flashcards_studentview_r\d+"[^>]*>([\s\S]*?)<\/tr>/g)].map(([, row]) => {
    const cell = (c: number) => row!.match(new RegExp(`_c${c}">([\\s\\S]*?)</td>`))?.[1]?.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() ?? '';
    const n = Number(cell(3).match(/(\d)/)?.[1] ?? 0);
    return { qid: Number(row!.match(/data-value="(\d+)"/)?.[1] ?? 0), name: cell(1), box: n >= 1 && n <= 5 ? n : 0 };
  }).filter((c) => c.qid);
}
export function poolOf(html: string): number[] {
  const boxes = [0, 0, 0, 0, 0, 0];
  for (const c of poolRows(html)) boxes[c.box]!++;
  return boxes;
}

// The inside of the first element whose class has this name, nested divs
// and spans counted.
function inner(html: string, cls: string): string | null {
  const at = html.search(new RegExp(`<(div|span)[^>]*class="[^"]*\\b${cls}\\b`));
  if (at < 0) return null;
  const open = html.indexOf('>', at) + 1;
  let depth = 1, i = open;
  const tag = /<(\/?)(div|span)\b[^>]*>/g;
  tag.lastIndex = open;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (!depth) return html.slice(open, m.index);
    i = tag.lastIndex;
  }
  return html.slice(open, i);
}
// A card's HTML kept to what a card shows: no scripts, styles, handlers or
// script URLs; Moodle's maths left as \( \) for KaTeX.
export function clean(html: string): string {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/\son\w+="[^"]*"/gi, '').replace(/\son\w+='[^']*'/gi, '')
    .replace(/(href|src)="\s*javascript:[^"]*"/gi, '$1="#"').replace(/<span class="nolink">([\s\S]*?)<\/span>/g, '$1').trim();
}
// Front and back of a card from the plugin's rendering of it.
export function cardOf(html: string): { front: string; back: string } | null {
  const front = inner(html, 'qflashcard-question'), back = inner(html, 'qflashcard-answer');
  return front && back ? { front: clean(front), back: clean(back) } : null;
}

// An answer sent to Moodle as its own page sends it: a card still in the
// pool is taken into the deck first; right moves it a box up, wrong back
// to box 1.
export async function answerCard(http: Http, token: string, instance: number, qid: number, box: number, right: boolean) {
  if (box === 0) await ws(http, token, 'mod_flashcards_init_questions', { flashcardsid: instance, qids: [qid] });
  await ws(http, token, 'mod_flashcards_update_progress', { fid: instance, boxid: Math.max(1, box), questionid: qid, qanswervalue: right ? 1 : 0 });
}

export const download = async (http: Http, url: string, token: string) => {
  const res = await http(`${url}${url.includes('?') ? '&' : '?'}token=${token}`, { headers: { 'User-Agent': AGENT } });
  if (!res.ok) throw new MoodleError(`Moodle answered ${res.status} for a file`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  // A refused token comes back as a JSON error, not a PDF.
  if (bytes[0] === 0x7b) throw new Refused('Moodle refused the token for a file');
  return bytes;
};
