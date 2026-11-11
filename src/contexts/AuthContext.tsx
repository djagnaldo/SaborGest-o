/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
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

interface AuthContextType {
  currentUser: UserProfile | null;
  users: UserProfile[];
  firebaseUser: FirebaseUser | null;
  isAdm: boolean;
  isWaiter: boolean;
  isCashier: boolean;
  activeView: 'admin' | 'vendedor';
  setActiveView: (view: 'admin' | 'vendedor') => void;
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
  const [activeView, setActiveView] = useState<'admin' | 'vendedor'>('admin');

  // Load users when current tenant changes
  useEffect(() => {
    if (!currentTenant?.id) return;
    const tenantUsers = getUsers(currentTenant.id);
    setUsers(tenantUsers);

    const activeId = getActiveUserId();
    const active = tenantUsers.find((u) => u.id === activeId) || tenantUsers[0] || null;
    setCurrentUser(active);

    if (active) {
      if (active.role === 'waiter' || active.role === 'cashier') {
        setActiveView('vendedor');
      } else {
        setActiveView('admin');
      }
    }
  }, [currentTenant?.id]);

  // Monitor Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user && currentTenant?.id) {
        // If this firebase user matches or needs linking
        const existing = users.find((u) => u.email.toLowerCase() === user.email?.toLowerCase());
        if (existing) {
          setCurrentUser(existing);
          setActiveUserId(existing.id);
        } else if (user.email === 'agnaldomix@gmail.com') {
          // Auto-attach bootstrap admin
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

  const switchUser = (userId: string) => {
    const target = users.find((u) => u.id === userId);
    if (target) {
      setCurrentUser(target);
      setActiveUserId(userId);
      // Auto-route view depending on permissions
      if (target.role === 'waiter' || target.role === 'cashier') {
        setActiveView('vendedor');
      } else {
        setActiveView('admin');
      }
      addAuditLog({
        tenantId: currentTenant.id,
        userId: target.id,
        userName: target.name,
        action: 'LOGIN_SIMULADO',
        details: `Usuário ativo alterado para ${target.name} (${target.role})`,
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
    signOut(auth).catch(() => {});
    if (users.length > 0) {
      // Return to first user
      setCurrentUser(users[0]);
      setActiveUserId(users[0].id);
    }
  };

  const isAdm = currentUser?.role === 'admin' || currentUser?.role === 'manager';
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
