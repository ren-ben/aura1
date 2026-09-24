// The Academy: Bachelor Physik at the University of Vienna, curriculum
// version 2026 (180 ECTS), and the courses of the current term as u:find
// publishes them (m1-ufind.univie.ac.at/courses/<nr>/<semester>). Sample data
// until the API keeps it: the modules are the real curriculum, the week is
// the real timetable of 2026W, the grades are yours to enter.

export type Status = 'passed' | 'running' | 'open' | 'locked';
export type Module = { code: string; name: string; ects: number; sem: number; group: string; status: Status; grade?: number };

// The recommended path through the degree, from the curriculum's appendix.
export const MODULES: Module[] = [
  { code: 'STEOP1', name: 'Experimentalphysik 1', ects: 8, sem: 1, group: 'StEOP', status: 'running' },
  { code: 'STEOP2', name: 'Physikalische Rechenmethoden', ects: 8, sem: 1, group: 'StEOP', status: 'running' },
  { code: 'STEOP3', name: 'Forschung und Studium', ects: 2, sem: 1, group: 'StEOP', status: 'running' },
  { code: 'LA1', name: 'Lineare Algebra 1', ects: 4, sem: 1, group: 'Mathematik', status: 'running' },
  { code: 'ANA1', name: 'Analysis 1', ects: 8, sem: 1, group: 'Mathematik', status: 'running' },
  { code: 'EP2', name: 'Experimentalphysik 2', ects: 8, sem: 2, group: 'Experimentalphysik', status: 'open' },
  { code: 'TP1', name: 'Klassische Mechanik', ects: 8, sem: 2, group: 'Theoretische Physik', status: 'locked' },
  { code: 'LA2', name: 'Lineare Algebra 2', ects: 4, sem: 2, group: 'Mathematik', status: 'locked' },
  { code: 'ANA2', name: 'Analysis 2', ects: 8, sem: 2, group: 'Mathematik', status: 'locked' },
  { code: 'GEA', name: 'Experimentelles Arbeiten', ects: 2, sem: 2, group: 'Labor', status: 'open' },
  { code: 'LP1', name: 'Laborpraktikum 1', ects: 5, sem: 3, group: 'Labor', status: 'locked' },
  { code: 'TP2', name: 'Elektrodynamik', ects: 8, sem: 3, group: 'Theoretische Physik', status: 'locked' },
  { code: 'ANA3', name: 'Analysis 3', ects: 8, sem: 3, group: 'Mathematik', status: 'locked' },
  { code: 'PROG', name: 'Programmierung', ects: 6, sem: 3, group: 'Programmierung', status: 'locked' },
  { code: 'WST', name: 'Wahrscheinlichkeit & Statistik', ects: 4, sem: 3, group: 'Mathematik', status: 'locked' },
  { code: 'EP3', name: 'Quantenoptik, Atom, Kern', ects: 8, sem: 4, group: 'Experimentalphysik', status: 'locked' },
  { code: 'TP3', name: 'Quantenmechanik 1', ects: 8, sem: 4, group: 'Theoretische Physik', status: 'locked' },
  { code: 'LP2', name: 'Laborpraktikum 2', ects: 8, sem: 4, group: 'Labor', status: 'locked' },
  { code: 'SCDS', name: 'Scientific Computing', ects: 6, sem: 4, group: 'Programmierung', status: 'locked' },
  { code: 'EP4', name: 'Kondensierte Materie', ects: 8, sem: 5, group: 'Experimentalphysik', status: 'locked' },
  { code: 'TP4', name: 'Statistische Mechanik', ects: 8, sem: 5, group: 'Theoretische Physik', status: 'locked' },
  { code: 'WFach', name: 'Wahl-Fachbereiche', ects: 7, sem: 5, group: 'Wahl', status: 'locked' },
  { code: 'EXT', name: 'Erweiterung', ects: 15, sem: 5, group: 'Erweiterung', status: 'locked' },
  { code: 'TP5', name: 'Quantenmechanik 2', ects: 7, sem: 6, group: 'Theoretische Physik', status: 'locked' },
  { code: 'WLab', name: 'Wahl-Laborpraktikum', ects: 6, sem: 6, group: 'Labor', status: 'locked' },
  { code: 'BAPR', name: 'Bachelorprojekt', ects: 8, sem: 6, group: 'Bachelorprojekt', status: 'locked' },
];

export type Course = { nr: string; module: string; name: string; type: string; ects: number };
export const COURSES: Course[] = [
  { nr: '261600', module: 'STEOP1', name: 'Experimentalphysik 1', type: 'VO', ects: 5 },
  { nr: '260162', module: 'STEOP1', name: 'Experimentalphysik 1', type: 'UE', ects: 3 },
  { nr: '261603', module: 'STEOP2', name: 'Physikalische Rechenmethoden', type: 'VO', ects: 5 },
  { nr: '261604', module: 'STEOP2', name: 'Physikalische Rechenmethoden', type: 'UE', ects: 3 },
  { nr: '260041', module: 'STEOP3', name: 'Forschung und Studium in Physik', type: 'KU', ects: 2 },
  { nr: '260022', module: 'LA1', name: 'Lineare Algebra 1', type: 'VU', ects: 4 },
  { nr: '261608', module: 'ANA1', name: 'Analysis 1', type: 'VO', ects: 5 },
  { nr: '261609', module: 'ANA1', name: 'Analysis 1', type: 'UE', ects: 3 },
];

// The week of 12 October 2026, as u:find has it (exercise groups: group 1).
export type Event = { day: number; from: string; to: string; nr: string; room: string };
export const WEEK_OF = '2026-10-12';
export const WEEK: Event[] = [
  { day: 0, from: '09:15', to: '10:45', nr: '261600', room: 'Lise-Meitner-Hörsaal' },
  { day: 0, from: '11:00', to: '12:30', nr: '261608', room: 'Lise-Meitner-Hörsaal' },
  { day: 0, from: '13:00', to: '14:30', nr: '261609', room: 'Ludwig-Boltzmann-Hörsaal' },
  { day: 1, from: '09:15', to: '10:45', nr: '261600', room: 'Lise-Meitner-Hörsaal' },
  { day: 1, from: '11:00', to: '12:30', nr: '261603', room: 'Lise-Meitner-Hörsaal' },
  { day: 1, from: '13:00', to: '13:45', nr: '260022', room: 'Ludwig-Boltzmann-Hörsaal' },
  { day: 2, from: '09:15', to: '10:45', nr: '261600', room: 'Lise-Meitner-Hörsaal' },
  { day: 2, from: '10:45', to: '12:15', nr: '260041', room: 'Lise-Meitner-Hörsaal' },
  { day: 2, from: '13:00', to: '14:30', nr: '261604', room: 'Lise-Meitner-Hörsaal' },
  { day: 3, from: '11:00', to: '12:30', nr: '261608', room: 'Lise-Meitner-Hörsaal' },
  { day: 3, from: '13:00', to: '14:30', nr: '260162', room: 'Lise-Meitner-Hörsaal' },
  { day: 4, from: '11:00', to: '12:30', nr: '261603', room: 'Lise-Meitner-Hörsaal' },
];

// The Austrian scale: 1 is the best, 5 is a fail.
export const GRADES = ['sehr gut', 'gut', 'befriedigend', 'genügend', 'nicht genügend'];
// 2026W runs from 1 October to 31 January.
export const TERM = { from: '2026-10-01', to: '2027-01-31', name: '2026W' };
