import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Scale, 
  LayoutDashboard, 
  FileAudio, 
  FolderOpen, 
  Search, 
  CreditCard, 
  User
} from 'lucide-react';
import styles from './Sidebar.module.css';

interface SidebarProps {
  isCollapsed: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, onMouseEnter, onMouseLeave }) => {
  const getNavClass = ({ isActive }: { isActive: boolean }) => 
    `${styles.navItem} ${isActive ? styles.navItemActive : ''} ${isCollapsed ? styles.navItemCollapsed : ''}`;

  return (
    <aside 
      className={`${styles.sidebar} ${isCollapsed ? styles.sidebarCollapsed : ''}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className={`${styles.logoArea} ${isCollapsed ? styles.logoAreaCollapsed : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
          <Scale className={styles.logoIcon} size={28} />
          {!isCollapsed && <h1 className={styles.logoText}>LexIA</h1>}
        </div>
      </div>
      
      <nav className={styles.navMenu}>
        <NavLink to="/dashboard" className={getNavClass}>
          <LayoutDashboard size={20} className={styles.navIcon} />
          {!isCollapsed && <span>Dashboard</span>}
        </NavLink>
        <NavLink to="/transcription" className={getNavClass}>
          <FileAudio size={20} className={styles.navIcon} />
          {!isCollapsed && <span>Nueva Transcripción</span>}
        </NavLink>
        <NavLink to="/documents" className={getNavClass}>
          <FolderOpen size={20} className={styles.navIcon} />
          {!isCollapsed && <span>Mis Documentos</span>}
        </NavLink>
        <NavLink to="/search" className={getNavClass}>
          <Search size={20} className={styles.navIcon} />
          {!isCollapsed && <span>Búsqueda Legal</span>}
        </NavLink>
      </nav>

      <div className={styles.footer}>
        <NavLink to="/subscription" className={getNavClass} style={{padding: '0.5rem 0'}}>
          <CreditCard size={20} className={styles.navIcon} />
          {!isCollapsed && <span>Suscripción</span>}
        </NavLink>
        <NavLink to="/profile" className={getNavClass} style={{padding: '0.5rem 0'}}>
          <User size={20} className={styles.navIcon} />
          {!isCollapsed && <span>Mi Perfil</span>}
        </NavLink>
        {!isCollapsed && <div className={styles.badge}>Plan Pro</div>}
      </div>
    </aside>
  );
};
