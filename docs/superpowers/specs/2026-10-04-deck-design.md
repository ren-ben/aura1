# The decks (Academy phase 3 of 3)

The course's Moodle flashcard decks (univie's mod_flashcards), played in the
Academy and kept in step with Moodle.

## Cards

At each Moodle sync, per deck, through one browser session:

1. Answers given here that Moodle has not taken yet are sent first, in order.
2. `studentquestioninit.php?id=<cmid>&perpage=1000` lists every card: its
   question id, name, and box ("Fach n", or "-" while it is in the pool, box 0).
   Moodle's box wins, except for a card with answers still owed.
3. A card not seen before is fetched from `flashcardpreview.php`; its face
   (`qflashcard-question`) and back (`qflashcard-answer`) are kept as HTML,
   cleaned of scripts, handlers and script URLs, maths left as `\( \)`, and
   small images inlined as data URIs.

## Answers

The plugin's rule: right moves a card one box up (from the pool into box 2),
wrong back to box 1. An answer moves the card here at once and is sent with
the flashcards token: `mod_flashcards_init_questions` first for a pool card,
then `mod_flashcards_update_progress(fid, boxid, questionid, 1|0)`. What
Moodle does not take is kept and sent before anything else next time.

## Anki

`GET /academy/decks/:id/anki`: Anki's plain-text import (tab separated,
HTML on, the deck as `Course::Deck`, tags `moodle boxN` and the card's name).
Anki reads `\( \)` maths as it is.

## The pane

Designs to pick from: https://claude.ai/artifact/M1zEo1PXbiaZhZCdHjqXNE
(the Table, the Spread, the Wheel).
