import { Request, Response, NextFunction } from 'express';
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
export declare function requireSignedChallenge(req: AuthenticatedChallengeRequest, res: Response, next: NextFunction): void | Response<any, Record<string, any>>;
/**
 * Middleware ensuring the authenticated wallet is the exact creator of the target bounty
 */
export declare function requireBountyOwnership(req: AuthenticatedChallengeRequest, res: Response, next: NextFunction): Response<any, Record<string, any>>;
