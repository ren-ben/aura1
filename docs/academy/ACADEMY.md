# The Academy

The university pane: the physics bachelor at Vienna (curriculum 2026, 180 ECTS),
drawn as the instruments of an old faculty.

## The lore

Before it was a university, Vienna was a court that paid astronomers. The
registrar here keeps the old habits: every course is a volume on a shelf, every
grade a wax seal, and the degree is read off an astrolabe the way a scholar
would read the sky. Miskatonic kept its restricted stacks the same way.

Kael'thos approves. He says the mathematics is the telescope: every module you
pass lets you see a little further, and the pole of the instrument is an eye
because the first thing a degree does is teach you to look.

## The astrolabe

An astrolabe is a brass map of the sky that you turn to read. This one maps
the degree instead.

| Part | What it shows |
| --- | --- |
| The six rings | The six semesters, numbered i (innermost) to vi (outermost), as the curriculum recommends them. |
| An arc | One module. Its length is its share of that semester's ECTS; its label is the module code and its ECTS. |
| Solid arc | Passed: its courses carry its full ECTS with passing grades. |
| Stirring grain | This term: a course of it has no grade yet. |
| Double outline | Open to you: next semester's modules. |
| Dotted trace | Not yet. |
| The pointer (rete) | How far the current term has run, turning once from the first day to the last. Drag the plate to turn it by hand; it springs back. |
| The eye at the pole | The StEOP, the first gate every degree passes through. |

Hover an arc for its module, its ECTS earned and each course's grade. Click it
to highlight it everywhere: its volumes lean out of the shelf, its dates light
up in the week.

## The rest

- **The stacks of the faculty:** your courses as 3D volumes. Thickness is ECTS, a
  lecture (VO) stands taller than its exercise (UE), brass bookends separate
  modules, and a graded one carries its seal on the spine. Click one to take it
  down: seal its grade (1 sehr gut to 5 nicht genügend), change the module it
  counts toward, pick its exercise group, or strike it.
- **The rector's armillary:** six beads on the ecliptic, one per semester; they
  light as semesters are finished, and the current one pulses.
- **The tally:** ECTS passed of 180, the StEOP (18 ECTS), the weighted grade,
  and the next exam.
- **The week:** your chosen groups' dates from u:find, with a line at the hour.

## Where the data comes from

Courses are added by their u:find number. The server reads u:find's public XML
for name, type, ECTS, module codes, every group's dates and rooms, and the exams
posted for the course or its StEOP module. It asks again once a day. Grades and
groups are yours to set: u:space has no API.
