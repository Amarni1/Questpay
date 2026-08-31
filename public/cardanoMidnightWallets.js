/**
 * QuestPay - Midnight Preview & Cardano CIP-30 Wallet Connector
 */

export function discoverMidnightWallets() {
  if (typeof window === 'undefined' || !window.midnight) {
    return [];
  }
  const discovered = [];
  const keys = Object.keys(window.midnight);

  for (const key of keys) {
    const p = window.midnight[key];
    if (p && (typeof p.connect === 'function' || typeof p.enable === 'function')) {
      discovered.push({
        key,
        name: p.name || (key === 'mnLace' ? 'Lace (Midnight Preview)' : key),
        icon: '🌙',
        provider: p
      });
    }
  }

  // Fallback well-known Lace check
  if (discovered.length === 0 && window.midnight.mnLace) {
    discovered.push({
      key: 'mnLace',
      name: 'Lace (Midnight Preview)',
      icon: '🌙',
      provider: window.midnight.mnLace
    });
  }

  return discovered;
}

export async function connectMidnightLace() {
  if (typeof window === 'undefined' || !window.midnight) {
    throw new Error('No Midnight wallet extension detected. Please install Lace with Midnight Preview enabled.');
  }

  const provider = window.midnight.mnLace || window.midnight[Object.keys(window.midnight)[0]];
  if (!provider) {
    throw new Error('Lace Midnight Preview provider not available');
  }

  let api = null;
  if (typeof provider.connect === 'function') {
    api = await provider.connect('preview');
  } else if (typeof provider.enable === 'function') {
    api = await provider.enable();
  }

  return api;
}

// Client-side SHA-256 hash commitment computation for ZK challenges
export async function computeClientSha256(text) {
  const msgUint8 = new TextEncoder().encode(text.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
