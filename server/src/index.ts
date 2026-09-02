import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { db } from './db.js';
import { authRouter } from './routes/auth.js';
import { bountiesRouter } from './routes/bounties.js';
import { submissionsRouter } from './routes/submissions.js';
import { CONTRACT_ADDRESS, MIDNIGHT_NETWORK, USDM_TOKEN_COLOR } from './contracts/questpay.js';

import cookieParser from 'cookie-parser';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: '*',
  exposedHeaders: ['x-questpay-wallet', 'x-questpay-message', 'x-questpay-signature', 'x-questpay-verifying-key']
}));

app.use(cookieParser());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Static frontend build serving
app.use(express.static(path.resolve(process.cwd(), 'client', 'dist')));
app.use(express.static(path.resolve(process.cwd(), 'dist')));
app.use(express.static(path.resolve(process.cwd(), 'public')));

// Health Check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    network: 'Midnight Preview',
    timestamp: new Date().toISOString()
  });
});

// API Routers
app.use('/api/auth', authRouter);
app.use('/api/bounties', bountiesRouter);
app.use('/api', submissionsRouter);

// Platform Overview Stats (Calculated strictly from real database records)
app.get('/api/stats', (req: Request, res: Response) => {
  const activeQuests = db.prepare("SELECT count(*) as count, coalesce(sum(reward_usdm), 0) as totalLocked FROM bounties WHERE status = 'Open' AND chain_tx_hash IS NOT NULL").get() as any;
  const completedQuests = db.prepare("SELECT count(*) as count, coalesce(sum(reward_usdm), 0) as totalPaid FROM bounties WHERE status = 'Paid'").get() as any;
  const totalBounties = db.prepare("SELECT count(*) as count FROM bounties WHERE chain_tx_hash IS NOT NULL").get() as any;

  res.json({
    success: true,
    stats: {
      totalEscrowLockedUsdm: activeQuests ? activeQuests.totalLocked : 0,
      activeQuestsCount: activeQuests ? activeQuests.count : 0,
      completedQuestsCount: completedQuests ? completedQuests.count : 0,
      totalPaidUsdm: completedQuests ? completedQuests.totalPaid : 0,
      totalQuestsCount: totalBounties ? totalBounties.count : 0,
      successRate: completedQuests && completedQuests.count > 0 ? `${Math.round((completedQuests.count / Math.max(1, totalBounties.count)) * 100)}%` : '100%'
    }
  });
});

// Platform Configuration
app.get('/api/config', (req: Request, res: Response) => {
  res.json({
    platform: 'QuestPay',
    network: 'Midnight Preview (Testnet)',
    networkId: MIDNIGHT_NETWORK,
    contractAddress: CONTRACT_ADDRESS,
    usdmTokenColor: USDM_TOKEN_COLOR,
    explorerUrl: process.env.MIDNIGHT_EXPLORER_URL || 'https://explorer.preview.midnight.network/tx/',
    indexerConfigured: !!(process.env.MIDNIGHT_INDEXER_URL || process.env.MIDNIGHT_NODE_URL)
  });
});

// Reputation Leaderboard
app.get('/api/reputation', (req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT wallet_address as walletAddress, completed_count as completedCount,
           successful_count as successfulCount, total_earned_usdm as totalEarnedUsdm,
           reputation_score as reputationScore, tier
    FROM reputation
    ORDER BY reputation_score DESC, total_earned_usdm DESC
    LIMIT 50
  `).all();

  res.json({
    success: true,
    leaderboard: rows
  });
});

// User Reputation Profile
app.get('/api/reputation/:address', (req: Request, res: Response) => {
  const addr = String(req.params.address).toLowerCase();
  const rep = db.prepare('SELECT * FROM reputation WHERE wallet_address = ?').get(addr) as any;
  const ledger = db.prepare('SELECT * FROM wallet_escrow_ledger WHERE wallet_address = ?').get(addr) as any || { total_locked: 0, total_earned: 0, total_refunded: 0 };

  res.json({
    success: true,
    reputation: rep ? {
      walletAddress: rep.wallet_address,
      completedCount: rep.completed_count,
      successfulCount: rep.successful_count,
      totalEarnedUsdm: rep.total_earned_usdm,
      reputationScore: rep.reputation_score,
      tier: rep.tier
    } : {
      walletAddress: addr,
      completedCount: 0,
      successfulCount: 0,
      totalEarnedUsdm: 0,
      reputationScore: 70,
      tier: 'Novice Quester'
    },
    ledger: {
      totalLocked: ledger.total_locked,
      totalEarned: ledger.total_earned,
      totalRefunded: ledger.total_refunded
    }
  });
});

// Escrow Activity Metrics for a given wallet address (analytics only, wallet is balance source of truth)
app.get('/api/wallet-escrow-metrics/:address', (req: Request, res: Response) => {
  const addr = String(req.params.address).toLowerCase();

  // Sum of USDM locked in active (Open/InProgress) bounties created by this wallet
  const locked = db.prepare(
    "SELECT coalesce(sum(reward_usdm), 0) as total FROM bounties WHERE lower(employer_wallet) = ? AND status IN ('Open', 'InProgress') AND chain_tx_hash IS NOT NULL"
  ).get(addr) as any;

  // Sum of USDM earned from approved submissions (Paid bounties where quester is this wallet)
  const earned = db.prepare(
    "SELECT coalesce(sum(b.reward_usdm), 0) as total FROM submissions s JOIN bounties b ON s.bounty_id = b.id WHERE lower(s.quester_wallet) = ? AND b.status = 'Paid' AND s.status = 'Approved'"
  ).get(addr) as any;

  // Sum of USDM paid out as employer (bounties this wallet funded that reached Paid status)
  const paidOut = db.prepare(
    "SELECT coalesce(sum(reward_usdm), 0) as total FROM bounties WHERE lower(employer_wallet) = ? AND status = 'Paid' AND chain_tx_hash IS NOT NULL"
  ).get(addr) as any;

  const totalLocked = locked?.total || 0;
  const totalEarned = earned?.total || 0;
  const totalPaidOut = paidOut?.total || 0;

  res.json({
    success: true,
    address: addr,
    totalLocked: totalLocked.toFixed(2),
    totalEarned: totalEarned.toFixed(2),
    totalPaidOut: totalPaidOut.toFixed(2)
  });
});

// Catch-all for unmatched /api routes (guarantee application/json)
app.use('/api', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `API endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

// Fallback to React index.html for SPA client-side routing, excluding /api routes
app.get(/^\/(?!api).*/, (req: Request, res: Response) => {
  const clientDistIndex = path.resolve(process.cwd(), 'client', 'dist', 'index.html');
  const distIndex = path.resolve(process.cwd(), 'dist', 'index.html');
  const publicIndex = path.resolve(process.cwd(), 'public', 'index.html');

  if (fs.existsSync(clientDistIndex)) {
    return res.sendFile(clientDistIndex);
  }
  if (fs.existsSync(distIndex)) {
    return res.sendFile(distIndex);
  }
  return res.sendFile(publicIndex);
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`⚡ QuestPay (Midnight Preview) DApp Backend Running!`);
  console.log(`🌐 Local Web Portal: http://localhost:${PORT}`);
  console.log(`🔒 Contract: ${CONTRACT_ADDRESS} (${MIDNIGHT_NETWORK})`);
  console.log(`=======================================================`);
});
