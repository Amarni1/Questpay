import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  WalletState,
  WalletStatus,
  AuthState,
  AuthStatus,
  WalletBalanceState,
  DiscoveredMidnightWallet,
  WalletTransactionEntry
} from '../types/index.js';
import {
  discoverMidnightWallets,
  connectMidnightWallet,
  readMidnightUsdmBalance,
  getRealUsdmBalance,
  submitFundingTransaction,
  submitPayoutTransaction,
  fetchWalletTxHistory,
  signChallengeData,
  submitContractTransaction,
  USDM_TOKEN_TYPE,
  CONTRACT_ADDRESS,
  MIDNIGHT_NETWORK
} from '../services/midnightWallet.js';

interface WalletContextType {
  wallet: WalletState;
  authState: AuthState;
  usdmBalance: WalletBalanceState;
  discoveredWallets: DiscoveredMidnightWallet[];
  history: WalletTransactionEntry[];
  isConnecting: boolean;
  isWalletModalOpen: boolean;
  isSignInModalOpen: boolean;
  signInModalReason: string;
  connectWallet: (walletObj: DiscoveredMidnightWallet) => Promise<void>;
  connectDevWallet: (customAddress?: string) => Promise<void>;
  openWalletModal: () => void;
  closeWalletModal: () => void;
  disconnect: () => void;
  refreshUsdmBalance: () => Promise<void>;
  getRealBalance: () => Promise<bigint>;
  fundBountyEscrow: (amountRaw: bigint) => Promise<{ txHash: string }>;
  payoutBountyReward: (questerAddress: string, amountRaw: bigint) => Promise<{ txHash: string }>;
  refreshTransactionHistory: () => Promise<void>;
  signChallenge: (message: string) => Promise<string>;
  sendContractTransaction: (circuitPayload: any) => Promise<{ txHash: string; method: string }>;
  getWalletTransactions: () => Promise<WalletTransactionEntry[]>;
  isAppAuthenticated: () => boolean;
  requestAuthSignature: () => Promise<string>;
  openSignInModal: (options?: { reason?: string; onAuthenticated?: () => void }) => void;
  closeSignInModal: () => void;
  ensureAuthenticated: (reason?: string, onAuthenticated?: () => void) => Promise<boolean>;
  getAuthHeaders: () => Record<string, string>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [wallet, setWallet] = useState<WalletState>({
    status: 'disconnected',
    connected: false,
    type: 'none',
    providerId: null,
    name: 'Not Connected',
    address: null,
    api: null,
    error: null
  });

  const [authState, setAuthState] = useState<AuthState>({
    status: 'unknown',
    token: null,
    wallet: null,
    expiresAt: null,
    error: null
  });

  const [usdmBalance, setUsdmBalance] = useState<WalletBalanceState>({
    raw: null,
    status: 'idle',
    error: null,
    updatedAt: null
  });

  const [history, setHistory] = useState<WalletTransactionEntry[]>([]);
  const [discoveredWallets, setDiscoveredWallets] = useState<DiscoveredMidnightWallet[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  const openWalletModal = useCallback(() => setIsWalletModalOpen(true), []);
  const closeWalletModal = useCallback(() => setIsWalletModalOpen(false), []);

  // Sign-In Modal & Pending Action State
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);
  const [signInModalReason, setSignInModalReason] = useState<string>('view_private_submissions');
  const pendingActionRef = useRef<(() => void) | null>(null);

  const walletRef = useRef(wallet);
  useEffect(() => { walletRef.current = wallet; }, [wallet]);

  const authStateRef = useRef(authState);
  useEffect(() => { authStateRef.current = authState; }, [authState]);

  const reconnectPromiseRef = useRef<Promise<any> | null>(null);
  const bootstrappedRef = useRef(false);

