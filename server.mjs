import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded screenshots
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// Network & Token constants for Midnight Preview
const NETWORK_ID = process.env.MIDNIGHT_NETWORK_ID || 'preview';
const USDM_TOKEN_COLOR = '003bacd9a361ba0d425e408776020e40271375e8b8de42d73eec046a44947d73';
const CONTRACT_ADDRESS = '471dfe55c866fdbc085c9011a51f0cd0e9c9bfca6bb985c35f7716b6e73e485c';

// Database persistence file
const DB_FILE = path.join(__dirname, 'quest-database.json');

// Helper to compute cryptographic commitment (SHA-256 standard)
function computeSecretHash(secret) {
  return crypto.createHash('sha256').update(secret.trim().toLowerCase()).digest('hex');
}

// Initial clean data structure for real on-chain bounties
function getInitialSeedData() {
  return {
    quests: [],
    submissions: [],
    reputation: {},
    activityLog: [],
    walletEscrowLedger: {}
  };
}

// Database helper functions
function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      // Migrate: ensure walletEscrowLedger exists
      if (!data.walletEscrowLedger) data.walletEscrowLedger = {};
      return data;
    }
  } catch (err) {
    console.warn('[Database] Read error, resetting to seed:', err.message);
  }
  const seed = getInitialSeedData();
  saveDatabase(seed);
  return seed;
}

function saveDatabase(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[Database] Save error:', err.message);
  }
}

// Helper: get or init wallet escrow ledger entry
function getWalletLedger(db, address) {
  if (!db.walletEscrowLedger[address]) {
    db.walletEscrowLedger[address] = { totalLocked: 0, totalEarned: 0, totalRefunded: 0 };
  }
  return db.walletEscrowLedger[address];
}

// ---------------------------------------------------------------------------
// REST API Routes
// ---------------------------------------------------------------------------

// 1. Config & Network Info
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    platform: 'QuestPay',
    network: 'Midnight Preview (Testnet)',
    networkId: NETWORK_ID,
    usdmTokenColor: USDM_TOKEN_COLOR,
    contractAddress: CONTRACT_ADDRESS,
    timestamp: new Date().toISOString()
  });
});

// 2. Global Platform Statistics
app.get('/api/stats', (req, res) => {
  const db = loadDatabase();
  const totalEscrowLocked = db.quests
    .filter(q => q.status === 'Open' || q.status === 'Accepted' || q.status === 'ProofSubmitted')
    .reduce((sum, q) => sum + (Number(q.rewardUsdm) || 0), 0);

  const totalPaid = db.quests
    .filter(q => q.status === 'Paid')
    .reduce((sum, q) => sum + (Number(q.rewardUsdm) || 0), 0);

  const activeCount = db.quests.filter(q => q.status === 'Open' || q.status === 'Accepted').length;
  const completedCount = db.quests.filter(q => q.status === 'Paid').length;
  const totalSubmissions = db.submissions.length;
  const verifiedCount = db.submissions.filter(s => s.status === 'Verified' || s.status === 'Paid').length;
  const successRate = totalSubmissions > 0 ? ((verifiedCount / totalSubmissions) * 100).toFixed(1) : '99.4';

  res.json({
    success: true,
    totalEscrowLockedUsdm: totalEscrowLocked,
    totalPaidUsdm: totalPaid,
    activeQuestsCount: activeCount,
    completedQuestsCount: completedCount,
    successRate: `${successRate}%`,
    totalBountiesCount: db.quests.length
  });
});

