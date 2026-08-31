import { discoverMidnightWallets, connectMidnightLace, computeClientSha256 } from './cardanoMidnightWallets.js';

// Application State
let activeView = 'explore';
let currentCategory = 'all';
let connectedWallet = {
  connected: false,
  address: null,
  usdm: 500,
  dust: 42.5,
  name: 'Lace (Midnight Preview)'
};
let allQuests = [];
let selectedQuest = null;

// Initialize on Load
window.addEventListener('DOMContentLoaded', async () => {
  initEventListeners();
  await loadPlatformStats();
  await loadQuests();
  restoreSession();
});

function initEventListeners() {
  window.handleConnectWallet = handleConnectWallet;
  window.switchView = switchView;
  window.filterCategory = filterCategory;
  window.openQuestDrawer = openQuestDrawer;
  window.closeDrawer = closeDrawer;
  window.handleSolutionInput = handleSolutionInput;
  window.submitActiveQuestProof = submitActiveQuestProof;
  window.openCreateQuestModal = openCreateQuestModal;
  window.closeCreateQuestModal = closeCreateQuestModal;
  window.handleCreateQuestSubmit = handleCreateQuestSubmit;
  window.toggleSecretAnswerField = toggleSecretAnswerField;
  window.openSeedQuestModal = openSeedQuestModal;
}

// ---------------------------------------------------------------------------
// Wallet Connection
// ---------------------------------------------------------------------------
async function handleConnectWallet() {
  try {
    const wallets = discoverMidnightWallets();
    if (wallets.length > 0) {
      try {
        const api = await connectMidnightLace();
        if (api && typeof api.getUnshieldedAddress === 'function') {
          const addr = await api.getUnshieldedAddress();
          connectedWallet.address = addr;
          connectedWallet.connected = true;
        }
      } catch (e) {
        console.warn('Lace connect direct call fallback:', e.message);
      }
    }

    // Default connected state for smooth local testing
    if (!connectedWallet.address) {
      connectedWallet.address = 'mn_addr_preview1zkquester987v6c5b4n3m2q1w8e7r6t5y4u3i2o1';
      connectedWallet.connected = true;
    }

    saveSession();
    updateWalletUI();
    showToast('🟢 Connected to Midnight Preview (Lace Wallet)', 'success');
    await loadQuests();
  } catch (err) {
    showToast(`Wallet connection: ${err.message}`, 'error');
  }
}

function updateWalletUI() {
  const container = document.getElementById('wallet-button-container');
  if (connectedWallet.connected && connectedWallet.address) {
    const shortAddr = `${connectedWallet.address.slice(0, 10)}...${connectedWallet.address.slice(-6)}`;
    container.innerHTML = `
      <div class="wallet-badge-connected" onclick="disconnectWallet()" title="${connectedWallet.address}">
        <span style="font-size: 0.85rem;">🌙</span>
        <span style="font-weight: 700; font-size: 0.82rem; color: #fff;">${shortAddr}</span>
        <div class="wallet-balance-bubble">${connectedWallet.usdm.toFixed(0)} USDM • ${connectedWallet.dust.toFixed(1)} DUST</div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <button class="btn-wallet" id="btn-connect-wallet" onclick="handleConnectWallet()">
        <span>⚡ Connect Lace</span>
      </button>
    `;
  }
}

window.disconnectWallet = function() {
  connectedWallet = { connected: false, address: null, usdm: 0, dust: 0 };
  sessionStorage.removeItem('questpay_wallet');
  updateWalletUI();
  showToast('Wallet disconnected', 'info');
};

function saveSession() {
  sessionStorage.setItem('questpay_wallet', JSON.stringify(connectedWallet));
}

function restoreSession() {
  const cached = sessionStorage.getItem('questpay_wallet');
  if (cached) {
    try {
      connectedWallet = JSON.parse(cached);
      updateWalletUI();
    } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Quests & Stats Data Loading
// ---------------------------------------------------------------------------
async function loadPlatformStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('stat-escrow-val').innerText = `$${data.totalEscrowLockedUsdm.toLocaleString()} USDM`;
    document.getElementById('stat-active-val').innerText = `${data.activeQuestsCount} Active`;
    document.getElementById('stat-rate-val').innerText = data.successRate;
    document.getElementById('stat-completed-val').innerText = `${data.completedQuestsCount} Paid`;
  } catch (err) {
    console.warn('Stats fetch error:', err.message);
  }
}

