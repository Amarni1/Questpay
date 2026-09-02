import React, { useState, useEffect } from 'react';
import { Bounty, ProofType } from '../types/index.js';
import { useWallet } from '../context/WalletContext.js';
import { CountdownTimer } from './CountdownTimer.js';
import {
  Compass,
  Search,
  Zap,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Lock,
  ArrowRight,
  Upload,
  Link as LinkIcon,
  FileText,
  Clock,
  X,
  Sparkles
} from 'lucide-react';

interface ExploreViewProps {
  initialBountyId?: string | null;
  onNavigate: (tab: string, id?: string) => void;
}

const CATEGORIES = [
  'All Bounties',
  'Smart Contracts',
  'ZK Cryptography',
  'Frontend & UI',
  'Security & Audit',
  'Growth & Marketing',
  'Research & Benchmarking',
  'General Bounty'
];

export const ExploreView: React.FC<ExploreViewProps> = ({ initialBountyId, onNavigate }) => {
  const { wallet, openWalletModal } = useWallet();

  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All Bounties');
  const [search, setSearch] = useState('');
  const [selectedBounty, setSelectedBounty] = useState<Bounty | null>(null);

  // Submit Drawer Form State
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofText, setProofText] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [solutionAnswer, setSolutionAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccessMsg, setSubmitSuccessMsg] = useState<string | null>(null);
  const [submitErrorMsg, setSubmitErrorMsg] = useState<string | null>(null);

  const fetchBounties = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (category !== 'All Bounties') queryParams.append('category', category);
      if (search) queryParams.append('search', search);

      const res = await fetch(`/api/bounties?${queryParams.toString()}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.bounties)) {
        setBounties(data.bounties);
      } else {
        setBounties([]);
      }
    } catch (err) {
      console.error('Failed to fetch bounties:', err);
      setBounties([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBounties();
  }, [category, search]);

  useEffect(() => {
    if (initialBountyId && bounties.length > 0) {
      const match = bounties.find(b => b.id === initialBountyId || b.contractQuestId === initialBountyId);
      if (match) setSelectedBounty(match);
    }
  }, [initialBountyId, bounties]);

  const handleOpenBounty = (bounty: Bounty) => {
    setSelectedBounty(bounty);
    setSubmitSuccessMsg(null);
    setSubmitErrorMsg(null);
    setProofFile(null);
    setProofText('');
    setExternalUrl('');
    setNotes('');
    setSolutionAnswer('');
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.connected || !wallet.address) {
      setSubmitErrorMsg('Please connect your Midnight wallet first.');
      return;
    }

    if (!selectedBounty) return;

    // Check expiry
    const isExpired = Date.now() > new Date(selectedBounty.expiresAt).getTime();
    if (isExpired) {
      setSubmitErrorMsg('This bounty has expired. Submissions are no longer accepted.');
      return;
    }

    setIsSubmitting(true);
    setSubmitSuccessMsg(null);
    setSubmitErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append('bountyId', selectedBounty.id);
      formData.append('questerWallet', wallet.address);

      const pType = (selectedBounty.proofType || 'screenshot').toLowerCase();

      if (proofFile) formData.append('proofFile', proofFile);
      if (proofText) formData.append('proofText', proofText.trim());
      if (externalUrl) formData.append('externalUrl', externalUrl.trim());
      if (notes) formData.append('notes', notes.trim());
      if (solutionAnswer) formData.append('solutionAnswer', solutionAnswer.trim());

      const res = await fetch('/api/submissions', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit proof');
      }

      // Development logging
      console.log('[QuestPay] Submission created:', {
        bountyId: data.bountyId || selectedBounty.id,
        questerWallet: wallet.address,
        submissionId: data.submissionId
      });

      if (data.status === 'Paid') {
        setSubmitSuccessMsg(`🎉 Zero-Knowledge Verification Passed! ${selectedBounty.rewardUsdm} USDM released on Midnight Preview.`);
      } else {
        setSubmitSuccessMsg('✓ Proof encrypted off-chain and submitted! Only the employer who funded this bounty can decrypt and review your submission.');
      }

      fetchBounties();
    } catch (err: any) {
      setSubmitErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isOwner = selectedBounty && wallet.address && selectedBounty.employerWallet.toLowerCase() === wallet.address.toLowerCase();
  const isSelectedExpired = selectedBounty ? Date.now() > new Date(selectedBounty.expiresAt).getTime() : false;

  const rawProof = selectedBounty ? (selectedBounty.proofType || 'screenshot').toLowerCase() : 'screenshot';

  const now = Date.now();
  const filteredBounties = bounties.filter(b => {
    return b.status === 'Open' && new Date(b.expiresAt).getTime() > now;
  });

  return (
    <div className="explore-view-container">
      {/* Header & Controls */}
      <div className="view-header">
        <div>
          <h1 className="view-title">Explore On-Chain Quests</h1>
          <p className="view-subtitle">
            Active bounties backed by locked USDM smart contract escrows on Midnight Preview.
          </p>
        </div>

        <button className="btn-primary" onClick={() => onNavigate('create')}>
          <Sparkles size={16} />
          <span>+ Create Bounty</span>
        </button>
      </div>

      {/* Connect Card Banner (shown when wallet is not connected) */}
      {!wallet.connected && (
        <div className="page-connect-card">
          <div className="page-connect-card-left">
            <div className="page-connect-icon-box">
              <Lock size={24} style={{ color: 'var(--midnight-blue)' }} />
            </div>
            <div>
              <div className="page-connect-title">Connect Midnight Preview Wallet</div>
              <div className="page-connect-subtitle">
                Connect your Lace DApp Connector to fund smart contract escrows, submit private zero-knowledge proofs, and receive instant USDM payouts.
              </div>
            </div>
          </div>
          <button
            className="btn-primary"
            style={{ padding: '0.65rem 1.25rem', fontSize: '0.85rem', flexShrink: 0 }}
            onClick={openWalletModal}
          >
            <Zap size={15} />
            <span>Connect Wallet</span>
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="filter-bar">
        <div className="category-chips">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`category-chip ${category === cat ? 'active' : ''}`}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search on-chain bounties..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Bounties Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <div className="spinner" />
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Querying Midnight Preview verified bounties...</div>
        </div>
      ) : filteredBounties.length === 0 ? (
        <div className="empty-state-card">
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🔍</div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginBottom: '0.5rem' }}>
            No Active Bounties
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: '440px', margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
            Bounties appear here only when an employer funds an escrow on Midnight Preview. Fund the first escrow to get started!
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            {!wallet.connected && (
              <button className="btn-secondary" onClick={openWalletModal}>
                <Zap size={15} />
                <span>Connect Wallet</span>
              </button>
            )}
            <button className="btn-primary" onClick={() => onNavigate('create')}>
              + Create First On-Chain Bounty
            </button>
          </div>
        </div>
      ) : (
        <div className="quests-grid">
          {filteredBounties.map(bounty => (
            <div key={bounty.id} className="quest-card">
              <div>
                <div className="quest-card-top">
                  <span className="badge-pill open">{bounty.category}</span>
                  <CountdownTimer expiresAt={bounty.expiresAt} compact />
                </div>

                <h3 className="quest-card-title">{bounty.title}</h3>
                <p className="quest-card-desc">{bounty.description}</p>
              </div>

              <div>
                <div className="quest-card-reward-box">
                  <div>
                    <div className="reward-label">USDM Escrow</div>
                    <div className="reward-amount">${bounty.rewardUsdm} USDM</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="reward-label">Proof Format</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fff', textTransform: 'capitalize' }}>
                      {bounty.proofType}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button
                    className="btn-primary"
                    style={{ flex: 1, padding: '0.65rem' }}
                    onClick={() => handleOpenBounty(bounty)}
                  >
                    <span>Inspect & Solve ➔</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inspect & Submit Drawer */}
      {selectedBounty && (
        <>
          <div className="drawer-backdrop" onClick={() => setSelectedBounty(null)} />
          <div className="drawer-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="badge-pill open">{selectedBounty.category}</span>
              <button className="btn-close" onClick={() => setSelectedBounty(null)}>✕</button>
            </div>

            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginBottom: '0.5rem' }}>
                {selectedBounty.title}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                {selectedBounty.description}
              </p>
            </div>

            {/* Escrow Reward & Countdown */}
            <div className="quest-card-reward-box">
              <div>
                <div className="reward-label">USDM Reward</div>
                <div className="reward-amount">${selectedBounty.rewardUsdm} USDM</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="reward-label">Time Remaining</div>
                <div style={{ marginTop: '0.2rem' }}>
                  <CountdownTimer expiresAt={selectedBounty.expiresAt} />
                </div>
              </div>
            </div>

            {/* Submission Requirements */}
            {selectedBounty.submissionRequirements && (
              <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '12px', padding: '0.85rem 1rem' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--midnight-blue)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                  Proof Instructions:
                </div>
                <div style={{ fontSize: '0.85rem', color: '#fff' }}>
                  {selectedBounty.submissionRequirements}
                </div>
              </div>
            )}

            {/* Feedback Alerts */}
            {submitSuccessMsg && (
              <div style={{ background: 'var(--emerald-surface)', border: '1px solid rgba(16, 185, 129, 0.3)', color: 'var(--emerald-success)', borderRadius: '12px', padding: '1rem', fontSize: '0.85rem' }}>
                {submitSuccessMsg}
              </div>
            )}

            {submitErrorMsg && (
              <div style={{ background: 'var(--rose-surface)', border: '1px solid rgba(244, 63, 94, 0.3)', color: 'var(--rose-danger)', borderRadius: '12px', padding: '1rem', fontSize: '0.85rem' }}>
                {submitErrorMsg}
              </div>
            )}

            {/* If Bounty Expired */}
            {isSelectedExpired ? (
              <div style={{ background: 'var(--bg-obsidian)', borderRadius: '16px', padding: '1.5rem', textAlign: 'center', border: '1px solid rgba(244, 63, 94, 0.2)' }}>
                <Clock size={36} style={{ color: 'var(--rose-danger)', margin: '0 auto 0.5rem' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', marginBottom: '0.25rem' }}>
                  Bounty Expired
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  This bounty's duration has ended. New submissions and acceptance are disabled.
                </p>
              </div>
            ) : selectedBounty.status === 'Paid' ? (
              <div style={{ background: 'var(--bg-obsidian)', borderRadius: '16px', padding: '1.5rem', textAlign: 'center', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <CheckCircle2 size={36} style={{ color: 'var(--emerald-success)', margin: '0 auto 0.5rem' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', marginBottom: '0.25rem' }}>
                  Bounty Completed & Settled
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  This bounty has been verified and the {selectedBounty.rewardUsdm} USDM payout was released on-chain.
                </p>
              </div>
            ) : isOwner ? (
              /* Owner View Notification */
              <div style={{ background: 'var(--bg-obsidian)', border: '1px solid var(--gold-border)', borderRadius: '16px', padding: '1.5rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>👑</div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', marginBottom: '0.25rem' }}>
                  You Created This Bounty
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  To review submitted proofs from questers, visit the Submissions page.
                </p>
                <button
                  className="btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => onNavigate('submissions', selectedBounty.id)}
                >
                  View Submissions ({selectedBounty.submissionCount || 0})
                </button>
              </div>
            ) : (
              /* DYNAMIC PROOF TYPE ENFORCED SUBMISSION FORM */
              <form onSubmit={handleSubmitProof} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Lock size={15} style={{ color: 'var(--gold-primary)' }} />
                  <span>Submit Private Proof (Encrypted Off-Chain)</span>
                </div>

                {/* 1. SCREENSHOT ONLY */}
                {rawProof === 'screenshot' && (
                  <div className="form-group">
                    <label className="form-label">Upload Screenshot Proof (PNG, JPEG, WEBP - Max 10MB)</label>
                    <label className="file-upload-box">
                      <Upload size={22} style={{ color: 'var(--gold-primary)', marginBottom: '0.4rem' }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                        {proofFile ? proofFile.name : 'Click to Upload Screenshot Image'}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
                        Encrypted with AES-256-GCM before upload
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setProofFile(e.target.files[0]);
                          }
                        }}
                        style={{ display: 'none' }}
                        required
                      />
                    </label>

                    {proofFile && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', background: 'var(--bg-obsidian)', padding: '0.5rem 0.85rem', borderRadius: '8px' }}>
                        <span style={{ fontSize: '0.78rem', color: '#fff' }}>{proofFile.name} ({(proofFile.size / 1024).toFixed(1)} KB)</span>
                        <button type="button" onClick={() => setProofFile(null)} style={{ color: 'var(--rose-danger)' }}>
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. LINK ONLY */}
                {rawProof === 'link' && (
                  <div className="form-group">
                    <label className="form-label">Proof URL (Must start with http:// or https://)</label>
                    <input
                      type="url"
                      className="form-input"
                      placeholder="https://github.com/... or https://..."
                      value={externalUrl}
                      onChange={(e) => setExternalUrl(e.target.value)}
                      required
                    />
                  </div>
                )}

                {/* 3. TEXT ONLY */}
                {rawProof === 'text' && (
                  <div className="form-group">
                    <label className="form-label">Text Answer / Code Proof</label>
                    <textarea
                      className="form-input"
                      rows={5}
                      placeholder="Enter your comprehensive text answer, findings, or code..."
                      value={proofText}
                      onChange={(e) => setProofText(e.target.value)}
                      required
                    />
                  </div>
                )}

                {/* 4. FILE ONLY (PDF / Docs) */}
                {rawProof === 'file' && (
                  <div className="form-group">
                    <label className="form-label">Upload Document File (PDF / Image - Max 20MB)</label>
                    <label className="file-upload-box">
                      <FileText size={22} style={{ color: 'var(--gold-primary)', marginBottom: '0.4rem' }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                        {proofFile ? proofFile.name : 'Click to Upload PDF or Document'}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
                        Encrypted with AES-256-GCM before upload
                      </span>
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setProofFile(e.target.files[0]);
                          }
                        }}
                        style={{ display: 'none' }}
                        required
                      />
                    </label>

                    {proofFile && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', background: 'var(--bg-obsidian)', padding: '0.5rem 0.85rem', borderRadius: '8px' }}>
                        <span style={{ fontSize: '0.78rem', color: '#fff' }}>{proofFile.name} ({(proofFile.size / 1024).toFixed(1)} KB)</span>
                        <button type="button" onClick={() => setProofFile(null)} style={{ color: 'var(--rose-danger)' }}>
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 5. BOTH (Screenshot + Link) */}
                {rawProof === 'both' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Screenshot Proof (Optional if link provided)</label>
                      <label className="file-upload-box">
                        <Upload size={22} style={{ color: 'var(--gold-primary)', marginBottom: '0.4rem' }} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                          {proofFile ? proofFile.name : 'Upload Screenshot Image (PNG/JPEG)'}
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              setProofFile(e.target.files[0]);
                            }
                          }}
                          style={{ display: 'none' }}
                        />
                      </label>
                      {proofFile && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', background: 'var(--bg-obsidian)', padding: '0.5rem 0.85rem', borderRadius: '8px' }}>
                          <span style={{ fontSize: '0.78rem', color: '#fff' }}>{proofFile.name} ({(proofFile.size / 1024).toFixed(1)} KB)</span>
                          <button type="button" onClick={() => setProofFile(null)} style={{ color: 'var(--rose-danger)' }}>
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label">Verification URL / Link</label>
                      <input
                        type="url"
                        className="form-input"
                        placeholder="https://..."
                        value={externalUrl}
                        onChange={(e) => setExternalUrl(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {/* 6. ZK Secret */}
                {(rawProof === 'automatedzksecret' || rawProof === 'zk_secret') && (
                  <div className="form-group">
                    <label className="form-label">Secret Preimage Solution</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Enter solution string..."
                      value={solutionAnswer}
                      onChange={(e) => setSolutionAnswer(e.target.value)}
                      required
                    />
                  </div>
                )}

                {/* Submitter Notes */}
                <div className="form-group">
                  <label className="form-label">Additional Submitter Notes (Optional)</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="Execution details, testing notes, or context for the employer..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  style={{ width: '100%', padding: '0.85rem' }}
                  disabled={isSubmitting || isSelectedExpired}
                >
                  <Lock size={16} />
                  <span>{isSubmitting ? 'Encrypting & Submitting...' : 'Submit Private Encrypted Proof'}</span>
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
};