  // Read USDM balance with specific API instance
  const refreshWalletBalanceWithApi = useCallback(async (api: any) => {
    if (!api) {
      setUsdmBalance({
        raw: null,
        status: 'idle',
        error: 'Wallet not connected',
        updatedAt: null
      });
      return;
    }

    if (!USDM_TOKEN_TYPE) {
      setUsdmBalance({
        raw: null,
        status: 'error',
        error: 'VITE_USDM_TOKEN_TYPE is not configured',
        updatedAt: null
      });
      return;
    }

    try {
      setUsdmBalance(prev => ({
        ...prev,
        status: 'loading',
        error: null
      }));

      const raw = await readMidnightUsdmBalance(api);

      if ((import.meta as any).env?.DEV) {
        console.log('[QuestPay] Balance synced:', raw);
      }

      setUsdmBalance({
        raw,
        status: 'ready',
        error: null,
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('[QuestPay] Failed to read USDM balance:', error);
      setUsdmBalance({
        raw: null,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unable to read USDM balance',
        updatedAt: null
      });
    }
  }, []);

  // Read transaction history with specific API instance
  const refreshTransactionHistoryWithApi = useCallback(async (api: any) => {
    if (!api) {
      setHistory([]);
      return;
    }
    try {
      const entries = await fetchWalletTxHistory(api, 0, 100);
      if ((import.meta as any).env?.DEV) {
        console.log('[QuestPay] Transaction history synced, entries:', entries.length);
      }
      setHistory(Array.isArray(entries) ? entries : []);
    } catch (error) {
      console.error('[QuestPay] Transaction history failed:', error);
      setHistory([]);
    }
  }, []);

  const refreshUsdmBalance = useCallback(async () => {
    await refreshWalletBalanceWithApi(walletRef.current.api);
  }, [refreshWalletBalanceWithApi]);

  const refreshTransactionHistory = useCallback(async () => {
    await refreshTransactionHistoryWithApi(walletRef.current.api);
  }, [refreshTransactionHistoryWithApi]);

  // Discover injected window.midnight wallets
  useEffect(() => {
    const discover = () => {
      const found = discoverMidnightWallets();
      setDiscoveredWallets(found);
    };
    discover();
    const interval = setInterval(discover, 1500);
    return () => clearInterval(interval);
  }, []);

  // Check existing session status (silent, no modal)
  const checkExistingSession = useCallback(async (walletAddress: string) => {
    setAuthState({
      status: 'authenticated',
      token: sessionStorage.getItem('questpay_session_token') || null,
      wallet: walletAddress,
      expiresAt: null,
      error: null
    });
  }, []);

  // Safe reconnect helper with Promise guard to prevent duplicate dialogs
  const safeReconnect = async (provider: any) => {
    if (reconnectPromiseRef.current) {
      return reconnectPromiseRef.current;
    }

    reconnectPromiseRef.current = connectMidnightWallet(provider);
    try {
      return await reconnectPromiseRef.current;
    } finally {
      reconnectPromiseRef.current = null;
    }
  };

  // Reconnect to saved wallet provider silently WITHOUT requesting auth signature
  const reconnectToWallet = useCallback(async (provider: any, providerId: string) => {
    try {
      if ((import.meta as any).env?.DEV) {
        console.log('[QuestPay] Reconnecting wallet:', providerId);
      }

      setWallet(prev => ({
        ...prev,
        status: 'reconnecting'
      }));

      const connected = await safeReconnect(provider);

      if ((import.meta as any).env?.DEV) {
        console.log('[QuestPay] Wallet connected:', connected.address);
        console.log('[QuestPay] Network:', connected.networkId);
      }

      const walletSession: WalletState = {
        status: 'connected',
        connected: true,
        type: 'midnight',
        providerId,
        name: provider.name || 'Midnight Wallet',
        icon: provider.icon || '🌙',
        rdns: provider.rdns,
        apiVersion: provider.apiVersion,
        address: connected.address,
        api: connected.api,
        networkId: connected.networkId,
        error: null
      };

      setWallet(walletSession);

      /*
       * IMPORTANT:
       * Do NOT call signData() here.
       * Do NOT request an auth signature here.
       */

      await Promise.all([
        refreshWalletBalanceWithApi(connected.api),
        refreshTransactionHistoryWithApi(connected.api)
      ]);

      // Check session status silently
      if (connected.address) {
        checkExistingSession(connected.address);
      }
    } catch (error) {
      console.error('[QuestPay] Wallet reconnect failed:', error);
      setWallet({
        status: 'error',
        connected: false,
        type: 'none',
        providerId: null,
        name: 'Not Connected',
        address: null,
        api: null,
        error: error instanceof Error ? error.message : 'Unable to reconnect wallet'
      });
    }
  }, [refreshWalletBalanceWithApi, refreshTransactionHistoryWithApi, checkExistingSession]);

  // Bootstrap wallet once on application load
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    if ((import.meta as any).env?.DEV) {
      console.log('[QuestPay] Booting');
    }

    const providerId = localStorage.getItem('questpay.walletProviderId') || localStorage.getItem('questpay.walletId');
    if (!providerId) {
      setWallet(prev => ({ ...prev, status: 'disconnected' }));
      return;
    }

    if ((import.meta as any).env?.DEV) {
      console.log('[QuestPay] Restoring wallet provider:', providerId);
    }

    // Attempt provider lookup
    const attemptRestore = () => {
      const wallets = discoverMidnightWallets();
      const target = wallets.find(w => w.id === providerId || w.rdns === providerId || w.name === providerId);
      if (target) {
        reconnectToWallet(target.provider, providerId);
        return true;
      }
      return false;
    };

    if (!attemptRestore()) {
      // Retry once after 500ms if extension injects slightly delayed
      const timeout = setTimeout(() => {
        if (!attemptRestore()) {
          setWallet(prev => ({ ...prev, status: 'disconnected' }));
        }
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [reconnectToWallet]);

  // Polling every 15s while connected
  useEffect(() => {
    if (!wallet.api) return;

    const interval = setInterval(() => {
      refreshWalletBalanceWithApi(walletRef.current.api);
    }, 15000);

    return () => clearInterval(interval);
  }, [wallet.api, refreshWalletBalanceWithApi]);

  // Refresh on visibility change
  useEffect(() => {
    if (!wallet.api) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && walletRef.current.api) {
        refreshWalletBalanceWithApi(walletRef.current.api);
        refreshTransactionHistoryWithApi(walletRef.current.api);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [wallet.api, refreshWalletBalanceWithApi, refreshTransactionHistoryWithApi]);

  // Explicit user connection
  const connectWallet = async (walletObj: DiscoveredMidnightWallet) => {
    setIsConnecting(true);
    setWallet(prev => ({ ...prev, status: 'connecting' }));

    try {
      const connected = await connectMidnightWallet(walletObj.provider);

      const providerId = walletObj.id || walletObj.rdns || walletObj.name;
      const nextWallet: WalletState = {
        status: 'connected',
        connected: true,
        type: 'midnight',
        providerId,
        name: walletObj.name,
        icon: walletObj.icon,
        rdns: walletObj.rdns,
        apiVersion: walletObj.apiVersion,
        address: connected.address,
        api: connected.api,
        networkId: connected.networkId,
        error: null
      };

      setWallet(nextWallet);

      // Persist ONLY wallet provider identifier
      localStorage.setItem('questpay.walletProviderId', providerId);

      if ((import.meta as any).env?.DEV) {
        console.log('[QuestPay] Wallet connected:', connected.address);
      }

      await Promise.all([
        refreshWalletBalanceWithApi(connected.api),
        refreshTransactionHistoryWithApi(connected.api)
      ]);

      if (connected.address) {
        checkExistingSession(connected.address);
      }
    } catch (err: any) {
      console.error('[QuestPay] Connect wallet failed:', err);
      setWallet(prev => ({
        ...prev,
        status: 'error',
        error: err.message || 'Connection failed'
      }));
      throw err;
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect
  const disconnect = () => {
    setWallet({
      status: 'disconnected',
      connected: false,
      type: 'none',
      providerId: null,
      name: 'Not Connected',
      address: null,
      api: null,
      error: null
    });
    setAuthState({
      status: 'notAuthenticated',
      token: null,
      wallet: null,
      expiresAt: null,
      error: null
    });
    setUsdmBalance({
      raw: null,
      status: 'idle',
      error: null,
      updatedAt: null
    });
    setHistory([]);
    localStorage.removeItem('questpay.walletProviderId');
    localStorage.removeItem('questpay.walletId');
    sessionStorage.removeItem('questpay_session_token');
    sessionStorage.removeItem('questpay.authenticated');

    // Invalidate server session
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  };

  // Low-level sign challenge method
  const signChallenge = async (message: string): Promise<string> => {
    if (!wallet.address || !wallet.api) throw new Error('Wallet not connected');
    return signChallengeData(wallet.api, message);
  };

  // Request application authorization signature (invoked by user action in SignInModal)
  const requestAuthSignature = async (): Promise<string> => {
    if (!wallet.address || !wallet.api) {
      throw new Error('Please connect your Midnight wallet first.');
    }

    if ((import.meta as any).env?.DEV) {
      console.log('[QuestPay] Application authorization required');
      console.log('[QuestPay] Sign-in requested by protected action');
    }

    setAuthState(prev => ({ ...prev, status: 'signing', error: null }));

    try {
      // 1. Fetch challenge
      const chRes = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: wallet.address })
      });

      const chData = await chRes.json();
      if (!chRes.ok || !chData.success) {
        throw new Error(chData.error || 'Failed to obtain security challenge');
      }

      // 2. Sign with Midnight signData()
      const signature = await signChallengeData(wallet.api, chData.message);

      // 3. Verify on backend and establish session
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: wallet.address,
          challengeId: chData.challengeId,
          message: chData.message,
          signature
        })
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData.error || 'Signature verification failed');
      }

      const token = verifyData.token;
      sessionStorage.setItem('questpay_session_token', token);
      sessionStorage.setItem('questpay.authenticated', 'true');

      setAuthState({
        status: 'authenticated',
        token,
        wallet: wallet.address,
        expiresAt: verifyData.expiresAt || null,
        error: null
      });

      setIsSignInModalOpen(false);

      // Execute pending action if one was queued
      if (pendingActionRef.current) {
        const action = pendingActionRef.current;
        pendingActionRef.current = null;
        action();
      }

      return token;
    } catch (err: any) {
      console.error('[QuestPay] Authorization signature failed:', err);
      setAuthState(prev => ({
        ...prev,
        status: 'error',
        error: err.message || 'Signature authorization failed'
      }));
      throw err;
    }
  };

  const isAppAuthenticated = useCallback((): boolean => {
    return !!walletRef.current.address;
  }, []);

  const openSignInModal = useCallback((options?: { reason?: string; onAuthenticated?: () => void }) => {
    if (options?.onAuthenticated) options.onAuthenticated();
  }, []);

  const closeSignInModal = useCallback(() => {
    setIsSignInModalOpen(false);
    pendingActionRef.current = null;
  }, []);

  // Ensure authenticated: executes action immediately for connected wallet
  const ensureAuthenticated = useCallback(async (_reason = 'view_private_submissions', onAuthenticated?: () => void): Promise<boolean> => {
    if (onAuthenticated) onAuthenticated();
    return true;
  }, []);

  // Auth headers for backend calls
  const getAuthHeaders = useCallback((): Record<string, string> => {
    const token = sessionStorage.getItem('questpay_session_token') || authStateRef.current.token;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-questpay-session-token'] = token;
    }
    if (walletRef.current.address) {
      headers['x-questpay-wallet'] = walletRef.current.address;
    }
    return headers;
  }, []);

  // Submit contract transaction
  const sendContractTransaction = async (circuitPayload: any) => {
    const result = await submitContractTransaction(wallet.api, circuitPayload);

    if (wallet.api) {
      await Promise.all([
        refreshWalletBalanceWithApi(wallet.api),
        refreshTransactionHistoryWithApi(wallet.api)
      ]);

      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        if (attempts > 8 || !walletRef.current.api) {
          clearInterval(pollInterval);
          return;
        }
        await Promise.all([
          refreshWalletBalanceWithApi(walletRef.current.api),
          refreshTransactionHistoryWithApi(walletRef.current.api)
        ]);
      }, 3000);
    }

    return result;
  };

  const connectDevWallet = async (customAddress?: string) => {
    const dev = {
      id: 'dev.preview.wallet',
      rdns: 'io.midnight.preview.dev',
      name: 'Preview Testnet Dev Wallet',
      icon: 'https://assets.midnight.network/icons/midnight-logo.svg',
      apiVersion: '4.0.1',
      provider: { isDevWallet: true, customAddress }
    };
    await connectWallet(dev as any);
  };

  const getRealBalance = async (): Promise<bigint> => {
    if (!wallet.api) throw new Error('Wallet not connected');
    return getRealUsdmBalance(wallet.api);
  };

  const fundBountyEscrow = async (amountRaw: bigint): Promise<{ txHash: string }> => {
    if (!wallet.api || !wallet.address) throw new Error('Connect your Midnight wallet first.');
    if (wallet.networkId !== MIDNIGHT_NETWORK) {
      throw new Error('QuestPay funding requires a Midnight Preview wallet connection.');
    }
    const realBal = await getRealBalance();
    if (realBal < amountRaw) {
      throw new Error('Insufficient USDM balance.');
    }
    const result = await submitFundingTransaction(wallet.api, amountRaw, wallet.apiVersion);
    refreshUsdmBalance();
    refreshTransactionHistory();
    return result;
  };

  const payoutBountyReward = async (questerAddress: string, amountRaw: bigint): Promise<{ txHash: string }> => {
    if (!wallet.api || !wallet.address) throw new Error('Please connect your Midnight wallet first.');
    const result = await submitPayoutTransaction(wallet.api, questerAddress, amountRaw, USDM_TOKEN_TYPE);
    refreshUsdmBalance();
    refreshTransactionHistory();
    return result;
  };

  const getWalletTransactions = async () => {
    if (!wallet.api) return [];
    return fetchWalletTxHistory(wallet.api, 0, 100);
  };

  return (
    <WalletContext.Provider value={{
      wallet,
      authState,
      usdmBalance,
      discoveredWallets,
      history,
      isConnecting,
      isWalletModalOpen,
      isSignInModalOpen,
      signInModalReason,
      connectWallet,
      connectDevWallet,
      openWalletModal,
      closeWalletModal,
      disconnect,
      refreshUsdmBalance,
      getRealBalance,
      fundBountyEscrow,
      payoutBountyReward,
      refreshTransactionHistory,
      signChallenge,
      sendContractTransaction,
      getWalletTransactions,
      isAppAuthenticated,
      requestAuthSignature,
      openSignInModal,
      closeSignInModal,
      ensureAuthenticated,
      getAuthHeaders
    }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used within WalletProvider');
  return context;
};
