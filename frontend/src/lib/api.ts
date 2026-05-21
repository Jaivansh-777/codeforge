const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

async function apiFetch(path: string, options?: RequestInit) {
  const url = `${API_BASE}${path}`;
  console.log(`[API] Fetching: ${url}`);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    clearTimeout(timeoutId);
    console.log(`[API] Response status: ${res.status}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  } catch (e: any) {
    console.error(`[API] Error:`, e.message);
    if (e.name === 'AbortError') {
      throw new Error('Request timed out. Backend may be unreachable.');
    }
    if (e.message?.includes('fetch') || e.message?.includes('NetworkError') || e.message?.includes('Failed to fetch')) {
      throw new Error('Cannot connect to backend. Is the server running?');
    }
    throw e;
  }
}

export async function executeCode(language: string, code: string, input?: string) {
  return apiFetch('/api/execute', {
    method: 'POST',
    body: JSON.stringify({ language, code, input: input || '' }),
  });
}

export async function getLanguages() {
  return apiFetch('/api/languages');
}

export async function convertBinary(binary: string) {
  return apiFetch('/api/binary', {
    method: 'POST',
    body: JSON.stringify({ binary }),
  });
}
