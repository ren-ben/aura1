# The Folios (Academy phase 1 of 3)

Course material in the Academy: what Moodle has, and what is dropped in by
hand. Phase 2 (lecture maps from the Skript, ask, the hint ladder) and phase 3
(the flashcard deck) read from it. Design picked by the user on 2026-10-04:
the Exploded Codex (mockup: https://claude.ai/artifact/3frGr6WMdBG27gqdX1fFLz,
instrument I).

## Moodle

univie Moodle (5.2) logs in through weblogin (Shibboleth). The server walks
the Moodle app's own login once: `admin/tool/mobile/launch.php` redirects to
the IdP, its forms are filled (`j_username`, `j_password`, `_eventId_proceed`,
then the SAML post back), and Moodle answers
`moodlemobile://token=base64(signature:::token:::privatetoken)`. The same is
done for the `flashcards` service. The password is used for that one login
and never stored. A login form shown twice means weblogin refused it: never
retried.

Kept: the app token, the flashcards token, the private token (it buys a
browser session through `tool_mobile_get_autologin_key`, at most one per six
minutes), the Moodle user id, when it was bound and synced, and when Moodle
last refused the token.

Sync (on demand, and once a day by the page like the u:find refresh):

- `core_enrol_get_users_courses`; a course's shortname is
  `WS2026-261603-1` (term, u:find number, group).
- `core_course_get_contents`: every PDF in a resource, folder or pdfannotator
  module, keyed by its file URL; fetched again when its time modified moves.
- Flashcard activities (`modname: flashcards`): through one browser session,
  `studentquestioninit.php?id=<cmid>&perpage=1000` lists every card with its
  box ("Fach n", "-" = not in the deck yet). Phase 1 keeps the counts; the
  cards themselves are phase 3.
- A refused token (`invalidtoken`) marks the link broken; the files stay.

## Folios

A folio is one PDF of one course: u:find number and term, title, kind
(`skript`, `sheet`, `slides`, `exam`, `other`), source (`moodle`, `upload`),
Moodle section, size, pages, outline `[{title, from, to}]` (top level of the
PDF's bookmarks; one chapter for the whole file when it has none). The bytes
and the text of each page sit in a side table, read only when opened or by
phase 2. Kind is guessed from the file and section names and can be changed.

Upload: a PDF dropped onto the codex, posted raw, filed under the course on
screen.

## The Exploded Codex

An overlay over the Academy, opened from the week's title bar (`folios`) and
from a book's card. A course strip on top (the eight courses and anything
else Moodle has), its folios as tomes, the chosen tome exploded into one slab
per chapter: chapters named down the left, what hangs off each down the right
(the course's other folios and decks whose name matches the chapter), the
chosen chapter slid out with its first page lifted. The side panel: the
Moodle bond (bind, sync, broken), the tome or chapter, open the PDF, change
the kind, remove. Drop a PDF anywhere on it to file it.
