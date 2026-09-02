import React from 'react';
import { useWallet } from '../context/WalletContext.js';
import { formatUsdm } from '../services/midnightWallet.js';
import {
  LayoutDashboard,
  Compass,
  Briefcase,
  Inbox,
  History,
  Trophy,
  PlusCircle,
  Shield,
  Wallet,
  Copy,
  Check,
  LogOut,
  ExternalLink,
  Loader2
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenWalletModal: () => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onOpenWalletModal,
  isMobileOpen,
  setIsMobileOpen
}) => {
  const { wallet, usdmBalance, disconnect } = useWallet();
  const [copied, setCopied] = React.useState(false);

  const copyAddress = () => {
    if (wallet.address) {
      navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'explore', label: 'Explore Quests', icon: Compass },
    { id: 'my-bounties', label: 'My Bounties', icon: Briefcase },
    { id: 'submissions', label: 'Submissions', icon: Inbox },
    { id: 'history', label: 'Transaction History', icon: History },
    { id: 'reputation', label: 'Reputation', icon: Trophy },
  ];

  const renderUsdmBalanceText = () => {
    if (usdmBalance.status === 'loading') return 'Syncing…';
    if (usdmBalance.status === 'error') return 'Unavailable';
    if (usdmBalance.raw === null) return '—';
    return `${formatUsdm(usdmBalance.raw)} USDM`;
  };

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div
          className="mobile-sidebar-overlay"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside className={`app-sidebar ${isMobileOpen ? 'mobile-open' : ''}`}>
        {/* Brand Header */}
        <div className="sidebar-brand">
          <div className="brand-icon-box">
            <Shield size={20} />
          </div>
          <div>
            <div className="brand-title">
              QUEST<span style={{ color: 'var(--gold-primary)' }}>PAY</span>
            </div>
            <div className="brand-subtitle">Private Bounty Settlement</div>
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="sidebar-menu-section">
          <div className="sidebar-section-label">MAIN NAVIGATION</div>
          <nav className="sidebar-nav">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileOpen(false);
                  }}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Employer Action Section */}
        <div className="sidebar-menu-section" style={{ marginTop: '1rem' }}>
          <div className="sidebar-section-label">EMPLOYER</div>
          <button
            className={`sidebar-create-btn ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('create');
              setIsMobileOpen(false);
            }}
          >
            <PlusCircle size={18} />
            <span>Create Bounty</span>
          </button>
        </div>

        <div style={{ flex: 1 }} />

        {/* Connected Wallet Bottom Card */}
        <div className="sidebar-wallet-card">
          {wallet.connected ? (
            <div>
              <div className="wallet-status-row">
                <span className="status-dot-active" />
                <span style={{ color: 'var(--midnight-blue)', fontWeight: 700, fontSize: '0.75rem' }}>
                  Midnight Preview
                </span>
              </div>

              <div className="wallet-address-box">
                <span className="wallet-address-text">
                  {wallet.address?.slice(0, 8)}...{wallet.address?.slice(-6)}
                </span>
                <button onClick={copyAddress} title="Copy Address" className="icon-btn-subtle">
                  {copied ? <Check size={13} style={{ color: 'var(--emerald-success)' }} /> : <Copy size={13} />}
                </button>
              </div>

              <div className="wallet-balance-row">
                <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>USDM:</span>
                <span style={{ color: 'var(--gold-primary)', fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                  {renderUsdmBalanceText()}
                </span>
              </div>

              <button className="sidebar-disconnect-btn" onClick={disconnect}>
                <LogOut size={13} />
                <span>Disconnect</span>
              </button>
            </div>
          ) : wallet.status === 'reconnecting' ? (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--midnight-blue)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="status-dot-active" />
                <span>Reconnecting to Midnight…</span>
              </div>
              <button className="btn-wallet-connect" style={{ width: '100%', justifyContent: 'center', opacity: 0.8 }} disabled>
                <Loader2 size={16} className="spin-icon" />
                <span>Reconnecting…</span>
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
                Wallet Not Connected
              </div>
              <button className="btn-wallet-connect" style={{ width: '100%', justifyContent: 'center' }} onClick={onOpenWalletModal}>
                <Wallet size={16} />
                <span>Connect Wallet</span>
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
