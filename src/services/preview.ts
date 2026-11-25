function apiUrl(base: string, path: string) {
  const url = new URL(base);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error('URL da API inválida.');
  }
  return new URL(path, url.href.replace(/\/+$/, '') + '/');
}

export async function hasOperatorSession(endpoint: string, project: string, team: string) {
  const options: RequestInit = {
    credentials: 'include',
    headers: { 'X-Appwrite-Project': project },
    cache: 'no-store',
    signal: AbortSignal.timeout(7000),
    redirect: 'error',
  };
  const account = await fetch(apiUrl(endpoint, 'account'), options);
  if (!account.ok) return false;

  const membership = await fetch(apiUrl(endpoint, 'teams/' + encodeURIComponent(team)), options);
  return membership.ok;
}

export async function checkWorker(endpoint: string) {
  const response = await fetch(apiUrl(endpoint, 'health'), {
    credentials: 'omit',
    cache: 'no-store',
    signal: AbortSignal.timeout(7000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Worker indisponível.');
}
