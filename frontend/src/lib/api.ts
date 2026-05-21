const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

async function apiFetch(path: string, options?: RequestInit) {
  const url = `${API_BASE}${path}`;
  console.log(`[apiFetch] ${options?.method || 'GET'} ${url}`);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      console.error(`[apiFetch] Error ${res.status}:`, errBody);
      throw new Error(errBody.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    console.log(`[apiFetch] Response OK:`, data);
    return data;
  } catch (e: any) {
    if (e.name === 'AbortError') {
      console.error('[apiFetch] Request timed out');
      throw new Error('Request timed out.');
    }
    console.error(`[apiFetch] Network error:`, e.message);
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
