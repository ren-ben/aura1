import { z } from 'zod';

// A lecture map (docs/superpowers/specs/2026-09-26-lecture-maps-design.md):
// what the writing pass returns, validated before it is kept. Text is plain,
// with inline maths as $...$; equations are LaTeX; plots are expressions in
// x (and t, for time) that the page evaluates itself, never code.

export const MAP_SCENES = ['orbits', 'field', 'wave', 'lattice', 'tangent', 'vectors', 'atom', 'heat', 'spring', 'grid'] as const;

const line = z.string().min(1).max(600);
export const lectureMapSchema = z.object({
  title: z.string().min(1).max(120),
  // The small 3D scene at the centre, chosen from the ones the page can draw.
  scene: z.enum(MAP_SCENES),
  hook: line,
  core: z.string().min(1).max(1200),
  questions: z.array(z.object({ q: line, a: line })).min(3).max(8),
  outline: z.array(line).min(3).max(8),
  terms: z.array(z.object({ term: z.string().min(1).max(80), meaning: line })).min(2).max(8),
  equations: z.array(z.object({ tex: z.string().min(1).max(300), says: line })).max(6),
  pictures: z.array(z.object({
    title: z.string().min(1).max(80),
    expr: z.string().min(1).max(160),
    from: z.number(), to: z.number(),
    caption: line,
  })).max(2),
  worked: z.object({ problem: line, steps: z.array(line).min(2).max(8), answer: line }),
  traps: z.array(z.object({ wrong: line, right: line })).min(1).max(4),
  refresh: z.array(z.object({ topic: z.string().min(1).max(80), why: line })).min(1).max(6),
  further: z.array(z.object({ title: z.string().min(1).max(160), url: z.string().url(), note: line })).max(5),
});
export type LectureMap = z.infer<typeof lectureMapSchema>;

// Children grown out of a node by "go deeper".
export const deeperSchema = z.object({
  nodes: z.array(z.object({
    title: z.string().min(1).max(100),
    text: z.string().min(1).max(900),
    tex: z.string().max(300).optional(),
  })).min(2).max(5),
});
export type Deeper = z.infer<typeof deeperSchema>;
export type GrownNode = Deeper['nodes'][number] & { id: string; parent: string };

export type MapStatus = 'researching' | 'writing' | 'ready' | 'failed';
export type LectureMapDto = {
  id: number;
  courseId: number;
  begin: string;
  topic: string;
  status: MapStatus;
  error: string | null;
  map: LectureMap | null;
  grown: GrownNode[];
  sources: { title: string; url: string }[];
  // The pages of the student's own folios the map was written from.
  pages: { folioId: number; title: string; from: number; to: number }[];
  costUsd: number;
};

// A lecture as the pane sees it before any map: its place among the course's
// lectures and the topic guessed for it from the syllabus.
export type LectureDto = { courseId: number; begin: string; index: number; total: number; guess: string; topics: string[]; map: LectureMapDto | null };

// A map as the calendar lists it.
export type MapMark = { id: number; courseId: number; begin: string; status: MapStatus; title: string | null };
