import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Drizzle applies a migration only if it is newer than the last one the
// database has seen: a migration dated before an earlier one is silently
// skipped on every database that already has the earlier one.
test('migrations are dated in the order they run', () => {
  const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
  const entries = journal.entries as { idx: number; when: number; tag: string }[];
  for (let i = 1; i < entries.length; i++) {
    assert.ok(entries[i]!.when > entries[i - 1]!.when, `${entries[i]!.tag} is dated before ${entries[i - 1]!.tag}`);
  }
});