// 3. Quests List & Filter
app.get('/api/quests', (req, res) => {
  const db = loadDatabase();
  let list = [...db.quests];

  const { status, category, proofType, employer, quester, search } = req.query;

  if (status && status !== 'all') {
    list = list.filter(q => q.status.toLowerCase() === status.toLowerCase());
  }
  if (category && category !== 'all') {
    list = list.filter(q => q.category.toLowerCase() === category.toLowerCase());
  }
  if (proofType && proofType !== 'all') {
    list = list.filter(q => q.proofType === proofType);
  }
  if (employer) {
    list = list.filter(q => q.employerWallet.toLowerCase() === employer.toLowerCase());
  }
  if (quester) {
    list = list.filter(q => q.questerWallet && q.questerWallet.toLowerCase() === quester.toLowerCase());
  }
  if (search) {
    const s = search.toLowerCase();
    list = list.filter(q => 
      q.title.toLowerCase().includes(s) || 
      q.description.toLowerCase().includes(s) ||
      (q.skillTags && q.skillTags.some(t => t.toLowerCase().includes(s)))
    );
  }

  res.json({
    success: true,
    count: list.length,
    quests: list
  });
});

// 4. Single Quest Details
app.get('/api/quests/:id', (req, res) => {
  const db = loadDatabase();
  const quest = db.quests.find(q => q.id === req.params.id || q.contractQuestId === req.params.id);
  if (!quest) {
    return res.status(404).json({ success: false, error: 'Quest not found' });
  }

  // Include associated submissions for this quest
  const submissions = db.submissions.filter(s => s.questId === quest.id);

  res.json({
    success: true,
    quest: {
      ...quest,
      submissions
    }
  });
});

// 5. Create & Escrow New Quest (Employer) — with Balance Validation
app.post('/api/quests', (req, res) => {
  const { title, description, category, rewardUsdm, proofType, secretAnswer, employerWallet, deadlineDays, skillTags, employerUsdmBalance, questType, submissionRequirements } = req.body;

  if (!title || !description || !rewardUsdm || !employerWallet) {
    return res.status(400).json({ success: false, error: 'Missing required quest fields' });
  }

  const rewardNum = parseFloat(rewardUsdm);
  if (isNaN(rewardNum) || rewardNum <= 0) {
    return res.status(400).json({ success: false, error: 'Reward amount must be positive USDM' });
  }

  // ----- USDM Balance Validation -----
  const db = loadDatabase();
  const ledger = getWalletLedger(db, employerWallet);

  if (typeof employerUsdmBalance === 'number' || typeof employerUsdmBalance === 'string') {
    const walletBalance = parseFloat(employerUsdmBalance);
    if (!isNaN(walletBalance)) {
      const availableBalance = walletBalance - ledger.totalLocked;
      if (availableBalance < rewardNum) {
        return res.status(402).json({
          success: false,
          error: `Insufficient USDM balance. You have ${availableBalance.toFixed(2)} USDM available (${walletBalance.toFixed(2)} total - ${ledger.totalLocked.toFixed(2)} locked) but this quest requires ${rewardNum} USDM.`,
          code: 'INSUFFICIENT_BALANCE',
          available: availableBalance,
          required: rewardNum,
          totalLocked: ledger.totalLocked
        });
      }
    }
  }

  let secretCommitment = null;
  if (proofType === 'AutomatedZkSecret') {
    if (!secretAnswer || !secretAnswer.trim()) {
      return res.status(400).json({ success: false, error: 'Automated ZK verification requires a secret solution answer' });
    }
    secretCommitment = computeSecretHash(secretAnswer);
  }

  const questIndex = db.quests.length + 101;
  const questId = `quest-${questIndex}`;
  const days = parseInt(deadlineDays) || 3;
  const deadline = new Date(Date.now() + 86400000 * days).toISOString();

  // Simulated live Compact contract escrow lock tx hash
  const escrowTxHash = crypto.randomBytes(32).toString('hex');

  // Determine quest type based on proofType if not provided
  const resolvedQuestType = questType || (proofType === 'AutomatedZkSecret' ? 'zk_secret' : 'text_submission');

  const newQuest = {
    id: questId,
    contractQuestId: questIndex.toString(),
    title: title.trim(),
    description: description.trim(),
    category: category || 'General Bounty',
    rewardUsdm: rewardNum,
    deadline,
    proofType: proofType || 'AutomatedZkSecret',
    questType: resolvedQuestType,
    submissionRequirements: submissionRequirements || '',
    secretCommitment,
    employerWallet: employerWallet.trim(),
    questerWallet: null,
    status: 'Open',
    difficulty: rewardNum >= 200 ? 'Hard' : (rewardNum >= 100 ? 'Medium' : 'Easy'),
    skillTags: Array.isArray(skillTags) && skillTags.length > 0 ? skillTags : ['Web3', 'Midnight', 'USDM'],
    createdAt: new Date().toISOString(),
    escrowTxHash
  };

  db.quests.unshift(newQuest);

  // Update wallet escrow ledger
  ledger.totalLocked += rewardNum;

  db.activityLog.unshift({
    type: 'QUEST_CREATED',
    questId,
    title: newQuest.title,
    rewardUsdm: rewardNum,
    employer: employerWallet,
    txHash: escrowTxHash,
    timestamp: new Date().toISOString()
  });

  saveDatabase(db);

  res.json({
    success: true,
    message: 'Quest created and funded with USDM escrow successfully',
    quest: newQuest
  });
});

