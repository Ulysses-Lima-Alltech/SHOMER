// frontend/src/api.ts - Cliente API Otimizado
import axios from "axios";

// Configurar axios com otimizações
const api = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_URL || "http://localhost:8000",
  timeout: 15000, // Aumentado para 15 segundos
  headers: {
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  },
});

// Interceptor para adicionar token JWT automaticamente
api.interceptors.request.use(
  (config) => {
    // Usar apenas cookie para maior segurança
    const token = getCookie("authToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Função para pegar cookie
function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

export interface Stats {
  current: number;
  total_passed: number;
  status?: string;
  fps?: number;
  timestamp?: string;
  cache_efficiency?: string;
  camera?: {
    current_source: string;
    stream_enabled: boolean;
  };
  tracking?: {
    total_entries: number;
    total_exits: number;
    current_persons: number;
    session_duration: number;
  };
}

export interface PerformanceStats {
  capture_fps: number;
  detection_fps: number;
  buffer_size: number;
  models_status: {
    yolo: boolean;
    face: boolean;
  };
  memory_usage: {
    total_detections: number;
    current_people: number;
  };
  detection_rate: {
    detections_per_second: number;
    total_detections: number;
    detection_efficiency: number;
  };
  camera?: {
    current_source: string;
    stream_enabled: boolean;
  };
}

export interface HealthCheck {
  status: string;
  detector: string;
  timestamp: string;
  camera?: {
    current_source: string;
    stream_enabled: boolean;
  };
}

export interface CameraStatus {
  current_source: string;
  stream_enabled: boolean;
  available_sources: string[];
  detector_ready: boolean;
  ip_url: string;
}

export interface CameraSwitchResponse {
  success: boolean;
  message: string;
  current_source: string;
  stream_enabled: boolean;
}

export interface StreamControlResponse {
  success: boolean;
  message: string;
  stream_enabled: boolean;
  current_source: string;
}

export interface UpdateIPPayload {
  ip_url: string;
}

export interface UpdateIPResponse {
  success: boolean;
  ip_url: string;
  current_source: string;
}

export interface Log {
  timestamp: string;
  count: number;
  details: Record<string, any>;
  created_at: string;
}

// Cache simples para evitar requests excessivos
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 10; // 10ms cache para stats (mínimo para debug)

function getCached<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data as T;
  }
  return null;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export async function fetchStats(): Promise<Stats> {
  const cacheKey = "stats";
  const cached = getCached<Stats>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const response = await api.get<Stats>("/stats");
    const stats = response.data;
    setCache(cacheKey, stats);
    return stats;
  } catch (error) {
    // Ignorar erro
    // Retornar dados padrão em caso de erro
    return {
      current: 0,
      total_passed: 0,
      status: "error",
      fps: 0,
    };
  }
}

export async function fetchPerformanceStats(): Promise<PerformanceStats | null> {
  try {
    const response = await api.get<PerformanceStats>("/performance");
    return response.data;
  } catch (error) {
    return null;
  }
}

export async function checkHealth(): Promise<HealthCheck | null> {
  try {
    const response = await api.get<HealthCheck>("/health");
    return response.data;
  } catch (error) {
    return null;
  }
}

export async function exportLog(): Promise<void> {
  try {
    const response = await api.get("/export_log.csv", {
      responseType: "blob",
      timeout: 10000, // Timeout maior para download
    });

    // Criar download automático
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.download = `shomer_log_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error("Falha ao exportar relatório");
  }
}

// Novas funções para controle de câmera
export async function getCameraStatus(): Promise<CameraStatus | null> {
  try {
    const response = await api.get<CameraStatus>("/camera/status");
    return response.data;
  } catch (error) {
    return null;
  }
}

export async function switchCamera(
  source: string
): Promise<CameraSwitchResponse | null> {
  try {
    const response = await api.post<CameraSwitchResponse>(
      "/camera/switch",
      null,
      {
        params: { source },
        timeout: 10000, // Timeout maior para troca de câmera
      }
    );
    return response.data;
  } catch (error) {
    throw new Error(`Falha ao trocar para ${source}`);
  }
}

export async function controlStream(
  action: "start" | "stop"
): Promise<StreamControlResponse | null> {
  try {
    const response = await api.post<StreamControlResponse>(
      "/stream/control",
      null,
      {
        params: { action },
        timeout: 5000,
      }
    );
    return response.data;
  } catch (error) {
    throw new Error(
      `Falha ao ${action === "start" ? "iniciar" : "parar"} stream`
    );
  }
}

// Atualiza URL da câmera IP
export async function updateIPCamera(
  payload: UpdateIPPayload
): Promise<UpdateIPResponse> {
  const response = await api.post<UpdateIPResponse>("/camera/ip", payload);
  return response.data;
}

/**
 * Busca os últimos logs do backend.
 */
export async function getLogs(limit = 100): Promise<Log[]> {
  try {
    const response = await api.get<Log[]>(`/logs?limit=${limit}`);
    return response.data;
  } catch (error) {
    throw new Error(
      `Erro ao buscar logs: ${
        error instanceof Error ? error.message : "Erro desconhecido"
      }`
    );
  }
}

// Hook personalizado para monitoramento contínuo
export function useRealtimeStats(intervalMs: number = 500) {
  const [stats, setStats] = React.useState<Stats>({
    current: 0,
    total_passed: 0,
    status: "connecting",
  });

  const [performance, setPerformance] = React.useState<PerformanceStats | null>(
    null
  );
  const [isConnected, setIsConnected] = React.useState(false);

  React.useEffect(() => {
    let statsInterval: number;
    let perfInterval: number;

    const updateStats = async () => {
      try {
        const newStats = await fetchStats();
        setStats(newStats);
        setIsConnected(true);
      } catch (error) {
        setIsConnected(false);
        setStats((prev) => ({ ...prev, status: "error" }));
      }
    };

    const updatePerformance = async () => {
      try {
        const perfStats = await fetchPerformanceStats();
        if (perfStats) {
          setPerformance(perfStats);
        }
      } catch (error) {
        // Ignorar erros de performance stats
      }
    };

    // Primeira atualização imediata
    updateStats();
    updatePerformance();

    // Intervals
    statsInterval = window.setInterval(updateStats, intervalMs);
    perfInterval = window.setInterval(updatePerformance, intervalMs * 4); // Performance a cada 2s

    return () => {
      window.clearInterval(statsInterval);
      window.clearInterval(perfInterval);
    };
  }, [intervalMs]);

  return { stats, performance, isConnected };
}

// Hook para controle de câmera
export function useCameraControl() {
  const [cameraStatus, setCameraStatus] = React.useState<CameraStatus | null>(
    null
  );
  const [isLoading, setIsLoading] = React.useState(false);

  const fetchCameraStatus = React.useCallback(async () => {
    try {
      const status = await getCameraStatus();
      setCameraStatus(status);
    } catch (error) {
      // Ignorar erro
    }
  }, []);

  const switchCameraSource = React.useCallback(
    async (source: string) => {
      setIsLoading(true);
      try {
        const result = await switchCamera(source);
        if (result) {
          await fetchCameraStatus(); // Atualizar status após troca
        }
        return result;
      } catch (error) {
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [fetchCameraStatus]
  );

  const toggleStream = React.useCallback(
    async (action: "start" | "stop") => {
      setIsLoading(true);
      try {
        const result = await controlStream(action);
        if (result) {
          await fetchCameraStatus(); // Atualizar status após controle
        }
        return result;
      } catch (error) {
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [fetchCameraStatus]
  );

  React.useEffect(() => {
    fetchCameraStatus();
  }, [fetchCameraStatus]);

  return {
    cameraStatus,
    isLoading,
    switchCameraSource,
    toggleStream,
    refreshStatus: fetchCameraStatus,
  };
}

// Importar React para o hook
import React from "react";

// Interfaces para autenticação
export interface LoginRequest {
  username: string; // Pode ser username ou email
  password: string;
}

export interface RegisterPayload {
  username: string;
  password: string;
  invitationToken: string;
  email?: string; // deixar opcional
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: {
    id: string;
    username: string;
    email: string;
    createdAt: string;
  };
}

// Funções de autenticação
export async function loginApi(payload: { username: string; password: string }) {
  const { data } = await api.post("/login", payload, {
    headers: { "Content-Type": "application/json" },
  });

  // Salva token em cookie
  document.cookie = `authToken=${data.access_token}; path=/; max-age=${30 * 60}; SameSite=Strict`;

  // Salva user no sessionStorage
  sessionStorage.setItem("shomer_user", JSON.stringify(data.user));
  return data;
}

// Funções para validação de token
export function validateToken(token: string): boolean {
  // opcional: decodificar e verificar expiração
  return true;
}

export function getUserFromToken(token: string): { username: string } {
  // decodifique o JWT ou armazene o nome no payload
  return { username: "usuario" };
}

export async function registerApi(payload: RegisterPayload) {
  const { data } = await api.post("/register", payload, {
    headers: { "Content-Type": "application/json" },
  });
  return data;
}

// Função para logout seguro
export function logout() {
  // Remove token do cookie
  document.cookie =
    "authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict";

  // Remove dados do usuário
  sessionStorage.removeItem("shomer_user");
}
