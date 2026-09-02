import React, { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext.js';
import { formatUsdm } from '../services/midnightWallet.js';
import { PlatformStats, Bounty } from '../types/index.js';
import {
  Compass,
  Briefcase,
  Inbox,
  History,
  Coins,
  Shield,
  ArrowUpRight,
  Sparkles,
  CheckCircle2,
  Lock,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (tab: string, bountyId?: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { wallet, usdmBalance, history, refreshUsdmBalance, openWalletModal } = useWallet();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [recentBounties, setRecentBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const [statsRes, bountiesRes] = await Promise.all([
          fetch('/api/stats'),
          fetch('/api/bounties')
        ]);

        const statsData = await statsRes.json();
        const bountiesData = await bountiesRes.json();

        if (statsData.success) setStats(statsData.stats);
        if (bountiesData.success) setRecentBounties(bountiesData.bounties || []);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const handleManualRefresh = async () => {
    setIsManualSyncing(true);
    try {
      await refreshUsdmBalance();
    } finally {
      setIsManualSyncing(false);
    }
  };

  const renderUsdmBalance = () => {
    if (usdmBalance.status === 'loading' || isManualSyncing) {
      return <span>Syncing…</span>;
    }

    if (usdmBalance.status === 'error') {
      if (usdmBalance.error?.includes('VITE_USDM_TOKEN_TYPE') || usdmBalance.error?.includes('not configured')) {
        return <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>USDM unavailable</span>;
      }
      if (usdmBalance.error?.includes('not returned by the wallet')) {
        return <span style={{ fontSize: '0.85rem', color: '#fb7185' }}>USDM token not found</span>;
      }
      return <span>Unavailable</span>;
    }

    if (usdmBalance.raw === null) {
      return <span>Connect wallet</span>;
    }

    return <span>{formatUsdm(usdmBalance.raw)} USDM</span>;
  };

  return (
    <div className="dashboard-container">
      {/* Welcome Banner */}
      <div className="dashboard-welcome-banner">
        <div className="welcome-content">
          <div className="welcome-badge">
            <span className={wallet.connected ? 'status-dot-active' : wallet.status === 'reconnecting' ? 'status-dot-pending' : 'status-dot'} />
            <span>
              {wallet.connected ? 'Connected ✓ Midnight Preview' : wallet.status === 'reconnecting' ? 'Connecting to Midnight…' : 'Midnight Preview Network'}
            </span>
          </div>
          <h1 className="welcome-title">
            {wallet.connected ? (
              <>Welcome back, <span className="wallet-highlight">{wallet.address?.slice(0, 8)}...{wallet.address?.slice(-6)}</span></>
            ) : wallet.status === 'reconnecting' ? (
              <>Reconnecting <span className="brand-highlight">Wallet…</span></>
            ) : (
              <>Welcome to <span className="brand-highlight">QuestPay</span></>
            )}
          </h1>
          <p className="welcome-subtitle">
            Zero-knowledge bounty marketplace with Compact smart contract escrow and private off-chain proof verification.
          </p>
        </div>

        {wallet.connected ? (
          <div className="welcome-balance-card">
            <div className="balance-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Coins size={16} style={{ color: 'var(--gold-primary)' }} />
                <span>USDM Balance</span>
              </div>
              <button
                onClick={handleManualRefresh}
                title="Refresh USDM balance"
                className="icon-btn-subtle"
                style={{ color: 'var(--text-dim)', padding: '2px 4px' }}
                disabled={usdmBalance.status === 'loading' || isManualSyncing}
              >
                <RefreshCw size={13} className={(usdmBalance.status === 'loading' || isManualSyncing) ? 'spin-icon' : ''} />
              </button>
            </div>

            <div className="balance-amount">
              {renderUsdmBalance()}
            </div>

            <div className="balance-sub" style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
              {usdmBalance.status === 'loading' || isManualSyncing ? (
                'Syncing wallet…'
              ) : usdmBalance.updatedAt ? (
                `Last synced: ${new Date(usdmBalance.updatedAt).toLocaleTimeString()}`
              ) : usdmBalance.error ? (
                usdmBalance.error
              ) : (
                'Connected to Preview'
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={openWalletModal}>
              <Shield size={16} />
              <span>Connect Wallet</span>
            </button>
            <button className="btn-secondary" onClick={() => onNavigate('explore')}>
              <Compass size={16} />
              <span>Explore Bounties</span>
            </button>
          </div>
        )}
      </div>

      {/* Real Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card" onClick={() => onNavigate('explore')} style={{ cursor: 'pointer' }}>
          <div className="stat-card-header">
            <span className="stat-label">Active Bounties</span>
            <Compass size={16} style={{ color: 'var(--midnight-blue)' }} />
          </div>
          <div className="stat-value blue">{stats?.activeQuestsCount || 0}</div>
          <div className="stat-meta">Live on Midnight Preview</div>
        </div>

        <div className="stat-card" onClick={() => onNavigate('my-bounties')} style={{ cursor: 'pointer' }}>
          <div className="stat-card-header">
            <span className="stat-label">Total Escrow Locked</span>
            <Briefcase size={16} style={{ color: 'var(--gold-primary)' }} />
          </div>
          <div className="stat-value gold">${stats?.totalEscrowLockedUsdm?.toLocaleString() || '0.00'} USDM</div>
          <div className="stat-meta">Locked in Smart Contracts</div>
        </div>

        <div className="stat-card" onClick={() => onNavigate('submissions')} style={{ cursor: 'pointer' }}>
          <div className="stat-card-header">
            <span className="stat-label">Settled Payouts</span>
            <CheckCircle2 size={16} style={{ color: 'var(--emerald-success)' }} />
          </div>
          <div className="stat-value emerald">${stats?.totalPaidUsdm?.toLocaleString() || '0.00'} USDM</div>
          <div className="stat-meta">{stats?.completedQuestsCount || 0} completed bounties</div>
        </div>

        <div className="stat-card" onClick={() => onNavigate('history')} style={{ cursor: 'pointer' }}>
          <div className="stat-card-header">
            <span className="stat-label">Wallet Transactions</span>
            <History size={16} style={{ color: '#a78bfa' }} />
          </div>
          <div className="stat-value" style={{ color: '#a78bfa' }}>
            {wallet.connected ? history.length : '—'}
          </div>
          <div className="stat-meta">Read from getTxHistory()</div>
        </div>
      </div>

      {/* Quick Actions & Recent On-Chain Bounties */}
      <div className="dashboard-grid-two">
        {/* Recent Bounties */}
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <div className="dashboard-card-title">
              <Sparkles size={18} style={{ color: 'var(--gold-primary)' }} />
              <span>Recent On-Chain Bounties</span>
            </div>
            <button className="btn-link" onClick={() => onNavigate('explore')}>
              <span>View All</span>
              <ArrowUpRight size={14} />
            </button>
          </div>

          {recentBounties.length === 0 ? (
            <div className="dashboard-empty-state">
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
              <div style={{ fontWeight: 700, color: '#fff', marginBottom: '0.25rem' }}>No Real Bounties Published Yet</div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '340px', margin: '0 auto 1rem' }}>
                All mock data has been removed. Bounties will appear here as soon as they are funded on-chain.
              </p>
              <button className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }} onClick={() => onNavigate('create')}>
                + Create First Bounty
              </button>
            </div>
          ) : (
            <div className="recent-bounties-list">
              {recentBounties.slice(0, 4).map(b => (
                <div key={b.id} className="recent-bounty-row" onClick={() => onNavigate('explore', b.id)}>
                  <div>
                    <div className="recent-bounty-title">{b.title}</div>
                    <div className="recent-bounty-meta">
                      <span className="badge-pill open">{b.category}</span>
                      <span>● {b.proofType}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="recent-bounty-reward">${b.rewardUsdm} USDM</div>
                    <div className="recent-bounty-status">{b.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security & Verification Card */}
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <div className="dashboard-card-title">
              <Lock size={18} style={{ color: 'var(--midnight-blue)' }} />
              <span>Privacy & Security Protocol</span>
            </div>
          </div>

          <div className="protocol-info-box">
            <div className="protocol-item">
              <div className="protocol-icon">🔒</div>
              <div>
                <div className="protocol-heading">Zero-Knowledge Off-Chain Proofs</div>
                <div className="protocol-desc">Screenshots, PDFs, and links are encrypted with AES-256-GCM. Only commitment hashes are published to Compact.</div>
              </div>
            </div>

            <div className="protocol-item">
              <div className="protocol-icon">✍️</div>
              <div>
                <div className="protocol-heading">Header-Based Challenge Auth</div>
                <div className="protocol-desc">Submissions are strictly guarded by signed wallet challenges. Non-owner addresses receive HTTP 403 Forbidden.</div>
              </div>
            </div>

            <div className="protocol-item">
              <div className="protocol-icon">🌙</div>
              <div>
                <div className="protocol-heading">Midnight Preview DApp Connector v4</div>
                <div className="protocol-desc">Real transaction history and balance queries directly from your connected Midnight wallet provider.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
