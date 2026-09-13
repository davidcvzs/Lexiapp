import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import styles from './MainLayout.module.css';

export const MainLayout: React.FC = () => {
  // Por defecto el sidebar inicia cerrado para disfrutar del modo Wide Screen
  const [isCollapsed, setIsCollapsed] = useState(true);

  return (
    <div className={styles.layoutRoot}>
      <Sidebar 
        isCollapsed={isCollapsed} 
        onMouseEnter={() => setIsCollapsed(false)} 
        onMouseLeave={() => setIsCollapsed(true)} 
      />
      <div 
        className={`${styles.mainContent} ${isCollapsed ? styles.contentCollapsed : ''}`}
      >
        <main className={styles.pageContainer}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
