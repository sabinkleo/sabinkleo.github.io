import type { Diagnostic } from './types';

export function assess(spec: Diagnostic, answers: number[]) {
  if (!Array.isArray(answers) || answers.length !== spec.questions.length ||
      !answers.every(value => Number.isInteger(value) && value >= 0 && value <= 2)) {
    throw new Error('Expected one evidence level per question.');
  }
  const score = Math.round(100 * answers.reduce((sum, level) => sum + level, 0) / (2 * answers.length));
  const priorities = spec.questions.map((q, index) => ({ ...q, level: answers[index] }))
    .sort((a, b) => a.level - b.level).slice(0, 3);
  const report = ['# ' + spec.name, 'Readiness: ' + score + '/100', '',
    ...priorities.map(q => '- ' + q.gap + ' (' + ['missing', 'partial', 'verified'][q.level] + '): ' + q.fix)].join('\n');
  return { score, priorities, report };
}
