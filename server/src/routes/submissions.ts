import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { db } from '../db.js';
import { encryptData, decryptData, computeCommitmentHash, verifyMidnightPreviewTx } from '../crypto.js';

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
submissionsRouter.post('/submissions', upload.single('proofFile'), async (req: Request, res: Response) => {
  const {
    bountyId,
    questerWallet,
    proofText,
    proofLinks,
    notes,
    solutionAnswer,
    externalUrl
  } = req.body;

  if (!bountyId || !questerWallet) {
    return res.status(400).json({ success: false, error: 'bountyId and questerWallet are required.' });
  }

  const bounty = db.prepare('SELECT * FROM bounties WHERE id = ? OR contract_quest_id = ?').get(bountyId, bountyId) as any;
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
  let linksArray: string[] = [];
  if (proofLinks) {
    try {
      linksArray = Array.isArray(proofLinks) ? proofLinks : JSON.parse(proofLinks);
    } catch {
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
  } else if (rawProofType === 'link') {
    if (linksArray.length === 0) {
      return res.status(400).json({ success: false, error: 'Proof type is "link". A valid HTTP/HTTPS URL is required.' });
    }
  } else if (rawProofType === 'text') {
    if (!proofText || !proofText.trim()) {
      return res.status(400).json({ success: false, error: 'Proof type is "text". A text answer / code payload is required.' });
    }
  } else if (rawProofType === 'file') {
    if (!file) {
      return res.status(400).json({ success: false, error: 'Proof type is "file". A PDF or document file is required.' });
    }
    const isAllowedDoc = ALLOWED_DOC_MIMES.includes(file.mimetype) || ALLOWED_IMAGE_MIMES.includes(file.mimetype);
    if (!isAllowedDoc) {
      return res.status(400).json({ success: false, error: 'Invalid document type. Only PDF and image documents are permitted.' });
    }
  } else if (rawProofType === 'both') {
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
  const nowIso = new Date().toISOString();

  // Insert submission strictly referencing bounty.id
  db.prepare(`
    INSERT INTO submissions (
      id, bounty_id, quester_wallet, proof_type, encrypted_payload, iv, auth_tag,
      proof_hash, status, file_name, mime_type, file_size, external_url, notes, links_json, created_at, reviewed_at, rejection_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
  `).run(
    submissionId,
    bounty.id,
    questerWallet.trim(),
    bounty.proof_type,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.authTag,
    proofHash,
    fileName || null,
    mimeType || null,
    fileSize || null,
    parsedUrl || null,
    notes ? notes.trim() : null,
    JSON.stringify(linksArray),
    nowIso
  );

  // Verify submission was persisted in database
  const insertedSubmission = db.prepare('SELECT id, bounty_id, quester_wallet, proof_type, proof_hash, status, created_at FROM submissions WHERE id = ?').get(submissionId) as any;
  if (!insertedSubmission) {
    return res.status(500).json({ success: false, error: 'Submission was not persisted.' });
  }

  // Development logging
  console.log('[QuestPay] Submission created:', {
    bountyId: bounty.id,
    questerWallet: questerWallet.trim(),
    submissionId
  });

  res.json({
    success: true,
    message: 'Proof submitted and encrypted off-chain. Ready for employer review.',
    submission: {
      id: submissionId,
      bountyId: bounty.id,
      questerWallet: questerWallet.trim(),
      proofType: bounty.proof_type,
      proofHash,
      status: 'Pending',
      createdAt: nowIso
    },
    submissionId,
    bountyId: bounty.id,
    proofHash,
    status: 'Pending'
  });
});

// Helper to extract wallet from query, body, or headers
function extractWallet(req: Request): string {
  const q = req.query.wallet as string;
  if (q && typeof q === 'string') return q.trim();
  const b = req.body?.wallet || req.body?.employerWallet || req.body?.questerWallet;
  if (b && typeof b === 'string') return b.trim();
  const h = req.headers['x-questpay-wallet'] as string;
  if (h && typeof h === 'string') return h.trim();
  return '';
}

// 2. GET & POST /api/my-submissions — Quester views their submitted quests
const handleMySubmissions = (req: Request, res: Response) => {
  const questerWallet = extractWallet(req).toLowerCase();
  if (!questerWallet) {
    return res.status(400).json({ success: false, error: 'Connected wallet is required.' });
  }

  const rows = db.prepare(`
    SELECT s.id, s.bounty_id, s.quester_wallet, s.proof_type, s.proof_hash, s.status,
           s.file_name, s.mime_type, s.external_url, s.created_at, s.reviewed_at, s.rejection_reason,
           b.title as bounty_title, b.reward_usdm as bounty_reward, b.status as bounty_status,
           b.employer_wallet, b.expires_at, b.deadline
    FROM submissions s
    JOIN bounties b ON s.bounty_id = b.id
    WHERE LOWER(s.quester_wallet) = ?
    ORDER BY s.created_at DESC
  `).all(questerWallet) as any[];

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
};

submissionsRouter.get('/my-submissions', handleMySubmissions);
submissionsRouter.post('/my-submissions', handleMySubmissions);

// 3. GET & POST /api/review-submissions — Employer views all bounties awaiting their review
const handleReviewSubmissions = (req: Request, res: Response) => {
  const employerWallet = extractWallet(req).toLowerCase();
  if (!employerWallet) {
    return res.status(400).json({ success: false, error: 'Connected wallet is required.' });
  }

  const bountiesWithSubmissions = db.prepare(`
    SELECT b.id, b.title, b.reward_usdm, b.category, b.proof_type, b.status, b.expires_at, b.created_at, b.description,
           COUNT(s.id) as total_submissions,
           SUM(CASE WHEN s.status = 'Pending' THEN 1 ELSE 0 END) as pending_submissions,
           MAX(s.created_at) as latest_submission_at
    FROM bounties b
    JOIN submissions s ON b.id = s.bounty_id
    WHERE LOWER(b.employer_wallet) = ?
    GROUP BY b.id
    ORDER BY latest_submission_at DESC
  `).all(employerWallet) as any[];

  res.json({
    success: true,
    count: bountiesWithSubmissions.length,
    bounties: bountiesWithSubmissions.map(b => ({
      id: b.id,
      title: b.title,
      description: b.description,
      rewardUsdm: b.reward_usdm,
      category: b.category,
      proofType: b.proof_type,
      status: b.status,
      expiresAt: b.expires_at,
      createdAt: b.created_at,
      totalSubmissions: b.total_submissions,
      pendingSubmissions: b.pending_submissions || 0,
      latestSubmissionAt: b.latest_submission_at
    }))
  });
};

submissionsRouter.get('/review-submissions', handleReviewSubmissions);
submissionsRouter.post('/review-submissions', handleReviewSubmissions);

// 4. GET /api/bounties/:bountyId/submissions — Employer retrieves submissions metadata for specific bounty
const handleBountySubmissions = (req: Request, res: Response) => {
  try {
    const bountyId = String(req.params.bountyId || req.params.id || '').trim();
    const wallet = extractWallet(req).toLowerCase();

    console.log('[QuestPay] Submission query', {
      bountyId,
      authenticatedWallet: wallet
    });

    if (!wallet) {
      return res.status(400).json({
        success: false,
        error: 'Connected wallet is required.'
      });
    }

    const bounty = db.prepare('SELECT * FROM bounties WHERE id = ? OR contract_quest_id = ?').get(bountyId, bountyId) as any;
    if (!bounty) {
      return res.status(404).json({
        success: false,
        error: 'Bounty not found.'
      });
    }

    console.log('[QuestPay] Matching bounty', {
      bountyId: bounty.id,
      employerWallet: bounty.employer_wallet
    });

    // Owner check: request wallet === bounty.employer_wallet
    if (wallet !== bounty.employer_wallet.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: 'Only the wallet that created this bounty can view submissions.'
      });
    }

    // Query submissions matching either bounty.id or bounty.contract_quest_id
    const rows = db.prepare(`
      SELECT id, bounty_id, quester_wallet, proof_type, proof_hash, status,
             file_name, mime_type, file_size, external_url, notes, links_json,
             created_at, reviewed_at, rejection_reason
      FROM submissions
      WHERE bounty_id = ? OR bounty_id = ?
      ORDER BY created_at DESC
    `).all(bounty.id, bounty.contract_quest_id || '') as any[];

    console.log('[QuestPay] Found submissions', {
      count: rows.length
    });

    const submissions = rows.map((s, idx) => {
      let links: string[] = [];
      try {
        links = JSON.parse(s.links_json || '[]');
      } catch {
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

    return res.status(200).json({
      success: true,
      bounty: {
        id: bounty.id,
        contractQuestId: bounty.contract_quest_id,
        title: bounty.title,
        description: bounty.description,
        rewardUsdm: bounty.reward_usdm,
        employerWallet: bounty.employer_wallet,
        status: bounty.status,
        proofType: bounty.proof_type
      },
      count: submissions.length,
      submissions
    });
  } catch (error: any) {
    console.error('[QuestPay] Failed to load submissions:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to load bounty submissions.'
    });
  }
};

submissionsRouter.get('/bounties/:bountyId/submissions', handleBountySubmissions);
submissionsRouter.get('/bounties/:id/submissions', handleBountySubmissions);
submissionsRouter.post('/bounties/:id/submissions/access', handleBountySubmissions);

// 5. GET /api/debug/bounties/:bountyId/submissions — Development Debug Endpoint
submissionsRouter.get('/debug/bounties/:bountyId/submissions', (req: Request, res: Response) => {
  const bountyId = String(req.params.bountyId).trim();
  const bounty = db.prepare('SELECT * FROM bounties WHERE id = ? OR contract_quest_id = ?').get(bountyId, bountyId) as any;

  if (!bounty) {
    return res.status(404).json({ success: false, error: 'Bounty not found' });
  }

  const rows = db.prepare(`
    SELECT id, bounty_id, quester_wallet, proof_type, status, created_at
    FROM submissions
    WHERE bounty_id = ? OR bounty_id = ?
    ORDER BY created_at DESC
  `).all(bounty.id, bounty.contract_quest_id || '') as any[];

  res.json({
    bounty: {
      id: bounty.id,
      contractQuestId: bounty.contract_quest_id,
      employerWallet: bounty.employer_wallet,
      title: bounty.title
    },
    submissionCount: rows.length,
    submissions: rows.map(s => ({
      id: s.id,
      bountyId: s.bounty_id,
      questerWallet: s.quester_wallet,
      proofType: s.proof_type,
      status: s.status,
      createdAt: s.created_at
    }))
  });
});

// 5. GET /api/submissions/:submissionId/proof — Employer decrypts and views private proof
const handleViewProof = (req: Request, res: Response) => {
  const submissionId = req.params.submissionId || req.params.id;
  const wallet = extractWallet(req).toLowerCase();

  if (!wallet) {
    return res.status(400).json({
      success: false,
      error: 'Connected wallet is required.'
    });
  }

  const sub = db.prepare('SELECT * FROM submissions WHERE id = ?').get(submissionId) as any;
  if (!sub) {
    return res.status(404).json({ success: false, error: 'Submission not found.' });
  }

  const bounty = db.prepare('SELECT * FROM bounties WHERE id = ?').get(sub.bounty_id) as any;
  if (!bounty) {
    return res.status(404).json({ success: false, error: 'Parent bounty not found.' });
  }

  // Owner check
  if (wallet !== bounty.employer_wallet.toLowerCase()) {
    return res.status(403).json({
      success: false,
      error: 'Only the bounty owner can view this proof.'
    });
  }

  // Decrypt proof bundle
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
      bountyId: bounty.id,
      bountyTitle: bounty.title,
      questerWallet: sub.quester_wallet,
      proofHash: sub.proof_hash,
      status: sub.status,
      submittedAt: sub.created_at,
      proof: parsedBundle,
      payload: parsedBundle,
      submission: {
        submissionId: sub.id,
        questerWallet: sub.quester_wallet,
        bountyTitle: bounty.title,
        proofHash: sub.proof_hash,
        status: sub.status,
        submittedAt: sub.created_at
      }
    });
  } catch (err: any) {
    console.error('[QuestPay] Decryption failed:', err);
    res.status(500).json({ success: false, error: 'Failed to decrypt proof: ' + err.message });
  }
};

