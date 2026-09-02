# QuestPay — Privacy-Preserving Web3 Quest & USDM Escrow Marketplace

A decentralized, privacy-preserving bounty and quest marketplace built on **Midnight Network (Preview Testnet)**, powered by **Compact** smart contracts and **USDM** token escrow settlement.

---

### 🏷️ GitHub Topics
`midnightntwrk` • `compact` • `zero-knowledge` • `usdm` • `escrow` • `bounty` • `privacy` • `web3`

---

## 🌟 Core Concept & Zero-Knowledge Architecture

QuestPay solves a major challenge in Web3 bounty platforms: **Proof Leakage and Front-Running**.
In traditional bounty contracts, solutions submitted on-chain are visible in plaintext, allowing others to copy answers and front-run payouts.

### 🛡️ Privacy Boundary:
* **Public State**:
  * Quest ID, category, USDM reward escrow, deadline, and escrow settlement status.
  * Public SHA-256 / Poseidon cryptographic commitment of the correct solution.
* **Private State (ZK)**:
  * Quester solution / private answer witness.
  * Quester personal identity and activity logs.
  * Confidential reputation metrics.

---

## 📜 Compact Smart Contract (`contracts/quest_escrow.compact`)

```compact
pragma language_version >= 0.17.0;
import CompactStandardLibrary;

export circuit submit_and_verify_zk_proof(
    quest_id: Uint<64>,
    private_secret_answer: Opaque<"string">
): [] {
    const q = quests.lookup(quest_id);
    const computed_hash = persistent_hash<Opaque<"string">>(private_secret_answer);
    
    // Assert zero-knowledge equality against on-chain public commitment
    assert(computed_hash == q.secret_commitment, "Zero-knowledge verification failed");
    
    // Escrow payout released directly to quester
    quests.insert(quest_id, ...);
}
```

---

## 🎨 Visual Design System

Built with an **Ultra-Rich Luxury Fintech & Web3 Palette**:
* **Obsidian Velvet Black** (`#060709`): Deep matte canvas with subtle ambient glows.
* **Liquid Champagne Gold** (`#f3ba2f` → `#e5a93c`): Brand emblems, metallic reward tags, and luminous primary action buttons.
* **Electric Sapphire Blue** (`#3875f6`): USDM bounty values and Midnight network indicators.
* **Royal Ruby Crimson** (`#f43f5e`): Urgency countdowns and critical vulnerability tags.
* **Interactive Slide-Over Drawer**: Right panel for inspecting bounties, live client-side SHA-256 hashing, and 1-click escrow payout settlement.

---

## 🚀 Getting Started Locally

### 1. Prerequisites
* **Node.js**: v18+ (Node 20+ recommended)
* **Lace Wallet**: With Midnight Preview enabled

### 2. Installation
```bash
git clone <repository-url>
cd questpay
npm install
```

### 3. Start Local Server
```bash
npm start
```
Open **[http://localhost:4000](http://localhost:4000)** in your browser.

---

## 💡 Demo Walkthrough / Hints

* **Riddle Quest ("The Self-Referential Circuit")**:
  * Answer: `recursion` (Instantly verified against on-chain hash → releases 75 USDM).
* **Vulnerability Quest ("Compact Integer Edge-Case")**:
  * Answer: `overflow_check_missing` (Instantly verified → releases 250 USDM).

---

## 🔒 Security & Authorization Architecture

### Midnight Preview MVP:
For the Preview testnet MVP, submission inspection and bounty management rely directly on the employer's **connected Midnight wallet address**. When an employer views private submissions or inspects off-chain proofs, the frontend supplies the connected wallet address, and the backend verifies ownership against the bounty record (`request wallet === bounty.employerWallet`). Decrypted proof payloads exist strictly in temporary browser memory and are revoked when closed.

### Production Roadmap:
For production mainnet environments, full cryptographic challenge-signature verification (`api.signData()`) should be enforced to prove private key ownership on every protected backend action. For the Midnight Preview MVP, signature gating has been streamlined to keep the user experience smooth and free of extra sign-in prompts.

---

## ⚖️ License
MIT License. Open source for the Midnight and Cardano developer community.
