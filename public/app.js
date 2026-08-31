import { 
  discoverMidnightWallets, 
  discoverCardanoWallets,
  connectMidnightLace, 
  getMidnightAddress, 
  getMidnightUsdmBalance, 
  getMidnightDustBalance,
  computeClientSha256 
} from './cardanoMidnightWallets.js';

// Application State
let activeView = 'explore';
let currentCategory = 'all';
let connectedWallet = {
  connected: false,
  type: 'none',
  name: 'Not Connected',
  address: null,
  api: null,
  usdm: null,
  dust: null
};
let allQuests = [];
let selectedQuest = null;
let balancePollInterval = null;

// Initialize on Load
window.addEventListener('DOMContentLoaded', async () => {
  initEventListeners();
  await loadPlatformStats();
  await loadQuests();
  await restoreSession();
});

function initEventListeners() {
  window.openWalletModal = openWalletModal;
  window.closeWalletModal = closeWalletModal;
  window.handleConnectMidnightExtension = handleConnectMidnightExtension;
  window.connectCustomAddress = connectCustomAddress;
  window.disconnectWallet = disconnectWallet;
  window.copyConnectedAddress = copyConnectedAddress;

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
// Wallet Connection & Modal Management
// ---------------------------------------------------------------------------

function openWalletModal() {
  const modal = document.getElementById('wallet-modal-backdrop');
  if (!modal) return;
  modal.classList.add('active');

  const selView = document.getElementById('wallet-selection-view');
  const detView = document.getElementById('wallet-details-view');
  const title = document.getElementById('wallet-modal-title');

  if (connectedWallet.connected && connectedWallet.address) {
    if (title) title.innerText = 'Connected Wallet';
    if (selView) selView.style.display = 'none';
    if (detView) detView.style.display = 'block';

    const fullAddrEl = document.getElementById('connected-modal-full-addr');
    const usdmEl = document.getElementById('modal-usdm-val');
    const dustEl = document.getElementById('modal-dust-val');

    if (fullAddrEl) fullAddrEl.innerText = connectedWallet.address;
    if (usdmEl) usdmEl.innerText = `${connectedWallet.usdm !== null ? connectedWallet.usdm : '0.00'} USDM`;
    if (dustEl) dustEl.innerText = `${connectedWallet.dust !== null ? connectedWallet.dust : '0.00'} DUST`;
  } else {
    if (title) title.innerText = 'Connect Wallet';
    if (selView) selView.style.display = 'block';
    if (detView) detView.style.display = 'none';
    renderDiscoveredWallets();
  }
}

function closeWalletModal() {
  const modal = document.getElementById('wallet-modal-backdrop');
  if (modal) modal.classList.remove('active');
}

function renderDiscoveredWallets() {
  const container = document.getElementById('discovered-wallets-list');
  if (!container) return;

  const midnightWallets = discoverMidnightWallets();
  const cardanoWallets = discoverCardanoWallets();

  let html = '';

  // 1. Midnight Extensions (Lace with Midnight Preview)
  if (midnightWallets.length > 0) {
    html += midnightWallets.map(w => `
      <div class="wallet-select-item" onclick="handleConnectMidnightExtension('${w.id}')">
        <div class="wallet-item-left">
          <div class="wallet-icon-box">🌙</div>
          <div>
            <div class="wallet-name-label">${w.name}</div>
            <div class="wallet-type-sublabel">Midnight Preview DApp Connector v${w.apiVersion}</div>
          </div>
        </div>
        <button class="btn-connect-sm">Connect</button>
      </div>
    `).join('');
  } else {
    html += `
      <div style="padding: 0.85rem 1rem; background: rgba(255,255,255,0.02); border: 1px dashed var(--border-subtle); border-radius: 12px; font-size: 0.82rem; color: var(--text-dim); text-align: center;">
        No active Lace Midnight Preview extension detected. (You can also paste your address below).
      </div>
    `;
  }

  // 2. Cardano CIP-30 Wallets (Vespr, Eternl, Lace, Nami)
  if (cardanoWallets.length > 0) {
    html += `
      <div style="margin-top: 0.5rem; font-size: 0.72rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase;">
        Cardano CIP-30 Wallets (USDM Source):
      </div>
    `;
    html += cardanoWallets.map(w => `
      <div class="wallet-select-item" onclick="handleConnectCardanoWallet('${w.key}')">
        <div class="wallet-item-left">
          <div class="wallet-icon-box" style="color: #60a5fa;">₳</div>
          <div>
            <div class="wallet-name-label">${w.name}</div>
            <div class="wallet-type-sublabel">Cardano CIP-30 Provider v${w.apiVersion}</div>
          </div>
        </div>
        <button class="btn-connect-sm" style="background: var(--sapphire-gradient); color: #fff;">Connect</button>
      </div>
    `).join('');
  }

  container.innerHTML = html;
}

async function handleConnectMidnightExtension(id) {
  try {
    const api = await connectMidnightLace();
    if (!api) throw new Error('No Midnight API returned from Lace');

    const address = await getMidnightAddress(api);
    if (!address) throw new Error('Could not retrieve unshielded address from Lace');

    connectedWallet = {
      connected: true,
      type: 'midnight_extension',
      name: 'Lace (Midnight Preview)',
      address: address,
      api: api,
      usdm: '0.00',
      dust: '0.00'
    };

    // Query real balances
    await refreshWalletBalances();
    saveSession();
    updateUIHeaderWidgets();
    closeWalletModal();
    startBalancePolling();

    showToast(`🟢 Connected: ${truncateAddr(address)}`, 'success');
    await loadQuests();
  } catch (err) {
    console.error('[Wallet Connect Error]', err);
    showToast(`Connection failed: ${err.message}`, 'error');
  }
}

async function handleConnectCardanoWallet(key) {
  try {
    if (!window.cardano || !window.cardano[key]) throw new Error(`Cardano wallet ${key} not available`);
    const api = await window.cardano[key].enable();
    
    // Query address from CIP-30
    let address = '';
    if (typeof api.getChangeAddress === 'function') {
      const rawHex = await api.getChangeAddress();
      address = rawHex;
    }

    connectedWallet = {
      connected: true,
      type: 'cardano_cip30',
      name: key.charAt(0).toUpperCase() + key.slice(1),
      address: address || 'addr_connected_cardano',
      api: api,
      usdm: '0.00',
      dust: '0.00'
    };

    saveSession();
    updateUIHeaderWidgets();
    closeWalletModal();
    showToast(`🟢 Connected Cardano: ${connectedWallet.name}`, 'success');
  } catch (err) {
    showToast(`Cardano connection failed: ${err.message}`, 'error');
  }
}

async function connectCustomAddress() {
  const input = document.getElementById('input-custom-wallet-addr');
  const addr = input ? input.value.trim() : '';

  if (!addr || (!addr.startsWith('mn_addr_preview') && !addr.startsWith('mn_addr') && !addr.startsWith('addr'))) {
    showToast('Please enter a valid Midnight address (starts with mn_addr_preview...)', 'error');
    return;
  }

  connectedWallet = {
    connected: true,
    type: 'custom',
    name: 'Midnight Address',
    address: addr,
    api: null,
    usdm: '0.00',
    dust: '0.00'
  };

  saveSession();
  updateUIHeaderWidgets();
  closeWalletModal();
  showToast(`🟢 Address Saved: ${truncateAddr(addr)}`, 'success');
  await loadQuests();
}

function disconnectWallet() {
  connectedWallet = {
    connected: false,
    type: 'none',
    name: 'Not Connected',
    address: null,
    api: null,
    usdm: null,
    dust: null
  };
  stopBalancePolling();
  sessionStorage.removeItem('questpay_wallet');
  updateUIHeaderWidgets();
  closeWalletModal();
  showToast('Wallet disconnected', 'info');
  loadQuests();
}

function copyConnectedAddress() {
  if (connectedWallet.address) {
    navigator.clipboard.writeText(connectedWallet.address);
    showToast('Address copied to clipboard!', 'success');
  }
}

// ---------------------------------------------------------------------------
// Balance Fetching & Clean Header Synchronization
// ---------------------------------------------------------------------------

async function refreshWalletBalances() {
  if (!connectedWallet.connected || !connectedWallet.address) {
    connectedWallet.usdm = null;
    connectedWallet.dust = null;
    updateUIHeaderWidgets();
    return;
  }

  // If connected via direct Lace Midnight Extension
  if (connectedWallet.api && connectedWallet.type === 'midnight_extension') {
    try {
      const [usdm, dust] = await Promise.all([
        getMidnightUsdmBalance(connectedWallet.api),
        getMidnightDustBalance(connectedWallet.api)
      ]);
      connectedWallet.usdm = usdm;
      connectedWallet.dust = dust;
    } catch (err) {
      console.warn('[Balances] Direct API error:', err);
    }
  }

  updateUIHeaderWidgets();
}

function startBalancePolling() {
  stopBalancePolling();
  balancePollInterval = setInterval(async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (connectedWallet.connected && connectedWallet.api) {
      await refreshWalletBalances();
    }
  }, 15000);
}

