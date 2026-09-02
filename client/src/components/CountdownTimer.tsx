import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface CountdownTimerProps {
  expiresAt: string;
  onExpire?: () => void;
  compact?: boolean;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({ expiresAt, onExpire, compact = false }) => {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
  }>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const target = new Date(expiresAt).getTime();
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
        if (onExpire) onExpire();
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / 1000 / 60) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      setTimeLeft({ days, hours, minutes, seconds, isExpired: false });
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [expiresAt]);

  if (timeLeft.isExpired) {
    return (
      <span className="badge-pill" style={{ background: 'var(--rose-surface)', color: 'var(--rose-danger)', border: '1px solid rgba(244, 63, 94, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <Clock size={12} />
        <span>Expired</span>
      </span>
    );
  }

  let formatted = '';
  if (timeLeft.days > 0) {
    formatted = `${timeLeft.days}d ${timeLeft.hours}h ${timeLeft.minutes}m`;
  } else if (timeLeft.hours > 0) {
    formatted = `${timeLeft.hours}h ${timeLeft.minutes}m ${timeLeft.seconds}s`;
  } else {
    formatted = `${timeLeft.minutes}m ${timeLeft.seconds}s`;
  }

  const isUrgent = timeLeft.days === 0 && timeLeft.hours < 24;

  return (
    <span
      className="badge-pill"
      style={{
        background: isUrgent ? 'rgba(251, 146, 60, 0.1)' : 'rgba(56, 189, 248, 0.08)',
        color: isUrgent ? '#fb923c' : 'var(--midnight-blue)',
        border: `1px solid ${isUrgent ? 'rgba(251, 146, 60, 0.25)' : 'rgba(56, 189, 248, 0.2)'}`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        fontSize: compact ? '0.72rem' : '0.78rem'
      }}
    >
      <Clock size={12} />
      <span>{formatted}</span>
    </span>
  );
};
