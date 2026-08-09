"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  clearSession,
  getOverview,
  getStoredUser,
  getToken,
  isSystemLive,
  SessionUser,
} from "../lib/api";
import { AlertIcon } from "./Icons";

type Appearance = "light" | "dark";
type Accent = "aurora" | "copper" | "lime" | "orchid";

const NAV_ITEMS: Array<{ href: string; label: string; enabled: boolean }> = [
  { href: "/", label: "Visão geral", enabled: true },
  { href: "/reports", label: "Relatórios", enabled: true },
  { href: "#monitoramento", label: "Monitoramento", enabled: false },
  { href: "#eventos", label: "Eventos", enabled: false },
  { href: "#dispositivos", label: "Dispositivos", enabled: false },
];

const STATUS_POLL_MS = 20_000;

export default function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [appearance, setAppearance] = useState<Appearance>("light");
  const [accent, setAccent] = useState<Accent>("aurora");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [statusKnown, setStatusKnown] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setUser(getStoredUser());
    setCheckingAuth(false);
  }, [router]);

  const pollStatus = useCallback(async () => {
    try {
      const overview = await getOverview();
      setLastEventAt(overview.lastEventAt);
      setStatusKnown(true);
    } catch {
      // Cada página trata seus próprios erros de fetch; o pill de status
      // simplesmente não atualiza neste ciclo.
    }
  }, []);

  useEffect(() => {
    if (checkingAuth) return;
    pollStatus();
    const interval = setInterval(pollStatus, STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [checkingAuth, pollStatus]);

  useEffect(() => {
    const savedAppearance = localStorage.getItem(
      "shomer-appearance",
    ) as Appearance | null;
    const savedAccent = localStorage.getItem("shomer-accent") as Accent | null;

    if (savedAppearance === "light" || savedAppearance === "dark") {
      setAppearance(savedAppearance);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setAppearance("dark");
    }

    if (
      savedAccent === "aurora" ||
      savedAccent === "copper" ||
      savedAccent === "lime" ||
      savedAccent === "orchid"
    ) {
      setAccent(savedAccent);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = appearance;
    document.documentElement.dataset.accent = accent;
    localStorage.setItem("shomer-appearance", appearance);
    localStorage.setItem("shomer-accent", accent);
  }, [appearance, accent]);

  function handleLogout() {
    clearSession();
    router.replace("/login");
  }

  if (checkingAuth) {
    return <div className="page-status">Verificando sessão...</div>;
  }

  const live = isSystemLive(lastEventAt);
  const initials = (user?.email || "??").slice(0, 2).toUpperCase();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <span>SHOMER</span>
        </div>

        <nav className="nav">
          {NAV_ITEMS.map((item) =>
            item.enabled ? (
              <Link
                key={item.label}
                href={item.href}
                className={`nav-item ${pathname === item.href ? "active" : ""}`}
              >
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                className="nav-item disabled"
                title="Em breve"
                disabled
              >
                {item.label}
              </button>
            ),
          )}
        </nav>

        <div className="top-actions">
          <span
            className={`status-pill ${live ? "live" : "offline"}`}
            title={
              lastEventAt
                ? `Último evento às ${new Date(lastEventAt).toLocaleTimeString("pt-BR")}`
                : "Nenhum evento recebido ainda"
            }
          >
            <span className="status-dot" />
            {live ? "Ao vivo" : "Sem sinal"}
          </span>

          <div className="accent-switcher">
            {(["aurora", "copper", "lime", "orchid"] as Accent[]).map((item) => (
              <button
                key={item}
                aria-label={`Tema ${item}`}
                className={`accent-dot accent-${item} ${
                  accent === item ? "selected" : ""
                }`}
                onClick={() => setAccent(item)}
              />
            ))}
          </div>

          <button
            className="theme-toggle"
            onClick={() =>
              setAppearance(appearance === "light" ? "dark" : "light")
            }
            aria-label="Alternar tema"
          >
            {appearance === "light" ? "☾" : "☼"}
          </button>

          <button className="avatar" onClick={handleLogout} title="Sair">
            {initials}
          </button>
        </div>
      </header>

      <section className="content">
        {statusKnown && !live && (
          <div className="alert-banner warning">
            <AlertIcon className="alert-banner-icon" />
            <div className="alert-banner-body">
              <strong>
                {lastEventAt ? "Sem dados recentes." : "Nenhum dado recebido ainda."}
              </strong>
              <span>
                {lastEventAt
                  ? `Último evento às ${new Date(lastEventAt).toLocaleTimeString("pt-BR")}. Verifique se o dispositivo edge está online.`
                  : "Verifique se o dispositivo edge está ligado e enviando eventos."}
              </span>
            </div>
          </div>
        )}

        {children}
      </section>
    </div>
  );
}
