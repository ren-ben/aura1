# Reading the folios (Academy phase 2 of 3)

Maps, questions and exercise hints answered from the student's own course
files (the folios, phase 1), not only the web.

## Pages, without a vector store

`academy/retrieve.ts`. For a need (a lecture's topic, a question, a task):

1. The candidate files: the folios of every course sharing the module (a
   lecture's Skript serves its exercise class).
2. Their catalogue: each file, each Skript with its chapters and page ranges.
3. The pages whose words match best (a word's first five letters count).
4. The research model picks at most 14 pages as a few ranges; when it does
   not answer, the best word matches are taken.
5. The ranges are cut out of the PDFs with pdf-lib and sent to the writer as
   PDFs (OpenRouter `file` parts, `file-parser` with the `native` engine), so
   the model sees the equations and figures as printed. A legend tells it
   how excerpt pages map to the original page numbers, for citations.

## Uses

- **Lecture maps**: the pages for the lecture's topic go to the writing pass
  as the lecture's real source; the research notes fill gaps. With a Skript,
  its chapters are the letter's topics and the guess. The map lists the
  pages it was written from, each opening the PDF at its page.
- **Ask**: a question to a course's folios, answered by Kael'thos in the
  question's language, with the pages cited. Kept, newest first.
- **The hint ladder**: on an exercise sheet or past exam, per task (read off
  "Aufgabe n" in its text): where it stands, a nudge, the next step, show me.
  Each rung only after the one below; a rung once written is kept; later
  rungs read the first rung's pages and what the earlier rungs said.

Questions and hints run after the request (`asks` table), like maps, and
count against the same monthly budget.
