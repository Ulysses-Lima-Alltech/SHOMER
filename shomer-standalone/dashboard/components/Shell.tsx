"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
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

export type Appearance = "light" | "dark";
export type Accent =
  | "teal"
  | "blush"
  | "violet"
  | "sage"
  | "sunset"
  | "sky"
  | "slate";

// 7 tons deliberadamente diferentes entre si (não variações de um mesmo
// matiz): frios e quentes, claros e escuros, vívidos e discretos.
export const ACCENT_OPTIONS: Accent[] = [
  "teal",
  "blush",
  "violet",
  "sage",
  "sunset",
  "sky",
  "slate",
];

interface ThemeContextValue {
  appearance: Appearance;
  accent: Accent;
  setAppearance: (value: Appearance) => void;
  setAccent: (value: Accent) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Usado pela tela de Configurações pra editar aparência/cor de destaque —
 * o estado "de verdade" mora aqui no Shell, que já aplica no <html> e
 * persiste em localStorage. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme precisa estar dentro de <Shell>");
  return ctx;
}

interface NavItem {
  href: string;
  label: string;
  enabled: boolean;
  adminOnly?: boolean;
  // super_admin não tem loja própria — mapa de calor e eventos não fazem
  // sentido pra ele (são dados de uma câmera/loja específica).
  hideForSuperAdmin?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Visão geral", enabled: true },
  { href: "/reports", label: "Relatórios", enabled: true },
  { href: "/heatmap", label: "Mapa de calor", enabled: true, hideForSuperAdmin: true },
  { href: "/ao-vivo", label: "Validação ao vivo", enabled: true, hideForSuperAdmin: true },
  { href: "/eventos", label: "Eventos", enabled: true, hideForSuperAdmin: true },
  { href: "/admin", label: "Administração", enabled: true, adminOnly: true },
  { href: "/configuracoes", label: "Configurações", enabled: true },
];

const STATUS_POLL_MS = 20_000;
const BANNER_DISMISSED_KEY = "shomer-banner-dismissed";

export default function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [appearance, setAppearance] = useState<Appearance>(() => {
    if (typeof window === "undefined") return "light";
    const saved = localStorage.getItem("shomer-appearance") as Appearance | null;
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [accent, setAccent] = useState<Accent>(() => {
    if (typeof window === "undefined") return "teal";
    const saved = localStorage.getItem("shomer-accent") as Accent | null;
    return saved && ACCENT_OPTIONS.includes(saved) ? saved : "teal";
  });
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [statusKnown, setStatusKnown] = useState(false);
  // Persistido em sessionStorage (não em useState puro) porque cada página
  // monta sua própria <Shell> — sem isso, o aviso "voltava" a cada troca de
  // tela mesmo depois de fechado. sessionStorage zera sozinho ao fechar a
  // aba/navegador, e é limpo explicitamente no login/logout.
  const [bannerDismissed, setBannerDismissedState] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(BANNER_DISMISSED_KEY) === "true";
  });
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  function setBannerDismissed(value: boolean) {
    setBannerDismissedState(value);
    if (value) {
      sessionStorage.setItem(BANNER_DISMISSED_KEY, "true");
    } else {
      sessionStorage.removeItem(BANNER_DISMISSED_KEY);
    }
  }

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
    document.documentElement.dataset.theme = appearance;
    document.documentElement.dataset.accent = accent;
    localStorage.setItem("shomer-appearance", appearance);
    localStorage.setItem("shomer-accent", accent);
  }, [appearance, accent]);

  const live = isSystemLive(lastEventAt);

  // Rearma o aviso pra próxima vez que o sistema cair — se não, uma vez
  // fechado ele nunca mais avisaria de novo depois de ficar "ao vivo".
  useEffect(() => {
    if (live) setBannerDismissed(false);
  }, [live]);

  function handleLogout() {
    clearSession();
    router.replace("/login");
  }

  if (checkingAuth) {
    return <div className="page-status">Verificando sessão...</div>;
  }

  const initials = (user?.email || "??").slice(0, 2).toUpperCase();

  return (
    <ThemeContext.Provider value={{ appearance, accent, setAppearance, setAccent }}>
      <div className="app-shell">
        <header className="topbar">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- ícone estático simples, sem necessidade de otimização do next/image */}
            <img
              src={appearance === "dark" ? "/shomer/shomer-icon-branco.svg" : "/shomer/shomer-icon-preto.svg"}
              alt="SHOMER"
              className="brand-mark"
            />
            <span>SHOMER</span>
          </div>

          <nav className="nav">
            {NAV_ITEMS.filter(
              (item) =>
                (!item.adminOnly || user?.role !== "viewer") &&
                (!item.hideForSuperAdmin || user?.role !== "super_admin"),
            ).map((item) =>
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

            <button
              className="theme-toggle"
              onClick={() =>
                setAppearance(appearance === "light" ? "dark" : "light")
              }
              aria-label="Alternar tema"
            >
              {appearance === "light" ? "☾" : "☼"}
            </button>

            <div className="account-menu">
              <button
                className="avatar"
                onClick={() => setAccountMenuOpen((v) => !v)}
                title={user?.email ?? "Conta"}
              >
                {initials}
              </button>
              {accountMenuOpen && (
                <>
                  <div className="account-menu-backdrop" onClick={() => setAccountMenuOpen(false)} />
                  <div className="account-menu-dropdown">
                    <div className="account-menu-email">{user?.email}</div>
                    <Link
                      href="/minha-conta"
                      className="account-menu-item"
                      onClick={() => setAccountMenuOpen(false)}
                    >
                      Minha conta
                    </Link>
                    <button type="button" className="account-menu-item" onClick={handleLogout}>
                      Sair
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <section className="content">
          {statusKnown && !live && !bannerDismissed && (
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
              <button
                type="button"
                className="alert-banner-close"
                aria-label="Fechar aviso"
                onClick={() => setBannerDismissed(true)}
              >
                ×
              </button>
            </div>
          )}

          {children}
        </section>
      </div>
    </ThemeContext.Provider>
  );
}
