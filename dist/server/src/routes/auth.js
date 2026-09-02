import { Router } from 'express';
import crypto from 'crypto';
import { generateChallenge, verifySignedChallengeHeaders } from '../crypto.js';
import { db } from '../db.js';
export const authRouter = Router();
// POST /api/auth/challenge — Request a cryptographic challenge for a wallet
authRouter.post('/challenge', (req, res) => {
    const wallet = (req.body?.wallet || '').trim();
    if (!wallet) {
        return res.status(400).json({ success: false, error: 'wallet address is required in body.' });
    }
    const challenge = generateChallenge(wallet);
    res.json({
        success: true,
        challengeId: challenge.challengeId,
        wallet,
        nonce: challenge.nonce,
        message: challenge.message,
        expiresAt: challenge.expiresAt
    });
});
// GET /api/auth/challenge — Fallback query format
authRouter.get('/challenge', (req, res) => {
    const wallet = (req.query.wallet || '').trim();
    if (!wallet) {
        return res.status(400).json({ success: false, error: 'wallet address is required in query parameter.' });
    }
    const challenge = generateChallenge(wallet);
    res.json({
        success: true,
        challengeId: challenge.challengeId,
        wallet,
        nonce: challenge.nonce,
        message: challenge.message,
        expiresAt: challenge.expiresAt
    });
});
// POST /api/auth/verify — Verify challenge signature and establish authenticated session
authRouter.post('/verify', (req, res) => {
    const { wallet, message, signature, verifyingKey, challengeId } = req.body;
    const verification = verifySignedChallengeHeaders({
        wallet,
        message,
        signature,
        verifyingKey,
        challengeId
    });
    if (!verification.valid || !verification.wallet) {
        return res.status(401).json({
            success: false,
            error: verification.error || 'Challenge signature verification failed'
        });
    }
    // Create session (valid for 24 hours)
    const sessionToken = `sess-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000;
    db.prepare(`
    INSERT INTO auth_sessions (token, wallet_address, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(sessionToken, verification.wallet.toLowerCase(), now, expiresAt);
    // Set HTTP-only cookie
    res.cookie('questpay_session', sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    });
    res.json({
        success: true,
        token: sessionToken,
        wallet: verification.wallet,
        expiresAt
    });
});
// GET /api/auth/session — Check if active session exists
authRouter.get('/session', (req, res) => {
    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers['x-questpay-session-token'] || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null);
    const cookieToken = req.cookies?.questpay_session;
    const token = tokenHeader || cookieToken;
    if (!token) {
        return res.json({ authenticated: false });
    }
    const session = db.prepare('SELECT * FROM auth_sessions WHERE token = ?').get(token);
    if (!session || Date.now() > session.expires_at) {
        if (session) {
            db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
        }
        return res.json({ authenticated: false });
    }
    res.json({
        authenticated: true,
        wallet: session.wallet_address,
        expiresAt: session.expires_at
    });
});
// POST /api/auth/logout — Invalidate active session
authRouter.post('/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers['x-questpay-session-token'] || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null);
    const cookieToken = req.cookies?.questpay_session;
    const token = tokenHeader || cookieToken;
    if (token) {
        db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
    }
    res.clearCookie('questpay_session');
    res.json({ success: true, message: 'Logged out' });
});
