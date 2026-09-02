import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../context/WalletContext.js';
import { Submission, DecryptedProofPayload } from '../types/index.js';
import { ProofModal } from './ProofModal.js';
import { requestJson } from '../utils/api.js';
import {
  usdmToRaw,
  USDM_DECIMALS,
  formatUsdm,
  pollTransactionConfirmation,
  MIDNIGHT_EXPLORER_BASE
} from '../services/midnightWallet.js';
import {
  Inbox,
  Shield,
  Lock,
  CheckCircle2,
  XCircle,
  Eye,
  AlertCircle,
  Coins,
  ExternalLink,
  ArrowRight,
  Check
} from 'lucide-react';

interface SubmissionsViewProps {
  selectedBountyId?: string | null;
  onNavigate: (tab: string, id?: string) => void;
}

export const SubmissionsView: React.FC<SubmissionsViewProps> = ({ selectedBountyId, onNavigate }) => {
  const {
    wallet,
    refreshUsdmBalance,
    payoutBountyReward
  } = useWallet();

  const [activeTab, setActiveTab] = useState<'review' | 'my-submissions'>('review');

  // Section A: Awaiting My Review
  const [reviewBounties, setReviewBounties] = useState<any[]>([]);
  const [activeBountyId, setActiveBountyId] = useState<string | null>(selectedBountyId || null);
  const [bountySubmissions, setBountySubmissions] = useState<Submission[]>([]);
  const [selectedBountyData, setSelectedBountyData] = useState<any | null>(null);

  // Section B: My Submitted Quests
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);

  // Proof Modal State
  const [isProofModalOpen, setIsProofModalOpen] = useState(false);
  const [activeProofData, setActiveProofData] = useState<DecryptedProofPayload | null>(null);
  const [activeProofMeta, setActiveProofMeta] = useState<any | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load submissions for a specific bounty
  const loadBountySubmissions = useCallback(async (bountyId: string) => {
    if (!wallet.address) return;

    try {
      const data = await requestJson<{
        success: boolean;
        submissions?: Submission[];
        bounty?: any;
        error?: string;
      }>(`/api/bounties/${encodeURIComponent(bountyId)}/submissions?wallet=${encodeURIComponent(wallet.address)}`);

      if (data.success) {
        console.log('[QuestPay] Loaded submissions for bounty', bountyId, ':', (data.submissions || []).length, 'found');
        setBountySubmissions(data.submissions || []);
        setSelectedBountyData(data.bounty || null);
      } else {
        throw new Error(data.error || 'Failed to load submissions');
      }
    } catch (err: any) {
      console.error('[QuestPay] Failed to fetch bounty submissions:', err);
      setErrorMsg(err.message);
    }
  }, [wallet.address]);

  // Load Section A: Review Bounties
  const loadReviewData = useCallback(async () => {
    if (!wallet.connected || !wallet.address) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const data = await requestJson<{
        success: boolean;
        bounties?: any[];
        error?: string;
      }>(`/api/review-submissions?wallet=${encodeURIComponent(wallet.address)}`);

      if (!data.success) {
        throw new Error(data.error || 'Failed to load review submissions');
      }

      const list = data.bounties || [];
      setReviewBounties(list);

      if (activeBountyId) {
        await loadBountySubmissions(activeBountyId);
      } else if (list.length > 0) {
        setActiveBountyId(list[0].id);
        await loadBountySubmissions(list[0].id);
      }
    } catch (err: any) {
      console.error('[QuestPay] Failed to load review data:', err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, [wallet.connected, wallet.address, activeBountyId, loadBountySubmissions]);

  // Load Section B: My Submitted Quests
  const loadMySubmissions = useCallback(async () => {
    if (!wallet.connected || !wallet.address) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const data = await requestJson<{
        success: boolean;
        submissions?: Submission[];
        error?: string;
      }>(`/api/my-submissions?wallet=${encodeURIComponent(wallet.address)}`);

      if (!data.success) {
        throw new Error(data.error || 'Failed to load your submitted quests');
      }

      setMySubmissions(data.submissions || []);
    } catch (err: any) {
      console.error('[QuestPay] Failed to load my submissions:', err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, [wallet.connected, wallet.address]);

  // Initial load effect
  useEffect(() => {
    if (!wallet.connected || !wallet.address) return;

    if (activeTab === 'review') {
      loadReviewData();
    } else {
      loadMySubmissions();
    }
  }, [activeTab, wallet.connected, wallet.address, loadReviewData, loadMySubmissions]);

  // Sync selected bounty from props if provided
  useEffect(() => {
    if (selectedBountyId && selectedBountyId !== activeBountyId) {
      setActiveBountyId(selectedBountyId);
      if (wallet.connected && wallet.address) {
        loadBountySubmissions(selectedBountyId);
      }
    }
  }, [selectedBountyId, wallet.connected, wallet.address, activeBountyId, loadBountySubmissions]);

  // Employer Selects a Bounty to Review
  const handleSelectBounty = (bountyId: string) => {
    setActiveBountyId(bountyId);
    loadBountySubmissions(bountyId);
  };

  // Decrypt Proof
  const handleDecryptProof = async (sub: Submission) => {
    if (!wallet.address) return;
    setIsDecrypting(true);
    setErrorMsg(null);

    try {
      const data = await requestJson<{
        success: boolean;
        proof?: DecryptedProofPayload;
        payload?: DecryptedProofPayload;
        submission?: any;
        error?: string;
      }>(`/api/submissions/${encodeURIComponent(sub.id)}/proof?wallet=${encodeURIComponent(wallet.address)}`);

      if (!data.success) {
        throw new Error(data.error || 'Failed to decrypt proof submission');
      }

      setActiveProofData(data.proof || data.payload || null);
      setActiveProofMeta(data.submission || {
        submissionId: sub.id,
        questerWallet: sub.questerWallet,
        bountyTitle: selectedBountyData?.title || '',
        proofHash: sub.proofHash,
        status: sub.status,
        submittedAt: sub.createdAt
      });
      setIsProofModalOpen(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Decryption failed.');
    } finally {
      setIsDecrypting(false);
    }
  };

  // Payout Flow Modal States
  const [payoutModalSub, setPayoutModalSub] = useState<Submission | null>(null);
  const [payoutPhase, setPayoutPhase] = useState<'confirm' | 'signing' | 'submitted' | 'finalized' | 'error'>('confirm');
  const [payoutTxHash, setPayoutTxHash] = useState<string | null>(null);
  const [payoutTxStatus, setPayoutTxStatus] = useState<string>('Pending');
  const [payoutError, setPayoutError] = useState<string | null>(null);

  // Trigger Payout Confirmation Modal
  const handleOpenPayoutModal = (sub: Submission) => {
    if (!wallet.connected || !wallet.address) {
      alert('Please connect your Midnight wallet first.');
      return;
    }
    setPayoutModalSub(sub);
    setPayoutPhase('confirm');
    setPayoutTxHash(null);
    setPayoutTxStatus('Pending');
    setPayoutError(null);
  };

  // Execute Real On-Chain Payout
  const handleExecutePayout = async () => {
    if (!payoutModalSub || !activeBountyId || !wallet.address) return;

    setPayoutPhase('signing');
    setPayoutError(null);

    try {
      const rewardNum = selectedBountyData?.rewardUsdm || 5;
      const decimals = Number.isInteger(USDM_DECIMALS) && USDM_DECIMALS >= 0 ? USDM_DECIMALS : 6;
      const amountRaw = usdmToRaw(rewardNum.toString(), decimals);

      // 1. Submit real payout transaction from wallet
      const { txHash: submittedTx } = await payoutBountyReward(payoutModalSub.questerWallet, amountRaw);
      if (!submittedTx) {
        throw new Error('Payout transaction returned no transaction hash.');
      }

      setPayoutTxHash(submittedTx);
      setPayoutPhase('submitted');
      setPayoutTxStatus('Pending');

      // 2. Poll confirmation on Midnight Preview
      const pollResult = await pollTransactionConfirmation(wallet.api, submittedTx, 30);
      if (pollResult.status === 'discarded') {
        setPayoutTxStatus('Discarded');
        setPayoutPhase('error');
        setPayoutError('Payout transaction was discarded by Midnight Preview network. Submission was not marked approved.');
        return;
      }

      setPayoutTxStatus('Finalized');

      // 3. Register approved payout on backend
      const data = await requestJson<{
        success: boolean;
        error?: string;
      }>(`/api/submissions/${encodeURIComponent(payoutModalSub.id)}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          employerWallet: wallet.address,
          payoutTxHash: submittedTx
        })
      });

      if (!data.success) {
        throw new Error(data.error || 'Failed to update submission on-chain status');
      }

      setPayoutPhase('finalized');
      setFeedbackMsg(`✓ Submission approved! ${rewardNum} USDM released to quester on Midnight Preview.`);
      await loadReviewData();
      await refreshUsdmBalance();
    } catch (err: any) {
      setPayoutPhase('error');
      setPayoutError(err.message || 'Payout transaction failed.');
    }
  };

  // Employer Rejects Submission
  const handleReject = async (subId: string) => {
    if (!activeBountyId || !wallet.address) return;

    setActionLoading(subId);
    setErrorMsg(null);

    try {
      const data = await requestJson<{
        success: boolean;
        error?: string;
      }>(`/api/submissions/${encodeURIComponent(subId)}/reject`, {
        method: 'POST',
        body: JSON.stringify({
          employerWallet: wallet.address,
          rejectionReason: rejectionReason.trim() || 'Requirements not satisfied'
        })
      });

      if (!data.success) {
        throw new Error(data.error || 'Failed to reject submission');
      }

      setRejectModalOpen(null);
      setRejectionReason('');
      setFeedbackMsg('Submission rejected.');
      await loadReviewData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Rejection failed.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="submissions-view-container">
      <div className="view-header">
        <div>
          <h1 className="view-title">Submission Review & Proofs</h1>
          <p className="view-subtitle">
            Inspect encrypted off-chain proofs, verify cryptographic commitments, and release USDM escrow on Midnight Preview.
          </p>
        </div>
      </div>

      {feedbackMsg && (
        <div style={{ background: 'var(--emerald-surface)', border: '1px solid rgba(16, 185, 129, 0.3)', color: 'var(--emerald-success)', borderRadius: '12px', padding: '0.85rem 1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
          <CheckCircle2 size={16} />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div style={{ background: 'var(--rose-surface)', border: '1px solid rgba(244, 63, 94, 0.3)', color: 'var(--rose-danger)', borderRadius: '12px', padding: '0.85rem 1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="my-bounties-tabs" style={{ marginBottom: '1.5rem' }}>
        <button
          className={`bounty-tab-btn ${activeTab === 'review' ? 'active' : ''}`}
          onClick={() => setActiveTab('review')}
        >
          <Shield size={14} style={{ display: 'inline', marginRight: '6px' }} />
          <span>Awaiting My Review ({reviewBounties.length})</span>
        </button>
        <button
          className={`bounty-tab-btn ${activeTab === 'my-submissions' ? 'active' : ''}`}
          onClick={() => setActiveTab('my-submissions')}
        >
          <Inbox size={14} style={{ display: 'inline', marginRight: '6px' }} />
          <span>My Submitted Quests ({mySubmissions.length})</span>
        </button>
      </div>

      {!wallet.connected ? (
        <div className="empty-state-card">
          <Lock size={44} style={{ color: 'var(--gold-primary)', margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginBottom: '0.5rem' }}>
            Connect your Midnight wallet to view your submissions.
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
            Please connect your Midnight Preview wallet to access private off-chain submissions and review proofs.
          </p>
          <button className="btn-primary" onClick={() => onNavigate('dashboard')} style={{ margin: '0 auto' }}>
            Connect Wallet
          </button>
        </div>
      ) : activeTab === 'review' ? (
        /* Section A: Review Bounties View */
        <div className="submissions-layout">
          {/* Left Column: Bounties list */}
          <div className="submissions-sidebar">
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              Bounties With Submissions:
            </div>

            {loading && reviewBounties.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div className="spinner" />
              </div>
            ) : reviewBounties.length === 0 ? (
              <div className="dashboard-empty-state" style={{ padding: '2rem 1rem' }}>
                <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>📭</div>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>No Submissions Awaiting Review</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Submissions from questers will appear here when submitted.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {reviewBounties.map(b => {
                  const isSelected = activeBountyId === b.id;
                  return (
                    <div
                      key={b.id}
                      className={`bounty-review-select-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectBounty(b.id)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                        <span className="badge-pill open" style={{ fontSize: '0.68rem' }}>{b.category}</span>
                        <span style={{ fontWeight: 800, color: 'var(--gold-primary)', fontSize: '0.85rem' }}>
                          ${b.rewardUsdm} USDM
                        </span>
                      </div>
                      <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem', marginBottom: '0.35rem', lineHeight: 1.3 }}>
                        {b.title}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        <span>{b.pendingSubmissions || 0} Pending</span>
                        <span>{b.totalSubmissions} Total</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Submissions for active bounty */}
          <div className="submissions-main">
            {activeBountyId && selectedBountyData ? (
              <div>
                <div style={{ background: 'var(--bg-obsidian)', borderRadius: '14px', padding: '1.25rem', border: '1px solid var(--border-subtle)', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>{selectedBountyData.title}</h2>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--gold-primary)' }}>
                      ${selectedBountyData.rewardUsdm} USDM Escrow
                    </span>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {selectedBountyData.description}
                  </p>
                </div>

                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                  Submissions ({bountySubmissions.length}):
                </div>

                {bountySubmissions.length === 0 ? (
                  <div className="dashboard-empty-state">
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📑</div>
                    <div style={{ fontWeight: 700, color: '#fff' }}>No Submissions Found for This Bounty</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {bountySubmissions.map((sub, idx) => {
                      const isPending = sub.status === 'Pending';
                      const isApproved = sub.status === 'Approved';
                      const isRejected = sub.status === 'Rejected';

                      return (
                        <div key={sub.id} className="submission-card">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 800, color: 'var(--midnight-blue)', fontSize: '0.85rem' }}>
                                #{idx + 1}
                              </span>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#fff' }}>
                                {sub.questerWallet?.slice(0, 8)}...{sub.questerWallet?.slice(-6)}
                              </span>
                            </div>

                            <span className={`badge-pill ${isApproved ? 'paid' : isRejected ? 'expired' : 'open'}`}>
                              {sub.status}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', gap: '12px' }}>
                            <span>Format: {sub.proofType}</span>
                            <span>●</span>
                            <span>Submitted: {new Date(sub.createdAt).toLocaleString()}</span>
                          </div>

                          {/* Action Buttons */}
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
                            <button
                              className="btn-secondary"
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.78rem' }}
                              onClick={() => handleDecryptProof(sub)}
                              disabled={isDecrypting}
                            >
                              <Eye size={13} />
                              <span>View Proof</span>
                            </button>

                            {isPending && (
                              <>
                                <button
                                  className="btn-primary"
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.78rem' }}
                                  onClick={() => handleOpenPayoutModal(sub)}
                                  disabled={actionLoading === sub.id}
                                >
                                  <Coins size={13} />
                                  <span>Approve & Payout</span>
                                </button>
                                <button
                                  className="btn-secondary"
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.78rem', color: 'var(--rose-danger)' }}
                                  onClick={() => setRejectModalOpen(sub.id)}
                                  disabled={actionLoading === sub.id}
                                >
                                  <XCircle size={13} />
                                  <span>Reject</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state-card">
                <Shield size={36} style={{ color: 'var(--text-dim)', margin: '0 auto 0.75rem' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>Select a Bounty to Review</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  Choose a bounty from the list on the left to inspect quester submissions.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Section B: My Submitted Quests View */
        <div>
          {mySubmissions.length === 0 ? (
            <div className="empty-state-card">
              <Inbox size={44} style={{ color: 'var(--text-dim)', margin: '0 auto 1rem' }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginBottom: '0.35rem' }}>
                No Submitted Quests Yet
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '440px', margin: '0 auto 1.5rem' }}>
                You have not submitted proof for any bounties yet. Browse open bounties to start earning USDM rewards.
              </p>
              <button className="btn-primary" onClick={() => onNavigate('explore')}>
                Explore Active Bounties
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {mySubmissions.map((sub) => (
                <div key={sub.id} className="submission-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div>
                      <div style={{ fontWeight: 800, color: '#fff', fontSize: '0.95rem', marginBottom: '0.2rem' }}>
                        {sub.bountyTitle || `Bounty #${sub.bountyId}`}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        Submitted {new Date(sub.createdAt).toLocaleString()}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, color: 'var(--gold-primary)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                        ${sub.bountyReward} USDM
                      </div>
                      <span className={`badge-pill ${sub.status === 'Approved' ? 'paid' : sub.status === 'Rejected' ? 'expired' : 'open'}`}>
                        {sub.status}
                      </span>
                    </div>
                  </div>

                  {sub.rejectionReason && (
                    <div style={{ background: 'var(--rose-surface)', border: '1px solid rgba(244, 63, 94, 0.2)', padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.78rem', color: 'var(--rose-danger)', marginTop: '0.5rem' }}>
                      <strong>Employer feedback:</strong> {sub.rejectionReason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Proof Inspection Modal */}
      <ProofModal
        isOpen={isProofModalOpen}
        onClose={() => setIsProofModalOpen(false)}
        proofData={activeProofData}
        payload={activeProofData}
        meta={activeProofMeta}
        submissionMeta={activeProofMeta}
      />

      {/* Rejection Modal */}
      {rejectModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '440px' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', marginBottom: '0.5rem' }}>
              Reject Submission
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Provide constructive feedback to the quester explaining why the submission was rejected.
            </p>

            <textarea
              className="form-input"
              rows={3}
              placeholder="e.g. Screenshot does not show terminal test pass output..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              style={{ marginBottom: '1rem' }}
            />

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setRejectModalOpen(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                style={{ flex: 1, background: 'var(--rose-danger)' }}
                onClick={() => handleReject(rejectModalOpen)}
                disabled={actionLoading === rejectModalOpen}
              >
                {actionLoading === rejectModalOpen ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real On-Chain Escrow Payout Modal */}
      {payoutModalSub && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '480px', padding: '1.75rem' }}>

            {/* PHASE 1: Pre-Wallet Confirmation */}
            {payoutPhase === 'confirm' && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                  <div className="brand-icon-box" style={{ margin: '0 auto 0.75rem' }}>
                    <Coins size={24} style={{ color: 'var(--gold-primary)' }} />
                  </div>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                    Release USDM Escrow Payout
                  </h2>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    Approve submission and release locked escrow to the quester on Midnight Preview.
                  </p>
                </div>

                <div style={{ background: 'var(--bg-obsidian)', borderRadius: '14px', border: '1px solid var(--border-subtle)', padding: '1.25rem', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Payout Amount:</span>
                    <span style={{ fontWeight: 800, color: 'var(--gold-primary)', fontSize: '1.05rem' }}>
                      {selectedBountyData?.rewardUsdm || 5} USDM
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Recipient Quester:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#fff' }}>
                      {payoutModalSub.questerWallet?.slice(0, 10)}...{payoutModalSub.questerWallet?.slice(-6)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>Network:</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem', color: '#38bdf8', fontWeight: 600 }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#38bdf8' }} />
                      Midnight Preview
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => setPayoutModalSub(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    type="button"
                    onClick={handleExecutePayout}
                  >
                    <span>Sign Payout</span>
                    <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* PHASE 2: Signing in Wallet */}
            {payoutPhase === 'signing' && (
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <div className="spinner" style={{ margin: '0 auto 1.25rem', width: '36px', height: '36px' }} />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', marginBottom: '0.5rem' }}>
                  Confirm in Wallet
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Please authorize the USDM payout release in your Midnight wallet extension popup.
                </p>
              </div>
            )}

            {/* PHASE 3: Transaction Submitted & Polling Finalization */}
            {(payoutPhase === 'submitted' || payoutPhase === 'finalized') && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                  {payoutPhase === 'finalized' ? (
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎉</div>
                  ) : (
                    <div className="spinner" style={{ margin: '0 auto 0.75rem', width: '32px', height: '32px' }} />
                  )}
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                    {payoutPhase === 'finalized' ? 'Escrow Payout Complete' : 'Transaction submitted'}
                  </h2>
                  <p style={{ fontSize: '0.85rem', color: 'var(--gold-primary)', fontWeight: 700, marginTop: '0.35rem' }}>
                    {selectedBountyData?.rewardUsdm || 5} USDM escrow payout
                  </p>
                </div>

                <div style={{ background: 'var(--bg-obsidian)', borderRadius: '14px', border: '1px solid var(--border-subtle)', padding: '1.25rem', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Status:</span>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      color: payoutTxStatus === 'Finalized' ? '#4ade80' : '#38bdf8'
                    }}>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: payoutTxStatus === 'Finalized' ? '#4ade80' : '#38bdf8',
                        boxShadow: payoutTxStatus === 'Finalized' ? '0 0 8px #4ade80' : '0 0 8px #38bdf8'
                      }} />
                      {payoutTxStatus}
                    </span>
                  </div>

                  {payoutTxHash && (
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.35rem' }}>
                        Transaction:
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#fff', wordBreak: 'break-all', background: 'rgba(255,255,255,0.04)', padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {payoutTxHash}
                      </div>

                      {MIDNIGHT_EXPLORER_BASE && (
                        <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
                          <a
                            href={`${MIDNIGHT_EXPLORER_BASE}/${payoutTxHash.replace(/^0x/, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              fontSize: '0.78rem',
                              color: 'var(--midnight-blue)',
                              textDecoration: 'none',
                              fontWeight: 600
                            }}
                          >
                            <span>View transaction</span>
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {payoutPhase === 'finalized' ? (
                  <button
                    className="btn-primary"
                    style={{ width: '100%', padding: '0.75rem' }}
                    onClick={() => setPayoutModalSub(null)}
                  >
                    Done
                  </button>
                ) : (
                  <div style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Verifying on Midnight Preview ledger…
                  </div>
                )}
              </div>
            )}

            {/* PHASE 4: Error / Discarded */}
            {payoutPhase === 'error' && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                  <div style={{ color: 'var(--rose-danger)', marginBottom: '0.5rem' }}>
                    <AlertCircle size={40} style={{ margin: '0 auto' }} />
                  </div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                    Payout Failed
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--rose-danger)', marginTop: '0.5rem', lineHeight: 1.5 }}>
                    {payoutError || 'The payout transaction could not be completed.'}
                  </p>
                </div>

                <button
                  className="btn-secondary"
                  style={{ width: '100%' }}
                  onClick={() => setPayoutModalSub(null)}
                >
                  Close
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
};
