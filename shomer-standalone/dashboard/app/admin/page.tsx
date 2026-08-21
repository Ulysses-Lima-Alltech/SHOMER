"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ApiError,
  createTenant,
  deleteTenant,
  getStoredUser,
  getTenants,
  SessionUser,
  setTenantActive,
  TenantWithUserCount,
} from "../../lib/api";
import Shell from "../../components/Shell";

export default function AdminPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [tenants, setTenants] = useState<TenantWithUserCount[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setTenants(await getTenants());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar clientes.");
    }
  }, []);

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
    // tenant_admin não escolhe entre clientes — vai direto pro próprio.
    if (user.role === "tenant_admin" && user.tenantId) {
      router.replace(`/admin/${user.tenantId}`);
      return;
    }
    setSession(user);
    load();
  }, [router, load]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createTenant({ name });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao criar cliente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(tenant: TenantWithUserCount) {
    const goingInactive = tenant.active;
    const message = goingInactive
      ? `Inativar "${tenant.name}"? Os ${tenant.userCount} usuário(s) desse cliente não vão mais conseguir logar. Nada é apagado — dá pra reativar depois.`
      : `Reativar "${tenant.name}"? Os usuários desse cliente voltam a conseguir logar.`;
    if (!confirm(message)) return;
    try {
      await setTenantActive(tenant.id, !goingInactive);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao alterar status do cliente.");
    }
  }

  async function handleDelete(tenant: TenantWithUserCount) {
    const message =
      `Excluir "${tenant.name}" (código ${tenant.id}) definitivamente? ` +
      `Isso remove também os ${tenant.userCount} acesso(s) desse cliente. Essa ação não pode ser desfeita.`;
    if (!confirm(message)) return;
    try {
      await deleteTenant(tenant.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao excluir cliente.");
    }
  }

  if (!session) {
    return (
      <Shell>
        <div className="page-status">Carregando...</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRAÇÃO</span>
          <h1>Clientes.</h1>
          <p>
            Cada cliente é isolado — crie o cliente aqui e depois entre nele
            para gerenciar os acessos ao dashboard dele. O código do cliente
            é atribuído automaticamente.
          </p>
        </div>
      </div>

      <section className="panel flow-panel">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">NOVO CLIENTE</span>
            <h2>Criar cliente</h2>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16, alignItems: "flex-end" }}
        >
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, gap: 4 }}>
            Nome
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Loja Centro"
              required
              style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8 }}
            />
          </label>
          <button type="submit" className="export-button" disabled={saving}>
            {saving ? "Criando..." : "Criar cliente"}
          </button>
        </form>

        {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}

        <div style={{ marginTop: 18, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-faint)" }}>
                <th style={{ padding: "8px 12px" }}>Nome</th>
                <th style={{ padding: "8px 12px" }}>Código do cliente</th>
                <th style={{ padding: "8px 12px" }}>Usuários</th>
                <th style={{ padding: "8px 12px" }}>Status</th>
                <th style={{ padding: "8px 12px" }}>Criado em</th>
                <th style={{ padding: "8px 12px" }} />
              </tr>
            </thead>
            <tbody>
              {(tenants ?? []).map((t) => (
                <tr
                  key={t.id}
                  style={{ borderTop: "1px solid var(--border)", opacity: t.active ? 1 : 0.6 }}
                >
                  <td style={{ padding: "8px 12px" }}>{t.name}</td>
                  <td style={{ padding: "8px 12px", color: "var(--text-soft)" }}>{t.id}</td>
                  <td style={{ padding: "8px 12px", color: "var(--text-soft)" }}>{t.userCount}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span className={`status-pill ${t.active ? "live" : "offline"}`}>
                      <span className="status-dot" />
                      {t.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px", color: "var(--text-soft)" }}>
                    {new Date(t.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <Link href={`/admin/${t.id}`} className="nav-item">
                      Gerenciar acessos →
                    </Link>
                    <button type="button" className="nav-item" onClick={() => handleToggleActive(t)}>
                      {t.active ? "Inativar" : "Reativar"}
                    </button>
                    <button
                      type="button"
                      className="nav-item"
                      style={{ color: "var(--danger, #c0392b)" }}
                      onClick={() => handleDelete(t)}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {tenants && tenants.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "16px 12px", color: "var(--text-faint)" }}>
                    Nenhum cliente cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </Shell>
  );
}
