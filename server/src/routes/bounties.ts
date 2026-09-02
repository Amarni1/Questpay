import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { verifyMidnightPreviewTx } from '../crypto.js';
import { requireSignedChallenge, requireBountyOwnership, AuthenticatedChallengeRequest } from '../middleware/auth.js';
import crypto from 'crypto';

export const bountiesRouter = Router();

// Helper to format bounty row
function formatBountyRow(b: any) {
  const subCount = db.prepare('SELECT count(*) as count FROM submissions WHERE bounty_id = ?').get(b.id) as { count: number };
  const pendingCount = db.prepare('SELECT count(*) as count FROM submissions WHERE bounty_id = ? AND status = "Pending"').get(b.id) as { count: number };

  const expiresAt = b.expires_at || b.deadline;
  const isExpired = Date.now() > new Date(expiresAt).getTime();
  let resolvedStatus = b.status || 'OPEN';
  if ((resolvedStatus === 'Open' || resolvedStatus === 'OPEN' || resolvedStatus === 'FUNDED') && isExpired) {
    resolvedStatus = 'EXPIRED';
  }

  const rewardUsdm = typeof b.reward_usdm === 'number' ? b.reward_usdm : parseFloat(b.reward_usdm || '0');
  const rewardRaw = b.reward_raw || Math.round(rewardUsdm * 1000000).toString();

  return {
    id: b.id,
    employerWallet: b.employer_wallet,
    title: b.title,
    description: b.description,
    category: b.category,
    rewardRaw,
    rewardUsdm,
    usdmTokenType: b.usdm_token_type || '003bacd9a361ba0d425e408776020e40271375e8b8de42d73eec046a44947d73',
    proofType: b.proof_type,
    durationDays: b.duration_days || 5,
    deadline: b.deadline,
    expiresAt,
    status: resolvedStatus,
    contractQuestId: b.contract_quest_id,
    chainTxHash: b.funding_tx_hash || b.chain_tx_hash || '',
    fundingTxHash: b.funding_tx_hash || b.chain_tx_hash || null,
    fundingTxStatus: b.funding_tx_status || 'FINALIZED',
    payoutTxHash: b.payout_tx_hash || b.approval_tx_hash || null,
    payoutTxStatus: b.payout_tx_status || 'PENDING',
    createdOnchain: b.created_onchain ?? 1,
    fundedOnchain: b.funded_onchain ?? 1,
    paidOnchain: b.paid_onchain ?? (resolvedStatus === 'PAID' || resolvedStatus === 'Paid' ? 1 : 0),
    submissionRequirements: b.submission_requirements || '',
    secretCommitment: b.secret_commitment,
    releaseMode: b.release_mode,
    approvalTxHash: b.approval_tx_hash,
    rejectionReason: b.rejection_reason,
    createdAt: b.created_at,
    submissionCount: subCount ? subCount.count : 0,
    pendingReviewCount: pendingCount ? pendingCount.count : 0
  };
}

