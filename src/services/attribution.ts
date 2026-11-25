const fields = ['utm_source', 'utm_medium', 'utm_campaign', 'vertical'] as const;

export function attributedUrl(href: string) {
  const target = new URL(href, location.href);
  const source = new URLSearchParams(location.search);
  for (const key of fields) {
    const value = source.get(key)?.trim().slice(0, 120);
    if (value) target.searchParams.set(key, value);
  }
  return target;
}

export function reviewUrl(slug: string, score?: number) {
  const target = attributedUrl(location.pathname);
  if (!target.searchParams.has('vertical')) target.searchParams.set('vertical', slug);
  if (score !== undefined) target.searchParams.set('score', String(score));
  target.hash = 'handoff';
  return target;
}
