"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, changeOwnPassword, getStoredUser, SessionUser } from "../../lib/api";
import Shell from "../../components/Shell";

export default function MinhaContaPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    setSession(user);
  }, [router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 8) {
      setError("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("A confirmação não bate com a nova senha.");
      return;
    }

    setSaving(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao alterar a senha.");
    } finally {
      setSaving(false);
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
          <span className="eyebrow">MINHA CONTA</span>
          <h1>Sua conta.</h1>
        </div>
      </div>

      <section className="panel flow-panel" style={{ marginBottom: 18 }}>
        <div className="panel-header">
          <div>
            <span className="panel-kicker">IDENTIFICAÇÃO</span>
            <h2>E-mail</h2>
          </div>
        </div>
        <p style={{ marginTop: 12, fontSize: 14 }}>{session.email}</p>
        <p style={{ color: "var(--text-soft)", fontSize: 13, marginTop: 4 }}>
          Para trocar o e-mail de acesso, fale com o administrador do seu cliente.
        </p>
      </section>

      <section className="panel flow-panel">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">SEGURANÇA</span>
            <h2>Alterar senha</h2>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16, maxWidth: 340 }}
        >
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, gap: 4 }}>
            Senha atual
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, gap: 4 }}>
            Nova senha
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, gap: 4 }}>
            Repita a nova senha
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8 }}
            />
          </label>

          {error && <div className="login-error">{error}</div>}
          {success && !error && (
            <div style={{ color: "var(--accent)", fontSize: 13 }}>Senha alterada com sucesso.</div>
          )}

          <button type="submit" className="export-button" disabled={saving} style={{ alignSelf: "flex-start" }}>
            {saving ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      </section>
    </Shell>
  );
}
