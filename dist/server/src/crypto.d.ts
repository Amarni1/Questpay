export interface EncryptedPayload {
    ciphertext: string;
    iv: string;
    authTag: string;
}
/**
 * Encrypt arbitrary text or buffer using AES-256-GCM
 */
export declare function encryptData(data: string | Buffer): EncryptedPayload;
/**
 * Decrypt AES-256-GCM payload
 */
export declare function decryptData(encrypted: EncryptedPayload): Buffer;
/**
 * Compute SHA-256 cryptographic commitment hash
 */
export declare function computeCommitmentHash(data: string | Buffer): string;
/**
 * Generate a cryptographic challenge for a wallet
 */
export declare function generateChallenge(walletAddress: string): {
    challengeId: string;
    nonce: string;
    message: string;
    expiresAt: number;
};
/**
 * Verify signed challenge headers for Midnight DApp Connector v4:
 * Headers:
 * - x-questpay-wallet
 * - x-questpay-message
 * - x-questpay-signature
 * - x-questpay-verifying-key
 * - x-questpay-challenge-id (optional)
 */
export declare function verifySignedChallengeHeaders(headers: {
    wallet?: string;
    message?: string;
    signature?: string;
    verifyingKey?: string;
    challengeId?: string;
}): {
    valid: boolean;
    error?: string;
    wallet?: string;
};
/**
 * Verify on-chain transaction on Midnight Preview network indexer / RPC source
 */
export declare function verifyMidnightPreviewTx(txHash: string): Promise<{
    verified: boolean;
    error?: string;
}>;
