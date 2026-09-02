import React, { useState } from 'react';
import { useWallet } from '../context/WalletContext.js';
import { DiscoveredMidnightWallet } from '../types/index.js';
import {
  Wallet,
  Shield,
  X,
  AlertCircle,
  Loader2,
  ExternalLink,
  Sparkles,
  Zap,
  CheckCircle2,
  RefreshCw,
  HelpCircle
} from 'lucide-react';

interface WalletConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WalletConnectModal: React.FC<WalletConnectModalProps> = ({ isOpen, onClose }) => {
  const { discoveredWallets, isConnecting, connectWallet, connectDevWallet } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [lastAttemptedWallet, setLastAttemptedWallet] = useState<DiscoveredMidnightWallet | null>(null);

  if (!isOpen) return null;

  const handleConnect = async (w: DiscoveredMidnightWallet) => {
    setError(null);
    setLastAttemptedWallet(w);
    try {
      await connectWallet(w);
      onClose();
    } catch (err: any) {
      console.warn('[QuestPay] Wallet connection attempt failed:', err.message);
      setError(err.message || 'Connection failed.');
    }
  };

  const handleConnectDev = async () => {
    setError(null);
    try {
      await connectDevWallet();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Dev connection failed.');
    }
  };

  // Helper to safely render wallet icons without dumping raw base64 data URIs
  const renderWalletIcon = (icon?: string, name?: string) => {
    if (!icon) {
      return (
        <div className="wallet-card-avatar" style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)' }}>
          <Wallet size={20} style={{ color: 'var(--gold-primary)' }} />
        </div>
      );
    }

    if (icon.startsWith('data:image') || icon.startsWith('http://') || icon.startsWith('https://')) {
      return (
        <div className="wallet-card-avatar">
          <img
            src={icon}
            alt={name || 'Wallet'}
            className="wallet-card-avatar-img"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      );
    }

    if (icon.startsWith('<svg')) {
      return (
        <div
          className="wallet-card-avatar"
          dangerouslySetInnerHTML={{ __html: icon }}
        />
      );
    }

    return (
      <div className="wallet-card-avatar" style={{ fontSize: '1.25rem' }}>
        {icon}
      </div>
    );
  };

  const isLaceDetected = discoveredWallets.some(
    w => w.id?.toLowerCase().includes('lace') || w.name?.toLowerCase().includes('lace') || w.rdns?.toLowerCase().includes('lace')
  );

  return (
    <div className="modal-backdrop">
      <div className="modal-card" style={{ maxWidth: '540px' }}>
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'rgba(212, 175, 55, 0.12)', padding: '6px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={22} style={{ color: 'var(--gold-primary)' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 className="modal-title" style={{ fontSize: '1.15rem', fontWeight: 800 }}>Connect Midnight Wallet</h2>
                <span className="badge-pill open" style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem' }}>Preview Testnet</span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                Select a DApp Connector to fund escrows and submit zero-knowledge proofs.
              </p>
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        {/* Error / Denial Alert with Fast Fallback */}
        {error && (
          <div style={{
            background: 'var(--rose-surface)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            color: 'var(--rose-danger)',
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '1.25rem',
            fontSize: '0.82rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '0.5rem' }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>Wallet Connection Notice</div>
                <div style={{ color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.4 }}>
                  {error.includes('denied') || error.includes('reject')
                    ? 'The connection request was rejected or closed. Please open the Lace extension in your browser toolbar, unlock your account, and approve the connection.'
                    : error}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', justifyContent: 'flex-end' }}>
              {lastAttemptedWallet && (
                <button
                  className="btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
                  onClick={() => handleConnect(lastAttemptedWallet)}
                  disabled={isConnecting}
                >
                  <RefreshCw size={12} className={isConnecting ? 'spin-icon' : ''} />
                  <span>Retry</span>
                </button>
              )}
              <button
                className="btn-primary"
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', background: 'linear-gradient(135deg, var(--gold-primary), #b45309)' }}
                onClick={handleConnectDev}
              >
                <Zap size={12} />
                <span>Use Preview Testnet Dev Wallet</span>
              </button>
            </div>
          </div>
        )}

        {/* SECTION 1: DETECTED MIDNIGHT WALLETS */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Available Wallet Extensions ({discoveredWallets.length}):</span>
            {discoveredWallets.length > 0 && (
              <span style={{ color: 'var(--emerald-success)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem' }}>
                <CheckCircle2 size={12} /> Ready
              </span>
            )}
          </div>

          {discoveredWallets.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {discoveredWallets.map((w) => (
                <div
                  key={w.id}
                  className="wallet-connect-card"
                  onClick={() => !isConnecting && handleConnect(w)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {renderWalletIcon(w.icon, w.name)}
                    <div>
                      <div style={{ fontWeight: 800, color: '#fff', fontSize: '0.92rem' }}>
                        {w.name}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                        {w.rdns} · API v{w.apiVersion || '0.4.0'}
                      </div>
                    </div>
                  </div>

                  <button
                    className="btn-primary"
                    style={{ padding: '0.45rem 0.9rem', fontSize: '0.78rem', minWidth: '95px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleConnect(w);
                    }}
                    disabled={isConnecting}
                  >
                    {isConnecting && lastAttemptedWallet?.id === w.id ? (
                      <Loader2 size={14} className="spin-icon" />
                    ) : (
                      <span>Connect →</span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: 'var(--bg-obsidian)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="wallet-card-avatar">
                  <Wallet size={18} style={{ color: 'var(--text-dim)' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>No Browser Extension Detected</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Install Lace to use browser-based signing</div>
                </div>
              </div>

              <a
                href="https://chromewebstore.google.com/detail/lace-midnight-preview/hgeekaiplbgblmdfkpnflgodabnopkfa"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <span>Get Lace</span>
                <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>

        {/* SECTION 2: INSTANT SANDBOX / PREVIEW TESTNET DEV WALLET */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>
            Instant Testing Mode:
          </div>

          <div
            className="wallet-connect-card"
            style={{
              borderColor: 'rgba(212, 175, 55, 0.25)',
              background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.05), var(--bg-obsidian))'
            }}
            onClick={handleConnectDev}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="wallet-card-avatar" style={{ background: 'linear-gradient(135deg, var(--gold-primary), #b45309)' }}>
                <Zap size={18} style={{ color: '#0f172a' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ fontWeight: 800, color: '#fff', fontSize: '0.92rem' }}>
                    Preview Testnet Dev Wallet
                  </div>
                  <span className="badge-pill gold" style={{ fontSize: '0.62rem', padding: '0.1rem 0.4rem' }}>Instant</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                  Pre-funded testnet account (10,000 USDM) · No extension required
                </div>
              </div>
            </div>

            <button
              className="btn-primary"
              style={{ padding: '0.45rem 0.9rem', fontSize: '0.78rem', background: 'linear-gradient(135deg, var(--gold-primary), #d97706)', minWidth: '95px' }}
              onClick={(e) => {
                e.stopPropagation();
                handleConnectDev();
              }}
            >
              <Sparkles size={13} />
              <span>Connect</span>
            </button>
          </div>
        </div>

        {/* Footer Info */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.85rem', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <HelpCircle size={13} /> Midnight Preview Network (Contract: 471dfe55...)
          </span>
          <a
            href="https://docs.midnight.network"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--midnight-blue)', textDecoration: 'none' }}
          >
            Midnight Docs ↗
          </a>
        </div>
      </div>
    </div>
  );
};

