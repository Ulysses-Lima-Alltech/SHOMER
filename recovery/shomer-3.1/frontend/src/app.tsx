// frontend/src/App.tsx - Versão Integrada com Autenticação e Roteamento
import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { User } from "lucide-react";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Demo from "./components/Demo";
import AuthPage from "./components/AuthPage";
import {
  useRealtimeStats,
  exportLog,
  checkHealth,
  validateToken,
  getUserFromToken,
} from "./api";

interface User {
  id: string;
  username: string;
  email: string;
  createdAt: string;
}

interface AppState {
  user: User | null;
  backendHealth: "checking" | "healthy" | "unhealthy";
  lastHealthCheck: Date | null;
  exportStatus: "idle" | "exporting" | "success" | "error";
}

// Componente para o Dashboard principal (apenas para usuários autenticados)
function Dashboard({
  appState,
  onLogout,
  onExport,
  performHealthCheck,
}: {
  appState: AppState;
  onLogout: () => void;
  onExport: () => void;
  performHealthCheck: () => void;
}) {
  const { stats, performance, isConnected } = useRealtimeStats(
    appState.user ? 500 : 10000
  );

  const systemStatus =
    appState.user && (appState.backendHealth === "healthy" || isConnected)
      ? "operational"
      : "degraded";

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Navbar com info do usuário */}
      <Navbar user={appState.user!} onLogout={onLogout} />

      {/* Hero Section */}
      <Hero />

      {/* Demo/Dashboard Section */}
      <Demo
        stats={{
          current: stats.current,
          total_passed: stats.total_passed,
          tracking: stats.tracking,
        }}
        onExport={onExport}
        systemStatus={systemStatus}
        performance={performance}
        exportStatus={appState.exportStatus}
        backendFps={stats.fps || 0}
      />

      {/* Banner de Status do Sistema */}
      {systemStatus === "degraded" && (
        <motion.div
          className="bg-yellow-600/20 border-b border-yellow-500/30 px-6 py-2"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              <span className="text-yellow-200">
                {!isConnected
                  ? "Reconectando ao sistema..."
                  : "Backend em inicialização..."}
              </span>
            </div>
            <button
              className="text-yellow-100 underline hover:text-yellow-50 transition-colors"
              onClick={performHealthCheck}
            >
              Tentar novamente
            </button>
          </div>
        </motion.div>
      )}

      {/* Welcome Toast (apenas na primeira vez) */}
      {appState.user && !appState.lastHealthCheck && (
        <motion.div
          className="fixed bottom-6 right-6 bg-green-600/90 backdrop-blur-sm text-white px-6 py-4 rounded-xl shadow-lg z-50"
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 100 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <User className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold">Bem-vindo ao Shomer!</div>
              <div className="text-sm text-green-100">
                Login realizado como: {appState.user.username}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [appState, setAppState] = useState<AppState>({
    user: null,
    backendHealth: "checking",
    lastHealthCheck: null,
    exportStatus: "idle",
  });

  // Verificar token salvo no localStorage ao inicializar
  useEffect(() => {
    const token = localStorage.getItem("authToken");
    const userData = sessionStorage.getItem("shomer_user");

    if (token && validateToken(token) && userData) {
      try {
        const user = JSON.parse(userData);
        setUsername(user.username);
        setAppState((prev) => ({ ...prev, user }));
      } catch (error) {
        // Ignorar erro
        // Limpar dados inválidos
        localStorage.removeItem("authToken");
        sessionStorage.removeItem("shomer_user");
      }
    }
  }, []);

  // Health check apenas quando autenticado
  const performHealthCheck = async () => {
    if (!appState.user) return;

    try {
      const health = await checkHealth();
      setAppState((prev) => ({
        ...prev,
        backendHealth: "healthy",
        lastHealthCheck: new Date(),
      }));
    } catch (error) {
      setAppState((prev) => ({
        ...prev,
        backendHealth: "unhealthy",
        lastHealthCheck: new Date(),
      }));
    }
  };

  useEffect(() => {
    if (appState.user) {
      performHealthCheck();
      const interval = setInterval(performHealthCheck, 10000);
      return () => clearInterval(interval);
    }
  }, [appState.user]);

  // Handlers de autenticação
  const handleLogin = (user: User) => {
    setUsername(user.username);
    setAppState((prev) => ({ ...prev, user }));
  };

  const handleLogout = () => {
    setUsername(null);
    setAppState((prev) => ({ ...prev, user: null }));
    localStorage.removeItem("authToken");
    sessionStorage.removeItem("shomer_user");
  };

  // Handler de exportação
  const handleExport = async () => {
    setAppState((prev) => ({ ...prev, exportStatus: "exporting" }));
    try {
      await exportLog();
      setAppState((prev) => ({ ...prev, exportStatus: "success" }));
    } catch {
      setAppState((prev) => ({ ...prev, exportStatus: "error" }));
    } finally {
      setTimeout(
        () => setAppState((prev) => ({ ...prev, exportStatus: "idle" })),
        2000
      );
    }
  };

  return (
    <Routes>
      {/* Rota de autenticação - sempre acessível */}
      <Route
        path="/login"
        element={
          appState.user ? (
            <Navigate to="/demo" replace />
          ) : (
            <AuthPage onLogin={handleLogin} />
          )
        }
      />

      {/* Rota do dashboard - apenas para usuários autenticados */}
      <Route
        path="/demo"
        element={
          username ? (
            <Dashboard
              appState={appState}
              onLogout={handleLogout}
              onExport={handleExport}
              performHealthCheck={performHealthCheck}
            />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Redireciona raiz para login */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* Redireciona qualquer rota não encontrada */}
      <Route
        path="*"
        element={<Navigate to={username ? "/demo" : "/login"} replace />}
      />
    </Routes>
  );
}
