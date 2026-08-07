// frontend/src/components/VideoStream.tsx - Otimizado para MJPEG Stream Nativo
import React, { useEffect, useRef, useState, useCallback, memo } from "react";
import { motion } from "framer-motion";
import { Play, Camera, Wifi } from "lucide-react";

interface Props {
  src: string;
}

interface StreamStats {
  fps: number;
  frameCount: number;
  bytesReceived: number;
  lastUpdate: number;
  latency: number;
}

function VideoStream({ src }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "error" | "waiting"
  >("connecting");
  const [currentSource, setCurrentSource] = useState<"webcam" | "ip_camera">(
    "webcam"
  );
  const [ipUrl, setIpUrl] = useState<string>("");
  const [cacheBuster, setCacheBuster] = useState<number>(Date.now());
  const [streamStats, setStreamStats] = useState<StreamStats>({
    fps: 0,
    frameCount: 0,
    bytesReceived: 0,
    lastUpdate: Date.now(),
    latency: 0,
  });

  // Refs para controle de performance
  const frameCountRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const fpsCalculationRef = useRef<{ lastTime: number; lastCount: number }>({
    lastTime: Date.now(),
    lastCount: 0,
  });

  // Timer para verificar status do stream
  const statusCheckRef = useRef<number | null>(null);

  // Função otimizada para calcular FPS e latência
  const updateStats = useCallback(() => {
    const now = Date.now();
    frameCountRef.current++;

    // Calcular latência (tempo entre frames)
    if (lastFrameTimeRef.current > 0) {
      const latency = now - lastFrameTimeRef.current;
      setStreamStats((prev) => ({ ...prev, latency }));
    }
    lastFrameTimeRef.current = now;

    // Calcular FPS a cada segundo
    const fpsCalc = fpsCalculationRef.current;
    if (now - fpsCalc.lastTime >= 1000) {
      const fps =
        ((frameCountRef.current - fpsCalc.lastCount) * 1000) /
        (now - fpsCalc.lastTime);

      setStreamStats((prev) => ({
        ...prev,
        fps: Math.round(fps * 10) / 10,
        frameCount: frameCountRef.current,
        lastUpdate: now,
        bytesReceived: prev.bytesReceived + 25000, // Estimativa otimizada para FPS alto
      }));

      fpsCalc.lastTime = now;
      fpsCalc.lastCount = frameCountRef.current;
    }
  }, []);

  // Função para verificar status do stream
  const checkStreamStatus = useCallback(async () => {
    try {
      const apiBase = (import.meta as any).env?.VITE_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiBase}/camera/status`);
      if (response.ok) {
        const data = await response.json();
        if (data.stream_enabled) {
          setConnectionStatus("connected");
        } else {
          setConnectionStatus("waiting");
        }
        if (data.current_source === "ip_camera") {
          setCurrentSource("ip_camera");
        } else {
          setCurrentSource("webcam");
        }
        if (typeof data.ip_url === "string") {
          setIpUrl(data.ip_url);
        }
      }
    } catch (error) {
      // Ignorar erro
    }
  }, []);

  // Configuração otimizada do stream MJPEG
  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    setConnectionStatus("connecting");
    frameCountRef.current = 0;
    lastFrameTimeRef.current = 0;

    const img = imgRef.current;
    if (!img) return;

    // Handlers otimizados para MJPEG stream
    const handleLoad = () => {
      setIsLoading(false);
      setHasError(false);

      // Verificar status do stream após carregar
      checkStreamStatus();

      updateStats();
    };

    const handleError = () => {
      setIsLoading(false);
      setHasError(true);
      setConnectionStatus("error");
      // Ignorar erro
    };

    // Configurar para stream MJPEG contínuo (força reconexão com cache-buster)
    const url = new URL(src);
    url.searchParams.set("cb", String(cacheBuster));
    img.src = url.toString();

    // Event listeners otimizados
    img.addEventListener("load", handleLoad, { passive: true });
    img.addEventListener("error", handleError, { passive: true });

    // Iniciar verificação periódica do status
    statusCheckRef.current = setInterval(checkStreamStatus, 2000); // Verificar a cada 2 segundos

    // Cleanup
    return () => {
      img.removeEventListener("load", handleLoad);
      img.removeEventListener("error", handleError);
      if (statusCheckRef.current) {
        clearInterval(statusCheckRef.current);
      }
    };
  }, [src, updateStats, checkStreamStatus, cacheBuster]);

  // Função para retry manual
  const handleRetry = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    setConnectionStatus("connecting");
    frameCountRef.current = 0;
    lastFrameTimeRef.current = 0;

    const img = imgRef.current;
    if (img) {
      setCacheBuster(Date.now());
    }
  }, [src]);

  // Quando a fonte atual muda, força reconexão do <img>
  useEffect(() => {
    setCacheBuster(Date.now());
  }, [currentSource, ipUrl]);

  // Função para formatar bytes
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <motion.div
      className="relative border-4 border-cyan-400 rounded-xl overflow-hidden shadow-2xl mx-auto max-w-4xl bg-[#020617]"
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
    >
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-[#020617] flex items-center justify-center z-30">
          <div className="text-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-400 mx-auto mb-4"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-cyan-400 text-xs font-mono">
                  {frameCountRef.current}
                </div>
              </div>
            </div>
            <p className="text-cyan-400 text-sm font-medium">
              Conectando ao stream MJPEG...
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Aguardando detecções visuais
            </p>
          </div>
        </div>
      )}

      {/* Waiting for Stream Release Overlay */}
      {connectionStatus === "waiting" && (
        <div className="absolute inset-0 bg-[#020617] flex items-center justify-center z-30">
          <div className="text-center max-w-md px-6">
            <div className="text-yellow-400 text-6xl mb-4">⏸️</div>
            <h3 className="text-yellow-400 text-lg font-semibold mb-2">
              Stream Aguardando Liberação
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              O stream está conectado mas aguarda liberação. Use os controles de
              câmera para iniciar o stream.
            </p>
            <div className="flex items-center justify-center gap-2 text-yellow-300">
              <Play className="w-4 h-4" />
              <span className="text-sm">Clique em "Iniciar Stream"</span>
            </div>
            <button
              onClick={checkStreamStatus}
              className="mt-4 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded-lg transition"
            >
              🔄 Verificar Status
            </button>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {hasError && (
        <div className="absolute inset-0 bg-[#020617] flex items-center justify-center z-30">
          <div className="text-center max-w-md px-6">
            <div className="text-red-400 text-6xl mb-4">📹</div>
            <h3 className="text-red-400 text-lg font-semibold mb-2">
              Stream Indisponível
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              Não foi possível conectar ao stream MJPEG. Verifique se o backend
              está rodando.
            </p>
            <div className="space-y-2">
              <button
                onClick={handleRetry}
                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition"
              >
                🔄 Tentar Novamente
              </button>
              <p className="text-xs text-gray-500">
                Backend deve estar em: http://localhost:8000
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Video Image - Otimizado para MJPEG */}
      <img
        ref={imgRef}
        alt="Stream de detecção em tempo real"
        className={`w-full block transition-all duration-300 ${
          isLoading || hasError || connectionStatus === "waiting"
            ? "opacity-0"
            : "opacity-100"
        }`}
        style={{
          maxHeight: "600px",
          objectFit: "contain",
          backgroundColor: "#020617",
          imageRendering: "auto", // Melhor para vídeo
        }}
        onLoad={updateStats}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
          setConnectionStatus("error");
        }}
        loading="eager"
        decoding="async"
        crossOrigin="anonymous" // Para CORS se necessário
      />

      {/* Badge de fonte atual */}
      <div className="absolute top-3 left-3 z-40">
        <div className="px-3 py-1 rounded-full bg-black/60 border border-white/10 backdrop-blur text-xs text-white flex items-center gap-2">
          {currentSource === "ip_camera" ? (
            <Wifi className="w-3 h-3" />
          ) : (
            <Camera className="w-3 h-3" />
          )}
          <span>
            {currentSource === "ip_camera" ? "IP Camera" : "Webcam"}
          </span>
          {currentSource === "ip_camera" && ipUrl && (
            <span className="text-[10px] text-gray-300 max-w-[240px] truncate">
              {ipUrl}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Memoizar para não re-renderizar quando o pai atualizar
export default memo(VideoStream);
