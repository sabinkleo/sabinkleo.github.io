export interface Diagnostic {
  slug: string;
  title: string;
  name: string;
  description: string;
  command: string;
  lines: string[];
  stages: { when: string; artifact: string; detail: string }[];
  questions: { label: string; gap: string; fix: string }[];
}
