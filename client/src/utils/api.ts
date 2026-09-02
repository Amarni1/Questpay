/**
 * Shared API Helper for QuestPay
 * Guarantees that responses have application/json content-type and parses them safely.
 * Throws clean, user-friendly errors instead of JSON syntax errors (Unexpected token '<').
 */

export async function getJson<T = any>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (!contentType.includes('application/json')) {
    console.error('[QuestPay] Non-JSON response received:', text.slice(0, 500));
    throw new Error('QuestPay server returned an invalid response. Please verify the backend service is running.');
  }

  try {
    return JSON.parse(text) as T;
  } catch (err: any) {
    console.error('[QuestPay] JSON parse error:', err, 'Body:', text.slice(0, 300));
    throw new Error('Failed to parse response from QuestPay server.');
  }
}

export async function requestJson<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const defaultHeaders: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (options.body && typeof options.body === 'string') {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {})
    }
  });

  return getJson<T>(response);
}