function stopBalancePolling() {
  if (balancePollInterval) {
    clearInterval(balancePollInterval);
    balancePollInterval = null;
  }
}

// Cleanly Updates Separated USDM Balance Card & Wallet Card in Header
function updateUIHeaderWidgets() {
  const usdmEl = document.getElementById('header-usdm-val');
  const dustEl = document.getElementById('header-dust-val');
  const walletCard = document.getElementById('header-wallet-card');

  // 1. Update Separate Available Balance Card
  if (connectedWallet.connected && connectedWallet.address) {
    const usdmDisplay = connectedWallet.usdm !== null ? connectedWallet.usdm : '0.00';
    const dustDisplay = connectedWallet.dust !== null ? connectedWallet.dust : '0.00';

    if (usdmEl) usdmEl.innerText = `${usdmDisplay} USDM`;
    if (dustEl) dustEl.innerText = `${dustDisplay} DUST`;
  } else {
    if (usdmEl) usdmEl.innerText = '-- USDM';
    if (dustEl) dustEl.innerText = '-- DUST';
  }

  // 2. Update Separate Wallet Connect Card
  if (walletCard) {
    if (connectedWallet.connected && connectedWallet.address) {
      walletCard.innerHTML = `
        <div class="wallet-badge-connected" onclick="openWalletModal()" title="${connectedWallet.address}">
          <span style="font-size: 0.9rem;">🌙</span>
          <span style="font-weight: 700; font-size: 0.85rem; color: #fff;">${truncateAddr(connectedWallet.address)}</span>
        </div>
      `;
    } else {
      walletCard.innerHTML = `
        <button class="btn-wallet" id="btn-connect-wallet" onclick="openWalletModal()">
          <span>⚡ Connect Wallet</span>
        </button>
      `;
    }
  }
}

