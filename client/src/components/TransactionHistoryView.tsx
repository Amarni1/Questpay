import React, { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext.js';
import { WalletTransactionEntry } from '../types/index.js';
import { getExplorerTxUrl } from '../services/midnightWallet.js';
import {
  History,
  RotateCw,
  Copy,
  Check,
  ExternalLink,
  Lock,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Search
} from 'lucide-react';

export const TransactionHistoryView: React.FC = () => {
  const { wallet, history, refreshTransactionHistory } = useWallet();

  const [loading, setLoading] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'finalized' | 'discarded'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadHistory = async () => {
    if (!wallet.connected) return;
    setLoading(true);
    try {
      await refreshTransactionHistory();
    } finally {
      setLoading(false);
    }
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const getStatusBadge = (status?: string) => {
    const s = (status || 'confirmed').toLowerCase();
    if (s === 'finalized') {
      return (
        <span className="badge-pill paid" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <CheckCircle2 size={12} />
          <span>Finalized</span>
        </span>
      );
    }
    if (s === 'confirmed') {
      return (
        <span className="badge-pill open" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <CheckCircle2 size={12} />
          <span>Confirmed</span>
        </span>
      );
    }
    if (s === 'pending') {
      return (
        <span className="badge-pill attestation" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Clock size={12} />
          <span>Pending</span>
        </span>
      );
    }
    if (s === 'discarded') {
      return (
        <span className="badge-pill" style={{ background: 'var(--rose-surface)', color: 'var(--rose-danger)', border: '1px solid rgba(244, 63, 94, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <XCircle size={12} />
          <span>Discarded</span>
        </span>
      );
    }
    return (
      <span className="badge-pill open">
        {s}
      </span>
    );
  };

  const filteredHistory = history.filter(tx => {
    const s = (tx.status || 'confirmed').toLowerCase();
    if (statusFilter !== 'all' && s !== statusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      return tx.hash.toLowerCase().includes(searchQuery.trim().toLowerCase());
    }
    return true;
  });

  return (
    <div className="tx-history-container">
      <div className="view-header">
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--midnight-blue)', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem' }}>
            <History size={14} />
            <span>On-Chain Ledger Activity</span>
          </div>
          <h1 className="view-title">Transaction History</h1>
          <p className="view-subtitle" style={{ color: 'var(--gold-secondary)' }}>
            Real transaction records queried directly from connectedApi.getTxHistory(0, 100).
          </p>
        </div>

        {wallet.connected && (
          <button className="btn-secondary" onClick={loadHistory} disabled={loading}>
            <RotateCw size={15} className={loading ? 'spin-icon' : ''} />
            <span>Refresh</span>
          </button>
        )}
      </div>

      {!wallet.connected ? (
        <div className="empty-state-card">
          <Lock size={44} style={{ color: 'var(--gold-primary)', margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginBottom: '0.5rem' }}>
            Connect Wallet to View Transaction History
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
            Transaction history is fetched directly from your active Midnight Preview wallet connector via getTxHistory().
          </p>
        </div>
      ) : loading && history.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <div className="spinner" />
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Calling connectedApi.getTxHistory(0, 100)...</div>
        </div>
      ) : (
        <>
          {/* Filter Bar & Search */}
          <div className="filter-bar" style={{ marginBottom: '1.5rem' }}>
            <div className="my-bounties-tabs" style={{ marginBottom: 0 }}>
              <button
                className={`bounty-tab-btn ${statusFilter === 'all' ? 'active' : ''}`}
                onClick={() => setStatusFilter('all')}
              >
                All ({history.length})
              </button>
              <button
                className={`bounty-tab-btn ${statusFilter === 'pending' ? 'active' : ''}`}
                onClick={() => setStatusFilter('pending')}
              >
                Pending ({history.filter(t => (t.status || '').toLowerCase() === 'pending').length})
              </button>
              <button
                className={`bounty-tab-btn ${statusFilter === 'confirmed' ? 'active' : ''}`}
                onClick={() => setStatusFilter('confirmed')}
              >
                Confirmed ({history.filter(t => (t.status || '').toLowerCase() === 'confirmed').length})
              </button>
              <button
                className={`bounty-tab-btn ${statusFilter === 'finalized' ? 'active' : ''}`}
                onClick={() => setStatusFilter('finalized')}
              >
                Finalized ({history.filter(t => (t.status || '').toLowerCase() === 'finalized').length})
              </button>
              <button
                className={`bounty-tab-btn ${statusFilter === 'discarded' ? 'active' : ''}`}
                onClick={() => setStatusFilter('discarded')}
              >
                Discarded ({history.filter(t => (t.status || '').toLowerCase() === 'discarded').length})
              </button>
            </div>

            <div className="search-box">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search transaction hash..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="empty-state-card">
              <History size={44} style={{ color: 'var(--text-dim)', margin: '0 auto 1rem' }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginBottom: '0.35rem' }}>
                No Transactions Found
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '440px', margin: '0 auto' }}>
                {searchQuery ? 'No transactions match your search filter.' : 'Your connected Midnight Preview wallet has no transaction records for this filter.'}
              </p>
            </div>
          ) : (
            <div className="tx-history-table-wrapper">
              <table className="tx-history-table">
                <thead>
                  <tr>
                    <th>Transaction Hash</th>
                    <th>Status</th>
                    <th>Execution Status</th>
                    <th>Timestamp</th>
                    <th style={{ textAlign: 'right' }}>Explorer</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((tx, idx) => {
                    const explorerUrl = getExplorerTxUrl(tx.hash);
                    const isCopied = copiedHash === tx.hash;

                    return (
                      <tr key={idx}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#fff' }}>
                              0x{tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
                            </span>
                            <button
                              className="icon-btn-subtle"
                              onClick={() => copyHash(tx.hash)}
                              title="Copy Transaction Hash"
                            >
                              {isCopied ? <Check size={13} style={{ color: 'var(--emerald-success)' }} /> : <Copy size={13} />}
                            </button>
                          </div>
                        </td>

                        <td>{getStatusBadge(tx.status)}</td>

                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {tx.executionStatus || 'Success'}
                        </td>

                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {tx.timestamp ? new Date(tx.timestamp).toLocaleString() : 'Recent Block'}
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          {explorerUrl ? (
                            <a
                              href={explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-link"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                            >
                              <span>View Explorer</span>
                              <ExternalLink size={12} />
                            </a>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};
