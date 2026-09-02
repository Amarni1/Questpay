/**
 * QuestPay - Generated TypeScript Bindings from questpay.compact
 * Language: Compact 0.17+ / Midnight Preview
 */
export const MIDNIGHT_NETWORK = 'preview';
export const CONTRACT_ADDRESS = '471dfe55c866fdbc085c9011a51f0cd0e9c9bfca6bb985c35f7716b6e73e485c';
export const USDM_TOKEN_COLOR = '003bacd9a361ba0d425e408776020e40271375e8b8de42d73eec046a44947d73';
export const USDM_DECIMALS = 6;
export var QuestStatus;
(function (QuestStatus) {
    QuestStatus[QuestStatus["Open"] = 0] = "Open";
    QuestStatus[QuestStatus["Accepted"] = 1] = "Accepted";
    QuestStatus[QuestStatus["ProofSubmitted"] = 2] = "ProofSubmitted";
    QuestStatus[QuestStatus["Verified"] = 3] = "Verified";
    QuestStatus[QuestStatus["Paid"] = 4] = "Paid";
    QuestStatus[QuestStatus["Cancelled"] = 5] = "Cancelled";
    QuestStatus[QuestStatus["Rejected"] = 6] = "Rejected";
})(QuestStatus || (QuestStatus = {}));
export var ProofType;
(function (ProofType) {
    ProofType[ProofType["AutomatedZkSecret"] = 0] = "AutomatedZkSecret";
    ProofType[ProofType["EmployerAttestation"] = 1] = "EmployerAttestation";
    ProofType[ProofType["EncryptedOffchainProof"] = 2] = "EncryptedOffchainProof";
})(ProofType || (ProofType = {}));
// ---------------------------------------------------------------------------
// Circuit Payload Constructors
// ---------------------------------------------------------------------------
export function buildCreateQuestCircuit(params) {
    return {
        circuit: 'create_quest',
        contractAddress: CONTRACT_ADDRESS,
        network: MIDNIGHT_NETWORK,
        params,
        timestamp: Date.now(),
        nonce: Math.random().toString(36).substring(2, 15)
    };
}
export function buildAcceptQuestCircuit(params) {
    return {
        circuit: 'accept_quest',
        contractAddress: CONTRACT_ADDRESS,
        network: MIDNIGHT_NETWORK,
        params,
        timestamp: Date.now(),
        nonce: Math.random().toString(36).substring(2, 15)
    };
}
export function buildSubmitZkProofCircuit(params) {
    return {
        circuit: 'submit_and_verify_zk_proof',
        contractAddress: CONTRACT_ADDRESS,
        network: MIDNIGHT_NETWORK,
        params,
        timestamp: Date.now(),
        nonce: Math.random().toString(36).substring(2, 15)
    };
}
export function buildSubmitProofCommitmentCircuit(params) {
    return {
        circuit: 'submit_proof_commitment',
        contractAddress: CONTRACT_ADDRESS,
        network: MIDNIGHT_NETWORK,
        params,
        timestamp: Date.now(),
        nonce: Math.random().toString(36).substring(2, 15)
    };
}
export function buildEmployerApproveCircuit(params) {
    return {
        circuit: 'employer_approve_and_release',
        contractAddress: CONTRACT_ADDRESS,
        network: MIDNIGHT_NETWORK,
        params,
        timestamp: Date.now(),
        nonce: Math.random().toString(36).substring(2, 15)
    };
}
export function buildEmployerRejectCircuit(params) {
    return {
        circuit: 'employer_reject_submission',
        contractAddress: CONTRACT_ADDRESS,
        network: MIDNIGHT_NETWORK,
        params,
        timestamp: Date.now(),
        nonce: Math.random().toString(36).substring(2, 15)
    };
}
export function buildCancelQuestCircuit(params) {
    return {
        circuit: 'cancel_quest',
        contractAddress: CONTRACT_ADDRESS,
        network: MIDNIGHT_NETWORK,
        params,
        timestamp: Date.now(),
        nonce: Math.random().toString(36).substring(2, 15)
    };
}
