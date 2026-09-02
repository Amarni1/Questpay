import React, { useState, useEffect } from 'react';
import { ReputationRecord } from '../types/index.js';
import { Trophy, Award, Shield, CheckCircle2 } from 'lucide-react';

export const Leaderboard: React.FC = () => {
  const [leaderboard, setLeaderboard] = useState<ReputationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reputation')
      .then(r => r.json())
      .then(d => {
        if (d.success) setLeaderboard(d.leaderboard || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="hero-banner" style={{ marginBottom: '2rem' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--gold-surface)', border: '1px solid var(--gold-border)', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', color: 'var(--gold-primary)', marginBottom: '0.75rem' }}>
            <Trophy size={14} />
            <span>Verifiable On-Chain Reputation</span>
          </div>
          <h1 className="hero-title">Ecosystem Quester Leaderboard</h1>
          <p className="hero-subtitle">
            Questers build permanent zero-knowledge credentials and earn reputation points with every verified USDM escrow release.
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <div className="spinner" />
        </div>
      ) : leaderboard.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 1.5rem', background: 'var(--bg-surface)', borderRadius: '20px', border: '1px solid var(--border-subtle)' }}>
          <Trophy size={48} style={{ color: 'var(--gold-primary)', margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginBottom: '0.5rem' }}>
            Be the First on the Leaderboard!
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Complete quests and solve confidential bounties to earn your first verified USDM reward.
          </p>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '20px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-obsidian)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '1rem 1.5rem' }}>Rank</th>
                <th style={{ padding: '1rem 1.5rem' }}>Quester Wallet</th>
                <th style={{ padding: '1rem 1.5rem' }}>Tier</th>
                <th style={{ padding: '1rem 1.5rem' }}>Bounties Won</th>
                <th style={{ padding: '1rem 1.5rem' }}>Total USDM Earned</th>
                <th style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>Reputation Score</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((item, index) => (
                <tr
                  key={item.walletAddress}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    transition: 'background 0.2s ease'
                  }}
                >
                  <td style={{ padding: '1.25rem 1.5rem', fontWeight: 800, color: index === 0 ? 'var(--gold-primary)' : index === 1 ? '#e2e8f0' : index === 2 ? '#d97706' : 'var(--text-dim)' }}>
                    {index === 0 ? '🥇 #1' : index === 1 ? '🥈 #2' : index === 2 ? '🥉 #3' : `#${index + 1}`}
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem', fontFamily: 'var(--font-mono)', color: '#fff' }}>
                    {item.walletAddress.slice(0, 10)}...{item.walletAddress.slice(-8)}
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem' }}>
                    <span className="badge-pill attestation">{item.tier}</span>
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem', color: '#fff', fontWeight: 600 }}>
                    {item.successfulCount} Quests
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem', color: 'var(--gold-primary)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                    ${item.totalEarnedUsdm.toFixed(2)} USDM
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right', fontWeight: 800, color: 'var(--emerald-success)' }}>
                    {item.reputationScore} / 100
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
