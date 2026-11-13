/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserProfile, UserRole, UserPermission } from '../types';
import { useTenant } from './TenantContext';
import {
  getUsers,
  saveUser,
  deleteUser as removeUserFromStorage,
  getActiveUserId,
  setActiveUserId,
  addAuditLog,
} from '../services/storage';
import { DEFAULT_PERMISSIONS } from '../services/mock-data';
import { auth, googleProvider } from '../services/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  initRealtimeSync,
  isWebPortalUrl,
  getWebPortalAuth,
  logoutWebPortal,
  getWsConnectionStatus,
  type WebPortalAuthState,
} from '../services/sync-client';

interface AuthContextType {
  currentUser: UserProfile | null;
  users: UserProfile[];
  firebaseUser: FirebaseUser | null;
  isAdm: boolean;
  isWaiter: boolean;
  isCashier: boolean;
  activeView: 'admin' | 'vendedor';
  setActiveView: (view: 'admin' | 'vendedor') => void;
  isWebPortal: boolean;
  webPortalAuth: WebPortalAuthState | null;
  wsConnected: boolean;
  wsRevision: number;
  revokedMessage: string | null;
  clearRevokedMessage: () => void;
  switchUser: (userId: string) => void;
  createUser: (userData: {
    name: string;
    email: string;
    phone?: string;
    role: UserRole;
    commissionRate?: number;
    salesTargetMonthly?: number;
    permissions?: Partial<UserPermission>;
  }) => UserProfile;
  updateUser: (user: UserProfile) => void;
  deleteUser: (userId: string) => void;
  loginWithGoogle: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentTenant } = useTenant();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [activeView, setActiveViewState] = useState<'admin' | 'vendedor'>('admin');
  const [webPortalAuth, setWebPortalAuthState] = useState<WebPortalAuthState | null>(() =>
    getWebPortalAuth()
  );
  const [isWebPortal] = useState<boolean>(() => isWebPortalUrl());
  const [wsConnected, setWsConnected] = useState<boolean>(() => getWsConnectionStatus().connected);
  const [wsRevision, setWsRevision] = useState<number>(() => getWsConnectionStatus().revision);
  const [revokedMessage, setRevokedMessage] = useState<string | null>(null);

  const reloadUsersFromStorage = useCallback(() => {
    if (!currentTenant?.id) return;
    const tenantUsers = getUsers(currentTenant.id);
    setUsers(tenantUsers);

    const portalAuth = getWebPortalAuth();
    if (portalAuth) {
      const syncedUser =
        tenantUsers.find((u) => u.id === portalAuth.user.id) || portalAuth.user;
      setCurrentUser(syncedUser);
      setActiveViewState(portalAuth.session.mode === 'admin' ? 'admin' : 'vendedor');
      return;
    }

    const activeId = getActiveUserId();
    const active = tenantUsers.find((u) => u.id === activeId) || tenantUsers[0] || null;
    setCurrentUser(active);
    if (active) {
      if (active.role === 'waiter' || active.role === 'cashier') {
        setActiveViewState('vendedor');
      } else {
        setActiveViewState('admin');
      }
    }
  }, [currentTenant?.id]);

  // Load users when current tenant changes
  useEffect(() => {
    reloadUsersFromStorage();
  }, [reloadUsersFromStorage]);

  // Initialize Real-Time WebSocket + HTTP Sync
  useEffect(() => {
    if (!currentTenant?.id) return;
    initRealtimeSync({
      tenantId: currentTenant.id,
      userId: currentUser?.id,
    });
  }, [currentTenant?.id, currentUser?.id, webPortalAuth?.token]);

  // Listen to storage sync, WS connection status, and remote revocations
  useEffect(() => {
    const onLocalSync = () => {
      reloadUsersFromStorage();
    };
    const onWebAuthChanged = (e: Event) => {
      const detail = (e as CustomEvent<WebPortalAuthState | null>).detail;
      setWebPortalAuthState(detail);
      if (detail) {
        setRevokedMessage(null);
        setCurrentUser(detail.user);
        setActiveViewState(detail.session.mode === 'admin' ? 'admin' : 'vendedor');
      }
      reloadUsersFromStorage();
    };
    const onWebRevoked = (e: Event) => {
      const detail = (e as CustomEvent<{ reason?: string }>).detail;
      setWebPortalAuthState(null);
      setRevokedMessage(
        detail?.reason || 'Acesso desconectado ou bloqueado pelo Administrador.'
      );
    };
    const onWsStatus = (e: Event) => {
      const detail = (e as CustomEvent<{ connected: boolean; revision: number }>).detail;
      if (detail) {
        setWsConnected(detail.connected);
        setWsRevision(detail.revision);
      }
    };

    window.addEventListener('sabor_local_sync', onLocalSync);
    window.addEventListener('sabor_web_auth_changed', onWebAuthChanged);
    window.addEventListener('sabor_web_revoked', onWebRevoked);
    window.addEventListener('sabor_ws_status', onWsStatus);

    return () => {
      window.removeEventListener('sabor_local_sync', onLocalSync);
      window.removeEventListener('sabor_web_auth_changed', onWebAuthChanged);
      window.removeEventListener('sabor_web_revoked', onWebRevoked);
      window.removeEventListener('sabor_ws_status', onWsStatus);
    };
  }, [reloadUsersFromStorage]);

  // Monitor Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user && currentTenant?.id && !getWebPortalAuth()) {
        const existing = users.find((u) => u.email.toLowerCase() === user.email?.toLowerCase());
        if (existing) {
          setCurrentUser(existing);
          setActiveUserId(existing.id);
        } else if (user.email === 'agnaldomix@gmail.com') {
          const adminUser: UserProfile = {
            id: user.uid,
            tenantId: currentTenant.id,
            name: user.displayName || 'Administrador (Google)',
            email: user.email,
            avatarUrl: user.photoURL || undefined,
            role: 'admin',
            active: true,
            commissionRate: 0,
            permissions: DEFAULT_PERMISSIONS.admin,
            createdAt: new Date().toISOString(),
          };
          saveUser(adminUser);
          setUsers(getUsers(currentTenant.id));
          setCurrentUser(adminUser);
          setActiveUserId(adminUser.id);
        }
      }
    });

    return () => unsubscribe();
  }, [currentTenant?.id, users]);

  const setActiveView = (view: 'admin' | 'vendedor') => {
    if (webPortalAuth && webPortalAuth.session.mode === 'seller') {
      // Vendedor autenticado pelo navegador nunca alterna para MODO ADMINISTRADOR
      setActiveViewState('vendedor');
      return;
    }
    setActiveViewState(view);
  };

  const switchUser = (userId: string) => {
    if (webPortalAuth) return; // Troca direta desabilitada quando conectado via chave web
    const target = users.find((u) => u.id === userId);
    if (target) {
      setCurrentUser(target);
      setActiveUserId(userId);
      if (target.role === 'waiter' || target.role === 'cashier') {
        setActiveViewState('vendedor');
      } else {
        setActiveViewState('admin');
      }
      addAuditLog({
        tenantId: currentTenant.id,
        userId: target.id,
        userName: target.name,
        action: 'ALTERACAO_PERFIL_MATRIZ',
        details: `Operador ativo alterado para ${target.name} (${target.role})`,
      });
    }
  };

  const createUser = (userData: {
    name: string;
    email: string;
    phone?: string;
    role: UserRole;
    commissionRate?: number;
    salesTargetMonthly?: number;
    permissions?: Partial<UserPermission>;
  }): UserProfile => {
    const basePerms = DEFAULT_PERMISSIONS[userData.role] || DEFAULT_PERMISSIONS.waiter;
    const newUser: UserProfile = {
      id: `user-${Date.now()}`,
      tenantId: currentTenant.id,
      name: userData.name,
      email: userData.email,
      phone: userData.phone,
      role: userData.role,
      active: true,
      canSell: true,
      status: 'autorizado',
      commissionRate: userData.commissionRate ?? (userData.role === 'waiter' ? 5 : 0),
      salesTargetMonthly: userData.salesTargetMonthly ?? 15000,
      permissions: {
        ...basePerms,
        ...(userData.permissions || {}),
      },
      createdAt: new Date().toISOString(),
      isDemo: false,
    };

    saveUser(newUser);
    const updated = getUsers(currentTenant.id);
    setUsers(updated);

    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'Administrador',
      action: 'CRIOU_USUARIO',
      details: `Cadastrou o colaborador ${newUser.name} com cargo de ${newUser.role}`,
    });

    return newUser;
  };

  const updateUser = (user: UserProfile) => {
    saveUser(user);
    const updated = getUsers(currentTenant.id);
    setUsers(updated);
    if (currentUser?.id === user.id) {
      setCurrentUser(user);
    }

    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'Administrador',
      action: 'ATUALIZOU_USUARIO',
      details: `Atualizou os dados/permissões de ${user.name}`,
    });
  };

  const deleteUser = (userId: string) => {
    const target = users.find((u) => u.id === userId);
    removeUserFromStorage(userId);
    const updated = getUsers(currentTenant.id);
    setUsers(updated);

    if (currentUser?.id === userId && updated.length > 0) {
      setCurrentUser(updated[0]);
      setActiveUserId(updated[0].id);
    }

    if (target) {
      addAuditLog({
        tenantId: currentTenant.id,
        userId: currentUser?.id || 'admin',
        userName: currentUser?.name || 'Administrador',
        action: 'REMOVEU_USUARIO',
        details: `Removeu o colaborador ${target.name}`,
      });
    }
  };

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Google Sign-In Error:', error);
    }
  };

  const logout = () => {
    if (webPortalAuth) {
      logoutWebPortal();
      return;
    }
    signOut(auth).catch(() => {});
    if (users.length > 0) {
      setCurrentUser(users[0]);
      setActiveUserId(users[0].id);
    }
  };

  const isAdm = webPortalAuth
    ? webPortalAuth.session.mode === 'admin'
    : currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const isWaiter = currentUser?.role === 'waiter';
  const isCashier = currentUser?.role === 'cashier';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        users,
        firebaseUser,
        isAdm,
        isWaiter,
        isCashier,
        activeView,
        setActiveView,
        isWebPortal,
        webPortalAuth,
        wsConnected,
        wsRevision,
        revokedMessage,
        clearRevokedMessage: () => setRevokedMessage(null),
        switchUser,
        createUser,
        updateUser,
        deleteUser,
        loginWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};
