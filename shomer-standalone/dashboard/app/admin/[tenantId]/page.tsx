"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ApiError,
  createUser,
  DailySummary,
  deleteUser,
  getDaily,
  getStoredUser,
  getTenant,
  getUsers,
  ManagedUser,
  SessionUser,
  Tenant,
  updateUserEmail,
  updateUserPassword,
  UserRole,
} from "../../../lib/api";
import Shell from "../../../components/Shell";

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Admin global",
  tenant_admin: "Admin do cliente",
  viewer: "Somente leitura",
};

export default function TenantUsersPage() {
  const router = useRouter();
  const params = useParams<{ tenantId: string }>();
  const tenantId = params.tenantId;

  const [session, setSession] = useState<SessionUser | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [movement, setMovement] = useState<DailySummary | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("tenant_admin");
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, u, m] = await Promise.all([
        getTenant(tenantId),
        getUsers(tenantId),
        getDaily({ days: 30 }, tenantId),
      ]);
      setTenant(t);
      setUsers(u);
      setMovement(m);
      setLoadError(null);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
        setLoadError(
          err.status === 403
            ? "Você não tem acesso a este cliente."
            : "Cliente não encontrado.",
        );
        return;
      }
      setLoadError(err instanceof Error ? err.message : "Falha ao carregar dados do cliente.");
    }
  }, [tenantId]);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role === "viewer") {
      router.replace("/");
      return;
    }
    if (user.role === "tenant_admin" && user.tenantId !== tenantId) {
      router.replace(`/admin/${user.tenantId}`);
      return;
    }
    setSession(user);
    load();
  }, [router, load, tenantId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createUser({ email, password, role, tenantId });
      setEmail("");
      setPassword("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao criar acesso.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Remover este acesso?")) return;
    try {
      await deleteUser(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao remover acesso.");
    }
  }

  async function handleChangeEmail(id: number, currentEmail: string) {
    const newEmail = prompt(`Novo e-mail para ${currentEmail}:`, currentEmail);
    if (!newEmail || newEmail === currentEmail) return;
    try {
      await updateUserEmail(id, newEmail);
      setError(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao alterar o email.");
    }
  }

  async function handleChangePassword(id: number, email: string) {
    const newPassword = prompt(`Nova senha temporária para ${email} (mín. 8 caracteres):`);
    if (!newPassword) return;
    if (newPassword.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    try {
      await updateUserPassword(id, newPassword);
      setError(null);
      alert("Senha atualizada.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao alterar a senha.");
    }
  }

  if (!session) {
    return (
      <Shell>
        <div className="page-status">Carregando...</div>
      </Shell>
    );
  }

  if (loadError) {
    return (
      <Shell>
        <div className="page-status is-error">{loadError}</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="page-heading">
        <div>
          {session.role === "super_admin" && (
            <Link href="/admin" style={{ fontSize: 12, color: "var(--text-soft)" }}>
              ← Todos os clientes
            </Link>
          )}
          <span className="eyebrow">ADMINISTRAÇÃO</span>
          <h1>{tenant ? tenant.name : "Carregando..."}</h1>
          <p>Acessos ao dashboard deste cliente — isolados dos demais.</p>
        </div>
      </div>

      <section className="panel flow-panel">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">ACESSOS</span>
            <h2>Usuários de {tenant?.name ?? tenantId}</h2>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16, alignItems: "flex-end" }}
        >
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, gap: 4 }}>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, gap: 4 }}>
            Senha temporária
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, gap: 4 }}>
            Papel
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8 }}
            >
              <option value="tenant_admin">Admin do cliente</option>
              <option value="viewer">Somente leitura</option>
            </select>
          </label>
          <button type="submit" className="export-button" disabled={saving}>
            {saving ? "Criando..." : "Criar acesso"}
          </button>
        </form>

        {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}

        <div style={{ marginTop: 18, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-faint)" }}>
                <th style={{ padding: "8px 12px" }}>E-mail</th>
                <th style={{ padding: "8px 12px" }}>Papel</th>
                <th style={{ padding: "8px 12px" }}>Último acesso</th>
                <th style={{ padding: "8px 12px" }}>Senha alterada em</th>
                <th style={{ padding: "8px 12px" }} />
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u) => (
                <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 12px" }}>{u.email}</td>
                  <td style={{ padding: "8px 12px" }}>{ROLE_LABELS[u.role]}</td>
                  <td style={{ padding: "8px 12px", color: "var(--text-soft)" }}>
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("pt-BR") : "nunca acessou"}
                  </td>
                  <td style={{ padding: "8px 12px", color: "var(--text-soft)" }}>
                    {u.passwordChangedAt ? new Date(u.passwordChangedAt).toLocaleString("pt-BR") : "nunca alterada"}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      className="nav-item"
                      onClick={() => handleChangeEmail(u.id, u.email)}
                    >
                      Alterar email
                    </button>
                    <button
                      type="button"
                      className="nav-item"
                      onClick={() => handleChangePassword(u.id, u.email)}
                    >
                      Alterar senha
                    </button>
                    {u.id !== session.userId && (
                      <button
                        type="button"
                        className="nav-item"
                        style={{ color: "var(--danger, #c0392b)" }}
                        onClick={() => handleDelete(u.id)}
                      >
                        Remover
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users && users.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: "16px 12px", color: "var(--text-faint)" }}>
                    Nenhum acesso criado ainda para este cliente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel flow-panel" style={{ marginTop: 18 }}>
        <div className="panel-header">
          <div>
            <span className="panel-kicker">RESUMO PARA FOLLOW-UP</span>
            <h2>Movimento nos últimos 30 dias</h2>
            <p style={{ color: "var(--text-soft)", fontSize: 13, marginTop: 4 }}>
              Use isso pra saber se o cliente está ativo antes de ligar pra ele.
            </p>
          </div>
        </div>

        {!movement ? (
          <div className="kpi-grid" style={{ marginTop: 16 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="kpi-card skeleton" style={{ height: 110 }} />
            ))}
          </div>
        ) : movement.totalVisitors === 0 ? (
          <div className="empty-state" style={{ marginTop: 8 }}>
            <strong>Sem movimento registrado nos últimos 30 dias</strong>
            <span>O dispositivo edge desse cliente pode estar offline — vale um contato.</span>
          </div>
        ) : (
          <div className="kpi-grid" style={{ marginTop: 16 }}>
            <article className="kpi-card">
              <span className="kpi-label">Total de visitantes</span>
              <div className="kpi-value">{movement.totalVisitors.toLocaleString("pt-BR")}</div>
              <span className="kpi-context">últimos 30 dias</span>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Média diária</span>
              <div className="kpi-value">{movement.averagePerDay.toLocaleString("pt-BR")}</div>
              <span className="kpi-context">visitantes por dia</span>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Melhor dia</span>
              <div className="kpi-value">{movement.bestDay?.count.toLocaleString("pt-BR") ?? "—"}</div>
              <span className="kpi-context">
                {movement.bestDay ? new Date(`${movement.bestDay.date}T00:00:00`).toLocaleDateString("pt-BR") : "sem dados"}
              </span>
            </article>
          </div>
        )}
      </section>
    </Shell>
  );
}
