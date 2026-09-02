import React, { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext.js';
import {
  USDM_TOKEN_TYPE,
  USDM_DECIMALS,
  formatUsdm,
  usdmToRaw,
  pollTransactionConfirmation,
  MIDNIGHT_EXPLORER_BASE,
  logOriginalWalletError
} from '../services/midnightWallet.js';
import {
  Sparkles,
  AlertCircle,
  Coins,
  Shield,
  Lock,
  Clock,
  ArrowRight,
  Check,
  X,
  ExternalLink,
  Loader2
} from 'lucide-react';

interface CreateBountyViewProps {
  onNavigate: (tab: string, id?: string) => void;
}

const CATEGORIES = [
  'Smart Contracts',
  'ZK Cryptography',
  'Frontend & UI',
  'Security & Audit',
  'Growth & Marketing',
  'Research & Benchmarking',
  'General Bounty'
];

const DURATION_OPTIONS = [
  { label: '1 Day', value: '1' },
  { label: '3 Days', value: '3' },
  { label: '5 Days (Default)', value: '5' },
  { label: '7 Days (1 Week)', value: '7' },
  { label: '14 Days (2 Weeks)', value: '14' },
  { label: '30 Days (1 Month)', value: '30' },
  { label: 'Custom Duration', value: 'custom' }
];

export const CreateBountyView: React.FC<CreateBountyViewProps> = ({ onNavigate }) => {
  const { wallet, usdmBalance, getRealBalance, fundBountyEscrow, refreshUsdmBalance } = useWallet();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Smart Contracts');
  const [rewardUsdm, setRewardUsdm] = useState('5');
  const [proofType, setProofType] = useState('screenshot');
  const [durationSelect, setDurationSelect] = useState('5');
  const [customDays, setCustomDays] = useState('5');
  const [submissionRequirements, setSubmissionRequirements] = useState('');
  const [secretAnswer, setSecretAnswer] = useState('');

  // Real Wallet Balance (BigInt)
  const [realWalletBalance, setRealWalletBalance] = useState<bigint | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);

  // Financial Funding Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalPhase, setModalPhase] = useState<'confirm' | 'signing' | 'submitted' | 'finalized' | 'error'>('confirm');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<'Pending' | 'Confirmed' | 'Finalized' | 'Discarded'>('Pending');
  const [modalError, setModalError] = useState<string | null>(null);

  const isUsdmConfigured = !!USDM_TOKEN_TYPE && USDM_TOKEN_TYPE.length > 5;
  const rewardNum = parseFloat(rewardUsdm) || 0;
  const decimals = Number.isInteger(USDM_DECIMALS) && USDM_DECIMALS >= 0 ? USDM_DECIMALS : 6;

  let rewardRaw = 0n;
  let parseError = '';
  try {
    if (rewardUsdm && rewardNum > 0) {
      rewardRaw = usdmToRaw(rewardUsdm, decimals);
    }
  } catch (err: any) {
    parseError = err.message;
  }

  // Refresh real balance on load / wallet change
  const checkBalance = async () => {
    if (!wallet.connected || !wallet.api) {
      setRealWalletBalance(null);
      return;
    }
    setIsCheckingBalance(true);
    try {
      const b = await getRealBalance();
      setRealWalletBalance(b);
    } catch (err) {
      console.warn('Could not read real balance:', err);
    } finally {
      setIsCheckingBalance(false);
    }
  };

  useEffect(() => {
    checkBalance();
  }, [wallet.connected, wallet.address]);

  const effectiveBalance = realWalletBalance !== null ? realWalletBalance : usdmBalance.raw;
  const isInsufficient = effectiveBalance !== null && rewardRaw > 0n && effectiveBalance < rewardRaw;
  const remainingBalance = effectiveBalance !== null && rewardRaw > 0n && effectiveBalance >= rewardRaw ? effectiveBalance - rewardRaw : null;
  const resolvedDurationDays = durationSelect === 'custom' ? (parseInt(customDays) || 5) : parseInt(durationSelect);

  // Step 1: Open Confirmation Modal
  const handleOpenConfirmation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!wallet.connected || !wallet.address) {
      alert('Please connect your Midnight wallet first.');
      return;
    }

    if (!isUsdmConfigured) {
      alert('USDM configuration is incomplete.');
      return;
    }

    if (parseError) {
      alert(parseError);
      return;
    }

    // Refresh real balance right before confirmation
    let currentBal = effectiveBalance;
    try {
      currentBal = await getRealBalance();
      setRealWalletBalance(currentBal);
    } catch (err: any) {
      alert(err.message || 'Could not fetch current wallet balance.');
      return;
    }

    if (currentBal < rewardRaw) {
      alert(`Insufficient USDM balance. You have ${formatUsdm(currentBal)} USDM, but need ${rewardNum} USDM.`);
      return;
    }

    setModalPhase('confirm');
    setTxHash(null);
    setTxStatus('Pending');
    setModalError(null);
    setIsModalOpen(true);
  };

  // Step 2: User clicks "Continue to Wallet" -> triggers real wallet transaction
  const handleExecuteWalletFunding = async () => {
    setModalPhase('signing');
    setModalError(null);

    try {
      // 1. Submit real transaction through wallet connector
      const { txHash: submittedHash } = await fundBountyEscrow(rewardRaw);
      if (!submittedHash) {
        throw new Error('Transaction submission returned no transaction hash.');
      }

      setTxHash(submittedHash);
      setModalPhase('submitted');
      setTxStatus('Pending');

      // 2. Poll transaction confirmation on Midnight Preview
      const pollResult = await pollTransactionConfirmation(wallet.api, submittedHash, 30);

      if (pollResult.status === 'discarded') {
        setTxStatus('Discarded');
        setModalPhase('error');
        setModalError('Transaction was discarded or rejected by Midnight Preview network. The bounty was not funded.');
        return;
      }

      setTxStatus('Finalized');

      // 3. Register finalized on-chain bounty with backend
      const calculatedExpiresAt = new Date(Date.now() + 86400000 * resolvedDurationDays).toISOString();
      const res = await fetch('/api/bounties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employerWallet: wallet.address,
          title: title.trim(),
          description: description.trim(),
          category,
          rewardUsdm: rewardNum,
          rewardRaw: rewardRaw.toString(),
          usdmTokenType: USDM_TOKEN_TYPE,
          proofType,
          durationDays: resolvedDurationDays,
          deadline: calculatedExpiresAt,
          fundingTxHash: submittedHash,
          submissionRequirements: submissionRequirements.trim(),
          secretAnswer: secretAnswer.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to register funded bounty in backend ledger.');
      }

      setModalPhase('finalized');
      await refreshUsdmBalance();
      await checkBalance();
    } catch (error) {
      logOriginalWalletError('Fund Bounty UI', error);
      setModalPhase('error');
      setModalError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="create-bounty-container">
      <div className="view-header">
        <div>
          <h1 className="view-title">Create On-Chain Bounty</h1>
          <p className="view-subtitle">
            Define requirements, set active duration, and lock USDM reward into a Compact smart contract escrow on Midnight Preview.
          </p>
        </div>
      </div>

      {/* Warning if USDM is missing */}
      {!isUsdmConfigured && (
        <div style={{ background: 'var(--rose-surface)', border: '1px solid rgba(244, 63, 94, 0.3)', color: 'var(--rose-danger)', borderRadius: '16px', padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={20} />
          <div>
            <div style={{ fontWeight: 800 }}>USDM configuration is missing.</div>
            <div style={{ fontSize: '0.82rem', marginTop: '0.2rem' }}>
              VITE_USDM_TOKEN_TYPE is not configured. Bounty funding and payout transactions are disabled until configured.
            </div>
          </div>
        </div>
      )}

      {/* Balance Card */}
      {wallet.connected && (
        <div style={{ background: 'var(--bg-obsidian)', borderRadius: '16px', padding: '1.25rem', border: '1px solid var(--border-subtle)', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
              Connected Employer Wallet Balance
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: isInsufficient ? 'var(--rose-danger)' : 'var(--midnight-blue)' }}>
              {usdmBalance.status === 'loading' ? (
                'Syncing…'
              ) : usdmBalance.raw !== null ? (
                `${formatUsdm(usdmBalance.raw)} USDM`
              ) : (
                'USDM unavailable'
              )}
            </div>
          </div>

          {isInsufficient && (
            <div style={{ color: 'var(--rose-danger)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={15} />
              <span>Insufficient USDM</span>
            </div>
          )}
        </div>
      )}

      {/* Bounty Creation Form */}
      <div className="dashboard-card" style={{ maxWidth: '720px' }}>
        <form onSubmit={handleOpenConfirmation}>
          <div className="form-group">
            <label className="form-label">Bounty Title</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Audit Compact 0.17 Circuit Preimage Validator"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description & Task Overview</label>
            <textarea
              className="form-input"
              rows={4}
              placeholder="Describe deliverables, verification criteria, and acceptance benchmarks..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }} className="form-group">
            <div>
              <label className="form-label">Category</label>
              <select
                className="form-input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">Reward (USDM Escrow)</label>
              <input
                type="number"
                step="any"
                min="1"
                className="form-input"
                value={rewardUsdm}
                onChange={(e) => setRewardUsdm(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }} className="form-group">
            <div>
              <label className="form-label">Proof Format Required</label>
              <select
                className="form-input"
                value={proofType}
                onChange={(e) => setProofType(e.target.value)}
              >
                <option value="screenshot">🖼️ Screenshot / Image Only</option>
                <option value="link">🔗 URL / Link Only</option>
                <option value="text">📝 Text / Code Review Only</option>
                <option value="file">📄 PDF / Document File</option>
                <option value="both">🖼️+🔗 Screenshot AND Link</option>
                <option value="AutomatedZkSecret">⚡ ZK Secret Challenge (Instant Release)</option>
              </select>
            </div>

            <div>
              <label className="form-label">Bounty Duration</label>
              <select
                className="form-input"
                value={durationSelect}
                onChange={(e) => setDurationSelect(e.target.value)}
              >
                {DURATION_OPTIONS.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>

          {durationSelect === 'custom' && (
            <div className="form-group" style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '0.85rem', borderRadius: '12px' }}>
              <label className="form-label" style={{ color: 'var(--midnight-blue)' }}>
                Custom Duration (Days: 1 to 60)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                className="form-input"
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                required
              />
            </div>
          )}

          {proofType === 'AutomatedZkSecret' && (
            <div className="form-group" style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '1rem', borderRadius: '12px' }}>
              <label className="form-label" style={{ color: 'var(--midnight-blue)' }}>
                Secret Solution String (Hashed in ZK):
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. quantum_resistance_solution_2026"
                value={secretAnswer}
                onChange={(e) => setSecretAnswer(e.target.value)}
                required={proofType === 'AutomatedZkSecret'}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Submission Guidance for Questers (Optional)</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Upload PNG screenshot of terminal execution and link to github PR"
              value={submissionRequirements}
              onChange={(e) => setSubmissionRequirements(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', padding: '0.85rem' }}
            disabled={!isUsdmConfigured || isInsufficient || isCheckingBalance}
          >
            <Coins size={16} />
            <span>Fund Bounty ({rewardNum} USDM Escrow)</span>
          </button>
        </form>
      </div>

      {/* Real Financial Transaction Confirmation & Tracking Modal */}
      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '480px', padding: '1.75rem' }}>

            {/* PHASE 1: Pre-Wallet Confirmation */}
            {modalPhase === 'confirm' && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                  <div className="brand-icon-box" style={{ margin: '0 auto 0.75rem' }}>
                    <Coins size={24} style={{ color: 'var(--gold-primary)' }} />
                  </div>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                    Fund Bounty
                  </h2>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    This amount will be locked in QuestPay escrow.
                  </p>
                </div>

                <div style={{ background: 'var(--bg-obsidian)', borderRadius: '14px', border: '1px solid var(--border-subtle)', padding: '1.25rem', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Reward:</span>
                    <span style={{ fontWeight: 800, color: 'var(--gold-primary)', fontSize: '1.05rem' }}>
                      {rewardNum} USDM
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Wallet balance:</span>
                    <span style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}>
                      {effectiveBalance !== null ? formatUsdm(effectiveBalance) : '0'} USDM
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>After funding:</span>
                    <span style={{ fontWeight: 700, color: 'var(--midnight-blue)', fontSize: '0.9rem' }}>
                      {remainingBalance !== null ? formatUsdm(remainingBalance) : '0'} USDM
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
                    onClick={() => setIsModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    type="button"
                    onClick={handleExecuteWalletFunding}
                  >
                    <Coins size={15} />
                    <span>Fund {rewardNum} USDM</span>
                  </button>
                </div>
              </div>
            )}

            {/* PHASE 2: Signing in Wallet */}
            {modalPhase === 'signing' && (
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <div className="spinner" style={{ margin: '0 auto 1.25rem', width: '36px', height: '36px' }} />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', marginBottom: '0.5rem' }}>
                  Waiting for Midnight wallet confirmation...
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Please authorize the {rewardNum} USDM escrow funding transaction in your Midnight wallet extension popup.
                </p>
              </div>
            )}

            {/* PHASE 3: Transaction Submitted & Polling Finalization */}
            {(modalPhase === 'submitted' || modalPhase === 'finalized') && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                  {modalPhase === 'finalized' ? (
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎉</div>
                  ) : (
                    <div className="spinner" style={{ margin: '0 auto 0.75rem', width: '32px', height: '32px' }} />
                  )}
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                    {modalPhase === 'finalized' ? 'Bounty Funded & Active' : 'Transaction submitted'}
                  </h2>
                  <p style={{ fontSize: '0.85rem', color: 'var(--gold-primary)', fontWeight: 700, marginTop: '0.35rem' }}>
                    {rewardNum} USDM escrow funding
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
                      color: txStatus === 'Finalized' ? '#4ade80' : '#38bdf8'
                    }}>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: txStatus === 'Finalized' ? '#4ade80' : '#38bdf8',
                        boxShadow: txStatus === 'Finalized' ? '0 0 8px #4ade80' : '0 0 8px #38bdf8'
                      }} />
                      {txStatus}
                    </span>
                  </div>

                  {txHash && (
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.35rem' }}>
                        Transaction:
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#fff', wordBreak: 'break-all', background: 'rgba(255,255,255,0.04)', padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {txHash}
                      </div>

                      {MIDNIGHT_EXPLORER_BASE && (
                        <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
                          <a
                            href={`${MIDNIGHT_EXPLORER_BASE}/${txHash.replace(/^0x/, '')}`}
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

                {modalPhase === 'finalized' ? (
                  <button
                    className="btn-primary"
                    style={{ width: '100%', padding: '0.75rem' }}
                    onClick={() => {
                      setIsModalOpen(false);
                      onNavigate('my-bounties');
                    }}
                  >
                    Done & View in My Bounties
                  </button>
                ) : (
                  <div style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Verifying on Midnight Preview ledger…
                  </div>
                )}
              </div>
            )}

            {/* PHASE 4: Error / Discarded */}
            {modalPhase === 'error' && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                  <div style={{ color: 'var(--rose-danger)', marginBottom: '0.5rem' }}>
                    <AlertCircle size={40} style={{ margin: '0 auto' }} />
                  </div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                    Funding Failed
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--rose-danger)', marginTop: '0.5rem', lineHeight: 1.5 }}>
                    {modalError || 'The funding transaction could not be completed.'}
                  </p>
                </div>

                <button
                  className="btn-secondary"
                  style={{ width: '100%' }}
                  onClick={() => setIsModalOpen(false)}
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