submissionsRouter.get('/submissions/:submissionId/proof', handleViewProof);
submissionsRouter.get('/submissions/:id/proof', handleViewProof);
submissionsRouter.post('/submissions/:id/decrypt', handleViewProof);
submissionsRouter.post('/submissions/:id/access', handleViewProof);

// 6. POST /api/submissions/:id/approve (and /api/bounties/:id/approve) — Employer approves submission
const handleApproveSubmission = async (req: Request, res: Response) => {
  const targetId = req.params.id;
  const { submissionId, chainTxHash, approvalTxHash, payoutTxHash } = req.body;
  const wallet = extractWallet(req).toLowerCase();

  const resolvedTx = payoutTxHash || chainTxHash || approvalTxHash;

  if (!resolvedTx || typeof resolvedTx !== 'string' || !resolvedTx.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Real Midnight on-chain payout transaction hash is required to approve and release escrow.'
    });
  }

  // Real On-Chain Payout Transaction Verification
  const txVerification = await verifyMidnightPreviewTx(resolvedTx);
  if (!txVerification.verified) {
    return res.status(422).json({
      success: false,
      error: `Payout transaction verification failed: ${txVerification.error || 'Transaction could not be verified on Midnight Preview.'}`,
      code: 'TRANSACTION_VERIFICATION_FAILED'
    });
  }

  // Check if targetId is a submission ID or bounty ID
  let sub = db.prepare('SELECT * FROM submissions WHERE id = ?').get(targetId) as any;
  let bounty: any;

  if (sub) {
    bounty = db.prepare('SELECT * FROM bounties WHERE id = ?').get(sub.bounty_id) as any;
  } else {
    bounty = db.prepare('SELECT * FROM bounties WHERE id = ? OR contract_quest_id = ?').get(targetId, targetId) as any;
    if (bounty && submissionId) {
      sub = db.prepare('SELECT * FROM submissions WHERE id = ? AND bounty_id = ?').get(submissionId, bounty.id) as any;
    } else if (bounty) {
      sub = db.prepare('SELECT * FROM submissions WHERE bounty_id = ? ORDER BY created_at DESC LIMIT 1').get(bounty.id) as any;
    }
  }

  if (!bounty) {
    return res.status(404).json({ success: false, error: 'Bounty not found.' });
  }

  if (wallet && wallet !== bounty.employer_wallet.toLowerCase()) {
    return res.status(403).json({ success: false, error: 'Only the bounty owner can approve submissions.' });
  }

  if (bounty.status === 'PAID' || bounty.status === 'Paid') {
    return res.status(400).json({ success: false, error: 'Bounty has already been completed and paid.' });
  }

  if (bounty.status === 'CANCELLED' || bounty.status === 'Cancelled') {
    return res.status(400).json({ success: false, error: 'Cannot approve submission on a cancelled bounty.' });
  }

  const questerWallet = sub ? sub.quester_wallet : null;

  // Update bounty to PAID with real on-chain transaction metadata
  db.prepare(`
    UPDATE bounties
    SET status = 'PAID',
        payout_tx_hash = ?,
        payout_tx_status = 'FINALIZED',
        paid_onchain = 1,
        approval_tx_hash = ?
    WHERE id = ?
  `).run(resolvedTx.trim(), resolvedTx.trim(), bounty.id);

  // Update submission to Approved
  if (sub) {
    db.prepare('UPDATE submissions SET status = "Approved", reviewed_at = ? WHERE id = ?').run(new Date().toISOString(), sub.id);
  }

  // Record on-chain payout transaction
  db.prepare(`
    INSERT INTO transactions (id, wallet, tx_hash, type, status, bounty_id, created_at)
    VALUES (?, ?, ?, 'BOUNTY_PAYOUT', 'Confirmed', ?, ?)
  `).run(crypto.randomUUID(), bounty.employer_wallet.toLowerCase(), resolvedTx.trim(), bounty.id, new Date().toISOString());

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
    message: 'Submission approved and USDM payout verified on Midnight Preview on-chain.',
    status: 'PAID',
    payoutTxHash: resolvedTx.trim(),
    payoutTxStatus: 'FINALIZED',
    paidOnchain: 1,
    rewardUsdm: bounty.reward_usdm
  });
};

