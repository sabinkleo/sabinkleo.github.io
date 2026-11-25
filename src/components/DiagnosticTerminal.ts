import { assess } from '../data/diagnostics/score';
import type { Diagnostic } from '../data/diagnostics/types';
import { reviewUrl } from '../services/attribution';

function DiagnosticTerminal(root: HTMLElement, { spec }: { spec: Diagnostic }) {
  const form = root.querySelector('form')!;
  const output = form.querySelector<HTMLElement>('[data-output]')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const review = form.querySelector<HTMLAnchorElement>('[data-review]')!;
  const status = form.querySelector<HTMLElement>('[role=status]')!;
  const markdown = form.querySelector('textarea')!;
  let answers: number[] = [];
  let generation = 0;
  submit.disabled = false;
  form.addEventListener('change', () => {
    generation++;
    output.hidden = true;
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    generation++;
    answers = Array.from(form.querySelectorAll('select'), select => Number(select.value));
    const result = assess(spec, answers);
    const heading = form.querySelector<HTMLElement>('[data-score]')!;
    heading.textContent = 'Readiness ' + result.score + '/100 · Review priorities';
    form.querySelector('[data-priorities]')!.replaceChildren(...result.priorities.map(q => {
      const item = document.createElement('li');
      item.textContent = q.gap + ' (' + ['missing', 'partial', 'verified'][q.level] + ') — ' + q.fix;
      return item;
    }));
    markdown.value = result.report;
    markdown.hidden = true;
    review.href = reviewUrl(spec.slug, result.score).href;
    status.textContent = '';
    output.hidden = false;
    heading.focus();
  });
  form.querySelector('[data-copy]')!.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(markdown.value);
      status.textContent = 'Markdown copied.';
    } catch {
      markdown.hidden = false;
      markdown.select();
      status.textContent = 'Select and copy the report below.';
    }
  });
  const brief = form.querySelector<HTMLButtonElement>('[data-brief]')!;
  brief.addEventListener('click', async () => {
    const current = generation;
    brief.disabled = true;
    status.textContent = 'Preparing review note…';
    let note = assess(spec, answers).priorities[0].fix;
    try {
      const response = await fetch(import.meta.env.PUBLIC_TRIAGE_ENDPOINT || '/api/triage', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vertical: spec.slug, answers }), signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const body = await response.json();
        if (typeof body.note === 'string') note = body.note;
      }
    } catch { /* Static Pages and offline previews use the local recommendation. */ }
    if (current === generation) status.textContent = note;
    brief.disabled = false;
  });
}
export default Object.assign(DiagnosticTerminal, { nativeDiagnostic: true });
