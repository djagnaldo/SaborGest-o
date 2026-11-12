/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utilitário de Notificações Android / Web para Alertas de Mesas
 * Respeita as permissões do dispositivo e opera em primeiro e segundo plano.
 */

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    const perm = await Notification.requestPermission();
    return perm;
  } catch (err) {
    console.warn('Erro ao solicitar permissão de notificações:', err);
    return 'denied';
  }
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}

export function sendTableExpiredNotification(tableName: string, minutes: number): void {
  // 1. Vibração tátil no dispositivo Android (padrão de alerta de salão)
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([300, 150, 300, 150, 500]);
    } catch {
      // Ignora erro se vibração não estiver autorizada pelo navegador
    }
  }

  // 2. Notificação nativa / web do sistema operacional (Android / Chrome / PWA)
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const title = `⚠️ TEMPO ESGOTADO — ${tableName}`;
      const options: NotificationOptions = {
        body: `O temporizador de ${minutes} min da ${tableName} atingiu o limite. Verifique o atendimento da mesa.`,
        icon: '/favicon.ico',
        tag: `table-timer-${tableName}`,
        requireInteraction: true,
      };

      if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready
          .then((registration) => {
            registration.showNotification(title, options).catch(() => {
              new Notification(title, options);
            });
          })
          .catch(() => {
            new Notification(title, options);
          });
      } else {
        new Notification(title, options);
      }
    } catch (err) {
      console.warn('Não foi possível exibir notificação em segundo plano:', err);
    }
  }
}
