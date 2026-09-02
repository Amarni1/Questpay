import { Request, Response, NextFunction } from 'express';
import { verifySignedChallengeHeaders } from '../crypto.js';
import { db } from '../db.js';

export interface AuthenticatedChallengeRequest extends Request {
  authenticatedWallet?: string;
  targetBounty?: any;
}

/**
 * Middleware requiring signed challenge authentication headers:
 * - x-questpay-wallet
 * - x-questpay-message
 * - x-questpay-signature
 * - x-questpay-verifying-key
 * - x-questpay-challenge-id
 */
export function requireSignedChallenge(req: AuthenticatedChallengeRequest, res: Response, next: NextFunction) {
  // 1. Check for active session token
  const authHeader = req.headers.authorization;
  const tokenHeader = (req.headers['x-questpay-session-token'] as string) || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null);
  const cookieToken = req.cookies?.questpay_session;
  const sessionToken = tokenHeader || cookieToken;

  if (sessionToken) {
    const session = db.prepare('SELECT * FROM auth_sessions WHERE token = ?').get(sessionToken) as any;
    if (session && Date.now() <= session.expires_at) {
      req.authenticatedWallet = session.wallet_address.toLowerCase();
      return next();
    }
  }

  // 2. Check for explicit signed challenge headers
  const wallet = (req.headers['x-questpay-wallet'] as string) || (req.body?.wallet as string);
  const message = (req.headers['x-questpay-message'] as string) || (req.body?.message as string);
  const signature = (req.headers['x-questpay-signature'] as string) || (req.body?.signature as string);
  const verifyingKey = (req.headers['x-questpay-verifying-key'] as string) || (req.body?.verifyingKey as string);
  const challengeId = (req.headers['x-questpay-challenge-id'] as string) || (req.body?.challengeId as string);

  if (wallet && message && signature) {
    const verification = verifySignedChallengeHeaders({
      wallet,
      message,
      signature,
      verifyingKey,
      challengeId
    });

    if (verification.valid && verification.wallet) {
      req.authenticatedWallet = verification.wallet.toLowerCase();
      return next();
    }
  }

  // 3. Not authenticated
  return res.status(401).json({
    success: false,
    code: 'AUTH_REQUIRED',
    error: 'Application signature authorization required. Please sign the authentication challenge using your Midnight wallet.'
  });
}

/**
 * Middleware ensuring the authenticated wallet is the exact creator of the target bounty
 */
export function requireBountyOwnership(req: AuthenticatedChallengeRequest, res: Response, next: NextFunction) {
  const bountyId = req.params.bountyId || req.params.id;

  if (!bountyId) {
    return res.status(400).json({ success: false, error: 'Bounty ID is required' });
  }

  if (!req.authenticatedWallet) {
    return res.status(401).json({ success: false, error: 'Wallet authentication required' });
  }

  const bounty = db.prepare('SELECT * FROM bounties WHERE id = ? OR contract_quest_id = ?').get(bountyId, bountyId) as any;

  if (!bounty) {
    return res.status(404).json({ success: false, error: 'Bounty not found' });
  }

  if (bounty.employer_wallet.toLowerCase() !== req.authenticatedWallet.toLowerCase()) {
    return res.status(403).json({
      success: false,
      error: 'Only the wallet that created this bounty can view private submissions.'
    });
  }

  req.targetBounty = bounty;
  next();
}
