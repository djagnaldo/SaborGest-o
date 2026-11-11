/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { SystemThemeConfig } from '../types';
import { getThemeConfig, saveThemeConfig, resetThemeConfig } from '../services/storage';
import { DEFAULT_THEME_CONFIG } from '../services/mock-data';
import { useAuth } from './AuthContext';

interface ThemeContextType {
  theme: SystemThemeConfig;
  updateTheme: (newTheme: Partial<SystemThemeConfig>) => void;
  resetThemeToDefault: () => void;
  isCustomized: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const THEME_COLOR_PRESETS = [
  { name: 'Laranja Gastrô (Padrão)', hex: '#ea580c' },
  { name: 'Âmbar Dourado', hex: '#d97706' },
  { name: 'Verde Esmeralda', hex: '#059669' },
  { name: 'Azul Cobalto', hex: '#2563eb' },
  { name: 'Ciano Oceano', hex: '#0284c7' },
  { name: 'Índigo Moderno', hex: '#4f46e5' },
  { name: 'Violeta Lounge', hex: '#7c3aed' },
  { name: 'Carmim / Vinho', hex: '#e11d48' },
  { name: 'Café & Tabaco', hex: '#78350f' },
  { name: 'Ardósia Minimalista', hex: '#475569' },
  { name: 'Preto Absoluto', hex: '#1c1917' },
];

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<SystemThemeConfig>(() => getThemeConfig());
  const { currentUser, isAdm } = useAuth();

  useEffect(() => {
    // Sincronização em tempo real entre abas e dispositivos
    const handleThemeUpdate = (e: any) => {
      if (e.detail) {
        setTheme(e.detail);
      } else {
        setTheme(getThemeConfig());
      }
    };

    window.addEventListener('sabor_theme_updated', handleThemeUpdate);
    return () => {
      window.removeEventListener('sabor_theme_updated', handleThemeUpdate);
    };
  }, []);

  const updateTheme = (partialTheme: Partial<SystemThemeConfig>) => {
    // Segurança: Somente ADM pode alterar o tema
    if (!isAdm) {
      console.warn('Tentativa não autorizada de alterar o tema por usuário não-administrador.');
      return;
    }

    const updated: SystemThemeConfig = {
      ...theme,
      ...partialTheme,
      updatedAt: new Date().toISOString(),
      updatedById: currentUser?.id || 'admin',
    };

    setTheme(updated);
    saveThemeConfig(updated, currentUser ? { id: currentUser.id, name: currentUser.name } : undefined);
  };

  const resetThemeToDefault = () => {
    if (!isAdm) return;
    const def = resetThemeConfig();
    setTheme(def);
  };

  const isCustomized = JSON.stringify(theme) !== JSON.stringify(DEFAULT_THEME_CONFIG);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        updateTheme,
        resetThemeToDefault,
        isCustomized,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme deve ser utilizado dentro de ThemeProvider');
  }
  return context;
};
