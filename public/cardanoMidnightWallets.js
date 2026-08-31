/**
 * QuestPay - Genuine Midnight Preview & Cardano CIP-30 Wallet Connector
 */

export const USDM_TOKEN_COLOR = '003bacd9a361ba0d425e408776020e40271375e8b8de42d73eec046a44947d73';
export const USDM_DECIMALS = 6;
export const MIDNIGHT_NETWORK = 'preview';

/**
 * Discover genuinely installed Midnight wallet extensions (e.g. Lace with Midnight Preview)
 */
export function discoverMidnightWallets() {
  if (typeof window === 'undefined' || !window.midnight) {
    return [];
  }
  const discovered = [];
  const keys = Object.keys(window.midnight);

  for (const key of keys) {
    const p = window.midnight[key];
    if (p && typeof p === 'object' && (typeof p.connect === 'function' || typeof p.enable === 'function')) {
      const isLace = key === 'mnLace' || (p.name && p.name.toLowerCase().includes('lace'));
      discovered.push({
        id: key,
        name: p.name || (isLace ? 'Lace (Midnight Preview)' : key),
        icon: '🌙',
        apiVersion: p.apiVersion || '1.0.0',
        provider: p
      });
    }
  }

  return discovered;
}

/**
 * Discover genuinely installed Cardano CIP-30 wallets (Lace, Vespr, Eternl, Nami, Flint, etc.)
 */
export function discoverCardanoWallets() {
  if (typeof window === 'undefined' || !window.cardano) {
    return [];
  }
  const discovered = [];
  const keys = Object.keys(window.cardano);

  for (const key of keys) {
    const p = window.cardano[key];
    if (p && typeof p === 'object' && typeof p.enable === 'function') {
      discovered.push({
        key,
        name: p.name || key.charAt(0).toUpperCase() + key.slice(1),
        icon: p.icon || '₳',
        apiVersion: p.apiVersion || '1.0.0',
        provider: p
      });
    }
  }

  return discovered;
}

/**
 * Connect to genuine Lace Midnight Preview DApp Connector
 */
export async function connectMidnightLace() {
  if (typeof window === 'undefined' || !window.midnight) {
    throw new Error('No Midnight wallet extension found. Please install Lace with Midnight Preview enabled.');
  }

  // Find Lace provider or first available Midnight provider
  const lace = window.midnight.mnLace || window.midnight[Object.keys(window.midnight)[0]];
  if (!lace) {
    throw new Error('Midnight Lace wallet provider not detected in browser.');
  }

  let api = null;
  if (typeof lace.connect === 'function') {
    api = await lace.connect(MIDNIGHT_NETWORK);
  } else if (typeof lace.enable === 'function') {
    api = await lace.enable();
  }

  if (!api) {
    throw new Error('Wallet connection was rejected or returned null.');
  }

  return api;
}

/**
 * Query unshielded address directly from connected Midnight API
 */
export async function getMidnightAddress(api) {
  if (!api) return null;
  if (typeof api.getUnshieldedAddress !== 'function') {
    throw new Error('Wallet API does not support getUnshieldedAddress()');
  }
  const res = await api.getUnshieldedAddress();
  return res?.unshieldedAddress || (typeof res === 'string' ? res : null);
}

/**
 * Query real USDM balance directly from connected Midnight API
 */
export async function getMidnightUsdmBalance(api) {
  if (!api || typeof api.getUnshieldedBalances !== 'function') {
    return '0.00';
  }
  try {
    const balances = await api.getUnshieldedBalances();
    const rawUsdm = (balances instanceof Map)
      ? (balances.get(USDM_TOKEN_COLOR) ?? 0n)
      : (balances?.[USDM_TOKEN_COLOR] ?? 0n);

    const formatted = Number(rawUsdm) / Math.pow(10, USDM_DECIMALS);
    return formatted.toFixed(2);
  } catch (err) {
    console.warn('[Wallet] USDM balance fetch error:', err);
    return '0.00';
  }
}

/**
 * Query real DUST balance directly from connected Midnight API
 */
export async function getMidnightDustBalance(api) {
  if (!api || typeof api.getDustBalance !== 'function') {
    return '0.00';
  }
  try {
    const rawDust = await api.getDustBalance();
    const formatted = Number(rawDust) / Math.pow(10, USDM_DECIMALS);
    return formatted.toFixed(2);
  } catch (err) {
    console.warn('[Wallet] DUST balance fetch error:', err);
    return '0.00';
  }
}

/**
 * Client-Side SHA-256 Hash Commitment Computation
 */
export async function computeClientSha256(text) {
  const msgUint8 = new TextEncoder().encode(text.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

