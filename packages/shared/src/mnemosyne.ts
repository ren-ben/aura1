// Mnemosyne, the map of everything learned
// (docs/superpowers/specs/2026-10-18-mnemosyne-design.md): topics written by
// hand, gathered into groups, each learned one scheduled by FSRS.
export type TopicDto = {
  id: number; groupId: number | null; title: string; points: string[]; x: number; y: number;
  // A hub holds the topics linked to it, hubs inside hubs, and is never
  // recalled itself.
  hub: boolean;
  // Not learned yet: its clock has not started, and the rest is empty.
  learned: boolean; stability: number; lastReview: string | null; due: string | null; reps: number; lapses: number;
  // When it would come back for again, hard, good and easy, asked now.
  next: [string, string, string, string] | null;
};
export type TopicGroupDto = { id: number; name: string; ground: number };
export type TopicLinkDto = { id: number; from: number; to: number };
export type MnemosyneDto = { groups: TopicGroupDto[]; topics: TopicDto[]; links: TopicLinkDto[] };
export type TopicPlace = { id: number; x: number; y: number; groupId: number | null };

// The water a group's pool is drawn in.
export const GROUNDS = ['still', 'deep', 'ripple', 'drift', 'grain', 'pale'] as const;

// FSRS-6's forgetting curve with ts-fsrs's default decay: how likely a topic
// still comes back `days` after it last did. At days = stability it is 90%,
// which is when it falls due.
const DECAY = 0.1542, FACTOR = 0.9 ** (-1 / DECAY) - 1;
export const recallOf = (days: number, stability: number): number =>
  stability > 0 ? (1 + (FACTOR * Math.max(0, days)) / stability) ** -DECAY : 0;
