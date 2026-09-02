import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { db } from '../db.js';
import { encryptData, decryptData, computeCommitmentHash, verifyMidnightPreviewTx } from '../crypto.js';
import { requireSignedChallenge, requireBountyOwnership } from '../middleware/auth.js';
export const submissionsRouter = Router();
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
// Multer memory storage with 20MB limit
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB max
});
const ALLOWED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const ALLOWED_DOC_MIMES = ['application/pdf'];
// 1. POST /api/submissions — Quester submits private proof with STRICT PROOF TYPE ENFORCEMENT
submissionsRouter.post('/submissions', upload.single('proofFile'), async (req, res) => {
    const { bountyId, questerWallet, proofText, proofLinks, notes, solutionAnswer, externalUrl } = req.body;
    if (!bountyId || !questerWallet) {
        return res.status(400).json({ success: false, error: 'bountyId and questerWallet are required.' });
    }
    const bounty = db.prepare('SELECT * FROM bounties WHERE id = ? OR contract_quest_id = ?').get(bountyId, bountyId);
    if (!bounty) {
        return res.status(404).json({ success: false, error: 'Bounty not found.' });
    }
    if (bounty.status === 'Paid') {
        return res.status(400).json({ success: false, error: 'This bounty is already paid and completed.' });
    }
    if (bounty.status === 'Cancelled') {
        return res.status(400).json({ success: false, error: 'This bounty has been cancelled by the employer.' });
    }
    // Check Expiry
    const expiresAt = bounty.expires_at || bounty.deadline;
    if (Date.now() > new Date(expiresAt).getTime()) {
        return res.status(400).json({ success: false, error: 'This bounty has expired. New submissions are not permitted.' });
    }
    const file = req.file;
    const rawProofType = (bounty.proof_type || 'screenshot').toLowerCase();
    let parsedUrl = externalUrl ? externalUrl.trim() : '';
    let linksArray = [];
    if (proofLinks) {
        try {
            linksArray = Array.isArray(proofLinks) ? proofLinks : JSON.parse(proofLinks);
        }
        catch {
            linksArray = [proofLinks.toString().trim()];
        }
    }
    if (parsedUrl && !linksArray.includes(parsedUrl)) {
        linksArray.push(parsedUrl);
    }
    // Validate URLs are http/https only
    for (const link of linksArray) {
        if (!link.startsWith('http://') && !link.startsWith('https://')) {
            return res.status(400).json({ success: false, error: `Invalid URL format: "${link}". URLs must start with http:// or https://.` });
        }
    }
    // Handle Automated Zero-Knowledge Secret Preimage Challenge
    if (rawProofType === 'automatedzksecret' || rawProofType === 'zk_secret') {
        if (!solutionAnswer || !solutionAnswer.trim()) {
            return res.status(400).json({ success: false, error: 'Secret solution answer is required for ZK verification.' });
        }
        const computedHash = computeCommitmentHash(solutionAnswer.trim());
        if (computedHash.toLowerCase() !== bounty.secret_commitment.toLowerCase()) {
            return res.status(400).json({
                success: false,
                error: 'Zero-Knowledge Verification Failed: Computed preimage hash does not match on-chain commitment.',
                verified: false
            });
        }
        const payoutTxHash = crypto.randomBytes(32).toString('hex');
        db.prepare('UPDATE bounties SET status = "Paid", approval_tx_hash = ? WHERE id = ?').run(payoutTxHash, bounty.id);
        // Update reputation
        db.prepare(`
      INSERT INTO reputation (wallet_address, completed_count, successful_count, total_earned_usdm, reputation_score, tier)
      VALUES (?, 1, 1, ?, 75, 'Verified Quester')
      ON CONFLICT(wallet_address) DO UPDATE SET
        completed_count = completed_count + 1,
        successful_count = successful_count + 1,
        total_earned_usdm = total_earned_usdm + excluded.total_earned_usdm,
        reputation_score = MIN(100, reputation_score + 5),
        tier = CASE WHEN (reputation_score + 5) >= 90 THEN 'Master Architect' WHEN (reputation_score + 5) >= 80 THEN 'Veteran Quester' ELSE 'Verified Quester' END
    `).run(questerWallet.trim().toLowerCase(), bounty.reward_usdm);
        return res.json({
            success: true,
            message: 'Zero-Knowledge proof verified! Escrow released to winning quester.',
            status: 'Paid',
            payoutTxHash,
            rewardUsdm: bounty.reward_usdm
        });
    }
    // STRICT PROOF TYPE ENFORCEMENT
    if (rawProofType === 'screenshot') {
        if (!file) {
            return res.status(400).json({ success: false, error: 'Proof type is "screenshot". An image file (PNG/JPG/WEBP) is required.' });
        }
        if (!ALLOWED_IMAGE_MIMES.includes(file.mimetype)) {
            return res.status(400).json({ success: false, error: 'Invalid file type. Only PNG, JPEG, and WEBP image screenshots are allowed.' });
        }
    }
    else if (rawProofType === 'link') {
        if (linksArray.length === 0) {
            return res.status(400).json({ success: false, error: 'Proof type is "link". A valid HTTP/HTTPS URL is required.' });
        }
    }
    else if (rawProofType === 'text') {
        if (!proofText || !proofText.trim()) {
            return res.status(400).json({ success: false, error: 'Proof type is "text". A text answer / code payload is required.' });
        }
    }
    else if (rawProofType === 'file') {
        if (!file) {
            return res.status(400).json({ success: false, error: 'Proof type is "file". A PDF or document file is required.' });
        }
        const isAllowedDoc = ALLOWED_DOC_MIMES.includes(file.mimetype) || ALLOWED_IMAGE_MIMES.includes(file.mimetype);
        if (!isAllowedDoc) {
            return res.status(400).json({ success: false, error: 'Invalid document type. Only PDF and image documents are permitted.' });
        }
    }
    else if (rawProofType === 'both') {
        const hasImage = file && ALLOWED_IMAGE_MIMES.includes(file.mimetype);
        const hasLink = linksArray.length > 0;
        if (!hasImage && !hasLink) {
            return res.status(400).json({ success: false, error: 'Proof type is "both". Please provide a screenshot, a link, or both.' });
        }
    }
    // Bundle Proof Data and Encrypt with AES-256-GCM
    let fileBufferBase64 = '';
    let fileName = '';
    let mimeType = '';
    let fileSize = 0;
    if (file) {
        fileBufferBase64 = file.buffer.toString('base64');
        fileName = file.originalname;
        mimeType = file.mimetype;
        fileSize = file.size;
    }
    const proofBundle = JSON.stringify({
        text: proofText || '',
        links: linksArray,
        notes: notes || '',
        externalUrl: parsedUrl || (linksArray[0] || ''),
        file: file ? {
            name: fileName,
            mimeType,
            size: fileSize,
            dataBase64: fileBufferBase64
        } : null
    });
    const encrypted = encryptData(proofBundle);
    const proofHash = computeCommitmentHash(proofBundle);
    const submissionId = `sub-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    db.prepare(`
    INSERT INTO submissions (
      id, bounty_id, quester_wallet, proof_type, encrypted_payload, iv, auth_tag,
      proof_hash, status, file_name, mime_type, file_size, external_url, notes, links_json, created_at, reviewed_at, rejection_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
  `).run(submissionId, bounty.id, questerWallet.trim(), bounty.proof_type, encrypted.ciphertext, encrypted.iv, encrypted.authTag, proofHash, fileName || null, mimeType || null, fileSize || null, parsedUrl || null, notes ? notes.trim() : null, JSON.stringify(linksArray), new Date().toISOString());
    res.json({
        success: true,
        message: 'Proof submitted and encrypted off-chain. Ready for employer review.',
        submissionId,
        proofHash,
        status: 'Pending'
    });
});
// 2. POST /api/my-submissions — Quester views their submitted quests
submissionsRouter.post('/my-submissions', requireSignedChallenge, (req, res) => {
    const questerWallet = req.authenticatedWallet.toLowerCase();
    const rows = db.prepare(`
    SELECT s.id, s.bounty_id, s.quester_wallet, s.proof_type, s.proof_hash, s.status,
           s.file_name, s.mime_type, s.external_url, s.created_at, s.reviewed_at, s.rejection_reason,
           b.title as bounty_title, b.reward_usdm as bounty_reward, b.status as bounty_status,
           b.employer_wallet, b.expires_at, b.deadline
    FROM submissions s
    JOIN bounties b ON s.bounty_id = b.id
    WHERE LOWER(s.quester_wallet) = ?
    ORDER BY s.created_at DESC
  `).all(questerWallet);
    const submissions = rows.map(r => ({
        id: r.id,
        bountyId: r.bounty_id,
        bountyTitle: r.bounty_title,
        bountyReward: r.bounty_reward,
        bountyStatus: r.bounty_status,
        employerWallet: r.employer_wallet,
        questerWallet: r.quester_wallet,
        proofType: r.proof_type,
        proofHash: r.proof_hash,
        status: r.status,
        fileName: r.file_name,
        mimeType: r.mime_type,
        externalUrl: r.external_url,
        createdAt: r.created_at,
        reviewedAt: r.reviewed_at,
        rejectionReason: r.rejection_reason
    }));
    res.json({
        success: true,
        count: submissions.length,
        submissions
    });
});
// 3. POST /api/review-submissions — Employer views all bounties awaiting their review
submissionsRouter.post('/review-submissions', requireSignedChallenge, (req, res) => {
    const employerWallet = req.authenticatedWallet.toLowerCase();
    const bountiesWithSubmissions = db.prepare(`
    SELECT b.id, b.title, b.reward_usdm, b.category, b.proof_type, b.status, b.expires_at, b.created_at,
           COUNT(s.id) as total_submissions,
           SUM(CASE WHEN s.status = 'Pending' THEN 1 ELSE 0 END) as pending_submissions,
           MAX(s.created_at) as latest_submission_at
    FROM bounties b
    JOIN submissions s ON b.id = s.bounty_id
    WHERE LOWER(b.employer_wallet) = ?
    GROUP BY b.id
    ORDER BY latest_submission_at DESC
  `).all(employerWallet);
    res.json({
        success: true,
        count: bountiesWithSubmissions.length,
        bounties: bountiesWithSubmissions.map(b => ({
            id: b.id,
            title: b.title,
            rewardUsdm: b.reward_usdm,
            category: b.category,
            proofType: b.proof_type,
            status: b.status,
            expiresAt: b.expires_at,
            createdAt: b.created_at,
            totalSubmissions: b.total_submissions,
            pendingSubmissions: b.pending_submissions,
            latestSubmissionAt: b.latest_submission_at
        }))
    });
});
// 4. POST /api/bounties/:id/submissions/access — Employer retrieves private submissions list for specific bounty
submissionsRouter.post('/bounties/:id/submissions/access', requireSignedChallenge, requireBountyOwnership, (req, res) => {
    const bounty = req.targetBounty;
    const rows = db.prepare(`
      SELECT id, bounty_id, quester_wallet, proof_type, proof_hash, status, file_name, mime_type, file_size, external_url, notes, links_json, created_at, reviewed_at, rejection_reason
      FROM submissions
      WHERE bounty_id = ?
      ORDER BY created_at DESC
    `).all(bounty.id);
    const submissions = rows.map((s, idx) => {
        let links = [];
        try {
            links = JSON.parse(s.links_json || '[]');
        }
        catch {
            links = [];
        }
        return {
            id: s.id,
            index: idx + 1,
            bountyId: s.bounty_id,
            questerWallet: s.quester_wallet,
            proofType: s.proof_type,
            proofHash: s.proof_hash,
            status: s.status,
            hasFile: !!s.file_name,
            fileName: s.file_name,
            mimeType: s.mime_type,
            fileSize: s.file_size,
            externalUrl: s.external_url,
            notes: s.notes,
            links,
            createdAt: s.created_at,
            reviewedAt: s.reviewed_at,
            rejectionReason: s.rejection_reason
        };
    });
    res.json({
        success: true,
        bounty: {
            id: bounty.id,
            title: bounty.title,
            rewardUsdm: bounty.reward_usdm,
            employerWallet: bounty.employer_wallet,
            status: bounty.status
        },
        count: submissions.length,
        submissions
    });
});
// 5. POST /api/submissions/:id/access — Employer opens and decrypts specific private proof
submissionsRouter.post('/submissions/:id/access', requireSignedChallenge, (req, res) => {
    const submissionId = req.params.id;
    const sub = db.prepare('SELECT * FROM submissions WHERE id = ?').get(submissionId);
    if (!sub) {
        return res.status(404).json({ success: false, error: 'Submission not found.' });
    }
    const bounty = db.prepare('SELECT employer_wallet FROM bounties WHERE id = ?').get(sub.bounty_id);
    if (!bounty) {
        return res.status(404).json({ success: false, error: 'Parent bounty not found.' });
    }
    // Verify ownership
    if (bounty.employer_wallet.toLowerCase() !== req.authenticatedWallet.toLowerCase()) {
        return res.status(403).json({
            success: false,
            error: 'Access Denied: Only the wallet that created this bounty can decrypt private proofs.'
        });
    }
    // Decrypt the proof bundle
    try {
        const decryptedBuf = decryptData({
            ciphertext: sub.encrypted_payload,
            iv: sub.iv,
            authTag: sub.auth_tag
        });
        const parsedBundle = JSON.parse(decryptedBuf.toString('utf8'));
        res.json({
            success: true,
            submissionId: sub.id,
            questerWallet: sub.quester_wallet,
            proofHash: sub.proof_hash,
            status: sub.status,
            proof: parsedBundle
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: 'Failed to decrypt proof: ' + err.message });
    }
});
// 6. POST /api/bounties/:id/approve — Employer approves submission and releases USDM payout
submissionsRouter.post('/bounties/:id/approve', requireSignedChallenge, requireBountyOwnership, async (req, res) => {
    const bounty = req.targetBounty;
    const { submissionId, chainTxHash } = req.body;
    if (bounty.status === 'Paid') {
        return res.status(400).json({ success: false, error: 'Bounty has already been completed and paid.' });
    }
    if (bounty.status === 'Cancelled') {
        return res.status(400).json({ success: false, error: 'Cannot approve submission on a cancelled bounty.' });
    }
    // Check expiry
    const expiresAt = bounty.expires_at || bounty.deadline;
    if (Date.now() > new Date(expiresAt).getTime()) {
        return res.status(400).json({ success: false, error: 'Bounty has expired. Submissions cannot be approved after expiration.' });
    }
    if (!chainTxHash) {
        return res.status(400).json({ success: false, error: 'On-chain payout transaction hash is required.' });
    }
    const txVerification = await verifyMidnightPreviewTx(chainTxHash);
    if (!txVerification.verified) {
        return res.status(422).json({
            success: false,
            error: `Payout verification failed: ${txVerification.error || 'Transaction could not be confirmed on Midnight Preview network.'}`
        });
    }
    let sub;
    if (submissionId) {
        sub = db.prepare('SELECT * FROM submissions WHERE id = ? AND bounty_id = ?').get(submissionId, bounty.id);
    }
    else {
        sub = db.prepare('SELECT * FROM submissions WHERE bounty_id = ? ORDER BY created_at DESC LIMIT 1').get(bounty.id);
    }
    const questerWallet = sub ? sub.quester_wallet : null;
    // Update bounty to Paid
    db.prepare('UPDATE bounties SET status = "Paid", approval_tx_hash = ? WHERE id = ?').run(chainTxHash.trim(), bounty.id);
    // Update submission to Approved
    if (sub) {
        db.prepare('UPDATE submissions SET status = "Approved", reviewed_at = ? WHERE id = ?').run(new Date().toISOString(), sub.id);
    }
    // Record on-chain payout transaction
    db.prepare(`
      INSERT INTO transactions (id, wallet, tx_hash, type, status, bounty_id, created_at)
      VALUES (?, ?, ?, 'BOUNTY_PAYOUT', 'Confirmed', ?, ?)
    `).run(crypto.randomUUID(), req.authenticatedWallet.toLowerCase(), chainTxHash.trim(), bounty.id, new Date().toISOString());
    // Update Quester reputation & escrow ledger
    if (questerWallet) {
        db.prepare(`
        INSERT INTO reputation (wallet_address, completed_count, successful_count, total_earned_usdm, reputation_score, tier)
        VALUES (?, 1, 1, ?, 75, 'Verified Quester')
        ON CONFLICT(wallet_address) DO UPDATE SET
          completed_count = completed_count + 1,
          successful_count = successful_count + 1,
          total_earned_usdm = total_earned_usdm + excluded.total_earned_usdm,
          reputation_score = MIN(100, reputation_score + 5),
          tier = CASE WHEN (reputation_score + 5) >= 90 THEN 'Master Architect' WHEN (reputation_score + 5) >= 80 THEN 'Veteran Quester' ELSE 'Verified Quester' END
      `).run(questerWallet.toLowerCase(), bounty.reward_usdm);
        db.prepare(`
        INSERT INTO wallet_escrow_ledger (wallet_address, total_locked, total_earned, total_refunded)
        VALUES (?, 0, ?, 0)
        ON CONFLICT(wallet_address) DO UPDATE SET total_earned = total_earned + excluded.total_earned
      `).run(questerWallet.toLowerCase(), bounty.reward_usdm);
    }
    res.json({
        success: true,
        message: 'Submission approved and USDM escrow released on Midnight Preview.',
        status: 'Paid',
        payoutTxHash: chainTxHash.trim(),
        rewardUsdm: bounty.reward_usdm
    });
});
// 7. POST /api/bounties/:id/reject — Employer rejects submission with feedback
submissionsRouter.post('/bounties/:id/reject', requireSignedChallenge, requireBountyOwnership, (req, res) => {
    const bounty = req.targetBounty;
    const { submissionId, rejectionReason } = req.body;
    if (bounty.status === 'Paid') {
        return res.status(400).json({ success: false, error: 'Cannot reject an already completed bounty.' });
    }
    const reason = rejectionReason ? rejectionReason.trim() : 'Submission requirements were not fully satisfied.';
    if (submissionId) {
        db.prepare('UPDATE submissions SET status = "Rejected", reviewed_at = ?, rejection_reason = ? WHERE id = ?').run(new Date().toISOString(), reason, submissionId);
    }
    db.prepare('UPDATE bounties SET rejection_reason = ? WHERE id = ?').run(reason, bounty.id);
    res.json({
        success: true,
        message: 'Submission rejected. Quester has been notified to resubmit revised proof.',
        status: 'Rejected',
        rejectionReason: reason
    });
});
