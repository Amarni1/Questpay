import React, { useState, useEffect } from 'react';
import { WalletProvider, useWallet } from './context/WalletContext.js';
import { Sidebar } from './components/Sidebar.js';
import { DashboardView } from './components/DashboardView.js';
import { ExploreView } from './components/ExploreView.js';
import { MyBountiesView } from './components/MyBountiesView.js';
import { SubmissionsView } from './components/SubmissionsView.js';
import { TransactionHistoryView } from './components/TransactionHistoryView.js';
import { ReputationView } from './components/ReputationView.js';
import { CreateBountyView } from './components/CreateBountyView.js';
import { WalletConnectModal } from './components/WalletConnectModal.js';
import { Page, PAGE_VALUES } from './types/index.js';
import { Menu } from 'lucide-react';

function pageFromLocation(): { page: Page; id: string | null } {
  const hash = window.location.hash.replace(/^#\/?/, '').trim();
  if (!hash) return { page: 'dashboard', id: null };

  const [tabPart, idPart] = hash.split('?')[0].split('/');
  return {
    page: PAGE_VALUES.includes(tabPart as Page) ? (tabPart as Page) : 'dashboard',
    id: idPart || null
  };
}

function AppContent() {
  const { isWalletModalOpen, openWalletModal, closeWalletModal } = useWallet();
  const [activeTab, setActiveTab] = useState<Page>(() => pageFromLocation().page);
  const [selectedBountyId, setSelectedBountyId] = useState<string | null>(() => pageFromLocation().id);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Sync state to URL hash
  const handleNavigate = (tab: string, bountyId?: string) => {
    const validPage: Page = PAGE_VALUES.includes(tab as Page) ? (tab as Page) : 'dashboard';
    setActiveTab(validPage);
    if (bountyId) {
      setSelectedBountyId(bountyId);
      window.location.hash = `#/${validPage}/${bountyId}`;
    } else {
      setSelectedBountyId(null);
      window.location.hash = `#/${validPage}`;
    }
  };

  // Sync hash changes into state on browser navigation
  useEffect(() => {
    const handleHashChange = () => {
      const { page, id } = pageFromLocation();
      setActiveTab(page);
      setSelectedBountyId(id);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const renderView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView onNavigate={handleNavigate} />;
      case 'explore':
        return <ExploreView initialBountyId={selectedBountyId} onNavigate={handleNavigate} />;
      case 'my-bounties':
        return <MyBountiesView onNavigate={handleNavigate} />;
      case 'submissions':
        return <SubmissionsView selectedBountyId={selectedBountyId} onNavigate={handleNavigate} />;
      case 'history':
        return <TransactionHistoryView />;
      case 'reputation':
        return <ReputationView />;
      case 'create':
        return <CreateBountyView onNavigate={handleNavigate} />;
      default:
        return <DashboardView onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleNavigate}
        onOpenWalletModal={openWalletModal}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
      />

      <main className="app-main">
        {/* Mobile Top Bar */}
        <div className="mobile-topbar">
          <button className="hamburger-btn" onClick={() => setIsMobileOpen(true)}>
            <Menu size={22} />
          </button>
          <span className="mobile-brand">QUEST<span style={{ color: 'var(--gold-primary)' }}>PAY</span></span>
        </div>

        <div className="main-content-scroll">
          {renderView()}
        </div>
      </main>

      <WalletConnectModal
        isOpen={isWalletModalOpen}
        onClose={closeWalletModal}
      />
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <AppContent />
    </WalletProvider>
  );
}