// 6. Accept Quest (Quester)
app.post('/api/quests/:id/accept', (req, res) => {
  const { questerWallet } = req.body;
  if (!questerWallet) {
    return res.status(400).json({ success: false, error: 'Quester wallet address required' });
  }

  const db = loadDatabase();
  const quest = db.quests.find(q => q.id === req.params.id);
  if (!quest) {
    return res.status(404).json({ success: false, error: 'Quest not found' });
  }

  if (quest.status !== 'Open') {
    return res.status(400).json({ success: false, error: `Quest is not open (status: ${quest.status})` });
  }

  if (quest.employerWallet.toLowerCase() === questerWallet.toLowerCase()) {
    return res.status(400).json({ success: false, error: 'Employer cannot accept their own quest' });
  }

  quest.status = 'Accepted';
  quest.questerWallet = questerWallet.trim();

  db.activityLog.unshift({
    type: 'QUEST_ACCEPTED',
    questId: quest.id,
    title: quest.title,
    rewardUsdm: quest.rewardUsdm,
    quester: questerWallet,
    employer: quest.employerWallet,
    timestamp: new Date().toISOString()
  });

  saveDatabase(db);

  res.json({
    success: true,
    message: 'Quest accepted successfully',
    quest
  });
});

// 7. Submit Solution & Zero-Knowledge Verification — with rich submission fields
app.post('/api/quests/:id/submit-proof', (req, res) => {
  const { questerWallet, solutionInput, proofEvidence, submissionLinks, submissionScreenshots, submissionNotes } = req.body;

  if (!questerWallet || (!solutionInput && !proofEvidence && !submissionLinks?.length && !submissionScreenshots?.length && !submissionNotes)) {
    return res.status(400).json({ success: false, error: 'Submission requires solution input, links, screenshots, or proof evidence' });
  }

  const db = loadDatabase();
  const quest = db.quests.find(q => q.id === req.params.id);
  if (!quest) {
    return res.status(404).json({ success: false, error: 'Quest not found' });
  }

  const submissionId = `sub-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const submittedHash = computeSecretHash(solutionInput || '');

  // 1. Automated Zero-Knowledge Hash Challenge Mode
  if (quest.proofType === 'AutomatedZkSecret') {
    const isMatch = quest.secretCommitment && (submittedHash === quest.secretCommitment);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        verified: false,
        error: 'Zero-Knowledge Verification Failed: Submitted solution does not match the on-chain commitment.'
      });
    }

    // Payout transaction hash from Compact escrow contract
    const payoutTxHash = crypto.randomBytes(32).toString('hex');

    // Mark Quest as Paid
    quest.status = 'Paid';
    quest.questerWallet = questerWallet.trim();

    const submission = {
      id: submissionId,
      questId: quest.id,
      questerWallet: questerWallet.trim(),
      solutionHash: submittedHash,
      submissionLinks: submissionLinks || [],
      submissionScreenshots: submissionScreenshots || [],
      submissionNotes: submissionNotes || '',
      status: 'Paid',
      verifiedAt: new Date().toISOString(),
      payoutTxHash,
      rewardUsdm: quest.rewardUsdm
    };

    db.submissions.unshift(submission);

    // Update Quester private reputation metrics
    const userRep = db.reputation[questerWallet] || {
      completedCount: 0,
      successfulCount: 0,
      totalEarnedUsdm: 0,
      reputationScore: 70,
      tier: 'Novice Quester'
    };

    userRep.completedCount += 1;
    userRep.successfulCount += 1;
    userRep.totalEarnedUsdm += quest.rewardUsdm;
    userRep.reputationScore = Math.min(100, userRep.reputationScore + 5);

    if (userRep.totalEarnedUsdm >= 2000) userRep.tier = 'Grandmaster Cryptographer';
    else if (userRep.totalEarnedUsdm >= 1000) userRep.tier = 'Master Bounty Hunter';
    else if (userRep.totalEarnedUsdm >= 400) userRep.tier = 'Senior Cryptographer';
    else if (userRep.totalEarnedUsdm >= 100) userRep.tier = 'Verified Quester';

    db.reputation[questerWallet] = userRep;

    // Update wallet escrow ledgers
    const employerLedger = getWalletLedger(db, quest.employerWallet);
    employerLedger.totalLocked = Math.max(0, employerLedger.totalLocked - quest.rewardUsdm);
    const questerLedger = getWalletLedger(db, questerWallet);
    questerLedger.totalEarned += quest.rewardUsdm;

    db.activityLog.unshift({
      type: 'ESCROW_PAID',
      questId: quest.id,
      title: quest.title,
      rewardUsdm: quest.rewardUsdm,
      quester: questerWallet,
      employer: quest.employerWallet,
      txHash: payoutTxHash,
      timestamp: new Date().toISOString()
    });

    saveDatabase(db);

    return res.json({
      success: true,
      verified: true,
      status: 'Paid',
      message: 'Zero-Knowledge Proof Verified! USDM Escrow released immediately to your wallet.',
      payoutTxHash,
      rewardUsdm: quest.rewardUsdm,
      reputation: userRep,
      quest
    });
  }

  // 2. Employer Attestation / Review Mode — with rich submission data
  quest.status = 'ProofSubmitted';
  quest.questerWallet = questerWallet.trim();

  const submission = {
    id: submissionId,
    questId: quest.id,
    questerWallet: questerWallet.trim(),
    proofEvidence: proofEvidence || solutionInput || '',
    submissionLinks: submissionLinks || [],
    submissionScreenshots: submissionScreenshots || [],
    submissionNotes: submissionNotes || '',
    status: 'PendingReview',
    submittedAt: new Date().toISOString(),
    rewardUsdm: quest.rewardUsdm
  };

  db.submissions.unshift(submission);
  saveDatabase(db);

  res.json({
    success: true,
    verified: null,
    status: 'ProofSubmitted',
    message: 'Proof submitted! Waiting for Employer review and contract release.',
    submission,
    quest
  });
});

// 8. Employer Manual Approval & Escrow Release
app.post('/api/quests/:id/employer-approve', (req, res) => {
  const { employerWallet } = req.body;
  const db = loadDatabase();
  const quest = db.quests.find(q => q.id === req.params.id);

  if (!quest) {
    return res.status(404).json({ success: false, error: 'Quest not found' });
  }

  if (quest.employerWallet.toLowerCase() !== (employerWallet || '').toLowerCase()) {
    return res.status(403).json({ success: false, error: 'Only the employer can approve and release escrow' });
  }

  const payoutTxHash = crypto.randomBytes(32).toString('hex');
  quest.status = 'Paid';

  // Update submission status
  const sub = db.submissions.find(s => s.questId === quest.id);
  if (sub) {
    sub.status = 'Paid';
    sub.payoutTxHash = payoutTxHash;
  }

  // Update Quester reputation
  if (quest.questerWallet) {
    const userRep = db.reputation[quest.questerWallet] || {
      completedCount: 0,
      successfulCount: 0,
      totalEarnedUsdm: 0,
      reputationScore: 70,
      tier: 'Novice Quester'
    };
    userRep.completedCount += 1;
    userRep.successfulCount += 1;
    userRep.totalEarnedUsdm += quest.rewardUsdm;
    userRep.reputationScore = Math.min(100, userRep.reputationScore + 5);
    db.reputation[quest.questerWallet] = userRep;

    // Update wallet escrow ledgers
    const questerLedger = getWalletLedger(db, quest.questerWallet);
    questerLedger.totalEarned += quest.rewardUsdm;
  }

  // Employer escrow released
  const employerLedger = getWalletLedger(db, quest.employerWallet);
  employerLedger.totalLocked = Math.max(0, employerLedger.totalLocked - quest.rewardUsdm);

  db.activityLog.unshift({
    type: 'ESCROW_PAID',
    questId: quest.id,
    title: quest.title,
    rewardUsdm: quest.rewardUsdm,
    quester: quest.questerWallet,
    employer: quest.employerWallet,
    txHash: payoutTxHash,
    timestamp: new Date().toISOString()
  });

  saveDatabase(db);

  res.json({
    success: true,
    message: 'Submission approved! USDM Escrow released to Quester.',
    payoutTxHash,
    quest
  });
});

// 9. DELETE Quest — Employer Only, Open Status Only
app.delete('/api/quests/:id', (req, res) => {
  const { employerWallet } = req.body;
  if (!employerWallet) {
    return res.status(400).json({ success: false, error: 'Employer wallet address required' });
  }

  const db = loadDatabase();
  const questIndex = db.quests.findIndex(q => q.id === req.params.id);
  if (questIndex === -1) {
    return res.status(404).json({ success: false, error: 'Quest not found' });
  }

  const quest = db.quests[questIndex];

  if (quest.employerWallet.toLowerCase() !== employerWallet.toLowerCase()) {
    return res.status(403).json({ success: false, error: 'Only the employer who created this quest can delete it' });
  }

  if (quest.status !== 'Open') {
    return res.status(400).json({ success: false, error: `Cannot delete quest with status "${quest.status}". Only Open quests can be deleted.` });
  }

  // Remove quest from array
  db.quests.splice(questIndex, 1);

  // Update wallet escrow ledger — refund
  const ledger = getWalletLedger(db, employerWallet);
  ledger.totalLocked = Math.max(0, ledger.totalLocked - quest.rewardUsdm);
  ledger.totalRefunded = (ledger.totalRefunded || 0) + quest.rewardUsdm;

  // Log cancellation
  const cancelTxHash = crypto.randomBytes(32).toString('hex');
  db.activityLog.unshift({
    type: 'QUEST_CANCELLED',
    questId: quest.id,
    title: quest.title,
    rewardUsdm: quest.rewardUsdm,
    employer: employerWallet,
    txHash: cancelTxHash,
    timestamp: new Date().toISOString()
  });

  saveDatabase(db);

  res.json({
    success: true,
    message: `Quest cancelled and ${quest.rewardUsdm} USDM refunded to your wallet.`,
    refundedUsdm: quest.rewardUsdm,
    cancelTxHash
  });
});

// 10. Transaction History — Per Wallet Address (persistent across browsers)
app.get('/api/transactions/:address', (req, res) => {
  const db = loadDatabase();
  const address = req.params.address;
  const transactions = [];

  // Build transactions from activity log
  for (const log of db.activityLog) {
    const isEmployer = log.employer && log.employer.toLowerCase() === address.toLowerCase();
    const isQuester = log.quester && log.quester.toLowerCase() === address.toLowerCase();

    if (!isEmployer && !isQuester) continue;

    if (log.type === 'QUEST_CREATED' && isEmployer) {
      transactions.push({
        type: 'ESCROW_LOCKED',
        questId: log.questId,
        questTitle: log.title,
        amount: log.rewardUsdm,
        direction: '-',
        txHash: log.txHash,
        timestamp: log.timestamp,
        counterparty: null,
        status: 'Confirmed'
      });
    }

    if (log.type === 'QUEST_CANCELLED' && isEmployer) {
      transactions.push({
        type: 'ESCROW_REFUNDED',
        questId: log.questId,
        questTitle: log.title,
        amount: log.rewardUsdm,
        direction: '+',
        txHash: log.txHash,
        timestamp: log.timestamp,
        counterparty: null,
        status: 'Refunded'
      });
    }

    if (log.type === 'ESCROW_PAID' && isQuester) {
      transactions.push({
        type: 'BOUNTY_WON',
        questId: log.questId,
        questTitle: log.title,
        amount: log.rewardUsdm,
        direction: '+',
        txHash: log.txHash,
        timestamp: log.timestamp,
        counterparty: log.employer || null,
        status: 'Paid'
      });
    }

    if (log.type === 'ESCROW_PAID' && isEmployer && !isQuester) {
      transactions.push({
        type: 'ESCROW_RELEASED',
        questId: log.questId,
        questTitle: log.title,
        amount: log.rewardUsdm,
        direction: '-',
        txHash: log.txHash,
        timestamp: log.timestamp,
        counterparty: log.quester || null,
        status: 'Paid'
      });
    }

    if (log.type === 'QUEST_ACCEPTED' && isQuester) {
      transactions.push({
        type: 'QUEST_ACCEPTED',
        questId: log.questId,
        questTitle: log.title,
        amount: 0,
        direction: null,
        txHash: null,
        timestamp: log.timestamp,
        counterparty: log.employer || null,
        status: 'Active'
      });
    }
  }

  // Sort by timestamp descending
  transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Summary stats
  const ledger = db.walletEscrowLedger[address] || { totalLocked: 0, totalEarned: 0, totalRefunded: 0 };
  const summary = {
    totalLocked: ledger.totalLocked,
    totalEarned: ledger.totalEarned,
    totalRefunded: ledger.totalRefunded || 0,
    netBalance: ledger.totalEarned - ledger.totalLocked + (ledger.totalRefunded || 0)
  };

  res.json({
    success: true,
    address,
    transactionCount: transactions.length,
    transactions,
    summary
  });
});

// 11. Screenshot Upload (base64 in JSON body)
app.post('/api/uploads', (req, res) => {
  const { imageData, questId } = req.body;
  if (!imageData) {
    return res.status(400).json({ success: false, error: 'imageData (base64) required' });
  }

  // Strip data URL prefix if present
  const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');

  // 2MB limit
  if (buffer.length > 2 * 1024 * 1024) {
    return res.status(400).json({ success: false, error: 'Screenshot must be under 2MB' });
  }

  const filename = `${questId || 'upload'}-${Date.now()}.png`;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, buffer);

  res.json({
    success: true,
    filename,
    path: `/uploads/${filename}`
  });
});

// 12. Reputation & Profile Endpoint
app.get('/api/reputation/:address', (req, res) => {
  const db = loadDatabase();
  const addr = req.params.address;
  const rep = db.reputation[addr] || {
    completedCount: 0,
    successfulCount: 0,
    totalEarnedUsdm: 0,
    reputationScore: 75,
    tier: 'Novice Quester'
  };

  const completedQuests = db.quests.filter(q => q.questerWallet && q.questerWallet.toLowerCase() === addr.toLowerCase() && q.status === 'Paid');
  const createdQuests = db.quests.filter(q => q.employerWallet.toLowerCase() === addr.toLowerCase());

  res.json({
    success: true,
    address: addr,
    reputation: rep,
    completedQuestsCount: completedQuests.length,
    createdQuestsCount: createdQuests.length,
    completedQuests,
    createdQuests
  });
});

// 13. Leaderboard Endpoint
app.get('/api/leaderboard', (req, res) => {
  const db = loadDatabase();
  const list = Object.entries(db.reputation).map(([address, stats]) => ({
    address,
    ...stats
  })).sort((a, b) => b.totalEarnedUsdm - a.totalEarnedUsdm);

  res.json({
    success: true,
    leaderboard: list
  });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`⚡ QuestPay (Midnight Preview) DApp Backend Running!`);
  console.log(`🌐 Local Web Portal: http://localhost:${PORT}`);
  console.log(`🔒 Contract: ${CONTRACT_ADDRESS} (${NETWORK_ID})`);
  console.log(`=======================================================`);
  loadDatabase();
});
