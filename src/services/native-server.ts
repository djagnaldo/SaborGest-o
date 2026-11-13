/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface NativeServerStatus {
  running: boolean;
  port: number;
  primaryIp: string;
  lanIps: string[];
  urls: string[];
  webAccessEnabled: boolean;
  activeSessionsCount: number;
  revision: number;
  batteryOptimizationIgnored?: boolean;
  isNativeAndroid?: boolean;
  error?: string;
}

interface SaborLocalServerPluginInterface {
  startServer(options: {
    port?: number;
    seedSnapshot?: Record<string, any>;
  }): Promise<NativeServerStatus & { newlySeeded?: boolean }>;
  stopServer(): Promise<NativeServerStatus>;
  getStatus(): Promise<NativeServerStatus>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  requestBatteryOptimizationExemption(): Promise<{ ignoring: boolean; promptOpened?: boolean }>;
  addListener(
    eventName: 'serverStatusChanged',
    listenerFunc: (status: NativeServerStatus) => void
  ): Promise<PluginListenerHandle>;
}

const SaborLocalServer = registerPlugin<SaborLocalServerPluginInterface>('SaborLocalServer');

export function isAndroidNativeHost(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export async function getNativeServerStatus(): Promise<NativeServerStatus | null> {
  if (!isAndroidNativeHost()) return null;
  return SaborLocalServer.getStatus();
}

export async function startNativeServer(
  port = 3000,
  seedSnapshot?: Record<string, any>
): Promise<NativeServerStatus & { newlySeeded?: boolean }> {
  if (!isAndroidNativeHost()) {
    throw new Error('Servidor nativo Android disponível apenas no APK instalado.');
  }
  return SaborLocalServer.startServer({ port, seedSnapshot });
}

export async function stopNativeServer(): Promise<NativeServerStatus> {
  if (!isAndroidNativeHost()) {
    throw new Error('Servidor nativo Android disponível apenas no APK instalado.');
  }
  return SaborLocalServer.stopServer();
}

export async function requestNativeNotificationPermission(): Promise<boolean> {
  if (!isAndroidNativeHost()) return true;
  try {
    const res = await SaborLocalServer.requestNotificationPermission();
    return Boolean(res?.granted);
  } catch {
    return false;
  }
}

export async function requestNativeBatteryExemption(): Promise<{
  ignoring: boolean;
  promptOpened?: boolean;
}> {
  if (!isAndroidNativeHost()) return { ignoring: true };
  return SaborLocalServer.requestBatteryOptimizationExemption();
}

export async function subscribeNativeServerStatus(
  listener: (status: NativeServerStatus) => void
): Promise<() => void> {
  if (!isAndroidNativeHost()) return () => {};
  const handle = await SaborLocalServer.addListener('serverStatusChanged', listener);
  return () => {
    handle.remove().catch(() => {});
  };
}
