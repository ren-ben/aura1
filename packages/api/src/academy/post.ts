// The university's mail: the inbox of the u:account in UNIVIE_MAIL_USER, read
// over IMAP with the password in UNIVIE_MAIL_PASSWORD. Nothing is ever sent or
// deleted; the only change made is the read flag, when a letter is opened or
// marked unread. The newest letters are kept in memory and looked at again
// every few minutes, so the dashboard and the device ask this, never the server.
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import { convert } from 'html-to-text';

export type Letter = { uid: number; from: string; addr: string; subject: string; date: string; unread: boolean };
export type Inbox = { letters: Letter[]; total: number; unread: number };

// The mailbox, behind the one thing that touches the network, so tests can
// stand in for it.
export interface Mailbox {
  inbox(limit: number): Promise<Inbox>;
  // The whole message as it came, without marking it read.
  source(uid: number): Promise<Buffer | null>;
  flag(uids: number[], seen: boolean): Promise<void>;
}

const HOST = 'imap.univie.ac.at';
const KEEP = 400;
const EVERY_MS = 5 * 60 * 1000;

export function imapMailbox(user: string, pass: string): Mailbox {
  // One short connection a call: five minutes apart, a held one only goes stale.
  async function withInbox<T>(run: (c: ImapFlow) => Promise<T>): Promise<T> {
    const c = new ImapFlow({ host: HOST, port: 993, secure: true, auth: { user, pass }, logger: false });
    await c.connect();
    const lock = await c.getMailboxLock('INBOX');
    try { return await run(c); } finally { lock.release(); await c.logout().catch(() => {}); }
  }
  return {
    inbox: (limit) => withInbox(async (c) => {
      const box = c.mailbox === false ? null : c.mailbox;
      const total = box?.exists ?? 0;
      const status = await c.status('INBOX', { unseen: true });
      if (!total) return { letters: [], total: 0, unread: 0 };
      const got = await c.fetchAll(`${Math.max(1, total - limit + 1)}:*`, { uid: true, envelope: true, flags: true });
      const letters = got.map((m) => {
        const from = m.envelope?.from?.[0];
        return {
          uid: m.uid,
          from: from?.name || from?.address || '',
          addr: from?.address ?? '',
          subject: m.envelope?.subject ?? '',
          date: new Date(m.envelope?.date ?? 0).toISOString(),
          unread: !m.flags?.has('\\Seen'),
        };
      }).reverse();
      return { letters, total, unread: (status ? status.unseen : undefined) ?? letters.filter((l) => l.unread).length };
    }),
    source: (uid) => withInbox(async (c) => {
      const m = await c.fetchOne(String(uid), { source: true }, { uid: true });
      return m ? m.source ?? null : null;
    }),
    flag: (uids, seen) => withInbox(async (c) => {
      if (seen) await c.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
      else await c.messageFlagsRemove(uids, ['\\Seen'], { uid: true });
    }),
  };
}

// The words of a letter: its plain part, or its HTML told as text.
const textOf = (mail: ParsedMail) => (mail.text?.trim() ? mail.text
  : mail.html ? convert(mail.html, { wordwrap: false, selectors: [{ selector: 'img', format: 'skip' }, { selector: 'a', options: { hideLinkHrefIfSameAsText: true } }] })
  : '').replace(/\n{3,}/g, '\n\n').trim();

export type Opened =Letter & { to: string; text: string; attachments: { name: string; type: string; size: number }[] };

export class Post {
  inbox: Inbox = { letters: [], total: 0, unread: 0 };
  checkedAt: Date | null = null;
  error: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private checking: Promise<void> | null = null;

  constructor(readonly box: Mailbox | null) {}

  get configured() { return this.box !== null; }

  start() {
    if (!this.box || this.timer) return;
    void this.check();
    this.timer = setInterval(() => void this.check(), EVERY_MS);
    this.timer.unref();
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  // A look at the server; one at a time, and a failed look keeps what was there.
  check(): Promise<void> {
    if (!this.box) return Promise.resolve();
    this.checking ??= this.box.inbox(KEEP).then((inbox) => {
      this.inbox = inbox; this.checkedAt = new Date(); this.error = null;
    }, (e: Error) => { this.error = e.message; }).finally(() => { this.checking = null; });
    return this.checking;
  }

  private async parsed(uid: number): Promise<ParsedMail | null> {
    const raw = await this.box?.source(uid);
    return raw ? simpleParser(raw) : null;
  }

  // A letter opened is a letter read, here and on the server.
  async open(uid: number): Promise<Opened | null> {
    const mail = await this.parsed(uid);
    if (!mail) return null;
    const known = this.inbox.letters.find((l) => l.uid === uid);
    if (known?.unread !== false) await this.mark([uid], true);
    const from = mail.from?.value[0];
    const to = Array.isArray(mail.to) ? mail.to[0] : mail.to;
    return {
      uid,
      from: from?.name || from?.address || '',
      addr: from?.address ?? '',
      to: to?.text ?? '',
      subject: mail.subject ?? '',
      date: (mail.date ?? new Date(0)).toISOString(),
      unread: false,
      text: textOf(mail),
      attachments: mail.attachments.map((a, i) => ({ name: a.filename ?? `attachment-${i + 1}`, type: a.contentType, size: a.size })),
    };
  }

  async attachment(uid: number, i: number) {
    const a = (await this.parsed(uid))?.attachments[i];
    return a ? { name: a.filename ?? `attachment-${i + 1}`, type: a.contentType, content: a.content } : null;
  }

  async mark(uids: number[], seen: boolean) {
    if (!uids.length) return;
    await this.box?.flag(uids, seen);
    for (const l of this.inbox.letters) {
      if (uids.includes(l.uid) && l.unread === seen) { l.unread = !seen; this.inbox.unread += seen ? -1 : 1; }
    }
  }
}

export function postFromEnv(): Post {
  const user = process.env.UNIVIE_MAIL_USER, pass = process.env.UNIVIE_MAIL_PASSWORD;
  return new Post(user && pass ? imapMailbox(user, pass) : null);
}