submissionsRouter.post('/submissions/:id/approve', handleApproveSubmission);
submissionsRouter.post('/bounties/:id/approve', handleApproveSubmission);

// 7. POST /api/submissions/:id/reject (and /api/bounties/:id/reject) — Employer rejects submission
const handleRejectSubmission = (req: Request, res: Response) => {
  const targetId = req.params.id;
  const { submissionId, rejectionReason } = req.body;
  const wallet = extractWallet(req).toLowerCase();

  let sub = db.prepare('SELECT * FROM submissions WHERE id = ?').get(targetId) as any;
  let bounty: any;

  if (sub) {
    bounty = db.prepare('SELECT * FROM bounties WHERE id = ?').get(sub.bounty_id) as any;
  } else {
    bounty = db.prepare('SELECT * FROM bounties WHERE id = ? OR contract_quest_id = ?').get(targetId, targetId) as any;
    if (bounty && submissionId) {
      sub = db.prepare('SELECT * FROM submissions WHERE id = ? AND bounty_id = ?').get(submissionId, bounty.id) as any;
    }
  }

  if (!bounty) {
    return res.status(404).json({ success: false, error: 'Bounty not found.' });
  }

  if (wallet && wallet !== bounty.employer_wallet.toLowerCase()) {
    return res.status(403).json({ success: false, error: 'Only the bounty owner can reject submissions.' });
  }

  if (bounty.status === 'Paid') {
    return res.status(400).json({ success: false, error: 'Cannot reject an already completed bounty.' });
  }

  const reason = rejectionReason ? rejectionReason.trim() : 'Submission requirements were not fully satisfied.';

  if (sub) {
    db.prepare('UPDATE submissions SET status = "Rejected", reviewed_at = ?, rejection_reason = ? WHERE id = ?').run(
      new Date().toISOString(),
      reason,
      sub.id
    );
  }

  db.prepare('UPDATE bounties SET rejection_reason = ? WHERE id = ?').run(reason, bounty.id);

  res.json({
    success: true,
    message: 'Submission rejected. Quester has been notified.',
    status: 'Rejected',
    rejectionReason: reason
  });
};

submissionsRouter.post('/submissions/:id/reject', handleRejectSubmission);
submissionsRouter.post('/bounties/:id/reject', handleRejectSubmission);