// 1. GET /api/bounties — Explore Feed (Returns ONLY valid on-chain funded bounties, not expired, not cancelled)
bountiesRouter.get('/', (req: Request, res: Response) => {
  const { category, status, search } = req.query;

  let query = 'SELECT * FROM bounties WHERE funding_tx_hash IS NOT NULL AND trim(funding_tx_hash) != "" AND status NOT IN ("DRAFT", "CANCELLED", "Cancelled", "Deleted", "FUNDING_FAILED")';
  const params: any[] = [];

  if (category && category !== 'All Bounties' && category !== 'all') {
    query += ' AND category = ?';
    params.push(category);
  }

  if (search) {
    query += ' AND (title LIKE ? OR description LIKE ? OR category LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  query += ' ORDER BY created_at DESC';

  const rows = db.prepare(query).all(...params) as any[];

  // Filter out expired bounties from open explore feed unless requested
  const now = Date.now();
  const bounties = rows
    .map(formatBountyRow)
    .filter(b => {
      if (status && status !== 'all') {
        return b.status.toUpperCase() === (status as string).toUpperCase();
      }
      // Default explore feed only shows active, non-expired, Open/Funded bounties
      const isOpen = b.status === 'OPEN' || b.status === 'Open' || b.status === 'FUNDED';
      return isOpen && new Date(b.expiresAt).getTime() > now;
    });

  res.json({
    success: true,
    count: bounties.length,
    bounties
  });
});

// 2. GET /api/bounties/verify-tx/:txHash — Verify on-chain transaction status
bountiesRouter.get('/verify-tx/:txHash', async (req: Request, res: Response) => {
  const { txHash } = req.params;
  const result = await verifyMidnightPreviewTx(txHash);
  res.json({
    success: result.verified,
    txHash,
    status: result.verified ? 'FINALIZED' : 'DISCARDED',
    error: result.error
  });
});

// 3. POST /api/bounties — Create & Register On-Chain Funded Bounty
bountiesRouter.post('/', async (req: Request, res: Response) => {
  const {
    employerWallet,
    title,
    description,
    category,
    rewardUsdm,
    rewardRaw,
    usdmTokenType,
    proofType,
    durationDays,
    deadline,
    chainTxHash,
    fundingTxHash,
    contractQuestId,
    submissionRequirements,
    secretAnswer,
    releaseMode
  } = req.body;

  const actualFundingTx = fundingTxHash || chainTxHash;

  if (!employerWallet || !title || !description || !rewardUsdm || !actualFundingTx) {
    return res.status(400).json({
      success: false,
      error: 'Missing mandatory fields: employerWallet, title, description, rewardUsdm, and fundingTxHash are required.'
    });
  }

  const rewardNum = parseFloat(rewardUsdm);
  if (isNaN(rewardNum) || rewardNum <= 0) {
    return res.status(400).json({ success: false, error: 'Reward amount must be a positive USDM value.' });
  }

  // Exact integer amount string
  const resolvedRewardRaw = rewardRaw ? String(rewardRaw) : Math.round(rewardNum * 1000000).toString();
  const resolvedTokenType = usdmTokenType || '003bacd9a361ba0d425e408776020e40271375e8b8de42d73eec046a44947d73';

  // 1. Mandatory Real On-Chain Transaction Verification
  const txVerification = await verifyMidnightPreviewTx(actualFundingTx);
  if (!txVerification.verified) {
    return res.status(422).json({
      success: false,
      error: `On-chain verification failed: ${txVerification.error || 'Transaction could not be verified on Midnight Preview network.'}`,
      code: 'TRANSACTION_VERIFICATION_FAILED'
    });
  }

  // Validate allowed proof types
  const allowedProofTypes = ['screenshot', 'link', 'text', 'file', 'both', 'AutomatedZkSecret', 'zk_secret'];
  const normalizedProofType = (proofType || 'screenshot').toLowerCase();
  if (!allowedProofTypes.map(p => p.toLowerCase()).includes(normalizedProofType)) {
    return res.status(400).json({
      success: false,
      error: `Invalid proofType. Allowed values are: screenshot, link, text, file, both.`
    });
  }

  let secretCommitment = null;
  if (proofType === 'AutomatedZkSecret' || proofType === 'zk_secret') {
    if (!secretAnswer || !secretAnswer.trim()) {
      return res.status(400).json({ success: false, error: 'Automated ZK verification requires a secret solution answer.' });
    }
    secretCommitment = crypto.createHash('sha256').update(secretAnswer.trim()).digest('hex');
  }

  const bountyId = `bounty-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const resolvedContractQuestId = contractQuestId || Date.now().toString();
  
  // Calculate server-side expiry
  const durationNum = parseInt(durationDays) || 5;
  const createdAtIso = new Date().toISOString();
  const calculatedExpiresAt = new Date(Date.now() + durationNum * 86400000).toISOString();
  const resolvedExpiresAt = deadline || calculatedExpiresAt;

  db.prepare(`
    INSERT INTO bounties (
      id, employer_wallet, title, description, category, reward_raw, reward_usdm, usdm_token_type, proof_type,
      duration_days, deadline, expires_at, status, contract_quest_id, chain_tx_hash, funding_tx_hash,
      funding_tx_status, created_onchain, funded_onchain, paid_onchain, submission_requirements,
      secret_commitment, release_mode, approval_tx_hash, rejection_reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, 'FINALIZED', 1, 1, 0, ?, ?, ?, NULL, NULL, ?)
  `).run(
    bountyId,
    employerWallet.trim(),
    title.trim(),
    description.trim(),
    category || 'General Bounty',
    resolvedRewardRaw,
    rewardNum,
    resolvedTokenType,
    proofType || 'screenshot',
    durationNum,
    resolvedExpiresAt,
    resolvedExpiresAt,
    resolvedContractQuestId,
    actualFundingTx.trim(),
    actualFundingTx.trim(),
    submissionRequirements ? submissionRequirements.trim() : '',
    secretCommitment,
    releaseMode || 'manual',
    createdAtIso
  );

  // Record in wallet transactions index
  db.prepare(`
    INSERT INTO transactions (id, wallet, tx_hash, type, status, bounty_id, created_at)
    VALUES (?, ?, ?, 'ESCROW_FUNDING', 'Confirmed', ?, ?)
  `).run(crypto.randomUUID(), employerWallet.trim().toLowerCase(), actualFundingTx.trim(), bountyId, createdAtIso);

  // Update escrow ledger
  db.prepare(`
    INSERT INTO wallet_escrow_ledger (wallet_address, total_locked, total_earned, total_refunded)
    VALUES (?, ?, 0, 0)
    ON CONFLICT(wallet_address) DO UPDATE SET total_locked = total_locked + excluded.total_locked
  `).run(employerWallet.trim().toLowerCase(), rewardNum);

  res.json({
    success: true,
    message: 'Bounty verified and locked in on-chain Midnight Preview escrow.',
    bounty: {
      id: bountyId,
      employerWallet: employerWallet.trim(),
      title: title.trim(),
      rewardRaw: resolvedRewardRaw,
      rewardUsdm: rewardNum,
      usdmTokenType: resolvedTokenType,
      durationDays: durationNum,
      expiresAt: resolvedExpiresAt,
      fundingTxHash: actualFundingTx.trim(),
      status: 'OPEN',
      createdOnchain: 1,
      fundedOnchain: 1
    }
  });
});

// 4. GET /api/bounties/employer/:address — Query created bounties for connected employer
bountiesRouter.get('/employer/:address', (req: Request, res: Response) => {
  const wallet = String(req.params.address || '').trim().toLowerCase();

  const rows = db.prepare(`
    SELECT * FROM bounties 
    WHERE LOWER(employer_wallet) = ? AND chain_tx_hash IS NOT NULL AND trim(chain_tx_hash) != ""
    ORDER BY created_at DESC
  `).all(wallet) as any[];

  const myBounties = rows.map(formatBountyRow);

  res.json({
    success: true,
    wallet,
    count: myBounties.length,
    bounties: myBounties
  });
});

// 4b. GET & POST /api/my-bounties — Employer's Bounties
const handleMyBounties = (req: Request, res: Response) => {
  const wallet = (req.query.wallet as string || req.body?.wallet || req.headers['x-questpay-wallet'] as string || '').trim().toLowerCase();

  if (!wallet) {
    return res.status(400).json({ success: false, error: 'Connected wallet is required.' });
  }

  const rows = db.prepare(`
    SELECT * FROM bounties 
    WHERE LOWER(employer_wallet) = ? AND chain_tx_hash IS NOT NULL AND trim(chain_tx_hash) != ""
    ORDER BY created_at DESC
  `).all(wallet) as any[];

  const myBounties = rows.map(formatBountyRow);

  res.json({
    success: true,
    wallet,
    count: myBounties.length,
    bounties: myBounties
  });
};

bountiesRouter.get('/my-bounties', handleMyBounties);
bountiesRouter.post('/my-bounties/access', handleMyBounties);

// 5. POST /api/bounties/:id/cancel — Employer cancels an active bounty on-chain
bountiesRouter.post('/:id/cancel', async (req: Request, res: Response) => {
  const bountyId = req.params.id;
  const { cancelTxHash, employerWallet, wallet } = req.body;
  const callerWallet = (wallet || employerWallet || req.headers['x-questpay-wallet'] as string || '').trim().toLowerCase();

  const bounty = db.prepare('SELECT * FROM bounties WHERE id = ? OR contract_quest_id = ?').get(bountyId, bountyId) as any;
  if (!bounty) {
    return res.status(404).json({ success: false, error: 'Bounty not found.' });
  }

  if (callerWallet && callerWallet !== bounty.employer_wallet.toLowerCase()) {
    return res.status(403).json({ success: false, error: 'Only the bounty owner can cancel this bounty.' });
  }

  if (bounty.status === 'Paid') {
    return res.status(400).json({ success: false, error: 'Cannot cancel an already completed and paid bounty.' });
  }

  if (bounty.status === 'Cancelled') {
    return res.status(400).json({ success: false, error: 'Bounty is already cancelled.' });
  }

  const resolvedTx = cancelTxHash || crypto.randomBytes(32).toString('hex');
  const txVerification = await verifyMidnightPreviewTx(resolvedTx);
  if (!txVerification.verified) {
    return res.status(422).json({
      success: false,
      error: `Cancellation verification failed: ${txVerification.error || 'Transaction could not be confirmed.'}`
    });
  }

  // Mark as Cancelled
  db.prepare('UPDATE bounties SET status = "Cancelled", rejection_reason = "Cancelled by employer" WHERE id = ?').run(bounty.id);

  // Record refund in escrow ledger
  db.prepare(`
    INSERT INTO wallet_escrow_ledger (wallet_address, total_locked, total_earned, total_refunded)
    VALUES (?, 0, 0, ?)
    ON CONFLICT(wallet_address) DO UPDATE SET
      total_locked = MAX(0, total_locked - excluded.total_refunded),
      total_refunded = total_refunded + excluded.total_refunded
  `).run(bounty.employer_wallet.toLowerCase(), bounty.reward_usdm);

  // Record transaction
  db.prepare(`
    INSERT INTO transactions (id, wallet, tx_hash, type, status, bounty_id, created_at)
    VALUES (?, ?, ?, 'BOUNTY_CANCEL', 'Confirmed', ?, ?)
  `).run(crypto.randomUUID(), bounty.employer_wallet.toLowerCase(), resolvedTx, bounty.id, new Date().toISOString());

  res.json({
    success: true,
    message: 'Bounty cancelled and USDM escrow unlocked.',
    bountyId: bounty.id,
    status: 'Cancelled',
    cancelTxHash: resolvedTx
  });
});

// 6. GET /api/bounties/:id — Single Bounty Details (placed at bottom to prevent shadowing other sub-routes)
bountiesRouter.get('/:id', (req: Request, res: Response) => {
  const b = db.prepare('SELECT * FROM bounties WHERE id = ? OR contract_quest_id = ?').get(req.params.id, req.params.id) as any;
  if (!b) {
    return res.status(404).json({ success: false, error: 'Bounty not found' });
  }

  res.json({
    success: true,
    bounty: formatBountyRow(b)
  });
});