function truncateAddr(addr) {
  if (!addr) return '';
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function saveSession() {
  const state = {
    connected: connectedWallet.connected,
    type: connectedWallet.type,
    name: connectedWallet.name,
    address: connectedWallet.address,
    usdm: connectedWallet.usdm,
    dust: connectedWallet.dust
  };
  sessionStorage.setItem('questpay_wallet', JSON.stringify(state));
}

async function restoreSession() {
  const cached = sessionStorage.getItem('questpay_wallet');
  if (cached) {
    try {
      const state = JSON.parse(cached);
      if (state.connected && state.address) {
        connectedWallet = { ...connectedWallet, ...state };
        
        // Attempt silent re-connection with Lace if previously connected via extension
        if (state.type === 'midnight_extension' && window.midnight) {
          try {
            const api = await connectMidnightLace();
            connectedWallet.api = api;
            await refreshWalletBalances();
            startBalancePolling();
          } catch (e) {
            console.warn('[Session Restore] Lace silent connect note:', e.message);
          }
        }

        updateUIHeaderWidgets();
      }
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
        <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">No bounties found in this view.</p>
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
// Views & Navigation
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
                  <div style="font-weight: 700; font-family: monospace; font-size: 0.85rem; color: #fff;">${truncateAddr(u.address)}</div>
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
// Slide-Over Drawer (Right Panel for Quest Details & Solution Submission)
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

  if (!connectedWallet.connected || !connectedWallet.address) {
    showToast('Please connect your wallet first', 'error');
    openWalletModal();
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
      showToast(`🎉 Verified! ${selectedQuest.rewardUsdm} USDM released to your wallet!`, 'success');
      btn.innerHTML = `<span>✓ USDM Escrow Claimed!</span>`;

      await refreshWalletBalances();
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
  if (!connectedWallet.connected || !connectedWallet.address) {
    openWalletModal();
    return;
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
        employerWallet: connectedWallet.address || 'mn_addr_preview1employer'
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

