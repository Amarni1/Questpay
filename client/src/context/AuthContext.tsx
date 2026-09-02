import React, { createContext, useContext, useState, useEffect } from 'react';
import { useWallet } from './WalletContext.js';

interface AuthContextType {
  authToken: string | null;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  authError: string | null;
  authenticateWallet: () => Promise<string>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { wallet, signChallenge } = useWallet();
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Restore saved token
  useEffect(() => {
    const savedToken = localStorage.getItem('questpay_auth_token');
    const savedWallet = localStorage.getItem('questpay_auth_wallet');

    if (savedToken && savedWallet && wallet.address && savedWallet.toLowerCase() === wallet.address.toLowerCase()) {
      setAuthToken(savedToken);
    } else {
      setAuthToken(null);
    }
  }, [wallet.address]);

  const authenticateWallet = async (): Promise<string> => {
    if (!wallet.connected || !wallet.address) {
      throw new Error('Please connect your Midnight wallet first.');
    }

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      // 1. Fetch challenge from backend
      const challengeRes = await fetch(`/api/auth/challenge?wallet=${encodeURIComponent(wallet.address)}`);
      const challengeData = await challengeRes.json();

      if (!challengeRes.ok || !challengeData.success) {
        throw new Error(challengeData.error || 'Failed to obtain authentication challenge');
      }

      // 2. Sign the challenge message using wallet
      const signature = await signChallenge(challengeData.message);

      // 3. Verify signature with backend
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: wallet.address,
          signature
        })
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData.error || 'Wallet signature verification failed');
      }

      const token = verifyData.token;
      setAuthToken(token);
      localStorage.setItem('questpay_auth_token', token);
      localStorage.setItem('questpay_auth_wallet', wallet.address.toLowerCase());

      return token;
    } catch (err: any) {
      setAuthError(err.message);
      throw err;
    } finally {
      setIsAuthenticating(false);
    }
  };

  const logout = () => {
    setAuthToken(null);
    localStorage.removeItem('questpay_auth_token');
    localStorage.removeItem('questpay_auth_wallet');
  };

  return (
    <AuthContext.Provider value={{
      authToken,
      isAuthenticated: !!authToken,
      isAuthenticating,
      authError,
      authenticateWallet,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
