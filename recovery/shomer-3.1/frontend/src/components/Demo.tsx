// frontend/src/components/Demo.tsx - Totalmente Integrado
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Download, Wifi, WifiOff, Activity, Users, Zap } from "lucide-react";
import VideoStream from "./VideoStream";
import StatCard from "./StatCard";
import CameraControls from "./CameraControls";
import { PerformanceStats } from "../api";

interface Props {
  stats: {
    current: number;
    total_passed: number;
    tracking?: {
      total_entries: number;
      total_exits: number;
      current_persons: number;
      session_duration: number;
    };
  };
  onExport: () => void;
  systemStatus?: "operational" | "degraded";
  performance?: PerformanceStats | null;
  exportStatus?: "idle" | "exporting" | "success" | "error";
  backendFps?: number;
}

export default function Demo({
  stats,
  onExport,
  systemStatus = "operational",
  performance,
  exportStatus = "idle",
  backendFps = 0,
}: Props) {
  const [lastStatsUpdate, setLastStatsUpdate] = useState<Date>(new Date());

  // Atualizar timestamp quando stats mudam
  useEffect(() => {
    setLastStatsUpdate(new Date());
  }, [stats]);

  // Determinar status de conexão baseado em múltiplos fatores
  const connectionStatus =
    systemStatus === "operational" ? "connected" : "disconnected";

  const getConnectionIcon = () => {
    return connectionStatus === "connected" ? (
      <Wifi className="w-4 h-4 text-green-400" />
    ) : (
      <WifiOff className="w-4 h-4 text-red-400" />
    );
  };

  const getStatusText = () => {
    return connectionStatus === "connected"
      ? "Sistema Online"
      : "Sistema Offline";
  };

  const getStatusColor = () => {
    return connectionStatus === "connected" ? "text-green-400" : "text-red-400";
  };

  const handleExport = async () => {
    try {
      await onExport();
    } catch (error) {
      // Ignorar erro
    }
  };

  return (
    <section
      id="demo"
      className="w-full py-16 px-4 md:px-10 bg-gradient-to-b from-[#0f172a] to-[#020617] rounded-t-3xl shadow-inner mt-[-2rem] relative z-10"
    >
      <div className="max-w-6xl mx-auto">
        {/* Header com Status Integrado */}
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-cyan-400 mb-4">
            Detecção em Tempo Real
          </h2>

          {/* Status de Sistema Completo */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center justify-center gap-2">
              {getConnectionIcon()}
              <span className={`text-sm font-medium ${getStatusColor()}`}>
                {getStatusText()}
              </span>
            </div>

            <div className="text-xs text-gray-500">
              Última atualização: {lastStatsUpdate.toLocaleTimeString()}
            </div>
          </div>
        </motion.div>

        {/* Video Stream e Controles de Câmera */}
        <motion.div
          className="mb-12 grid grid-cols-1 lg:grid-cols-3 gap-6"
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          {/* Video Stream - Ocupa 2/3 da largura */}
          <div className="lg:col-span-2">
            {(() => {
              const apiUrl = (import.meta as any).env?.VITE_API_URL || "http://localhost:8000";
              return <VideoStream src={`${apiUrl}/video_feed`} />;
            })()}
          </div>

          {/* Controles de Câmera - Ocupa 1/3 da largura */}
          <div className="lg:col-span-1">
            <CameraControls />
          </div>
        </motion.div>

        {/* Stats Cards Melhoradas */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <StatCard
            label="Pessoas Detectadas"
            value={stats.current}
            icon={<Users className="w-5 h-5" />}
            color="text-blue-400"
            borderColor="border-blue-400/50"
          />

          <StatCard
            label="Total"
            value={stats.tracking?.total_entries || stats.total_passed || 0}
            icon={<Activity className="w-5 h-5" />}
            color="text-green-400"
            borderColor="border-green-400/50"
          />

          <StatCard
            label="Performance"
            value={Math.round(backendFps)}
            suffix=" FPS"
            icon={<Zap className="w-5 h-5" />}
            color={
              backendFps > 20
                ? "text-green-400"
                : backendFps > 15
                ? "text-yellow-400"
                : "text-red-400"
            }
            borderColor={
              backendFps > 20
                ? "border-green-400/50"
                : backendFps > 15
                ? "border-yellow-400/50"
                : "border-red-400/50"
            }
          />
        </motion.div>

        {/* Controls Integrados */}
        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          {/* Export Button com Status */}
          <button
            onClick={handleExport}
            disabled={
              connectionStatus === "disconnected" ||
              exportStatus === "exporting"
            }
            className={`group relative px-8 py-3 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center gap-2 ${
              exportStatus === "exporting"
                ? "bg-blue-600 animate-pulse"
                : exportStatus === "success"
                ? "bg-green-600"
                : exportStatus === "error"
                ? "bg-red-600"
                : connectionStatus === "connected"
                ? "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500"
                : "bg-gray-600"
            } text-white font-semibold`}
          >
            {exportStatus === "exporting" ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Exportando...</span>
              </>
            ) : exportStatus === "success" ? (
              <>
                <span className="text-lg">✅</span>
                <span>Exportado!</span>
              </>
            ) : exportStatus === "error" ? (
              <>
                <span className="text-lg">❌</span>
                <span>Erro</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Exportar Relatório</span>
              </>
            )}
          </button>

          {/* System Status Badge Detalhado */}
          <div
            className={`px-6 py-3 rounded-xl text-sm font-medium border flex items-center gap-2 ${
              connectionStatus === "connected"
                ? "bg-green-500/20 border-green-400/50 text-green-400"
                : "bg-red-500/20 border-red-400/50 text-red-400"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                connectionStatus === "connected"
                  ? "bg-green-400 animate-pulse"
                  : "bg-red-400"
              }`}
            ></div>
            {connectionStatus === "connected" ? (
              <span>🟢 Sistema Operacional</span>
            ) : (
              <span>🔴 Sistema Offline</span>
            )}
          </div>
        </motion.div>

        {/* Technical Info Footer */}
        <motion.div
          className="mt-12 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <div className="inline-flex items-center gap-6 px-8 py-4 bg-gray-800/30 backdrop-blur-sm rounded-xl border border-gray-700/30">
            <div className="text-sm text-gray-300">
              <span className="text-cyan-400 font-semibold">Engine:</span>{" "}
              YOLOv8 + InsightFace
            </div>
            <div className="w-px h-4 bg-gray-600"></div>
            <div className="text-sm text-gray-300">
              <span className="text-cyan-400 font-semibold">Precisão:</span>{" "}
              95%+
            </div>
            <div className="w-px h-4 bg-gray-600"></div>
            <div className="text-sm text-gray-300">
              <span className="text-cyan-400 font-semibold">Latência:</span>{" "}
              &lt;100ms
            </div>
            {performance && (
              <>
                <div className="w-px h-4 bg-gray-600"></div>
                <div className="text-sm text-gray-300">
                  <span className="text-cyan-400 font-semibold">Buffer:</span>{" "}
                  {performance.buffer_size}/1 frames
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
