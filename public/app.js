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
let activeView = 'dashboard';
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
let platformStats = {
  totalEscrowLockedUsdm: 0,
  activeQuestsCount: 0,
  completedQuestsCount: 0,
  successRate: '100% Verified'
};
let selectedQuest = null;
let uploadedScreenshots = [];
let allTransactions = [];
let currentTxFilter = 'all';
let questToDeleteId = null;
let balancePollInterval = null;

// Initialize on Load
window.addEventListener('DOMContentLoaded', async () => {
  initEventListeners();
  await loadPlatformStats();
  await loadQuests();
  await restoreSession();
  switchView('dashboard');
});

function initEventListeners() {
  // Sidebar Drawer Navigation
  window.toggleSidebar = toggleSidebar;
  window.openSidebar = openSidebar;
  window.closeSidebar = closeSidebar;

  // Wallet Connection & Modals
  window.openWalletModal = openWalletModal;
  window.closeWalletModal = closeWalletModal;
  window.handleConnectMidnightExtension = handleConnectMidnightExtension;
  window.handleConnectCardanoWallet = handleConnectCardanoWallet;
  window.connectCustomAddress = connectCustomAddress;
  window.disconnectWallet = disconnectWallet;
  window.copyConnectedAddress = copyConnectedAddress;

  // Navigation & Filtering
  window.switchView = switchView;
  window.filterCategory = filterCategory;
  window.filterTransactions = filterTransactions;
  window.copyTxHash = copyTxHash;

  // Quest Drawer & Proof Submissions
  window.openQuestDrawer = openQuestDrawer;
  window.closeDrawer = closeDrawer;
  window.handleSolutionInput = handleSolutionInput;
  window.submitActiveQuestProof = submitActiveQuestProof;
  window.handleScreenshotUpload = handleScreenshotUpload;
  window.removeScreenshot = removeScreenshot;

  // Quest Creation & Balance Validation
  window.openCreateQuestModal = openCreateQuestModal;
  window.closeCreateQuestModal = closeCreateQuestModal;
  window.handleCreateQuestSubmit = handleCreateQuestSubmit;
  window.toggleSecretAnswerField = toggleSecretAnswerField;
  window.handleQuestTypeChange = handleQuestTypeChange;
  window.checkCreateQuestBalance = checkCreateQuestBalance;

  // Quest Cancellation & Deletion
  window.confirmDeleteQuest = confirmDeleteQuest;
  window.closeConfirmDialog = closeConfirmDialog;
  window.executeConfirmDelete = executeConfirmDelete;
}

// ---------------------------------------------------------------------------
// Side Panel Drawer Navigation
// ---------------------------------------------------------------------------

function toggleSidebar() {
  const panel = document.getElementById('sidebar-panel');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!panel) return;
  const isActive = panel.classList.contains('active');
  if (isActive) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

function openSidebar() {
  const panel = document.getElementById('sidebar-panel');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (panel) panel.classList.add('active');
  if (backdrop) backdrop.classList.add('active');
}

function closeSidebar() {
  const panel = document.getElementById('sidebar-panel');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (panel) panel.classList.remove('active');
  if (backdrop) backdrop.classList.remove('active');
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

    if (fullAddrEl) fullAddrEl.innerText = connectedWallet.address;
    if (usdmEl) usdmEl.innerText = `${connectedWallet.usdm !== null ? connectedWallet.usdm : '0.00'} USDM`;
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
        No active Lace Midnight Preview extension detected. (You can paste a custom Midnight address below).
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

    await refreshWalletBalances();
    saveSession();
    updateUIHeaderWidgets();
    closeWalletModal();
    startBalancePolling();

    showToast(`🟢 Connected: ${truncateAddr(address)}`, 'success');
    switchView(activeView);
  } catch (err) {
    console.error('[Wallet Connect Error]', err);
    showToast(`Connection failed: ${err.message}`, 'error');
  }
}

async function handleConnectCardanoWallet(key) {
  try {
    if (!window.cardano || !window.cardano[key]) throw new Error(`Cardano wallet ${key} not available`);
    const api = await window.cardano[key].enable();
    
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
    switchView(activeView);
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
    usdm: '1000.00',
    dust: '0.00'
  };

  saveSession();
  updateUIHeaderWidgets();
  closeWalletModal();
  showToast(`🟢 Address Saved: ${truncateAddr(addr)}`, 'success');
  switchView(activeView);
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
  switchView(activeView);
}

function copyConnectedAddress() {
  if (connectedWallet.address) {
    navigator.clipboard.writeText(connectedWallet.address);
    showToast('Address copied to clipboard!', 'success');
  }
}

// ---------------------------------------------------------------------------
// Balance Fetching & Clean Header Synchronization (Stacked Under Address)
// ---------------------------------------------------------------------------

