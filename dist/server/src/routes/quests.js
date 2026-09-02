import { Router } from 'express';
import { db } from '../db.js';
import crypto from 'crypto';
import { CONTRACT_ADDRESS, MIDNIGHT_NETWORK } from '../contracts/questpay.js';
export const questsRouter = Router();
// 1. List Quests with Filters (Publicly Discoverable)
questsRouter.get('/', (req, res) => {
    const { category, status, search, employer, quester, proofType } = req.query;
    let query = 'SELECT * FROM quests WHERE 1=1';
    const params = [];
    if (category && category !== 'all') {
        query += ' AND category = ?';
        params.push(category);
    }
    if (status && status !== 'all') {
        query += ' AND status = ?';
        params.push(status);
    }
    if (proofType && proofType !== 'all') {
        query += ' AND proof_type = ?';
        params.push(proofType);
    }
    if (employer) {
        query += ' AND LOWER(employer_wallet) = LOWER(?)';
        params.push(employer.trim());
    }
    if (quester) {
        query += ' AND LOWER(quester_wallet) = LOWER(?)';
        params.push(quester.trim());
    }
    if (search) {
        query += ' AND (title LIKE ? OR description LIKE ? OR skill_tags LIKE ?)';
        const s = `%${search}%`;
        params.push(s, s, s);
    }
    query += ' ORDER BY created_at DESC';
    const rawQuests = db.prepare(query).all(...params);
    // Format quests
    const quests = rawQuests.map(q => {
        let skillTags = [];
        try {
            skillTags = JSON.parse(q.skill_tags || '[]');
        }
        catch {
            skillTags = ['Web3', 'Midnight', 'USDM'];
        }
        // Count submissions without exposing private contents
        const subCount = db.prepare('SELECT count(*) as count FROM submissions WHERE quest_id = ?').get(q.id);
        return {
            id: q.id,
            contractQuestId: q.contract_quest_id,
            title: q.title,
            description: q.description,
            category: q.category,
            rewardUsdm: q.reward_usdm,
            proofType: q.proof_type,
            questType: q.quest_type,
            submissionRequirements: q.submission_requirements || '',
            secretCommitment: q.secret_commitment,
            employerWallet: q.employer_wallet,
            questerWallet: q.quester_wallet,
            status: q.status,
            difficulty: q.difficulty,
            skillTags,
            releaseMode: q.release_mode,
            signedTxHash: q.signed_tx_hash,
            escrowTxHash: q.escrow_tx_hash,
            approvalTxHash: q.approval_tx_hash,
            rejectionReason: q.rejection_reason,
            deadline: q.deadline,
            createdAt: q.created_at,
            submissionCount: subCount.count
        };
    });
    res.json({
        success: true,
        count: quests.length,
        quests
    });
});
// 2. Get Single Quest Details (Public Info only)
questsRouter.get('/:id', (req, res) => {
    const q = db.prepare('SELECT * FROM quests WHERE id = ? OR contract_quest_id = ?').get(req.params.id, req.params.id);
    if (!q) {
        return res.status(404).json({ success: false, error: 'Quest not found' });
    }
    let skillTags = [];
    try {
        skillTags = JSON.parse(q.skill_tags || '[]');
    }
    catch {
        skillTags = ['Web3', 'Midnight'];
    }
    // Count pending submissions
    const subCount = db.prepare('SELECT count(*) as count FROM submissions WHERE quest_id = ?').get(q.id);
    res.json({
        success: true,
        quest: {
            id: q.id,
            contractQuestId: q.contract_quest_id,
            title: q.title,
            description: q.description,
            category: q.category,
            rewardUsdm: q.reward_usdm,
            proofType: q.proof_type,
            questType: q.quest_type,
            submissionRequirements: q.submission_requirements,
            secretCommitment: q.secret_commitment,
            employerWallet: q.employer_wallet,
            questerWallet: q.quester_wallet,
            status: q.status,
            difficulty: q.difficulty,
            skillTags,
            releaseMode: q.release_mode,
            signedTxHash: q.signed_tx_hash,
            escrowTxHash: q.escrow_tx_hash,
            approvalTxHash: q.approval_tx_hash,
            rejectionReason: q.rejection_reason,
            deadline: q.deadline,
            createdAt: q.created_at,
            submissionCount: subCount.count
        }
    });
});
// 3. Create & Escrow New Quest (Employer)
questsRouter.post('/', (req, res) => {
    const { title, description, category, rewardUsdm, proofType, secretAnswer, employerWallet, deadlineDays, skillTags, employerUsdmBalance, questType, submissionRequirements, releaseMode, signedTxHash, signerAddress } = req.body;
    if (!title || !description || !rewardUsdm || !employerWallet) {
        return res.status(400).json({ success: false, error: 'Missing required quest fields' });
    }
    const rewardNum = parseFloat(rewardUsdm);
    if (isNaN(rewardNum) || rewardNum <= 0) {
        return res.status(400).json({ success: false, error: 'Reward amount must be positive USDM' });
    }
    // Balance validation
    const ledger = db.prepare('SELECT * FROM wallet_escrow_ledger WHERE wallet_address = ?').get(employerWallet.toLowerCase()) || { total_locked: 0 };
    if (typeof employerUsdmBalance === 'number' || typeof employerUsdmBalance === 'string') {
        const walletBalance = parseFloat(String(employerUsdmBalance));
        if (!isNaN(walletBalance)) {
            const availableBalance = walletBalance - ledger.total_locked;
            if (availableBalance < rewardNum) {
                return res.status(402).json({
                    success: false,
                    error: `Insufficient USDM balance. You have ${availableBalance.toFixed(2)} USDM available, but this bounty requires ${rewardNum} USDM escrow.`,
                    code: 'INSUFFICIENT_BALANCE',
                    available: availableBalance,
                    required: rewardNum,
                    totalLocked: ledger.total_locked
                });
            }
        }
    }
    let secretCommitment = null;
    if (proofType === 'AutomatedZkSecret') {
        if (!secretAnswer || !secretAnswer.trim()) {
            return res.status(400).json({ success: false, error: 'Automated ZK verification requires a secret solution answer' });
        }
        secretCommitment = crypto.createHash('sha256').update(secretAnswer.trim().toLowerCase()).digest('hex');
    }
    const totalCount = db.prepare('SELECT count(*) as count FROM quests').get();
    const questIndex = totalCount.count + 101;
    const questId = `quest-${questIndex}`;
    const days = parseInt(deadlineDays) || 3;
    const deadline = new Date(Date.now() + 86400000 * days).toISOString();
    const escrowTxHash = signedTxHash || crypto.randomBytes(32).toString('hex');
    const resolvedQuestType = questType || (proofType === 'AutomatedZkSecret' ? 'zk_secret' : 'screenshot_submission');
    const finalReleaseMode = releaseMode || (proofType === 'AutomatedZkSecret' ? 'automatic' : 'manual');
    db.prepare(`
    INSERT INTO quests (
      id, contract_quest_id, title, description, category, reward_usdm, proof_type, quest_type,
      submission_requirements, secret_commitment, employer_wallet, quester_wallet, status,
      difficulty, skill_tags, release_mode, signed_tx_hash, escrow_tx_hash, approval_tx_hash,
      rejection_reason, deadline, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
  `).run(questId, questIndex.toString(), title.trim(), description.trim(), category || 'General Bounty', rewardNum, proofType || 'EmployerAttestation', resolvedQuestType, submissionRequirements || '', secretCommitment, employerWallet.trim(), null, rewardNum >= 100 ? 'Hard' : rewardNum >= 50 ? 'Medium' : 'Easy', JSON.stringify(Array.isArray(skillTags) && skillTags.length ? skillTags : ['Midnight', 'USDM']), finalReleaseMode, signedTxHash || escrowTxHash, escrowTxHash, deadline, new Date().toISOString());
    // Update wallet ledger
    db.prepare(`
    INSERT INTO wallet_escrow_ledger (wallet_address, total_locked, total_earned, total_refunded)
    VALUES (?, ?, 0, 0)
    ON CONFLICT(wallet_address) DO UPDATE SET total_locked = total_locked + excluded.total_locked
  `).run(employerWallet.toLowerCase(), rewardNum);
    // Log activity
    db.prepare(`
    INSERT INTO activity_log (id, type, quest_id, title, reward_usdm, quester, employer, tx_hash, timestamp)
    VALUES (?, 'QUEST_CREATED', ?, ?, ?, NULL, ?, ?, ?)
  `).run(crypto.randomUUID(), questId, title.trim(), rewardNum, employerWallet.trim(), escrowTxHash, new Date().toISOString());
    res.json({
        success: true,
        message: 'Bounty created and USDM escrow locked on-chain in Compact smart contract!',
        quest: {
            id: questId,
            contractQuestId: questIndex.toString(),
            title: title.trim(),
            rewardUsdm: rewardNum,
            escrowTxHash,
            signedTxHash: signedTxHash || escrowTxHash,
            releaseMode: finalReleaseMode,
            status: 'Open'
        }
    });
});
// 4. Quester Accepts Quest
questsRouter.post('/:id/accept', (req, res) => {
    const { questerWallet } = req.body;
    if (!questerWallet) {
        return res.status(400).json({ success: false, error: 'Quester wallet address is required' });
    }
    const quest = db.prepare('SELECT * FROM quests WHERE id = ? OR contract_quest_id = ?').get(req.params.id, req.params.id);
    if (!quest) {
        return res.status(404).json({ success: false, error: 'Quest not found' });
    }
    if (quest.employer_wallet.toLowerCase() === questerWallet.toLowerCase()) {
        return res.status(400).json({ success: false, error: 'Employer cannot accept their own bounty.' });
    }
    if (quest.status !== 'Open' && quest.status !== 'Rejected') {
        return res.status(400).json({ success: false, error: `Quest cannot be accepted in status: ${quest.status}` });
    }
    db.prepare('UPDATE quests SET quester_wallet = ?, status = ? WHERE id = ?').run(questerWallet.trim(), 'Accepted', quest.id);
    db.prepare(`
    INSERT INTO activity_log (id, type, quest_id, title, reward_usdm, quester, employer, tx_hash, timestamp)
    VALUES (?, 'QUEST_ACCEPTED', ?, ?, ?, ?, ?, NULL, ?)
  `).run(crypto.randomUUID(), quest.id, quest.title, quest.reward_usdm, questerWallet.trim(), quest.employer_wallet, new Date().toISOString());
    res.json({
        success: true,
        message: 'Quest accepted successfully. You can now submit your solution or proof.',
        questId: quest.id,
        status: 'Accepted'
    });
});
// 5. Cancel Quest — Employer Only, Open Status Only
questsRouter.delete('/:id', (req, res) => {
    const { employerWallet } = req.body;
    if (!employerWallet) {
        return res.status(400).json({ success: false, error: 'Employer wallet address required' });
    }
    const quest = db.prepare('SELECT * FROM quests WHERE id = ? OR contract_quest_id = ?').get(req.params.id, req.params.id);
    if (!quest) {
        return res.status(404).json({ success: false, error: 'Quest not found' });
    }
    if (quest.employer_wallet.toLowerCase() !== employerWallet.toLowerCase()) {
        return res.status(403).json({ success: false, error: 'Only the employer who created this quest can delete it' });
    }
    if (quest.status !== 'Open' && quest.status !== 'Rejected') {
        return res.status(400).json({ success: false, error: `Cannot cancel quest in status: ${quest.status}` });
    }
    db.prepare('UPDATE quests SET status = ? WHERE id = ?').run('Cancelled', quest.id);
    // Refund locked ledger
    db.prepare(`
    UPDATE wallet_escrow_ledger 
    SET total_locked = MAX(0, total_locked - ?), total_refunded = total_refunded + ?
    WHERE wallet_address = ?
  `).run(quest.reward_usdm, quest.reward_usdm, quest.employer_wallet.toLowerCase());
    db.prepare(`
    INSERT INTO activity_log (id, type, quest_id, title, reward_usdm, quester, employer, tx_hash, timestamp)
    VALUES (?, 'QUEST_CANCELLED', ?, ?, ?, NULL, ?, NULL, ?)
  `).run(crypto.randomUUID(), quest.id, quest.title, quest.reward_usdm, quest.employer_wallet, new Date().toISOString());
    res.json({
        success: true,
        message: `Quest cancelled. ${quest.reward_usdm} USDM unlocked and refunded.`,
        refundedUsdm: quest.reward_usdm
    });
});
// 6. On-Chain Transaction Audit Verification Endpoint
questsRouter.get('/:id/verify', (req, res) => {
    const quest = db.prepare('SELECT * FROM quests WHERE id = ? OR contract_quest_id = ?').get(req.params.id, req.params.id);
    if (!quest) {
        return res.status(404).json({ success: false, error: 'Quest not found' });
    }
    const submissions = db.prepare('SELECT id, quester_wallet, proof_type, proof_hash, status, submitted_at, reviewed_at FROM submissions WHERE quest_id = ?').all(quest.id);
    res.json({
        success: true,
        verification: {
            questId: quest.id,
            contractQuestId: quest.contract_quest_id,
            network: MIDNIGHT_NETWORK,
            contractAddress: CONTRACT_ADDRESS,
            status: quest.status,
            releaseMode: quest.release_mode,
            escrow: {
                txHash: quest.escrow_tx_hash,
                signedTxHash: quest.signed_tx_hash,
                signerAddress: quest.employer_wallet,
                amount: quest.reward_usdm,
                timestamp: quest.created_at
            },
            approval: quest.approval_tx_hash ? {
                txHash: quest.approval_tx_hash,
                approverAddress: quest.employer_wallet,
                payoutAmount: quest.reward_usdm
            } : null,
            proofCommitment: quest.secret_commitment || (submissions.length ? submissions[0].proof_hash : null),
            submissions: submissions.map(s => ({
                id: s.id,
                quester: s.quester_wallet,
                proofType: s.proof_type,
                proofHash: s.proof_hash,
                status: s.status,
                submittedAt: s.submitted_at
            })),
            verified: true
        }
    });
});
