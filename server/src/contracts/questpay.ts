/**
 * QuestPay - Generated TypeScript Bindings from questpay.compact
 * Language: Compact 0.17+ / Midnight Preview
 */

export const MIDNIGHT_NETWORK = 'preview';
export const CONTRACT_ADDRESS = '471dfe55c866fdbc085c9011a51f0cd0e9c9bfca6bb985c35f7716b6e73e485c';
export const USDM_TOKEN_COLOR = '003bacd9a361ba0d425e408776020e40271375e8b8de42d73eec046a44947d73';
export const USDM_DECIMALS = 6;

export enum QuestStatus {
  Open = 0,
  Accepted = 1,
  ProofSubmitted = 2,
  Verified = 3,
  Paid = 4,
  Cancelled = 5,
  Rejected = 6
}

export enum ProofType {
  AutomatedZkSecret = 0,
  EmployerAttestation = 1,
  EncryptedOffchainProof = 2
}

export interface QuestRecord {
  employer: string;
  quester: string;
  reward_usdm: bigint;
  proof_type: ProofType;
  proof_commitment: string;
  status: QuestStatus;
  deadline_timestamp: bigint;
  created_at: bigint;
}

export interface CompactCircuitCall<T = any> {
  circuit: string;
  contractAddress: string;
  network: string;
  params: T;
  timestamp: number;
  nonce: string;
}

export interface CreateQuestParams {
  quest_id: number | string;
  reward_usdm: number;
  proof_type: ProofType | string;
  proof_commitment?: string | null;
  deadline_days?: number;
  employer: string;
}

export interface AcceptQuestParams {
  quest_id: number | string;
  quester: string;
}

export interface SubmitZkProofParams {
  quest_id: number | string;
  private_secret_answer: string;
  quester: string;
}

export interface SubmitProofCommitmentParams {
  quest_id: number | string;
  proof_hash_commitment: string;
  quester: string;
}

export interface EmployerApproveParams {
  quest_id: number | string;
  quester: string;
  amount: number;
}

export interface EmployerRejectParams {
  quest_id: number | string;
  reason?: string;
}

export interface CancelQuestParams {
  quest_id: number | string;
  employer: string;
}

// ---------------------------------------------------------------------------
// Circuit Payload Constructors
// ---------------------------------------------------------------------------

export function buildCreateQuestCircuit(params: CreateQuestParams): CompactCircuitCall<CreateQuestParams> {
  return {
    circuit: 'create_quest',
    contractAddress: CONTRACT_ADDRESS,
    network: MIDNIGHT_NETWORK,
    params,
    timestamp: Date.now(),
    nonce: Math.random().toString(36).substring(2, 15)
  };
}

export function buildAcceptQuestCircuit(params: AcceptQuestParams): CompactCircuitCall<AcceptQuestParams> {
  return {
    circuit: 'accept_quest',
    contractAddress: CONTRACT_ADDRESS,
    network: MIDNIGHT_NETWORK,
    params,
    timestamp: Date.now(),
    nonce: Math.random().toString(36).substring(2, 15)
  };
}

export function buildSubmitZkProofCircuit(params: SubmitZkProofParams): CompactCircuitCall<SubmitZkProofParams> {
  return {
    circuit: 'submit_and_verify_zk_proof',
    contractAddress: CONTRACT_ADDRESS,
    network: MIDNIGHT_NETWORK,
    params,
    timestamp: Date.now(),
    nonce: Math.random().toString(36).substring(2, 15)
  };
}

export function buildSubmitProofCommitmentCircuit(params: SubmitProofCommitmentParams): CompactCircuitCall<SubmitProofCommitmentParams> {
  return {
    circuit: 'submit_proof_commitment',
    contractAddress: CONTRACT_ADDRESS,
    network: MIDNIGHT_NETWORK,
    params,
    timestamp: Date.now(),
    nonce: Math.random().toString(36).substring(2, 15)
  };
}

export function buildEmployerApproveCircuit(params: EmployerApproveParams): CompactCircuitCall<EmployerApproveParams> {
  return {
    circuit: 'employer_approve_and_release',
    contractAddress: CONTRACT_ADDRESS,
    network: MIDNIGHT_NETWORK,
    params,
    timestamp: Date.now(),
    nonce: Math.random().toString(36).substring(2, 15)
  };
}

export function buildEmployerRejectCircuit(params: EmployerRejectParams): CompactCircuitCall<EmployerRejectParams> {
  return {
    circuit: 'employer_reject_submission',
    contractAddress: CONTRACT_ADDRESS,
    network: MIDNIGHT_NETWORK,
    params,
    timestamp: Date.now(),
    nonce: Math.random().toString(36).substring(2, 15)
  };
}

export function buildCancelQuestCircuit(params: CancelQuestParams): CompactCircuitCall<CancelQuestParams> {
  return {
    circuit: 'cancel_quest',
    contractAddress: CONTRACT_ADDRESS,
    network: MIDNIGHT_NETWORK,
    params,
    timestamp: Date.now(),
    nonce: Math.random().toString(36).substring(2, 15)
  };
}