async function refreshWalletBalances() {
  if (!connectedWallet.connected || !connectedWallet.address) {
    connectedWallet.usdm = null;
    updateUIHeaderWidgets();
    return;
  }

  if (connectedWallet.api && connectedWallet.type === 'midnight_extension') {
    try {
      const usdm = await getMidnightUsdmBalance(connectedWallet.api);
      connectedWallet.usdm = usdm;
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

function updateUIHeaderWidgets() {
  const walletCard = document.getElementById('header-wallet-card');
  const sideAddr = document.getElementById('sidebar-wallet-addr');
  const sideUsdm = document.getElementById('sidebar-wallet-usdm');

  const isConn = connectedWallet.connected && connectedWallet.address;
  const usdmDisplay = isConn && connectedWallet.usdm !== null ? connectedWallet.usdm : '0.00';

  // 1. Update Header Wallet Card (Address with Available USDM balance stacked underneath)
  if (walletCard) {
    if (isConn) {
      walletCard.innerHTML = `
        <div class="wallet-badge-connected" onclick="openWalletModal()" title="${connectedWallet.address}">
          <div class="wallet-avatar-icon">🌙</div>
          <div class="wallet-info-stacked">
            <div class="wallet-addr-row">
              <span class="wallet-addr-text">${truncateAddr(connectedWallet.address)}</span>
              <span class="wallet-badge-network">Preview</span>
            </div>
            <div class="wallet-balance-subline">
              <span style="font-size: 0.72rem;">💰 Available:</span>
              <span class="usdm-bal-val">${usdmDisplay} USDM</span>
            </div>
          </div>
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

  // 2. Update Sidebar Mini Wallet Box
  if (sideAddr && sideUsdm) {
    if (isConn) {
      sideAddr.innerText = truncateAddr(connectedWallet.address);
      sideUsdm.innerText = `💰 ${usdmDisplay} USDM Available`;
    } else {
      sideAddr.innerText = 'Wallet Not Connected';
      sideUsdm.innerText = 'Click to Connect Wallet';
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
        
        if (state.type === 'midnight_extension' && window.midnight) {
          try {
            const api = await connectMidnightLace();
            connectedWallet.api = api;
            await refreshWalletBalances();
            startBalancePolling();
          } catch (e) {
            console.warn('[Session Restore] Lace note:', e.message);
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
    platformStats = {
      totalEscrowLockedUsdm: data.totalEscrowLockedUsdm || 0,
      activeQuestsCount: data.activeQuestsCount || 0,
      completedQuestsCount: data.completedQuestsCount || 0,
      successRate: data.successRate || '100% Verified'
    };
  } catch (err) {
    console.warn('Stats fetch error:', err.message);
  }
}

async function loadQuests() {
  try {
    const res = await fetch('/api/quests');
    if (!res.ok) throw new Error('Failed to fetch quests');
    const data = await res.json();
    allQuests = data.quests || [];
  } catch (err) {
    console.error('Load quests error:', err);
  }
}

// ---------------------------------------------------------------------------
// Master View Switcher (Completely Independent Page Views)
// ---------------------------------------------------------------------------
function switchView(view) {
  activeView = view;
  
  // Highlight active sidebar item
  document.querySelectorAll('.sidebar-nav-item').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`side-nav-${view}`);
  if (activeBtn) activeBtn.classList.add('active');

  const mainContainer = document.getElementById('main-view-container');
  if (!mainContainer) return;

  if (view === 'dashboard') {
    renderDashboardView(mainContainer);
  } else if (view === 'explore') {
    renderExploreView(mainContainer);
  } else if (view === 'mybounties') {
    renderMyBountiesView(mainContainer);
  } else if (view === 'employer') {
    renderEmployerHubView(mainContainer);
  } else if (view === 'leaderboard') {
    renderLeaderboardView(mainContainer);
  } else if (view === 'history') {
    renderTransactionHistoryView(mainContainer);
  }
}

// ---------------------------------------------------------------------------
// 1. DASHBOARD VIEW (Hero Section + Stats Ribbon + Launchpad + Protocol Info)
// ---------------------------------------------------------------------------
function renderDashboardView(container) {
  const activeBounties = allQuests.filter(q => q.status === 'Open').slice(0, 3);

  container.innerHTML = `
    <div class="dashboard-wrapper">
      <!-- Hero Section (Matches uploaded screenshot) -->
      <section class="hero-section" style="padding: 1.5rem 0 1rem;">
        <div class="hero-tagline">
          <span>🛡️ ZERO-KNOWLEDGE ESCROW PROTOCOL</span>
        </div>
        <h1 class="hero-headline">
          Decentralized <span>ZK Quest Escrow</span> Marketplace
        </h1>
        <p class="hero-subtitle">
          Lock bounties in privacy-preserving Compact smart contracts. Submit cryptographic proofs, solve developer riddles, and receive instant USDM payouts on Midnight Preview.
        </p>

        <!-- Platform Stats Ribbon (Exact match to screenshot) -->
        <div class="stats-ribbon">
          <div class="stat-card">
            <div class="stat-label">TOTAL USDM ESCROWED</div>
            <div class="stat-value gold">$${platformStats.totalEscrowLockedUsdm.toLocaleString()} USDM</div>
          </div>
          <div class="stat-card blue">
            <div class="stat-label">ACTIVE QUESTS</div>
            <div class="stat-value blue">${platformStats.activeQuestsCount} Active</div>
          </div>
          <div class="stat-card emerald">
            <div class="stat-label">VERIFICATION RATE</div>
            <div class="stat-value emerald">${platformStats.successRate}</div>
          </div>
          <div class="stat-card red">
            <div class="stat-label">COMPLETED & PAID</div>
            <div class="stat-value">${platformStats.completedQuestsCount} Paid</div>
          </div>
        </div>
      </section>

      <!-- Dashboard Quick Navigation Launchpad -->
      <section>
        <div class="dashboard-section-header">
          <div class="dashboard-section-title">🚀 Quick Actions & Navigation</div>
        </div>

        <div class="dashboard-quick-grid">
          <div class="dashboard-quick-card">
            <div class="dashboard-quick-top">
              <div class="dashboard-quick-icon" style="color: #60a5fa;">🔍</div>
              <div>
                <div class="dashboard-quick-title">Explore Quests</div>
                <div class="dashboard-quick-desc">Browse open cryptographic bounties, audit riddles, and community quests.</div>
              </div>
            </div>
            <button class="dashboard-quick-btn" onclick="switchView('explore')">
              <span>Browse All Bounties</span>
              <span>➔</span>
            </button>
          </div>

          <div class="dashboard-quick-card">
            <div class="dashboard-quick-top">
              <div class="dashboard-quick-icon" style="color: var(--gold-primary);">⚔️</div>
              <div>
                <div class="dashboard-quick-title">My Bounties</div>
                <div class="dashboard-quick-desc">Manage your created bounties, inspect evidence, or cancel open escrows.</div>
              </div>
            </div>
            <button class="dashboard-quick-btn" onclick="switchView('mybounties')">
              <span>View My Portfolio</span>
              <span>➔</span>
            </button>
          </div>

          <div class="dashboard-quick-card">
            <div class="dashboard-quick-top">
              <div class="dashboard-quick-icon" style="color: #34d399;">💼</div>
              <div>
                <div class="dashboard-quick-title">Create Quest</div>
                <div class="dashboard-quick-desc">Lock USDM in privacy-preserving Compact contracts and set submission rules.</div>
              </div>
            </div>
            <button class="dashboard-quick-btn" onclick="openCreateQuestModal()">
              <span>+ Lock & Escrow Bounty</span>
              <span>➔</span>
            </button>
          </div>

          <div class="dashboard-quick-card">
            <div class="dashboard-quick-top">
              <div class="dashboard-quick-icon" style="color: #c084fc;">📜</div>
              <div>
                <div class="dashboard-quick-title">Tx History</div>
                <div class="dashboard-quick-desc">Inspect your persistent on-chain transaction ledger and verifiable hashes.</div>
              </div>
            </div>
            <button class="dashboard-quick-btn" onclick="switchView('history')">
              <span>Open Ledger History</span>
              <span>➔</span>
            </button>
          </div>
        </div>
      </section>

      <!-- Protocol Telemetry & Midnight Preview Status -->
      <section>
        <div class="dashboard-section-header">
          <div class="dashboard-section-title">🔒 Protocol & Contract Telemetry</div>
        </div>

        <div class="dashboard-telemetry-box">
          <div class="telemetry-item">
            <div class="telemetry-label">Network Status</div>
            <div class="telemetry-val" style="color: #34d399;">● Midnight Preview Live</div>
          </div>
          <div class="telemetry-item">
            <div class="telemetry-label">Compact Escrow Contract</div>
            <div class="telemetry-val">471dfe55c866f...e73e485c</div>
          </div>
          <div class="telemetry-item">
            <div class="telemetry-label">ZK Proof Protocol</div>
            <div class="telemetry-val" style="color: var(--gold-primary);">SHA-256 Witness Commitment</div>
          </div>
          <div class="telemetry-item">
            <div class="telemetry-label">Settlement Currency</div>
            <div class="telemetry-val" style="color: #60a5fa;">USDM (Midnight Native)</div>
          </div>
        </div>
      </section>

      <!-- Featured / Trending Quests Section -->
      <section>
        <div class="dashboard-section-header">
          <div class="dashboard-section-title">⚡ Featured Open Bounties</div>
          <button class="btn-secondary" onclick="switchView('explore')" style="font-size: 0.82rem; padding: 0.4rem 0.85rem;">View All Bounties ➔</button>
        </div>

        <div class="quests-grid">
          ${activeBounties.length === 0 ? `
            <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem; background: var(--bg-surface); border-radius: 16px; border: 1px solid var(--border-subtle);">
              <div style="color: var(--text-dim); margin-bottom: 0.75rem;">No open bounties at the moment.</div>
              <button class="btn-create-quest" onclick="openCreateQuestModal()" style="margin: 0 auto;"><span>+ Create First Quest</span></button>
            </div>
          ` : activeBounties.map(renderQuestCardHtml).join('')}
        </div>
      </section>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// 2. EXPLORE QUESTS VIEW (Independent Page)
// ---------------------------------------------------------------------------
function renderExploreView(container) {
  const filtered = currentCategory === 'all' 
    ? allQuests 
    : allQuests.filter(q => q.category === currentCategory);

  container.innerHTML = `
    <div>
      <!-- Page Header -->
      <div class="page-header-box">
        <div class="page-header-left">
          <h1 class="page-title">🔍 Explore Active Quests</h1>
          <p class="page-subtitle">
            Discover privacy-preserving developer bounties, cryptographic challenges, and community quests on Midnight Preview.
          </p>
        </div>
        <button class="btn-create-quest" onclick="openCreateQuestModal()">
          <span>+ Create & Fund Quest</span>
        </button>
      </div>

      <!-- Controls & Filter Bar -->
      <div class="controls-bar">
        <div class="category-filters">
          <button class="filter-chip ${currentCategory === 'all' ? 'active' : ''}" onclick="filterCategory('all', this)">All Bounties</button>
          <button class="filter-chip ${currentCategory === 'ZK Cryptography' ? 'active' : ''}" onclick="filterCategory('ZK Cryptography', this)">ZK Cryptography</button>
          <button class="filter-chip ${currentCategory === 'Smart Contract Audit' ? 'active' : ''}" onclick="filterCategory('Smart Contract Audit', this)">Smart Contract Audit</button>
          <button class="filter-chip ${currentCategory === 'Research & Benchmarking' ? 'active' : ''}" onclick="filterCategory('Research & Benchmarking', this)">Research & Telemetry</button>
          <button class="filter-chip ${currentCategory === 'Social & Community' ? 'active' : ''}" onclick="filterCategory('Social & Community', this)">Social & Community</button>
        </div>
      </div>

      <!-- Quests Grid -->
      <div class="quests-grid" id="quests-grid-container">
        ${filtered.length === 0 ? `
          <div style="grid-column: 1 / -1; text-align: center; padding: 4.5rem 1.5rem; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 20px;">
            <div style="font-size: 2.5rem; margin-bottom: 0.85rem;">🛡️</div>
            <h3 style="font-size: 1.35rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.5rem;">No Bounties in this Category</h3>
            <p style="font-size: 0.92rem; color: var(--text-muted); max-width: 480px; margin: 0 auto 1.75rem; line-height: 1.5;">
              There are currently no open bounties matching "${currentCategory}". Create a new quest to lock USDM into a Compact escrow contract!
            </p>
            <button class="btn-create-quest" onclick="openCreateQuestModal()" style="display: inline-flex; margin: 0 auto;">
              <span>+ Create & Fund Quest</span>
            </button>
          </div>
        ` : filtered.map(renderQuestCardHtml).join('')}
      </div>
    </div>
  `;
}

function renderQuestCardHtml(q) {
  const isZK = q.proofType === 'AutomatedZkSecret';
  const proofLabel = isZK ? '⚡ Automated ZK Proof' : '👤 Employer Attestation';
  const proofClass = isZK ? 'zk' : 'attestation';
  const isPaid = q.status === 'Paid';

  return `
    <div class="quest-card">
      <div>
        <div class="card-top-tags">
          <span class="bounty-pill">${q.category}</span>
          <span class="urgency-pill">⏱️ ${isPaid ? 'Completed' : 'Active'}</span>
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
}

function filterCategory(cat, btn) {
  currentCategory = cat;
  const mainContainer = document.getElementById('main-view-container');
  if (mainContainer && activeView === 'explore') {
    renderExploreView(mainContainer);
  }
}

// ---------------------------------------------------------------------------
// 3. MY BOUNTIES VIEW (Independent Page)
// ---------------------------------------------------------------------------
function renderMyBountiesView(container) {
  if (!connectedWallet.connected || !connectedWallet.address) {
    container.innerHTML = `
      <div>
        <div class="page-header-box">
          <div class="page-header-left">
            <h1 class="page-title">⚔️ My Bounties Portfolio</h1>
            <p class="page-subtitle">Manage bounties you have created, cancel open escrows, and review your won payout receipts.</p>
          </div>
        </div>
        <div style="text-align: center; padding: 4.5rem 1.5rem; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 20px;">
          <div style="font-size: 2.8rem; margin-bottom: 0.85rem;">🔒</div>
          <h3 style="font-size: 1.35rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.5rem;">Connect Wallet to View My Bounties</h3>
          <p style="font-size: 0.92rem; color: var(--text-muted); max-width: 480px; margin: 0 auto 1.75rem; line-height: 1.5;">
            Connect your Midnight Preview wallet to track quests you created, cancel open escrows, or inspect your submissions.
          </p>
          <button class="btn-create-quest" onclick="openWalletModal()" style="display: inline-flex; margin: 0 auto;">
            <span>⚡ Connect Wallet Now</span>
          </button>
        </div>
      </div>
    `;
    return;
  }

  const myCreated = allQuests.filter(q => q.employerWallet && q.employerWallet.toLowerCase() === connectedWallet.address.toLowerCase());
  const myParticipated = allQuests.filter(q => q.questerWallet && q.questerWallet.toLowerCase() === connectedWallet.address.toLowerCase());

  container.innerHTML = `
    <div>
      <div class="page-header-box">
        <div class="page-header-left">
          <h1 class="page-title">⚔️ My Bounties Portfolio</h1>
          <p class="page-subtitle">Manage bounties you have created, cancel open escrows, and review your won payout receipts.</p>
        </div>
        <button class="btn-create-quest" onclick="openCreateQuestModal()">
          <span>+ Create & Fund Quest</span>
        </button>
      </div>

      <div class="my-bounties-wrapper">
        <!-- Section 1: Quests Created by Connected Wallet -->
        <div class="my-bounties-section">
          <div class="my-bounties-section-header">
            <div class="my-bounties-section-title">
              <span>👑 Bounties Created by You</span>
              <span style="font-size: 0.85rem; font-weight: 600; color: var(--gold-primary); background: var(--gold-surface); padding: 0.2rem 0.6rem; border-radius: 20px;">
                ${myCreated.length} Total
              </span>
            </div>
            <button class="btn-create-quest" onclick="openCreateQuestModal()" style="padding: 0.5rem 1rem; font-size: 0.82rem;">
              <span>+ New Bounty</span>
            </button>
          </div>

          <div class="my-bounty-list">
            ${myCreated.length === 0 ? `
              <div style="padding: 2.5rem 1rem; text-align: center; color: var(--text-dim); font-size: 0.9rem;">
                You haven't created any bounties yet. Lock USDM into a Compact contract to start!
              </div>
            ` : myCreated.map(q => {
              const isOpen = q.status === 'Open';
              const isPaid = q.status === 'Paid';
              const statusColor = isOpen ? 'var(--gold-primary)' : isPaid ? '#34d399' : '#60a5fa';

              return `
                <div class="my-bounty-item">
                  <div class="my-bounty-item-left">
                    <div class="my-bounty-title">${q.title}</div>
                    <div class="my-bounty-meta">
                      <span style="color: ${statusColor}; font-weight: 700;">● ${q.status}</span>
                      <span>Category: ${q.category}</span>
                      <span>Type: ${formatQuestType(q.questType)}</span>
                      <span>Locked: ${q.rewardUsdm} USDM</span>
                    </div>
                  </div>

                  <div class="my-bounty-item-right">
                    ${isOpen ? `
                      <button class="btn-delete-quest" onclick="confirmDeleteQuest('${q.id}')" title="Cancel quest & refund escrow">
                        <span>🗑️ Cancel & Delete</span>
                      </button>
                    ` : ''}
                    <button class="btn-view-quest" onclick="openQuestDrawer('${q.id}')">
                      <span>Inspect Bounty ➔</span>
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Section 2: Quests Won / Participated -->
        <div class="my-bounties-section">
          <div class="my-bounties-section-header">
            <div class="my-bounties-section-title">
              <span>⚔️ Bounties Won & Participated</span>
              <span style="font-size: 0.85rem; font-weight: 600; color: #34d399; background: rgba(16, 185, 129, 0.12); padding: 0.2rem 0.6rem; border-radius: 20px;">
                ${myParticipated.length} Total
              </span>
            </div>
          </div>

          <div class="my-bounty-list">
            ${myParticipated.length === 0 ? `
              <div style="padding: 2.5rem 1rem; text-align: center; color: var(--text-dim); font-size: 0.9rem;">
                No completed bounties yet. Solve challenges from Explore Quests to claim USDM rewards!
              </div>
            ` : myParticipated.map(q => `
              <div class="my-bounty-item">
                <div class="my-bounty-item-left">
                  <div class="my-bounty-title">${q.title}</div>
                  <div class="my-bounty-meta">
                    <span style="color: #34d399; font-weight: 700;">✓ ${q.status === 'Paid' ? 'Won & Payout Released' : q.status}</span>
                    <span>Reward: <strong>${q.rewardUsdm} USDM</strong></span>
                    <span>Verified: ${q.completedAt ? new Date(q.completedAt).toLocaleDateString() : 'On-Chain'}</span>
                  </div>
                </div>

                <div class="my-bounty-item-right">
                  <button class="btn-view-quest" onclick="openQuestDrawer('${q.id}')">
                    <span>View Receipt ➔</span>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function formatQuestType(type) {
  if (type === 'zk_secret') return '⚡ ZK Secret';
  if (type === 'link_submission') return '🔗 Link Proof';
  if (type === 'screenshot_submission') return '📸 Screenshot';
  if (type === 'text_submission') return '📝 Text Review';
  return '⚡ ZK Challenge';
}

function confirmDeleteQuest(questId) {
  questToDeleteId = questId;
  const quest = allQuests.find(q => q.id === questId);
  
  const titleEl = document.getElementById('confirm-dialog-title');
  const descEl = document.getElementById('confirm-dialog-desc');
  
  if (titleEl) titleEl.innerText = `Cancel "${quest ? quest.title : 'Quest'}"?`;
  if (descEl && quest) {
    descEl.innerText = `Are you sure you want to cancel this bounty? The ${quest.rewardUsdm} USDM escrow will be refunded to your wallet balance.`;
  }

  const modal = document.getElementById('confirm-dialog-backdrop');
  if (modal) modal.classList.add('active');
}

function closeConfirmDialog() {
  questToDeleteId = null;
  const modal = document.getElementById('confirm-dialog-backdrop');
  if (modal) modal.classList.remove('active');
}

async function executeConfirmDelete() {
  if (!questToDeleteId) return;

  const deleteBtn = document.getElementById('btn-confirm-delete');
  if (deleteBtn) {
    deleteBtn.disabled = true;
    deleteBtn.innerText = 'Cancelling on Midnight...';
  }

  try {
    const res = await fetch(`/api/quests/${questToDeleteId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employerWallet: connectedWallet.address
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to cancel quest');
    }

    showToast(`✓ Bounty cancelled! ${data.refundAmount} USDM refunded to your balance.`, 'success');
    closeConfirmDialog();
    await refreshWalletBalances();
    await loadPlatformStats();
    await loadQuests();
    switchView('mybounties');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    if (deleteBtn) {
      deleteBtn.disabled = false;
      deleteBtn.innerText = 'Yes, Delete & Refund';
    }
  }
}

// ---------------------------------------------------------------------------
// 4. EMPLOYER HUB VIEW (Independent Page)
// ---------------------------------------------------------------------------
function renderEmployerHubView(container) {
  if (!connectedWallet.connected || !connectedWallet.address) {
    container.innerHTML = `
      <div>
        <div class="page-header-box">
          <div class="page-header-left">
            <h1 class="page-title">💼 Employer Escrow Hub</h1>
            <p class="page-subtitle">Publish quests, fund Compact smart contract escrows, and review quester submissions.</p>
          </div>
        </div>
        <div style="text-align: center; padding: 4.5rem 1.5rem; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 20px;">
          <div style="font-size: 2.8rem; margin-bottom: 0.85rem;">🔒</div>
          <h3 style="font-size: 1.35rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.5rem;">Connect Wallet to Access Employer Hub</h3>
          <p style="font-size: 0.92rem; color: var(--text-muted); max-width: 480px; margin: 0 auto 1.75rem; line-height: 1.5;">
            Connect your employer wallet on Midnight Preview to create escrows and review proof submissions.
          </p>
          <button class="btn-create-quest" onclick="openWalletModal()" style="display: inline-flex; margin: 0 auto;">
            <span>⚡ Connect Wallet Now</span>
          </button>
        </div>
      </div>
    `;
    return;
  }

  const employerQuests = allQuests.filter(q => q.employerWallet && q.employerWallet.toLowerCase() === connectedWallet.address.toLowerCase());
  const totalLocked = employerQuests.filter(q => q.status === 'Open').reduce((acc, q) => acc + q.rewardUsdm, 0);

  container.innerHTML = `
    <div>
      <div class="page-header-box">
        <div class="page-header-left">
          <h1 class="page-title">💼 Employer Escrow Hub</h1>
          <p class="page-subtitle">Publish quests, fund Compact smart contract escrows, and review quester submissions.</p>
        </div>
        <button class="btn-create-quest" onclick="openCreateQuestModal()">
          <span>+ Create & Escrow Quest</span>
        </button>
      </div>

      <div class="tx-summary-grid" style="margin-bottom: 2rem;">
        <div class="tx-summary-card gold">
          <div class="tx-summary-label">Your Active Escrow Locked</div>
          <div class="tx-summary-val gold">$${totalLocked.toLocaleString()} USDM</div>
        </div>
        <div class="tx-summary-card blue">
          <div class="tx-summary-label">Quests Created</div>
          <div class="tx-summary-val blue">${employerQuests.length} Total</div>
        </div>
        <div class="tx-summary-card emerald">
          <div class="tx-summary-label">Settled & Completed</div>
          <div class="tx-summary-val emerald">${employerQuests.filter(q => q.status === 'Paid').length} Paid</div>
        </div>
      </div>

      <div class="dashboard-section-header">
        <div class="dashboard-section-title">Your Published Bounties</div>
      </div>

      <div class="quests-grid">
        ${employerQuests.length === 0 ? `
          <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1.5rem; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 16px;">
            <div style="color: var(--text-dim); margin-bottom: 0.75rem;">You haven't published any bounties yet.</div>
            <button class="btn-create-quest" onclick="openCreateQuestModal()" style="display: inline-flex; margin: 0 auto;"><span>+ Create First Quest</span></button>
          </div>
        ` : employerQuests.map(renderQuestCardHtml).join('')}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// 5. REPUTATION & LEADERBOARD VIEW (Independent Page)
// ---------------------------------------------------------------------------
async function renderLeaderboardView(container) {
  container.innerHTML = `
    <div>
      <div class="page-header-box">
        <div class="page-header-left">
          <h1 class="page-title">👑 Reputation & Cryptographers Leaderboard</h1>
          <p class="page-subtitle">Verifiable on-chain reputation ranking and top USDM earners on Midnight Preview.</p>
        </div>
      </div>
      <div style="text-align: center; padding: 3rem 1rem;">
        <div style="font-size: 1.2rem; color: var(--gold-primary); font-weight: 700;">⏳ Loading cryptographic reputation ledger...</div>
      </div>
    </div>
  `;

  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    const list = data.leaderboard || [];

    container.innerHTML = `
      <div>
        <div class="page-header-box">
          <div class="page-header-left">
            <h1 class="page-title">👑 Reputation & Cryptographers Leaderboard</h1>
            <p class="page-subtitle">Verifiable on-chain reputation ranking and top USDM earners on Midnight Preview.</p>
          </div>
        </div>

        <div style="background: var(--bg-surface); border: 1px solid var(--gold-border); border-radius: 20px; padding: 2rem;">
          ${list.length === 0 ? `
            <div style="text-align: center; padding: 3rem 1rem;">
              <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">👑</div>
              <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--gold-primary); margin-bottom: 0.5rem;">Leaderboard Empty</h3>
              <p style="font-size: 0.88rem; color: var(--text-muted);">Complete quests to earn USDM and appear on the Midnight reputation ledger.</p>
            </div>
          ` : `
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
          `}
        </div>
      </div>
    `;
  } catch (err) {
    showToast('Failed to load leaderboard', 'error');
  }
}

// ---------------------------------------------------------------------------
// 6. TRANSACTION HISTORY VIEW (Independent Page for Connected Wallet)
// ---------------------------------------------------------------------------
async function renderTransactionHistoryView(container) {
  if (!connectedWallet.connected || !connectedWallet.address) {
    container.innerHTML = `
      <div>
        <div class="page-header-box">
          <div class="page-header-left">
            <h1 class="page-title">📜 On-Chain Transaction History</h1>
            <p class="page-subtitle">Persistent ledger transactions, escrow locks, refunds, and payout receipts for your connected wallet.</p>
          </div>
        </div>
        <div style="text-align: center; padding: 4.5rem 1.5rem; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 20px;">
          <div style="font-size: 2.8rem; margin-bottom: 0.85rem;">📜</div>
          <h3 style="font-size: 1.35rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.5rem;">Connect Wallet to View Transaction History</h3>
          <p style="font-size: 0.92rem; color: var(--text-muted); max-width: 480px; margin: 0 auto 1.75rem; line-height: 1.5;">
            Connect your wallet to inspect your immutable on-chain USDM escrow history across all devices and sessions.
          </p>
          <button class="btn-create-quest" onclick="openWalletModal()" style="display: inline-flex; margin: 0 auto;">
            <span>⚡ Connect Wallet Now</span>
          </button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div>
      <div class="page-header-box">
        <div class="page-header-left">
          <h1 class="page-title">📜 On-Chain Transaction History</h1>
          <p class="page-subtitle">Persistent ledger transactions, escrow locks, refunds, and payout receipts for your connected wallet.</p>
        </div>
      </div>
      <div style="text-align: center; padding: 3rem 1rem;">
        <div style="font-size: 1.2rem; color: var(--gold-primary); font-weight: 700;">⏳ Fetching on-chain transaction history...</div>
      </div>
    </div>
  `;

  try {
    const res = await fetch(`/api/transactions/${encodeURIComponent(connectedWallet.address)}`);
    const data = await res.json();
    allTransactions = data.transactions || [];
    const summary = data.summary || { totalLocked: 0, totalEarned: 0, totalRefunded: 0, totalReleased: 0, netBalance: 0 };

    container.innerHTML = `
      <div class="tx-history-wrapper">
        <!-- Page Header -->
        <div class="page-header-box">
          <div class="page-header-left">
            <h1 class="page-title">📜 On-Chain Transaction History</h1>
            <p class="page-subtitle">Persistent ledger transactions, escrow locks, refunds, and payout receipts for your connected wallet.</p>
          </div>
        </div>

        <!-- Summary Cards Ribbon -->
        <div class="tx-summary-grid">
          <div class="tx-summary-card gold">
            <div class="tx-summary-label">Total USDM Escrowed</div>
            <div class="tx-summary-val gold">$${summary.totalLocked.toLocaleString()} USDM</div>
          </div>
          <div class="tx-summary-card emerald">
            <div class="tx-summary-label">Bounties Won / Earned</div>
            <div class="tx-summary-val emerald">+$${summary.totalEarned.toLocaleString()} USDM</div>
          </div>
          <div class="tx-summary-card ruby">
            <div class="tx-summary-label">Escrows Refunded</div>
            <div class="tx-summary-val ruby">+$${summary.totalRefunded.toLocaleString()} USDM</div>
          </div>
          <div class="tx-summary-card blue">
            <div class="tx-summary-label">Paid to Questers</div>
            <div class="tx-summary-val blue">-$${summary.totalReleased.toLocaleString()} USDM</div>
          </div>
        </div>

        <!-- Transactions Table Card -->
        <div class="tx-card-container">
          <div class="tx-header-row">
            <div class="tx-header-title">
              <span>📜 Ledger Transactions</span>
              <span style="font-size: 0.8rem; color: var(--text-dim); font-weight: 500;">(Address: ${truncateAddr(connectedWallet.address)})</span>
            </div>

            <div class="tx-filter-group">
              <button class="tx-filter-btn ${currentTxFilter === 'all' ? 'active' : ''}" onclick="filterTransactions('all')">All</button>
              <button class="tx-filter-btn ${currentTxFilter === 'ESCROW_LOCKED' ? 'active' : ''}" onclick="filterTransactions('ESCROW_LOCKED')">Locked</button>
              <button class="tx-filter-btn ${currentTxFilter === 'BOUNTY_WON' ? 'active' : ''}" onclick="filterTransactions('BOUNTY_WON')">Won</button>
              <button class="tx-filter-btn ${currentTxFilter === 'ESCROW_REFUNDED' ? 'active' : ''}" onclick="filterTransactions('ESCROW_REFUNDED')">Refunded</button>
              <button class="tx-filter-btn ${currentTxFilter === 'ESCROW_RELEASED' ? 'active' : ''}" onclick="filterTransactions('ESCROW_RELEASED')">Released</button>
            </div>
          </div>

          <div class="tx-table-wrapper" id="tx-table-container">
            <!-- Rendered by filterTransactions -->
          </div>
        </div>
      </div>
    `;

    filterTransactions(currentTxFilter);
  } catch (err) {
    showToast('Failed to load transaction history', 'error');
  }
}

function filterTransactions(type) {
  currentTxFilter = type;
  document.querySelectorAll('.tx-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.innerText.toLowerCase() === type.toLowerCase() || (type === 'all' && btn.innerText === 'All'));
  });

  const container = document.getElementById('tx-table-container');
  if (!container) return;

  const filtered = type === 'all' 
    ? allTransactions 
    : allTransactions.filter(tx => tx.type === type);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-dim); font-size: 0.9rem;">
        No transactions found for this filter.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="tx-table">
      <thead>
        <tr>
          <th>Transaction Type</th>
          <th>Quest Title / Details</th>
          <th>Amount</th>
          <th>Date & Time</th>
          <th>On-Chain Hash (Midnight)</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(tx => {
          let badgeClass = 'badge-locked';
          let badgeLabel = '🔒 Escrow Locked';
          let amountClass = 'neutral';
          let amountPrefix = '';

          if (tx.type === 'BOUNTY_WON') {
            badgeClass = 'badge-won';
            badgeLabel = '🏆 Bounty Won';
            amountClass = 'positive';
            amountPrefix = '+';
          } else if (tx.type === 'ESCROW_REFUNDED') {
            badgeClass = 'badge-refunded';
            badgeLabel = '↩️ Escrow Refunded';
            amountClass = 'positive';
            amountPrefix = '+';
          } else if (tx.type === 'ESCROW_RELEASED') {
            badgeClass = 'badge-released';
            badgeLabel = '💸 USDM Released';
            amountClass = 'negative';
            amountPrefix = '-';
          } else if (tx.type === 'QUEST_ACCEPTED') {
            badgeClass = 'badge-accepted';
            badgeLabel = '⚔️ Quest Accepted';
            amountClass = 'neutral';
            amountPrefix = '';
          }

          const dateStr = new Date(tx.timestamp).toLocaleString();

          return `
            <tr>
              <td><span class="tx-type-badge ${badgeClass}">${badgeLabel}</span></td>
              <td style="font-weight: 600; color: var(--text-main); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${tx.questTitle || 'Quest Escrow'}
              </td>
              <td>
                <span class="tx-amount ${amountClass}">${amountPrefix}${tx.amount} USDM</span>
              </td>
              <td style="font-size: 0.8rem; color: var(--text-dim);">${dateStr}</td>
              <td>
                <div class="tx-hash-pill" onclick="copyTxHash('${tx.txHash}')" title="Click to copy on-chain Tx Hash">
                  <span>${truncateAddr(tx.txHash)}</span>
                  <span>📋</span>
                </div>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function copyTxHash(hash) {
  if (hash) {
    navigator.clipboard.writeText(hash);
    showToast(`Tx Hash copied: ${truncateAddr(hash)}`, 'success');
  }
}

// ---------------------------------------------------------------------------
// Slide-Over Drawer & Proof Submissions (Links + Screenshots)
// ---------------------------------------------------------------------------
function openQuestDrawer(questId) {
  const quest = allQuests.find(q => q.id === questId);
  if (!quest) return;
  selectedQuest = quest;
  uploadedScreenshots = [];

  document.getElementById('drawer-quest-title').innerText = quest.title;
  document.getElementById('drawer-reward-val').innerText = `${quest.rewardUsdm} USDM`;
  document.getElementById('drawer-quest-desc').innerText = quest.description;

  const reqsBox = document.getElementById('drawer-requirements-box');
  const reqsText = document.getElementById('drawer-requirements-text');
  if (quest.submissionRequirements && quest.submissionRequirements.trim()) {
    reqsText.innerText = quest.submissionRequirements;
    reqsBox.style.display = 'block';
  } else {
    reqsBox.style.display = 'none';
  }

  const isZK = quest.proofType === 'AutomatedZkSecret';
  const badge = document.getElementById('drawer-proof-badge');
  badge.className = `proof-mode-badge ${isZK ? 'zk' : 'attestation'}`;
  badge.innerText = isZK ? '⚡ Automated ZK Proof' : '👤 Employer Attestation';

  const secretSection = document.getElementById('drawer-secret-section');
  const linksSection = document.getElementById('drawer-links-section');
  const screenshotSection = document.getElementById('drawer-screenshot-section');
  const hashBox = document.getElementById('drawer-hash-box');

  const qType = quest.questType || (isZK ? 'zk_secret' : 'link_submission');

  if (qType === 'zk_secret') {
    secretSection.style.display = 'block';
    if (hashBox) hashBox.style.display = 'block';
    linksSection.style.display = 'none';
    screenshotSection.style.display = 'none';
  } else if (qType === 'link_submission') {
    secretSection.style.display = 'none';
    linksSection.style.display = 'block';
    screenshotSection.style.display = 'block';
  } else if (qType === 'screenshot_submission') {
    secretSection.style.display = 'none';
    linksSection.style.display = 'none';
    screenshotSection.style.display = 'block';
  } else {
    secretSection.style.display = 'block';
    if (hashBox) hashBox.style.display = 'none';
    linksSection.style.display = 'block';
    screenshotSection.style.display = 'block';
  }

  document.getElementById('drawer-solution-input').value = '';
  document.getElementById('drawer-link-input-1').value = '';
  document.getElementById('drawer-link-input-2').value = '';
  document.getElementById('drawer-notes-input').value = '';
  document.getElementById('drawer-hash-preview').innerText = 'Type your solution above to compute real-time commitment...';
  renderScreenshotPreviews();

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
  uploadedScreenshots = [];
}

async function handleSolutionInput(val) {
  const preview = document.getElementById('drawer-hash-preview');
  if (!preview) return;
  if (!val || !val.trim()) {
    preview.innerText = 'Type your solution above to compute real-time commitment...';
    return;
  }
  const hash = await computeClientSha256(val);
  preview.innerText = `0x${hash}`;
}

function handleScreenshotUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 2.5 * 1024 * 1024) {
    showToast('Screenshot must be under 2MB', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedScreenshots.push(e.target.result);
    renderScreenshotPreviews();
    showToast('Screenshot added!', 'success');
  };
  reader.readAsDataURL(file);
}

function removeScreenshot(index) {
  uploadedScreenshots.splice(index, 1);
  renderScreenshotPreviews();
}

function renderScreenshotPreviews() {
  const container = document.getElementById('drawer-screenshot-previews');
  if (!container) return;

  if (uploadedScreenshots.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = uploadedScreenshots.map((src, idx) => `
    <div class="upload-preview-item">
      <img src="${src}" alt="Screenshot preview" />
      <div class="upload-preview-remove" onclick="removeScreenshot(${idx})" title="Remove screenshot">✕</div>
    </div>
  `).join('');
}

async function submitActiveQuestProof() {
  if (!selectedQuest) return;

  if (!connectedWallet.connected || !connectedWallet.address) {
    showToast('Please connect your wallet first', 'error');
    openWalletModal();
    return;
  }

  const solution = document.getElementById('drawer-solution-input').value.trim();
  const link1 = document.getElementById('drawer-link-input-1').value.trim();
  const link2 = document.getElementById('drawer-link-input-2').value.trim();
  const notes = document.getElementById('drawer-notes-input').value.trim();

  const links = [link1, link2].filter(Boolean);
  const qType = selectedQuest.questType || 'zk_secret';

  if (qType === 'zk_secret' && !solution) {
    showToast('Please enter your secret answer/solution', 'error');
    return;
  }
  if (qType === 'link_submission' && links.length === 0 && uploadedScreenshots.length === 0 && !notes) {
    showToast('Please provide a submission link or screenshot evidence', 'error');
    return;
  }
  if (!solution && links.length === 0 && uploadedScreenshots.length === 0 && !notes) {
    showToast('Please provide solution details, link, or screenshot', 'error');
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
        solutionInput: solution,
        submissionLinks: links,
        submissionScreenshots: uploadedScreenshots,
        submissionNotes: notes
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
      switchView(activeView);

      setTimeout(() => {
        closeDrawer();
      }, 2000);
    } else {
      showToast('Proof submitted for employer review!', 'info');
      closeDrawer();
      await loadQuests();
      switchView(activeView);
    }
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = `<span>Verify & Release USDM Escrow</span>`;
  }
}

// ---------------------------------------------------------------------------
// Create Quest Modal & Real-Time Balance Validation
// ---------------------------------------------------------------------------
function openCreateQuestModal() {
  if (!connectedWallet.connected || !connectedWallet.address) {
    openWalletModal();
    return;
  }

  const balEl = document.getElementById('create-modal-available-balance');
  if (balEl) {
    const displayVal = connectedWallet.usdm !== null ? connectedWallet.usdm : '0.00';
    balEl.innerText = `${displayVal} USDM`;
  }

  const warningEl = document.getElementById('create-balance-warning');
  if (warningEl) warningEl.classList.remove('active');

  const rewardInput = document.getElementById('create-reward');
  if (rewardInput && rewardInput.value) {
    checkCreateQuestBalance(rewardInput.value);
  }

  document.getElementById('create-modal-backdrop').classList.add('active');
}

function closeCreateQuestModal() {
  document.getElementById('create-modal-backdrop').classList.remove('active');
}

function toggleSecretAnswerField(proofType) {
  const group = document.getElementById('secret-answer-group');
  if (!group) return;
  if (proofType === 'AutomatedZkSecret') {
    group.style.display = 'block';
  } else {
    group.style.display = 'none';
  }
}

function handleQuestTypeChange(type) {
  const proofSelect = document.getElementById('create-proof-type');
  const reqsInput = document.getElementById('create-submission-reqs');

  if (type === 'zk_secret') {
    if (proofSelect) proofSelect.value = 'AutomatedZkSecret';
    toggleSecretAnswerField('AutomatedZkSecret');
    if (reqsInput) reqsInput.placeholder = 'e.g. Enter secret key or hash match';
  } else if (type === 'link_submission') {
    if (proofSelect) proofSelect.value = 'EmployerAttestation';
    toggleSecretAnswerField('EmployerAttestation');
    if (reqsInput) reqsInput.placeholder = 'e.g. Follow @QuestPay_Zk and paste tweet / profile link';
  } else if (type === 'screenshot_submission') {
    if (proofSelect) proofSelect.value = 'EmployerAttestation';
    toggleSecretAnswerField('EmployerAttestation');
    if (reqsInput) reqsInput.placeholder = 'e.g. Upload screenshot of follow / completed task';
  } else {
    if (reqsInput) reqsInput.placeholder = 'e.g. Provide detailed PR link, notes, and analysis';
  }
}

function checkCreateQuestBalance(rewardVal) {
  const warning = document.getElementById('create-balance-warning');
  const warningText = document.getElementById('create-balance-warning-text');
  if (!warning) return;

  const rewardNum = parseFloat(rewardVal);
  const userBalance = parseFloat(connectedWallet.usdm) || 0;

  if (rewardNum > 0 && rewardNum > userBalance) {
    warning.classList.add('active');
    if (warningText) {
      warningText.innerText = `You need ${rewardNum} USDM to fund this escrow, but your available balance is ${userBalance.toFixed(2)} USDM.`;
    }
  } else {
    warning.classList.remove('active');
  }
}

async function handleCreateQuestSubmit(e) {
  e.preventDefault();

  const title = document.getElementById('create-title').value;
  const description = document.getElementById('create-desc').value;
  const category = document.getElementById('create-category').value;
  const rewardUsdm = document.getElementById('create-reward').value;
  const questType = document.getElementById('create-quest-type').value;
  const proofType = document.getElementById('create-proof-type').value;
  const submissionRequirements = document.getElementById('create-submission-reqs').value;
  const secretAnswer = document.getElementById('create-secret-answer').value;

  const rewardNum = parseFloat(rewardUsdm);
  const userBalance = parseFloat(connectedWallet.usdm) || 0;

  if (rewardNum > userBalance) {
    showToast(`Insufficient USDM balance! You have ${userBalance.toFixed(2)} USDM, but need ${rewardNum} USDM.`, 'error');
    const warning = document.getElementById('create-balance-warning');
    if (warning) warning.classList.add('active');
    return;
  }

  const submitBtn = document.getElementById('btn-submit-create-quest');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>⏳ Locking ${rewardUsdm} USDM in Compact Escrow...</span>`;
  }

  try {
    const res = await fetch('/api/quests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        category,
        rewardUsdm,
        questType,
        proofType,
        submissionRequirements,
        secretAnswer,
        employerWallet: connectedWallet.address,
        employerUsdmBalance: userBalance
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      if (data.code === 'INSUFFICIENT_BALANCE') {
        const warning = document.getElementById('create-balance-warning');
        if (warning) warning.classList.add('active');
        throw new Error(`Insufficient USDM balance! ${data.error}`);
      }
      throw new Error(data.error || 'Failed to create quest');
    }

    showToast(`✓ Quest created and ${rewardUsdm} USDM locked on-chain!`, 'success');
    closeCreateQuestModal();
    document.getElementById('create-quest-form').reset();
    await refreshWalletBalances();
    await loadPlatformStats();
    await loadQuests();
    switchView(activeView);
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Lock USDM Escrow & Publish Quest</span>`;
    }
  }
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


