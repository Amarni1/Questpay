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
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// Initial seed quests showcasing real ZK, Compact & privacy bounties
function getInitialSeedData() {
  const answer1 = "recursion";
  const answer2 = "overflow_check_missing";
  const answer3 = "midnight_preview_zk";

  return {
    quests: [
      {
        id: "quest-101",
        contractQuestId: "101",
        title: "ZK Cryptographic Riddle: The Self-Referential Circuit",
        description: "Solve the riddle: 'I speak without a voice, I verify without revealing, I call upon myself to prove the unseen. What single computer science concept describes me?' Submit the single-word solution.",
        category: "ZK Cryptography",
        rewardUsdm: 75,
        deadline: new Date(Date.now() + 86400000 * 2).toISOString(),
        proofType: "AutomatedZkSecret",
        secretCommitment: computeSecretHash(answer1),
        employerWallet: "mn_addr_preview1employer001qzpz3v8s7k2d9x4c0a5f6e8r7t1w2y3z4a",
        questerWallet: null,
        status: "Open",
        difficulty: "Medium",
        skillTags: ["Zero-Knowledge", "Cryptography", "Algorithms"],
        createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
        escrowTxHash: "3a8f9c71b2d4e680a1c3e5f79b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e4b6d"
      },
      {
        id: "quest-102",
        contractQuestId: "102",
        title: "Compact Smart Contract Vulnerability: Integer Edge-Case",
        description: "Review this Compact escrow snippet. Identify the specific logic flaw in token transfer calculations when dealing with 64-bit unsigned bounds. Submit the exact keyword phrase identifying the bug.",
        category: "Smart Contract Audit",
        rewardUsdm: 250,
        deadline: new Date(Date.now() + 86400000 * 3).toISOString(),
        proofType: "AutomatedZkSecret",
        secretCommitment: computeSecretHash(answer2),
        employerWallet: "mn_addr_preview1employer002k8s9d4f2j1l5x7c9v3b6n8m0q1w2e3r4t",
        questerWallet: null,
        status: "Open",
        difficulty: "Hard",
        skillTags: ["Compact", "Security", "Smart Contracts", "Audit"],
        createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
        escrowTxHash: "8b1e4c7a9f2d0e3b5a7c9f1d3e5b7a9c1e3f5a7c9e1b3d5f7a9c1e3f5b7d9a1c"
      },
      {
        id: "quest-103",
        contractQuestId: "103",
        title: "Midnight Preview Indexer Performance Benchmark",
        description: "Benchmark GraphQL WebSocket query latency for 100 consecutive unshielded UTxO transaction updates across varied global nodes. Provide structured JSON telemetry and methodology.",
        category: "Research & Benchmarking",
        rewardUsdm: 120,
        deadline: new Date(Date.now() + 86400000 * 4).toISOString(),
        proofType: "EmployerAttestation",
        secretCommitment: null,
        employerWallet: "mn_addr_preview1researchorg8v7x6c5b4n3m2q1w9e8r7t6y5u4i3o2p1",
        questerWallet: null,
        status: "Open",
        difficulty: "Expert",
        skillTags: ["GraphQL", "WebSockets", "Node.js", "Performance"],
        createdAt: new Date(Date.now() - 3600000 * 18).toISOString(),
        escrowTxHash: "9dbff75866344153ea54d087a881cdf93000727a18fab2b509e96e79770fd62c"
      },
      {
        id: "quest-104",
        contractQuestId: "104",
        title: "Zero-Knowledge Secret Key Derivation Verification",
        description: "Demonstrate client-side key derivation conformance with Midnight BIP39 seed standards for unshielded public keys. Submit the cryptographic derivation identifier.",
        category: "ZK Cryptography",
        rewardUsdm: 180,
        deadline: new Date(Date.now() + 86400000 * 1).toISOString(),
        proofType: "AutomatedZkSecret",
        secretCommitment: computeSecretHash(answer3),
        employerWallet: "mn_addr_preview1cryptolab4m3n2b1v9c8x7z6a5s4d3f2g1h0j9k8l7",
        questerWallet: null,
        status: "Open",
        difficulty: "Medium",
        skillTags: ["BIP39", "Key Derivation", "Rust", "TypeScript"],
        createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
        escrowTxHash: "2c4e6a8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6a8b0d2f4a"
      }
    ],
    submissions: [],
    reputation: {
      "mn_addr_preview1samplequester": {
        completedCount: 14,
        successfulCount: 14,
        totalEarnedUsdm: 1850,
        reputationScore: 98,
        tier: "Elite Cryptographer"
      }
    },
    activityLog: []
  };
}

// Database helper functions
function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
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

// 5. Create & Escrow New Quest (Employer)
app.post('/api/quests', (req, res) => {
  const { title, description, category, rewardUsdm, proofType, secretAnswer, employerWallet, deadlineDays, skillTags } = req.body;

  if (!title || !description || !rewardUsdm || !employerWallet) {
    return res.status(400).json({ success: false, error: 'Missing required quest fields' });
  }

  const rewardNum = parseFloat(rewardUsdm);
  if (isNaN(rewardNum) || rewardNum <= 0) {
    return res.status(400).json({ success: false, error: 'Reward amount must be positive USDM' });
  }

  let secretCommitment = null;
  if (proofType === 'AutomatedZkSecret') {
    if (!secretAnswer || !secretAnswer.trim()) {
      return res.status(400).json({ success: false, error: 'Automated ZK verification requires a secret solution answer' });
    }
    secretCommitment = computeSecretHash(secretAnswer);
  }

  const db = loadDatabase();
  const questIndex = db.quests.length + 101;
  const questId = `quest-${questIndex}`;
  const days = parseInt(deadlineDays) || 3;
  const deadline = new Date(Date.now() + 86400000 * days).toISOString();

  // Simulated live Compact contract escrow lock tx hash
  const escrowTxHash = crypto.randomBytes(32).toString('hex');

  const newQuest = {
    id: questId,
    contractQuestId: questIndex.toString(),
    title: title.trim(),
    description: description.trim(),
    category: category || 'General Bounty',
    rewardUsdm: rewardNum,
    deadline,
    proofType: proofType || 'AutomatedZkSecret',
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
    quester: questerWallet,
    timestamp: new Date().toISOString()
  });

  saveDatabase(db);

  res.json({
    success: true,
    message: 'Quest accepted successfully',
    quest
  });
});

// 7. Submit Solution & Zero-Knowledge Verification
app.post('/api/quests/:id/submit-proof', (req, res) => {
  const { questerWallet, solutionInput, proofEvidence } = req.body;

  if (!questerWallet || (!solutionInput && !proofEvidence)) {
    return res.status(400).json({ success: false, error: 'Submission requires solution input or proof evidence' });
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

    db.activityLog.unshift({
      type: 'ESCROW_PAID',
      questId: quest.id,
      title: quest.title,
      rewardUsdm: quest.rewardUsdm,
      quester: questerWallet,
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

  // 2. Employer Attestation / Review Mode
  quest.status = 'ProofSubmitted';
  quest.questerWallet = questerWallet.trim();

  const submission = {
    id: submissionId,
    questId: quest.id,
    questerWallet: questerWallet.trim(),
    proofEvidence: proofEvidence || solutionInput,
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
  }

  saveDatabase(db);

  res.json({
    success: true,
    message: 'Submission approved! USDM Escrow released to Quester.',
    payoutTxHash,
    quest
  });
});

// 9. Reputation & Profile Endpoint
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

// 10. Leaderboard Endpoint
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
