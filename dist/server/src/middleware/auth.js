import { verifySignedChallengeHeaders } from '../crypto.js';
import { db } from '../db.js';
/**
 * Middleware requiring signed challenge authentication headers:
 * - x-questpay-wallet
 * - x-questpay-message
 * - x-questpay-signature
 * - x-questpay-verifying-key
 * - x-questpay-challenge-id
 */
export function requireSignedChallenge(req, res, next) {
    // 1. Check for active session token
    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers['x-questpay-session-token'] || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null);
    const cookieToken = req.cookies?.questpay_session;
    const sessionToken = tokenHeader || cookieToken;
    if (sessionToken) {
        const session = db.prepare('SELECT * FROM auth_sessions WHERE token = ?').get(sessionToken);
        if (session && Date.now() <= session.expires_at) {
            req.authenticatedWallet = session.wallet_address.toLowerCase();
            return next();
        }
    }
    // 2. Check for explicit signed challenge headers
    const wallet = req.headers['x-questpay-wallet'] || req.body?.wallet;
    const message = req.headers['x-questpay-message'] || req.body?.message;
    const signature = req.headers['x-questpay-signature'] || req.body?.signature;
    const verifyingKey = req.headers['x-questpay-verifying-key'] || req.body?.verifyingKey;
    const challengeId = req.headers['x-questpay-challenge-id'] || req.body?.challengeId;
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
export function requireBountyOwnership(req, res, next) {
    const bountyId = req.params.bountyId || req.params.id;
    if (!bountyId) {
        return res.status(400).json({ success: false, error: 'Bounty ID is required' });
    }
    if (!req.authenticatedWallet) {
        return res.status(401).json({ success: false, error: 'Wallet authentication required' });
    }
    const bounty = db.prepare('SELECT * FROM bounties WHERE id = ? OR contract_quest_id = ?').get(bountyId, bountyId);
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