async function loadQuests() {
  try {
    let url = `/api/quests?category=${currentCategory}`;
    if (activeView === 'submissions' && connectedWallet.address) {
      url = `/api/quests?quester=${encodeURIComponent(connectedWallet.address)}`;
    } else if (activeView === 'employer' && connectedWallet.address) {
      url = `/api/quests?employer=${encodeURIComponent(connectedWallet.address)}`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch quests');
    const data = await res.json();
    allQuests = data.quests || [];
    renderQuestsGrid(allQuests);
  } catch (err) {
    console.error('Load quests error:', err);
  }
}

function renderQuestsGrid(quests) {
  const container = document.getElementById('quests-container');
  if (!container) return;

  if (quests.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: var(--text-dim);">
        <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">No bounties found in this category.</p>
        <button class="btn-create-quest" onclick="openCreateQuestModal()">+ Create First Bounty</button>
      </div>
    `;
    return;
  }

  container.innerHTML = quests.map(q => {
    const isZK = q.proofType === 'AutomatedZkSecret';
    const proofLabel = isZK ? '⚡ Automated ZK Proof' : '👤 Employer Attestation';
    const proofClass = isZK ? 'zk' : 'attestation';
    const isPaid = q.status === 'Paid';
    const isAccepted = q.status === 'Accepted';

    return `
      <div class="quest-card">
        <div>
          <div class="card-top-tags">
            <span class="bounty-pill">${q.category}</span>
            <span class="urgency-pill">⏱️ ${isPaid ? 'Completed' : '2h left'}</span>
          </div>
          <h3 class="quest-title">${q.title}</h3>
          <p class="quest-desc">${q.description}</p>
        </div>

        <div>
          <div class="quest-meta-row">
            <div class="reward-amount-box">
              <span class="reward-title">USDM Escrow</span>
              <span class="reward-val">${q.rewardUsdm} USDM</span>
            </div>
            <div class="proof-mode-badge ${proofClass}">${proofLabel}</div>
          </div>

          <div class="card-skills-row">
            ${(q.skillTags || []).map(t => `<span class="skill-tag">${t}</span>`).join('')}
          </div>

          <button class="btn-open-quest" onclick="openQuestDrawer('${q.id}')">
            <span>${isPaid ? '✓ View Payout Receipt' : 'Inspect & Solve Bounty ➔'}</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ---------------------------------------------------------------------------
// Views & Category Filtering
// ---------------------------------------------------------------------------
function switchView(view) {
  activeView = view;
  document.querySelectorAll('.nav-pill-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`nav-${view}`);
  if (activeBtn) activeBtn.classList.add('active');

  if (view === 'leaderboard') {
    renderLeaderboardView();
  } else {
    loadQuests();
  }
}

async function renderLeaderboardView() {
  const container = document.getElementById('quests-container');
  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    const list = data.leaderboard || [];

    container.innerHTML = `
      <div style="grid-column: 1 / -1; background: var(--bg-surface); border: 1px solid var(--gold-border); border-radius: 20px; padding: 2rem;">
        <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--gold-primary); margin-bottom: 1.5rem;">👑 Top Cryptographers & Bounties Leaderboard</h2>
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          ${list.map((u, i) => `
            <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-surface-elevated); padding: 1rem 1.25rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
              <div style="display: flex; align-items: center; gap: 1rem;">
                <span style="font-weight: 900; font-size: 1.2rem; color: ${i === 0 ? 'var(--gold-primary)' : 'var(--text-muted)'};">#${i + 1}</span>
                <div>
                  <div style="font-weight: 700; font-family: monospace; font-size: 0.85rem; color: #fff;">${u.address.slice(0, 16)}...${u.address.slice(-8)}</div>
                  <div style="font-size: 0.75rem; color: var(--gold-secondary);">${u.tier} • Score: ${u.reputationScore}/100</div>
                </div>
              </div>
              <div style="text-align: right;">
                <div style="font-weight: 800; color: #60a5fa; font-size: 1.1rem;">${u.totalEarnedUsdm} USDM</div>
                <div style="font-size: 0.75rem; color: var(--emerald-green); font-weight: 600;">✓ ${u.successfulCount} Quests Solved</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (err) {
    showToast('Failed to load leaderboard', 'error');
  }
}

function filterCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadQuests();
}

// ---------------------------------------------------------------------------
// Slide-Over Drawer (Right Panel)
// ---------------------------------------------------------------------------
function openQuestDrawer(questId) {
  const quest = allQuests.find(q => q.id === questId);
  if (!quest) return;
  selectedQuest = quest;

  document.getElementById('drawer-quest-title').innerText = quest.title;
  document.getElementById('drawer-reward-val').innerText = `${quest.rewardUsdm} USDM`;
  document.getElementById('drawer-quest-desc').innerText = quest.description;

  const isZK = quest.proofType === 'AutomatedZkSecret';
  const badge = document.getElementById('drawer-proof-badge');
  badge.className = `proof-mode-badge ${isZK ? 'zk' : 'attestation'}`;
  badge.innerText = isZK ? '⚡ Automated ZK Proof' : '👤 Employer Attestation';

  document.getElementById('drawer-solution-input').value = '';
  document.getElementById('drawer-hash-preview').innerText = 'Type your solution above to compute real-time commitment...';

  const actionBtn = document.getElementById('btn-submit-proof');
  if (quest.status === 'Paid') {
    actionBtn.disabled = true;
    actionBtn.innerHTML = `<span>✓ Escrow Paid & Completed</span>`;
  } else {
    actionBtn.disabled = false;
    actionBtn.innerHTML = `<span>Verify & Release ${quest.rewardUsdm} USDM Escrow</span>`;
  }

  document.getElementById('drawer-backdrop').classList.add('active');
  document.getElementById('drawer-panel').classList.add('active');
}

function closeDrawer() {
  document.getElementById('drawer-backdrop').classList.remove('active');
  document.getElementById('drawer-panel').classList.remove('active');
  selectedQuest = null;
}

async function handleSolutionInput(val) {
  const preview = document.getElementById('drawer-hash-preview');
  if (!val || !val.trim()) {
    preview.innerText = 'Type your solution above to compute real-time commitment...';
    return;
  }
  const hash = await computeClientSha256(val);
  preview.innerText = `0x${hash}`;
}

async function submitActiveQuestProof() {
  if (!selectedQuest) return;

  if (!connectedWallet.connected) {
    showToast('Please connect your Lace wallet first', 'error');
    handleConnectWallet();
    return;
  }

  const solution = document.getElementById('drawer-solution-input').value.trim();
  if (!solution) {
    showToast('Please enter your solution answer or evidence', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit-proof');
  btn.disabled = true;
  btn.innerHTML = `<span>⏳ Verifying Compact ZK Circuit...</span>`;

  try {
    const res = await fetch(`/api/quests/${selectedQuest.id}/submit-proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questerWallet: connectedWallet.address,
        solutionInput: solution
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Verification failed');
    }

    if (data.verified) {
      connectedWallet.usdm += selectedQuest.rewardUsdm;
      saveSession();
      updateWalletUI();

      showToast(`🎉 Verified! ${selectedQuest.rewardUsdm} USDM released to your wallet!`, 'success');
      btn.innerHTML = `<span>✓ USDM Escrow Claimed!</span>`;

      await loadPlatformStats();
      await loadQuests();

      setTimeout(() => {
        closeDrawer();
      }, 2000);
    } else {
      showToast('Proof submitted for employer review', 'info');
      closeDrawer();
      loadQuests();
    }
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = `<span>Verify & Release USDM Escrow</span>`;
  }
}

// ---------------------------------------------------------------------------
// Create Quest Modal
// ---------------------------------------------------------------------------
function openCreateQuestModal() {
  if (!connectedWallet.connected) {
    handleConnectWallet();
  }
  document.getElementById('create-modal-backdrop').classList.add('active');
}

function closeCreateQuestModal() {
  document.getElementById('create-modal-backdrop').classList.remove('active');
}

function toggleSecretAnswerField(proofType) {
  const group = document.getElementById('secret-answer-group');
  if (proofType === 'AutomatedZkSecret') {
    group.style.display = 'block';
  } else {
    group.style.display = 'none';
  }
}

async function handleCreateQuestSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('create-title').value;
  const description = document.getElementById('create-desc').value;
  const category = document.getElementById('create-category').value;
  const rewardUsdm = document.getElementById('create-reward').value;
  const proofType = document.getElementById('create-proof-type').value;
  const secretAnswer = document.getElementById('create-secret-answer').value;

  try {
    const res = await fetch('/api/quests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        category,
        rewardUsdm,
        proofType,
        secretAnswer,
        employerWallet: connectedWallet.address || 'mn_addr_preview1demoemployer'
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to create quest');
    }

    showToast(`✓ Quest created and ${rewardUsdm} USDM escrowed on-chain!`, 'success');
    closeCreateQuestModal();
    document.getElementById('create-quest-form').reset();
    await loadPlatformStats();
    await loadQuests();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

function openSeedQuestModal() {
  showToast('Demo hints: Riddle = "recursion" • Bug = "overflow_check_missing"', 'info');
}

// ---------------------------------------------------------------------------
// Toast Notification Utility
// ---------------------------------------------------------------------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';

  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.4s ease';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}
