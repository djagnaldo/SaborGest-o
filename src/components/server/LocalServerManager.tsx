/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Server,
  Wifi,
  Smartphone,
  Monitor,
  ShieldCheck,
  QrCode,
  Download,
  CheckCircle2,
  XCircle,
  Ban,
  RefreshCw,
  Copy,
  KeyRound,
  HardDrive,
  Users2,
  Clock,
  Radio,
  FileCode,
  AlertTriangle,
  Play,
  Pause,
  ExternalLink,
  ArrowRightLeft,
  ShieldAlert,
  Database,
  Lock,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  ConnectedDevice,
  DeviceStatus,
  LocalServerConfig,
  DatabaseBackupMetadata,
  MatrizInfo,
  MatrizHost,
  getLocalServerConfig,
  updateLocalServerConfig,
  getConnectedDevices,
  updateDeviceStatus,
  removeDevice,
  generateLocalBackup,
  getLocalBackups,
  registerNewDevice,
  getMatrizInfo,
  migrateMatriz,
} from '../../services/local-db';
import { formatDateTimeBR } from '../../utils/formatters';

interface LocalServerManagerProps {
  onSimulateDeviceSwitch?: (deviceType: 'android_adm' | 'windows_pc' | 'android_seller') => void;
}

export const LocalServerManager: React.FC<LocalServerManagerProps> = ({ onSimulateDeviceSwitch }) => {
  const { currentTenant } = useTenant();
  const { currentUser } = useAuth();

  const [config, setConfig] = useState<LocalServerConfig>(getLocalServerConfig());
  const [matriz, setMatriz] = useState<MatrizInfo>(getMatrizInfo());
  const [devices, setDevices] = useState<ConnectedDevice[]>(getConnectedDevices());
  const [backups, setBackups] = useState<DatabaseBackupMetadata[]>(getLocalBackups());
  const [copiedToken, setCopiedToken] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [migrationFeedback, setMigrationFeedback] = useState<string | null>(null);

  const [newSellerEmail, setNewSellerEmail] = useState('');
  const [newSellerName, setNewSellerName] = useState('');
  const [newSellerDeviceName, setNewSellerDeviceName] = useState('');

  const refreshData = () => {
    setConfig(getLocalServerConfig());
    setMatriz(getMatrizInfo());
    setDevices(getConnectedDevices());
    setBackups(getLocalBackups());
  };

  useEffect(() => {
    const handleSync = () => refreshData();
    window.addEventListener('sabor_local_sync', handleSync);
    return () => window.removeEventListener('sabor_local_sync', handleSync);
  }, []);

  const handleToggleServer = () => {
    const updated = updateLocalServerConfig({ isServerRunning: !config.isServerRunning });
    setConfig(updated);
  };

  const handleAuthorizeDevice = (deviceId: string) => {
    updateDeviceStatus(deviceId, 'authorized');
    refreshData();
  };

  const handleBlockDevice = (deviceId: string) => {
    updateDeviceStatus(deviceId, 'blocked');
    refreshData();
  };

  const handleRevokeDevice = (deviceId: string) => {
    updateDeviceStatus(deviceId, 'revoked');
    refreshData();
  };

  const handleCopyPairingCode = () => {
    const pairingPayload = `sabor://${config.serverIp}:${config.port}?token=${config.serverToken}`;
    navigator.clipboard.writeText(pairingPayload);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2500);
  };

  const handleDownloadBackup = () => {
    const { jsonContent, metadata } = generateLocalBackup(currentTenant.id);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = metadata.filename;
    a.click();
    URL.revokeObjectURL(url);
    refreshData();
  };

  // Executa migração controlada da Matriz (Celular <-> PC Windows)
  const handleExecuteMigration = (targetHost: MatrizHost) => {
    const targetName = targetHost === 'windows_pc'
      ? 'Computador Windows do Administrador (Dell Core i7)'
      : 'Celular Android do Administrador (Samsung Galaxy S23)';
    const targetIp = targetHost === 'windows_pc' ? '192.168.43.104' : '192.168.43.1';

    const result = migrateMatriz(
      targetHost,
      targetName,
      targetIp,
      currentUser?.name || 'Carlos Oliveira (Administrador)'
    );

    if (result.success) {
      setMigrationFeedback(
        `✓ ${result.message} Checksum de Integridade: ${result.checksum}. Total de tabelas migradas: ${result.recordCount}.`
      );
      refreshData();
      setTimeout(() => setShowMigrationModal(false), 3000);
    } else {
      alert(result.message);
    }
  };

  const handleDownloadWindowsInstaller = () => {
    const isPCMatriz = matriz.activeHost === 'windows_pc';
    const batScript = `@echo off
echo ========================================================
echo   SABOR GESTAO - ${isPCMatriz ? 'MATRIZ ADMINISTRATIVA' : 'TERMINAL BALCAO'} WINDOWS
echo ========================================================
echo.
echo Conectando ao Banco Local SQLite do Estabelecimento:
echo Host da Matriz: ${matriz.activeHostLabel}
echo IP de Acesso:  ${config.serverIp}
echo Porta Local:   ${config.port}
echo Token Mestre:  ${matriz.masterCryptographicToken.substring(0, 16)}...
echo.
echo Verificando conectividade na rede local Wi-Fi / Hotspot...
ping -n 1 ${config.serverIp} >nul
if %errorlevel% neq 0 (
  echo AVISO: Nao foi possivel comunicar com o IP ${config.serverIp}.
  echo Certifique-se de que o PC esta conectado no mesmo Wi-Fi ou Hotspot da Matriz!
) else (
  echo SUCESSO: Comunicacao com a Matriz ativa estabelecida!
)
echo.
echo Criando atalho no Desktop do Windows...
echo [InternetShortcut] > "%USERPROFILE%\\Desktop\\SaborGestao_${isPCMatriz ? 'Matriz' : 'Terminal'}.url"
echo URL=http://${config.serverIp}:${config.port} >> "%USERPROFILE%\\Desktop\\SaborGestao_${isPCMatriz ? 'Matriz' : 'Terminal'}.url"
echo.
echo Instalacao concluida com sucesso!
echo Abra o atalho na sua Area de Trabalho.
pause
`;
    const blob = new Blob([batScript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Instalar_SaborGestao_${isPCMatriz ? 'Matriz' : 'Terminal'}_Windows.bat`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSimulateNewRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSellerEmail || !newSellerName) return;

    registerNewDevice({
      deviceName: newSellerDeviceName || `Android (${newSellerName})`,
      deviceType: 'android_seller',
      ipAddress: `192.168.43.${Math.floor(Math.random() * 100 + 100)}`,
      userEmail: newSellerEmail,
      userName: newSellerName,
      role: 'waiter',
      status: 'pending',
      authToken: 'tok-req-' + Math.random().toString(36).substring(2, 8),
      appVersion: '2.4.0-localfirst',
      isOnline: true,
    });

    setNewSellerEmail('');
    setNewSellerName('');
    setNewSellerDeviceName('');
    refreshData();
  };

  const pendingDevices = devices.filter((d) => d.status === 'pending');
  const authorizedDevices = devices.filter((d) => d.status === 'authorized');

  return (
    <div className="space-y-6">
      {/* CARD PRINCIPAL: MATRIZ ADMINISTRATIVA & AUTORIDADE ÚNICA */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-stone-900 via-stone-800 to-amber-950 p-6 sm:p-8 text-white shadow-xl">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
              <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-400" />
              <span>MATRIZ ADMINISTRATIVA ATIVA • AUTORIDADE ÚNICA DOS DADOS</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleServer}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition shadow-sm ${
                  config.isServerRunning
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'bg-rose-600 text-white hover:bg-rose-500'
                }`}
              >
                {config.isServerRunning ? (
                  <>
                    <Pause className="h-3.5 w-3.5" /> Matriz Operando
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" /> Iniciar Matriz
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Identificação da Matriz Ativa */}
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {matriz.activeHost === 'android_phone' ? (
                    <Smartphone className="h-6 w-6" />
                  ) : (
                    <Monitor className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white">
                    {matriz.activeHostLabel}
                  </h1>
                  <p className="text-xs text-amber-300 font-medium">
                    {matriz.hostDeviceName} • IP Local: <strong>{matriz.ipAddress}:{matriz.port}</strong>
                  </p>
                </div>
              </div>

              <p className="mt-3 text-xs sm:text-sm text-stone-300 max-w-2xl leading-relaxed">
                Regra Fundamental de Integridade: Somente um dispositivo pode ser a matriz ativa de cada estabelecimento.
                A matriz detém autoridade central sobre produtos, preços, estoque, clientes e cancelamentos.
                Celulares de vendedores funcionam exclusivamente como terminais autorizados.
              </p>
            </div>

            {/* BOTÃO DE MIGRAÇÃO CONTROLADA */}
            <button
              onClick={() => setShowMigrationModal(true)}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-700 px-4 py-3 text-xs font-black uppercase text-white shadow-lg hover:from-amber-500 hover:to-amber-600 transition shrink-0 border border-amber-400/30 active:scale-98"
            >
              <ArrowRightLeft className="h-4 w-4" />
              <span>
                {matriz.activeHost === 'android_phone'
                  ? 'Migrar Matriz para PC Windows'
                  : 'Migrar Matriz para Celular Android'}
              </span>
            </button>
          </div>

          {/* Indicadores Técnicos da Matriz */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-white/10 p-3 backdrop-blur-md border border-white/10">
              <span className="text-[10px] text-stone-300 uppercase font-semibold">Autoridade Ativa</span>
              <p className="mt-0.5 text-xs font-bold text-emerald-400 truncate">
                {matriz.activeHost === 'android_phone' ? 'Celular Administrador' : 'Computador Windows'}
              </p>
            </div>

            <div className="rounded-xl bg-white/10 p-3 backdrop-blur-md border border-white/10">
              <span className="text-[10px] text-stone-300 uppercase font-semibold">Banco de Dados SQLite</span>
              <p className="mt-0.5 text-xs font-mono font-bold text-amber-300">
                v{matriz.databaseVersion} • Criptografado
              </p>
            </div>

            <div className="rounded-xl bg-white/10 p-3 backdrop-blur-md border border-white/10">
              <span className="text-[10px] text-stone-300 uppercase font-semibold">Rede Wi-Fi / Hotspot</span>
              <p className="mt-0.5 text-xs font-bold text-white truncate">{config.hotspotSsid}</p>
            </div>

            <div className="rounded-xl bg-white/10 p-3 backdrop-blur-md border border-white/10">
              <span className="text-[10px] text-stone-300 uppercase font-semibold">Terminais Pareados</span>
              <p className="mt-0.5 text-xs font-bold text-emerald-400">
                {authorizedDevices.length} autorizados
              </p>
            </div>
          </div>

          {/* Ações de Pareamento Rápido */}
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setShowQrModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-amber-500 transition"
            >
              <QrCode className="h-4 w-4" />
              QR Code de Pareamento dos Terminais
            </button>

            <button
              onClick={handleCopyPairingCode}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-md hover:bg-white/20 transition border border-white/10"
            >
              <Copy className="h-4 w-4 text-amber-400" />
              {copiedToken ? 'Código Copiado!' : 'Copiar Token de Conexão'}
            </button>

            <button
              onClick={handleDownloadWindowsInstaller}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-md hover:bg-white/20 transition border border-white/10"
            >
              <Download className="h-4 w-4 text-emerald-400" />
              Baixar Instalador Windows (.bat)
            </button>

            <button
              onClick={handleDownloadBackup}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-md hover:bg-white/20 transition border border-white/10"
            >
              <HardDrive className="h-4 w-4 text-amber-400" />
              Exportar Backup SQLite (Criptografado)
            </button>
          </div>
        </div>
      </div>

      {/* Dispositivos Aguardando Autorização (Aprovação Obrigatória pelo ADM) */}
      {pendingDevices.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/80 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <h3 className="font-bold text-sm">
                Solicitações de Acesso de Terminais Pendentes ({pendingDevices.length})
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-amber-800">
              Autorização exclusiva da Matriz
            </span>
          </div>

          <p className="text-xs text-amber-950 leading-relaxed">
            Novos funcionários que cadastraram seu e-mail pelo aplicativo do vendedor aguardam sua autorização
            para receber dados e registrar pedidos:
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pendingDevices.map((dev) => (
              <div
                key={dev.id}
                className="flex items-center justify-between rounded-xl border border-amber-200 bg-white p-3.5 shadow-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-stone-900 text-xs">{dev.userName || dev.userEmail}</span>
                    <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold text-amber-800">
                      Pendente
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500">{dev.userEmail} • IP: {dev.ipAddress}</p>
                  <p className="text-[10px] text-stone-400">Dispositivo: {dev.deviceName}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAuthorizeDevice(dev.id)}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Aprovar
                  </button>
                  <button
                    onClick={() => handleBlockDevice(dev.id)}
                    className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                    title="Rejeitar Solicitação"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid: Terminais Autorizados + Histórico de Migrações da Matriz */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Lado Esquerdo: Lista de Terminais Autorizados (7 colunas) */}
        <div className="space-y-4 lg:col-span-7">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">
                  Terminais Conectados à Matriz ({authorizedDevices.length})
                </h3>
              </div>
              <button
                onClick={refreshData}
                className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Atualizar
              </button>
            </div>

            <div className="mt-3 divide-y divide-stone-100">
              {authorizedDevices.map((dev) => {
                const isMasterDevice =
                  (matriz.activeHost === 'android_phone' && dev.deviceType === 'android_adm') ||
                  (matriz.activeHost === 'windows_pc' && dev.deviceType === 'windows_pc');

                return (
                  <div key={dev.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-xl text-white font-bold text-xs ${
                          isMasterDevice
                            ? 'bg-amber-600 shadow-sm'
                            : dev.deviceType === 'windows_pc'
                            ? 'bg-blue-600'
                            : 'bg-emerald-600'
                        }`}
                      >
                        {dev.deviceType === 'windows_pc' ? (
                          <Monitor className="h-4 w-4" />
                        ) : (
                          <Smartphone className="h-4 w-4" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-stone-900">{dev.deviceName}</p>
                          {isMasterDevice ? (
                            <span className="rounded-md bg-amber-100 px-1.5 py-0.2 text-[9px] font-black text-amber-900 uppercase">
                              MATRIZ ATIVA
                            </span>
                          ) : (
                            <span className="rounded-md bg-emerald-50 px-1.5 py-0.2 text-[9px] font-semibold text-emerald-700">
                              Terminal Autorizado
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-stone-400">
                          {dev.userEmail} • {dev.ipAddress} • v{dev.appVersion}
                        </p>
                      </div>
                    </div>

                    {!isMasterDevice && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleBlockDevice(dev.id)}
                          className="rounded-lg border border-stone-200 px-2 py-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-100"
                          title="Bloquear Terminal"
                        >
                          Bloquear
                        </button>
                        <button
                          onClick={() => handleRevokeDevice(dev.id)}
                          className="rounded-lg p-1 text-stone-400 hover:text-rose-600"
                          title="Remover Permissão"
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Lado Direito: Histórico de Migrações e Integridade (5 colunas) */}
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
              <Database className="h-4 w-4 text-amber-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">
                Auditoria de Migração da Matriz
              </h3>
            </div>

            <p className="mt-2 text-xs text-stone-500 leading-relaxed">
              Histórico rastreável de transferências de autoridade entre dispositivos com verificação de integridade SHA256:
            </p>

            <div className="mt-3 space-y-2">
              {matriz.migrationHistory.length > 0 ? (
                matriz.migrationHistory.map((mig) => (
                  <div
                    key={mig.id}
                    className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-stone-700 font-bold">
                      <span>{mig.fromHost} ➔ {mig.toHost}</span>
                      <span className="text-[10px] text-stone-400">{formatDateTimeBR(mig.timestamp)}</span>
                    </div>
                    <p className="text-[11px] text-stone-500">
                      Executado por: <strong>{mig.transferredBy}</strong>
                    </p>
                    <p className="text-[10px] font-mono text-emerald-700 font-bold">
                      Checksum: {mig.checksum} ({mig.totalRecords} tabelas migradas)
                    </p>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-xs text-stone-400 rounded-xl bg-stone-50 border border-dashed border-stone-200">
                  <Database className="h-6 w-6 mx-auto text-stone-300 mb-1" />
                  Nenhuma migração executada até o momento.
                  <p className="text-[10px] text-stone-400 mt-1">A Matriz original reside no celular Android.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DE MIGRAÇÃO CONTROLADA DA MATRIZ */}
      {showMigrationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-amber-600" />
                <h3 className="font-black text-stone-900 text-base">Migração da Matriz Administrativa</h3>
              </div>
              <button
                onClick={() => setShowMigrationModal(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs text-stone-600 leading-relaxed">
              <p>
                Você está prestes a transferir a <strong>Autoridade Central dos Dados</strong> para outro dispositivo físico do estabelecimento.
              </p>

              <div className="rounded-2xl bg-amber-50 p-3.5 border border-amber-200 space-y-1.5 text-amber-950">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <Lock className="h-4 w-4" />
                  <span>Garantia de Unicidade Absoluta:</span>
                </div>
                <p className="text-[11px]">
                  • O dispositivo anterior deixará de ser a Matriz e passará a operar como terminal.
                  <br />
                  • Todo o banco SQLite será empacotado e transferido com checksum criptográfico SHA256.
                  <br />
                  • É impossível a existência de duas matrizes ativas simultâneas.
                </p>
              </div>

              {migrationFeedback ? (
                <div className="rounded-xl bg-emerald-50 p-3 text-emerald-900 font-bold border border-emerald-200">
                  {migrationFeedback}
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  <p className="font-bold text-stone-800">Escolha o destino da nova Matriz:</p>

                  {matriz.activeHost === 'android_phone' ? (
                    <button
                      onClick={() => handleExecuteMigration('windows_pc')}
                      className="flex w-full items-center justify-between rounded-2xl border-2 border-stone-200 bg-white p-3.5 hover:border-amber-500 hover:bg-amber-50/40 transition text-left"
                    >
                      <div className="flex items-center gap-3">
                        <Monitor className="h-6 w-6 text-blue-600" />
                        <div>
                          <p className="font-bold text-stone-900 text-sm">Computador Windows do Administrador</p>
                          <p className="text-[11px] text-stone-500">PC Balcão • IP: 192.168.43.104</p>
                        </div>
                      </div>
                      <span className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs">
                        Tornar Matriz
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleExecuteMigration('android_phone')}
                      className="flex w-full items-center justify-between rounded-2xl border-2 border-stone-200 bg-white p-3.5 hover:border-amber-500 hover:bg-amber-50/40 transition text-left"
                    >
                      <div className="flex items-center gap-3">
                        <Smartphone className="h-6 w-6 text-emerald-600" />
                        <div>
                          <p className="font-bold text-stone-900 text-sm">Celular Android do Administrador</p>
                          <p className="text-[11px] text-stone-500">Samsung Galaxy S23 • IP: 192.168.43.1</p>
                        </div>
                      </div>
                      <span className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs">
                        Tornar Matriz
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowMigrationModal(false)}
                className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL QR CODE DE PAREAMENTO */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl text-center">
            <h3 className="text-base font-black text-stone-900">Pareamento de Terminal</h3>
            <p className="mt-1 text-xs text-stone-500">
              Aponte a câmera do aplicativo do vendedor para sincronizar com a Matriz:
            </p>

            {/* Simulação Visual do QR Code com SVG de Alta Fidelidade */}
            <div className="mt-4 mx-auto flex h-48 w-48 items-center justify-center rounded-2xl border-4 border-stone-900 bg-white p-3 shadow-inner">
              <svg viewBox="0 0 100 100" className="h-full w-full">
                <rect x="5" y="5" width="25" height="25" fill="#1c1917" rx="3" />
                <rect x="9" y="9" width="17" height="17" fill="white" rx="2" />
                <rect x="13" y="13" width="9" height="9" fill="#1c1917" />

                <rect x="70" y="5" width="25" height="25" fill="#1c1917" rx="3" />
                <rect x="74" y="9" width="17" height="17" fill="white" rx="2" />
                <rect x="78" y="13" width="9" height="9" fill="#1c1917" />

                <rect x="5" y="70" width="25" height="25" fill="#1c1917" rx="3" />
                <rect x="9" y="74" width="17" height="17" fill="white" rx="2" />
                <rect x="13" y="78" width="9" height="9" fill="#1c1917" />

                <rect x="35" y="10" width="8" height="8" fill="#d97706" />
                <rect x="48" y="10" width="12" height="6" fill="#1c1917" />
                <rect x="35" y="24" width="25" height="6" fill="#1c1917" />
                <rect x="10" y="38" width="8" height="12" fill="#1c1917" />
                <rect x="25" y="38" width="14" height="6" fill="#d97706" />
                <rect x="45" y="38" width="10" height="10" fill="#1c1917" />
                <rect x="62" y="38" width="12" height="8" fill="#1c1917" />
                <rect x="80" y="38" width="10" height="14" fill="#d97706" />

                <rect x="38" y="55" width="24" height="8" fill="#1c1917" />
                <rect x="42" y="70" width="12" height="16" fill="#d97706" />
                <rect x="62" y="55" width="8" height="20" fill="#1c1917" />
                <rect x="75" y="65" width="18" height="8" fill="#1c1917" />
                <rect x="75" y="80" width="12" height="12" fill="#1c1917" />
              </svg>
            </div>

            <div className="mt-4 rounded-xl bg-stone-50 p-3 border border-stone-200 text-left font-mono text-xs">
              <span className="block text-[10px] text-stone-400 uppercase font-sans font-semibold">
                Endereço da Matriz Ativa
              </span>
              <p className="font-bold text-stone-900">http://{config.serverIp}:{config.port}</p>
              <span className="block text-[10px] text-stone-400 uppercase font-sans font-semibold mt-2">
                Token de Autorização
              </span>
              <p className="font-bold text-amber-700 truncate">{config.serverToken}</p>
            </div>

            <button
              onClick={() => setShowQrModal(false)}
              className="mt-4 w-full rounded-xl bg-stone-900 py-2.5 text-xs font-bold text-white hover:bg-stone-800"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
