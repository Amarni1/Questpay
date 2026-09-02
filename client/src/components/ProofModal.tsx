import React, { useEffect, useState } from 'react';
import { DecryptedProofPayload } from '../types/index.js';
import { Shield, Lock, FileText, ExternalLink, X, Image as ImageIcon, Download } from 'lucide-react';

interface ProofModalProps {
  isOpen: boolean;
  onClose: () => void;
  proofData?: DecryptedProofPayload | null;
  payload?: DecryptedProofPayload | null;
  meta?: {
    submissionId: string;
    questerWallet: string;
    bountyTitle: string;
    proofHash: string;
    status: string;
    submittedAt: string;
  } | null;
  submissionMeta?: any | null;
}

export const ProofModal: React.FC<ProofModalProps> = ({ isOpen, onClose, proofData, payload, meta, submissionMeta }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const resolvedProof = proofData || payload;
  const resolvedMeta = meta || submissionMeta;

  useEffect(() => {
    if (isOpen && resolvedProof?.file?.dataBase64) {
      try {
        const byteCharacters = atob(resolvedProof.file.dataBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: resolvedProof.file.mimeType || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
      } catch (err) {
        console.error('Failed to create Blob object URL:', err);
      }
    }

    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
    };
  }, [isOpen, resolvedProof]);

  if (!isOpen || !resolvedMeta) return null;

  const handleClose = () => {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }
    onClose();
  };

  const isImage = resolvedProof?.file?.mimeType?.startsWith('image/');
  const isPdf = resolvedProof?.file?.mimeType === 'application/pdf';

  return (
    <div className="modal-backdrop">
      <div className="modal-card" style={{ maxWidth: '640px' }}>
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={20} style={{ color: 'var(--gold-primary)' }} />
            <h2 className="modal-title">Decrypted Private Proof</h2>
          </div>
          <button className="btn-close" onClick={handleClose}>✕</button>
        </div>

        {/* Security Notification */}
        <div style={{ background: 'rgba(56, 189, 248, 0.06)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '12px', padding: '0.85rem 1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Lock size={18} style={{ color: 'var(--midnight-blue)', flexShrink: 0 }} />
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            This proof was decrypted for your connected employer wallet. Decrypted bytes exist strictly in temporary browser memory and are revoked upon closing.
          </div>
        </div>

        {/* Submission Metadata */}
        <div style={{ background: 'var(--bg-obsidian)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border-subtle)', marginBottom: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Quester</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--midnight-blue)' }}>
                {meta.questerWallet}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Submitted</div>
              <div style={{ fontSize: '0.78rem', color: '#fff' }}>
                {new Date(meta.submittedAt).toLocaleString()}
              </div>
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>SHA-256 Proof Commitment</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                {meta.proofHash}
              </div>
            </div>
          </div>
        </div>

        {/* Decrypted Content */}
        {!proofData ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div className="spinner" />
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Decrypting payload in secure memory...</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Decrypted File (Image or PDF) */}
            {proofData.file && blobUrl && (
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                  Decrypted Attached File: {proofData.file.name}
                </div>

                {isImage && (
                  <div style={{ background: 'var(--bg-obsidian)', borderRadius: '12px', padding: '0.5rem', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                    <img
                      src={blobUrl}
                      alt="Decrypted Proof Screenshot"
                      style={{ maxWidth: '100%', maxHeight: '380px', borderRadius: '8px', objectFit: 'contain' }}
                    />
                  </div>
                )}

                {isPdf && (
                  <div style={{ background: 'var(--bg-obsidian)', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                    <FileText size={36} style={{ color: 'var(--gold-primary)', margin: '0 auto 0.5rem' }} />
                    <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                      {proofData.file.name} ({(proofData.file.size / 1024).toFixed(1)} KB)
                    </div>
                    <a
                      href={blobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary"
                      style={{ display: 'inline-flex', padding: '0.5rem 1rem', fontSize: '0.82rem' }}
                    >
                      <Download size={14} />
                      <span>Open PDF in Embedded Tab</span>
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Decrypted Text / Code */}
            {proofData.text && (
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  Decrypted Submitter Text:
                </div>
                <div style={{ background: 'var(--bg-obsidian)', borderRadius: '8px', padding: '1rem', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#fff', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto' }}>
                  {proofData.text}
                </div>
              </div>
            )}

            {/* External Links */}
            {(proofData.externalUrl || (proofData.links && proofData.links.length > 0)) && (
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  Submitted Links:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {(proofData.links || (proofData.externalUrl ? [proofData.externalUrl] : [])).map((link, i) => (
                    <div key={i} style={{ background: 'var(--bg-obsidian)', padding: '0.5rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
                      <ExternalLink size={14} style={{ color: 'var(--midnight-blue)' }} />
                      <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--midnight-blue)', textDecoration: 'none', wordBreak: 'break-all' }}>
                        {link}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Submitter Notes */}
            {proofData.notes && (
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  Quester Notes:
                </div>
                <div style={{ background: 'var(--bg-obsidian)', borderRadius: '8px', padding: '0.75rem 1rem', border: '1px solid var(--border-subtle)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {proofData.notes}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
          <button className="btn-secondary" onClick={handleClose}>
            Close & Wipe Memory
          </button>
        </div>
      </div>
    </div>
  );
};
