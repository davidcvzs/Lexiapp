import React from 'react';
import { User, Bell } from 'lucide-react';
import styles from './Header.module.css';

export const Header: React.FC = () => {
  return (
    <header className={styles.header}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button style={{ color: 'var(--color-text-muted)' }}>
          <Bell size={20} />
        </button>
        <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--color-border)' }} />
        <div className={styles.profileBox}>
          <div className={styles.avatar}>
            <User size={18} />
          </div>
          <span className={styles.profileName}>Dr. Mendoza</span>
        </div>
      </div>
    </header>
  );
};
