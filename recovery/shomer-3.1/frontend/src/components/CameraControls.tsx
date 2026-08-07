// frontend/src/components/CameraControls.tsx - Controles de Câmera Estilizados
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Camera, Video, VideoOff, Wifi, Monitor, Loader2 } from "lucide-react";
import { useCameraControl, updateIPCamera } from "../api";
import { Globe, Save } from "lucide-react";

interface Props {
  className?: string;
}

export default function CameraControls({ className = "" }: Props) {
  const {
    cameraStatus,
    isLoading,
    switchCameraSource,
    toggleStream,
    refreshStatus,
  } = useCameraControl();
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [ipUrl, setIpUrl] = useState<string>("");
  const [ipSaveMsg, setIpSaveMsg] = useState<string | null>(null);

  // Atualizar status automaticamente a cada 3 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      refreshStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, [refreshStatus]);

  useEffect(() => {
    if (cameraStatus?.ip_url) setIpUrl(cameraStatus.ip_url);
  }, [cameraStatus]);

  const handleCameraSwitch = async (source: string) => {
    setSwitchError(null);
    try {
      await switchCameraSource(source);
      // Aguardar um pouco e atualizar status
      setTimeout(() => {
        refreshStatus();
      }, 1000);
    } catch (error) {
      setSwitchError(
        `Erro ao trocar para ${source}: ${
          error instanceof Error ? error.message : "Erro desconhecido"
        }`
      );
    }
  };

  const handleStreamToggle = async () => {
    setStreamError(null);
    try {
      const action = cameraStatus?.stream_enabled ? "stop" : "start";
      await toggleStream(action);
      // Aguardar um pouco e atualizar status
      setTimeout(() => {
        refreshStatus();
      }, 1000);
    } catch (error) {
      setStreamError(
        `Erro ao ${
          cameraStatus?.stream_enabled ? "parar" : "iniciar"
        } stream: ${
          error instanceof Error ? error.message : "Erro desconhecido"
        }`
      );
    }
  };

  const normalizeUrl = (raw: string) => {
    let url = (raw || "").trim();
    if (!url) return url;
    if (!/^https?:\/\//i.test(url)) {
      url = `http://${url}`;
    }
    try {
      const u = new URL(url);
      if (!u.pathname || u.pathname === "/") {
        u.pathname = "/video";
      }
      return u.toString();
    } catch {
      // fallback simples
      if (url.endsWith("/")) return url + "video";
      if (!url.split("://")[1].includes("/")) return url + "/video";
      return url;
    }
  };

  const handleSaveIP = async (e: React.FormEvent) => {
    e.preventDefault();
    setIpSaveMsg(null);
    try {
      const normalized = normalizeUrl(ipUrl);
      if (!normalized) {
        setIpSaveMsg("Informe uma URL válida");
        return;
      }
      await updateIPCamera({ ip_url: normalized });
      setIpSaveMsg("URL salva. Você pode alternar para IP Camera.");
      setTimeout(() => setIpSaveMsg(null), 3000);
      // Atualiza status
      setTimeout(() => refreshStatus(), 500);
    } catch (error) {
      setIpSaveMsg(
        `Falha ao salvar URL: ${
          error instanceof Error ? error.message : "Erro desconhecido"
        }`
      );
    }
  };

  const getCurrentCameraIcon = () => {
    return cameraStatus?.current_source === "webcam" ? (
      <Monitor className="w-4 h-4" />
    ) : (
      <Wifi className="w-4 h-4" />
    );
  };

  const getCurrentCameraText = () => {
    return cameraStatus?.current_source === "webcam" ? "Webcam" : "IP Camera";
  };

  const getStreamButtonText = () => {
    if (isLoading) return "Carregando...";
    return cameraStatus?.stream_enabled ? "Parar Stream" : "Iniciar Stream";
  };

  const getStreamButtonIcon = () => {
    if (isLoading) return <Loader2 className="w-4 h-4 animate-spin" />;
    return cameraStatus?.stream_enabled ? (
      <VideoOff className="w-4 h-4" />
    ) : (
      <Video className="w-4 h-4" />
    );
  };

  return (
    <motion.div
      className={`bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h3 className="text-lg font-semibold text-cyan-400 mb-4 flex items-center gap-2">
        <Camera className="w-5 h-5" />
        Controles de Câmera
      </h3>

      {/* Status Atual */}
      <div className="mb-6 p-4 bg-gray-700/30 rounded-lg border border-gray-600/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getCurrentCameraIcon()}
            <div>
              <div className="text-sm text-gray-300">Câmera Atual</div>
              <div className="text-lg font-semibold text-white">
                {getCurrentCameraText()}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                cameraStatus?.stream_enabled
                  ? "bg-green-400 animate-pulse"
                  : "bg-red-400"
              }`}
            />
            <span className="text-sm text-gray-300">
              {cameraStatus?.stream_enabled ? "Stream Ativo" : "Stream Inativo"}
            </span>
          </div>
        </div>
      </div>

      {/* Botões de Troca de Câmera */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-300 mb-3">
          Trocar Câmera
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleCameraSwitch("webcam")}
            disabled={isLoading || cameraStatus?.current_source === "webcam"}
            className={`group relative px-4 py-3 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center gap-2 ${
              cameraStatus?.current_source === "webcam"
                ? "bg-blue-600/50 border border-blue-400/50"
                : "bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-gray-500"
            } text-white font-medium`}
          >
            <Monitor className="w-4 h-4" />
            <span>Webcam</span>
            {cameraStatus?.current_source === "webcam" && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full" />
            )}
          </button>

          <button
            onClick={() => handleCameraSwitch("ip_camera")}
            disabled={isLoading || cameraStatus?.current_source === "ip_camera"}
            className={`group relative px-4 py-3 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center gap-2 ${
              cameraStatus?.current_source === "ip_camera"
                ? "bg-purple-600/50 border border-purple-400/50"
                : "bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-gray-500"
            } text-white font-medium`}
          >
            <Wifi className="w-4 h-4" />
            <span>IP Camera</span>
            {cameraStatus?.current_source === "ip_camera" && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-400 rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* Campo para URL da IP Camera */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-300 mb-3">URL da IP Camera</h4>
        <form onSubmit={handleSaveIP} className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={ipUrl}
                onChange={(e) => setIpUrl(e.target.value)}
                placeholder="http://SEU_IP:PORT/video (ex: http://192.168.15.7:4747/video)"
                className="w-full bg-gray-800/60 border border-gray-700/60 rounded-lg px-10 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-2"
            >
              <Save className="w-4 h-4" /> Salvar
            </button>
          </div>
          {ipSaveMsg && (
            <div className="text-xs text-blue-300">{ipSaveMsg}</div>
          )}
        </form>
      </div>

      {/* Botão de Controle de Stream */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-300 mb-3">
          Controle de Stream
        </h4>
        <button
          onClick={handleStreamToggle}
          disabled={isLoading}
          className={`w-full group relative px-6 py-4 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-3 ${
            cameraStatus?.stream_enabled
              ? "bg-red-600 hover:bg-red-700 border border-red-500"
              : "bg-green-600 hover:bg-green-700 border border-green-500"
          } text-white font-semibold shadow-lg`}
        >
          {getStreamButtonIcon()}
          <span>{getStreamButtonText()}</span>
        </button>
      </div>

      {/* Informações da IP Camera */}
      {cameraStatus?.current_source === "ip_camera" && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="text-xs text-blue-300 font-medium mb-1">
            IP Camera URL
          </div>
          <div className="text-sm text-blue-200 font-mono break-all">
            {cameraStatus.ip_url}
          </div>
        </div>
      )}

      {/* Mensagens de Erro */}
      {switchError && (
        <motion.div
          className="mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
        >
          <div className="text-sm text-red-300">{switchError}</div>
        </motion.div>
      )}

      {streamError && (
        <motion.div
          className="mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
        >
          <div className="text-sm text-red-300">{streamError}</div>
        </motion.div>
      )}

      {/* Dicas de Uso */}
      <div className="mt-4 p-3 bg-gray-700/30 rounded-lg">
        <div className="text-xs text-gray-400">
          <div className="font-medium mb-1">💡 Dicas:</div>
          <ul className="space-y-1 text-xs">
            <li>• Troque de câmera a qualquer momento</li>
            <li>• O stream só é liberado após clicar em "Iniciar Stream"</li>
            <li>• IP Camera deve estar acessível na rede</li>
            <li>• Status atualiza automaticamente a cada 3s</li>
          </ul>
        </div>
      </div>
    </motion.div>
  );
}
