import type { Problem } from './types';

export const plannedStartDate = '2026-10-05';

// Start with two algorithms and one array exercise per session. The source
// catalogue keeps its A2Z order; only the guided queue uses this order.
export const openingSessions = [
  { algorithms: ['947', '943'], practice: '38' }, // Selection, bubble; largest element
  { algorithms: ['944', '945'], practice: '43' }, // Insertion, merge; second largest
  { algorithms: ['946', '41'], practice: '379' }, // Quick sort, linear search; sorted check
] as const;

export function openingSessionDates(startDate: string) {
  const firstDay = Date.parse(`${startDate}T00:00:00Z`);
  return openingSessions.map((session, index) => ({
    ...session,
    date: new Date(firstDay + index * 86_400_000).toISOString().slice(0, 10),
  }));
}

export function guidedProblems(problems: Problem[]): Problem[] {
  const byId = new Map(problems.map(problem => [problem.id, problem]));
  const opening = openingSessions.flatMap(session => [...session.algorithms, session.practice]);
  const priority = [
    ...opening.map(id => byId.get(id)).filter((problem): problem is Problem => !!problem),
    ...problems.filter(problem => problem.topicOrder === 2),
    ...problems.filter(problem => problem.topicOrder < 2),
    ...problems.filter(problem => problem.topicOrder > 2),
  ];
  const seen = new Set<string>();
  return priority.filter(problem => {
    if (seen.has(problem.id)) return false;
    seen.add(problem.id);
    return true;
  });
}
