import React, { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext.js';
import { ReputationRecord } from '../types/index.js';
import { Trophy, Shield, Star, Coins } from 'lucide-react';

export const ReputationView: React.FC = () => {
  const { wallet } = useWallet();
  const [leaderboard, setLeaderboard] = useState<ReputationRecord[]>([]);
  const [myRep, setMyRep] = useState<ReputationRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/reputation');
        const data = await res.json();
        if (data.success) setLeaderboard(data.leaderboard || []);

        if (wallet.connected && wallet.address) {
          const repRes = await fetch(`/api/reputation/${wallet.address}`);
          const repData = await repRes.json();
          if (repData.success && repData.reputation) setMyRep(repData.reputation);
        }
      } catch (err) {
        console.error('Failed to load reputation data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [wallet.connected, wallet.address]);

  const getTierColor = (tier: string) => {
    if (tier.includes('Master')) return '#a78bfa';
    if (tier.includes('Veteran')) return 'var(--gold-primary)';
    if (tier.includes('Verified')) return 'var(--emerald-success)';
    return 'var(--text-muted)';
  };

  return (
    <div className="reputation-container">
      <div className="view-header">
        <div>
          <h1 className="view-title">Reputation & Leaderboard</h1>
          <p className="view-subtitle">
            On-chain track record of verified bounty completions and USDM payouts on Midnight Preview.
          </p>
        </div>
      </div>

      {/* My Reputation Card */}
      {wallet.connected && myRep && (
        <div style={{ background: 'var(--bg-obsidian)', borderRadius: '16px', padding: '1.5rem', border: '1px solid var(--gold-border)', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Shield size={20} style={{ color: 'var(--gold-primary)' }} />
              <span style={{ fontWeight: 800, color: '#fff', fontSize: '1.1rem' }}>Your Reputation Profile</span>
            </div>
            <span style={{ color: getTierColor(myRep.tier), fontWeight: 800, fontSize: '0.9rem' }}>
              {myRep.tier}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Score</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--midnight-blue)' }}>{myRep.reputationScore}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Completed</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>{myRep.completedCount}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Successful</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--emerald-success)' }}>{myRep.successfulCount}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Total Earned</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--gold-primary)' }}>${myRep.totalEarnedUsdm}</div>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <div className="spinner" />
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading reputation leaderboard...</div>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="empty-state-card">
          <Trophy size={44} style={{ color: 'var(--text-dim)', margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginBottom: '0.35rem' }}>
            No Reputation Records Yet
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Reputation is built through verified bounty completions backed by real on-chain payouts.
          </p>
        </div>
      ) : (
        <div className="tx-history-table-wrapper">
          <table className="tx-history-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Wallet</th>
                <th>Score</th>
                <th>Completed</th>
                <th>Earned (USDM)</th>
                <th>Tier</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((r, idx) => (
                <tr key={r.walletAddress}>
                  <td style={{ fontWeight: 800, color: idx < 3 ? 'var(--gold-primary)' : '#fff' }}>
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                    {r.walletAddress.slice(0, 10)}...{r.walletAddress.slice(-6)}
                  </td>
                  <td style={{ fontWeight: 800, color: 'var(--midnight-blue)' }}>{r.reputationScore}</td>
                  <td>{r.completedCount}</td>
                  <td style={{ fontWeight: 700, color: 'var(--gold-primary)' }}>${r.totalEarnedUsdm}</td>
                  <td style={{ color: getTierColor(r.tier), fontWeight: 700 }}>{r.tier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
