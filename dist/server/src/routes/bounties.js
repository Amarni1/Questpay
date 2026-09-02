import { Router } from 'express';
import { db } from '../db.js';
import { verifyMidnightPreviewTx } from '../crypto.js';
import { requireSignedChallenge, requireBountyOwnership } from '../middleware/auth.js';
import crypto from 'crypto';
export const bountiesRouter = Router();
// Helper to format bounty row
function formatBountyRow(b) {
    const subCount = db.prepare('SELECT count(*) as count FROM submissions WHERE bounty_id = ?').get(b.id);
    const pendingCount = db.prepare('SELECT count(*) as count FROM submissions WHERE bounty_id = ? AND status = "Pending"').get(b.id);
    const expiresAt = b.expires_at || b.deadline;
    const isExpired = Date.now() > new Date(expiresAt).getTime();
    let resolvedStatus = b.status;
    if (resolvedStatus === 'Open' && isExpired) {
        resolvedStatus = 'Expired';
    }
    return {
        id: b.id,
        employerWallet: b.employer_wallet,
        title: b.title,
        description: b.description,
        category: b.category,
        rewardUsdm: b.reward_usdm,
        proofType: b.proof_type,
        durationDays: b.duration_days || 5,
        deadline: b.deadline,
        expiresAt,
        status: resolvedStatus,
        contractQuestId: b.contract_quest_id,
        chainTxHash: b.chain_tx_hash,
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
// 1. GET /api/bounties — Explore Feed (Returns ONLY valid on-chain bounties, not expired, not cancelled)
bountiesRouter.get('/', (req, res) => {
    const { category, status, search } = req.query;
    let query = 'SELECT * FROM bounties WHERE chain_tx_hash IS NOT NULL AND trim(chain_tx_hash) != "" AND status NOT IN ("Cancelled", "Deleted")';
    const params = [];
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
    const rows = db.prepare(query).all(...params);
    // Filter out expired bounties from open explore feed unless requested
    const now = Date.now();
    const bounties = rows
        .map(formatBountyRow)
        .filter(b => {
        if (status && status !== 'all') {
            return b.status.toLowerCase() === status.toLowerCase();
        }
        // Default explore feed only shows active, non-expired, Open bounties
        return b.status === 'Open' && new Date(b.expiresAt).getTime() > now;
    });
    res.json({
        success: true,
        count: bounties.length,
        bounties
    });
});
// 2. GET /api/bounties/:id — Single Bounty Details
bountiesRouter.get('/:id', (req, res) => {
    const b = db.prepare('SELECT * FROM bounties WHERE id = ? OR contract_quest_id = ?').get(req.params.id, req.params.id);
    if (!b) {
        return res.status(404).json({ success: false, error: 'Bounty not found' });
    }
    res.json({
        success: true,
        bounty: formatBountyRow(b)
    });
});
// 3. POST /api/bounties — Create & Register On-Chain Funded Bounty
bountiesRouter.post('/', async (req, res) => {
    const { employerWallet, title, description, category, rewardUsdm, proofType, durationDays, deadline, chainTxHash, contractQuestId, submissionRequirements, secretAnswer, releaseMode } = req.body;
    if (!employerWallet || !title || !description || !rewardUsdm || !chainTxHash) {
        return res.status(400).json({
            success: false,
            error: 'Missing mandatory fields: employerWallet, title, description, rewardUsdm, and chainTxHash are required.'
        });
    }
    const rewardNum = parseFloat(rewardUsdm);
    if (isNaN(rewardNum) || rewardNum <= 0) {
        return res.status(400).json({ success: false, error: 'Reward amount must be a positive USDM value.' });
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
    // 1. Mandatory On-Chain Transaction Verification
    const txVerification = await verifyMidnightPreviewTx(chainTxHash);
    if (!txVerification.verified) {
        return res.status(422).json({
            success: false,
            error: `On-chain verification failed: ${txVerification.error || 'Transaction could not be verified on Midnight Preview network.'}`,
            code: 'TRANSACTION_VERIFICATION_FAILED'
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
      id, employer_wallet, title, description, category, reward_usdm, proof_type,
      duration_days, deadline, expires_at, status, contract_quest_id, chain_tx_hash,
      submission_requirements, secret_commitment, release_mode, approval_tx_hash, rejection_reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?, ?, ?, ?, ?, NULL, NULL, ?)
  `).run(bountyId, employerWallet.trim(), title.trim(), description.trim(), category || 'General Bounty', rewardNum, proofType || 'screenshot', durationNum, resolvedExpiresAt, resolvedExpiresAt, resolvedContractQuestId, chainTxHash.trim(), submissionRequirements ? submissionRequirements.trim() : '', secretCommitment, releaseMode || 'manual', createdAtIso);
    // Record in wallet transactions index
    db.prepare(`
    INSERT INTO transactions (id, wallet, tx_hash, type, status, bounty_id, created_at)
    VALUES (?, ?, ?, 'ESCROW_LOCK', 'Confirmed', ?, ?)
  `).run(crypto.randomUUID(), employerWallet.trim().toLowerCase(), chainTxHash.trim(), bountyId, createdAtIso);
    // Update escrow ledger
    db.prepare(`
    INSERT INTO wallet_escrow_ledger (wallet_address, total_locked, total_earned, total_refunded)
    VALUES (?, ?, 0, 0)
    ON CONFLICT(wallet_address) DO UPDATE SET total_locked = total_locked + excluded.total_locked
  `).run(employerWallet.trim().toLowerCase(), rewardNum);
    res.json({
        success: true,
        message: 'Bounty verified and registered with on-chain Midnight Preview escrow.',
        bounty: {
            id: bountyId,
            employerWallet: employerWallet.trim(),
            title: title.trim(),
            rewardUsdm: rewardNum,
            durationDays: durationNum,
            expiresAt: resolvedExpiresAt,
            chainTxHash: chainTxHash.trim(),
            status: 'Open'
        }
    });
});
// 4. GET /api/bounties/employer/:address — Query created bounties for connected employer
bountiesRouter.get('/employer/:address', (req, res) => {
    const wallet = String(req.params.address || '').trim().toLowerCase();
    const rows = db.prepare(`
    SELECT * FROM bounties 
    WHERE LOWER(employer_wallet) = ? AND chain_tx_hash IS NOT NULL AND trim(chain_tx_hash) != ""
    ORDER BY created_at DESC
  `).all(wallet);
    const myBounties = rows.map(formatBountyRow);
    res.json({
        success: true,
        wallet,
        count: myBounties.length,
        bounties: myBounties
    });
});
// 4b. POST /api/my-bounties/access — Employer's Bounties (Authenticated via session or challenge)
bountiesRouter.post('/my-bounties/access', requireSignedChallenge, (req, res) => {
    const wallet = req.authenticatedWallet;
    const rows = db.prepare(`
    SELECT * FROM bounties 
    WHERE LOWER(employer_wallet) = ? AND chain_tx_hash IS NOT NULL AND trim(chain_tx_hash) != ""
    ORDER BY created_at DESC
  `).all(wallet.toLowerCase());
    const myBounties = rows.map(formatBountyRow);
    res.json({
        success: true,
        wallet,
        count: myBounties.length,
        bounties: myBounties
    });
});
// 5. POST /api/bounties/:id/cancel — Employer cancels an active bounty on-chain
bountiesRouter.post('/bounties/:id/cancel', requireSignedChallenge, requireBountyOwnership, async (req, res) => {
    const bounty = req.targetBounty;
    const { cancelTxHash } = req.body;
    if (bounty.status === 'Paid') {
        return res.status(400).json({ success: false, error: 'Cannot cancel an already completed and paid bounty.' });
    }
    if (bounty.status === 'Cancelled') {
        return res.status(400).json({ success: false, error: 'Bounty is already cancelled.' });
    }
    // Check if on-chain cancellation transaction hash provided
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
    `).run(req.authenticatedWallet.toLowerCase(), bounty.reward_usdm);
    // Record transaction
    db.prepare(`
      INSERT INTO transactions (id, wallet, tx_hash, type, status, bounty_id, created_at)
      VALUES (?, ?, ?, 'BOUNTY_CANCEL', 'Confirmed', ?, ?)
    `).run(crypto.randomUUID(), req.authenticatedWallet.toLowerCase(), resolvedTx, bounty.id, new Date().toISOString());
    res.json({
        success: true,
        message: 'Bounty cancelled and USDM escrow unlocked.',
        bountyId: bounty.id,
        status: 'Cancelled',
        cancelTxHash: resolvedTx
    });
});
