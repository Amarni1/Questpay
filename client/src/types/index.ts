export type UserRole = 'quester' | 'employer';

export type BountyStatus =
  | 'DRAFT'
  | 'FUNDING'
  | 'FUNDED'
  | 'OPEN'
  | 'ACCEPTED'
  | 'PROOF_SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'PAYING'
  | 'PAID'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDED'
  // Legacy case compatibility
  | 'Open'
  | 'Accepted'
  | 'ProofSubmitted'
  | 'Paid'
  | 'Cancelled'
  | 'Rejected'
  | 'Expired';

export type ProofType = 'screenshot' | 'link' | 'text' | 'file' | 'both' | 'AutomatedZkSecret' | 'zk_secret';

export type TxConfirmationStatus = 'PENDING' | 'CONFIRMED' | 'FINALIZED' | 'DISCARDED';

export interface Bounty {
  id: string;
  contractQuestId?: string;
  employerWallet: string;
  title: string;
  description: string;
  category: string;
  rewardRaw: string; // Exact integer token amount, e.g. "5000000"
  rewardUsdm: number; // Display data, e.g. 5
  usdmTokenType: string;
  proofType: ProofType;
  durationDays: number;
  deadline: string;
  expiresAt: string;

  fundingTxHash?: string | null;
  fundingTxStatus?: TxConfirmationStatus | string;

  payoutTxHash?: string | null;
  payoutTxStatus?: TxConfirmationStatus | string;

  status: BountyStatus;

  createdOnchain: boolean | number;
  fundedOnchain: boolean | number;
  paidOnchain: boolean | number;

  chainTxHash?: string;
  submissionRequirements?: string;
  secretCommitment?: string | null;
  releaseMode?: string;
  approvalTxHash?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  submissionCount?: number;
  pendingReviewCount?: number;
}

export interface Submission {
  id: string;
  index?: number;
  bountyId: string;
  bountyTitle?: string;
  bountyReward?: number;
  bountyStatus?: string;
  employerWallet?: string;
  questerWallet: string;
  proofType: ProofType;
  proofHash: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  hasFile?: boolean;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  externalUrl?: string;
  notes?: string;
  links?: string[];
  createdAt: string;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
}

export interface DecryptedProofPayload {
  text?: string;
  links?: string[];
  notes?: string;
  externalUrl?: string;
  file?: {
    name: string;
    mimeType: string;
    size: number;
    dataBase64: string; // base64 data for image/pdf/screenshot preview
  } | null;
}

export interface WalletTransactionEntry {
  hash: string;
  status?: 'pending' | 'confirmed' | 'finalized' | 'discarded' | string;
  executionStatus?: string;
  timestamp?: number | string;
  type?: string;
}

export interface DiscoveredMidnightWallet {
  id: string;
  rdns?: string;
  name: string;
  icon: string;
  apiVersion?: string;
  provider: any;
}

export type WalletBalanceState = {
  raw: bigint | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  updatedAt: number | null;
};

export type Page = 'dashboard' | 'explore' | 'my-bounties' | 'submissions' | 'history' | 'reputation' | 'create';
export const PAGE_VALUES: Page[] = ['dashboard', 'explore', 'my-bounties', 'submissions', 'history', 'reputation', 'create'];

export type WalletStatus = 'disconnected' | 'connecting' | 'reconnecting' | 'connected' | 'error';
export type AuthStatus = 'unknown' | 'notAuthenticated' | 'authenticated' | 'signing' | 'error';

export interface WalletState {
  status: WalletStatus;
  connected: boolean;
  type: 'midnight' | 'none';
  providerId: string | null;
  name: string;
  icon?: string;
  rdns?: string;
  apiVersion?: string;
  address: string | null;
  api: any | null;
  networkId?: string;
  error?: string | null;
}

export interface AuthState {
  status: AuthStatus;
  token: string | null;
  wallet: string | null;
  expiresAt: number | null;
  error: string | null;
}

export interface PlatformStats {
  totalEscrowLockedUsdm: number;
  activeQuestsCount: number;
  completedQuestsCount: number;
  totalPaidUsdm: number;
  totalQuestsCount: number;
  successRate: string;
}

export interface ReputationRecord {
  walletAddress: string;
  completedCount: number;
  successfulCount: number;
  totalEarnedUsdm: number;
  reputationScore: number;
  tier: string;
}
