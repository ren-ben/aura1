# Lecture maps

Date: 2026-09-26. Status: agreed in chat, built straight after.

## What it is

Every lecture (VO) in the Academy's week opens a map for that one session:
a floating panel over the page with an animated, pannable canvas of what the
lecture will cover, researched and written by Kael'thos. It is for previewing:
look at the week, see tomorrow's lecture, open its map, then write your own
notes in Obsidian or Notability. A course-wide map may come later, separate.

## The map's nodes

The core summary sits at the centre, with a small 3D scene of the topic.
Branches, each a kind:

| Kind | Content | Why |
| --- | --- | --- |
| hook | one everyday puzzle the topic explains | curiosity before material aids memory (Gruber et al. 2014) |
| core | the topic in 3-4 plain sentences | an advance organizer |
| questions | 5-8 prequestions, answers hidden until revealed; after the lecture date they become "now, without looking" | prequestion effect (g 0.54-0.66); practice testing (Dunlosky 2013) |
| outline | the likely order of the lecture, 4-7 steps | a skeleton to hang it on |
| terms | key terms with a one-line meaning | knowing the bird, not its name |
| equations | the key formulas (LaTeX) and what each says | |
| pictures | 1-2 plots from a function the page evaluates itself | dual coding |
| worked | one typical problem solved step by step | worked-example effect |
| traps | 2-3 misconceptions, wrong and right | |
| refresh | prerequisites, in order | the roadmap before the lecture |
| further | 3-4 real sources from the research | |

Every node can "go deeper": its children are researched and grown out of it.

Kael'thos explains the way Feynman did: intuition before formalism, homely
analogies, honest about what nobody understands, playful but never corny.

## How it works

- The topic: the server numbers the lecture among the course's VO dates and
  maps it onto the course's u:find syllabus (now saved with the course). The
  panel opens with that guess; the user confirms or edits it.
- Generation runs in the background in two passes through OpenRouter:
  research (Gemini 3.8 Flash with web search) into notes and sources, then
  writing (Claude Sonnet 5) into a strict JSON map. The panel polls and draws
  the branches in as they land. Expansion is one writing call.
- Everything is kept in `lecture_maps`: topic, status, notes, sources, map,
  cost. Reopening costs nothing. A failed writing pass reuses the notes.
- Settings in the server's environment: `OPENROUTER_API_KEY`,
  `ACADEMY_RESEARCH_MODEL`, `ACADEMY_WRITER_MODEL`, `ACADEMY_BUDGET_USD`
  (a month; generation stops when it is spent).
- Export in the browser: an Obsidian `.canvas` with a Markdown note, zipped;
  and a print layout for a PDF.

## Not now

The course-wide map, asking a node a question, maps for exercise classes.
