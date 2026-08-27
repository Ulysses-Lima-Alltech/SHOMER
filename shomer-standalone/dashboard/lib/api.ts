const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const TOKEN_KEY = "shomer-token";
const USER_KEY = "shomer-user";

export type UserRole = "super_admin" | "tenant_admin" | "viewer";

export interface SessionUser {
  userId: number;
  email: string;
  role: UserRole;
  tenantId: string | null;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as SessionUser) : null;
}

function setSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  // Cada login deve começar com o aviso "Sem dados recentes" re-armado.
  sessionStorage.removeItem("shomer-banner-dismissed");
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      clearSession();
    }
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    const message =
      typeof body.message === "string" ? body.message : `Erro ${res.status}`;
    throw new ApiError(res.status, message);
  }

  return res.status === 204 ? (undefined as T) : res.json();
}

export interface LoginResponse {
  accessToken: string;
  user: SessionUser & { id?: number };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const result = await request<{
    accessToken: string;
    user: { id: number; email: string; role: UserRole; tenantId: string | null };
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  const user: SessionUser = {
    userId: result.user.id,
    email: result.user.email,
    role: result.user.role,
    tenantId: result.user.tenantId,
  };
  setSession(result.accessToken, user);
  return { accessToken: result.accessToken, user };
}

export interface Tenant {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
}

export interface TenantWithUserCount extends Tenant {
  userCount: number;
}

export function getTenants(): Promise<TenantWithUserCount[]> {
  return request<TenantWithUserCount[]>("/tenants");
}

export function getTenant(id: string): Promise<Tenant> {
  return request<Tenant>(`/tenants/${encodeURIComponent(id)}`);
}

export function createTenant(data: { name: string }): Promise<Tenant> {
  return request<Tenant>("/tenants", { method: "POST", body: JSON.stringify(data) });
}

export function setTenantActive(id: string, active: boolean): Promise<Tenant> {
  return request<Tenant>(`/tenants/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });
}

export function deleteTenant(id: string): Promise<void> {
  return request<void>(`/tenants/${encodeURIComponent(id)}?confirm=true`, { method: "DELETE" });
}

export interface ManagedUser {
  id: number;
  email: string;
  role: UserRole;
  tenantId: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
}

export function getUsers(tenantId?: string): Promise<ManagedUser[]> {
  const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
  return request<ManagedUser[]>(`/users${qs}`);
}

export function createUser(data: {
  email: string;
  password: string;
  role: UserRole;
  tenantId?: string | null;
}): Promise<ManagedUser> {
  return request<ManagedUser>("/users", { method: "POST", body: JSON.stringify(data) });
}

export function deleteUser(id: number): Promise<void> {
  return request<void>(`/users/${id}`, { method: "DELETE" });
}

export function updateUserPassword(id: number, password: string): Promise<void> {
  return request<void>(`/users/${id}/password`, {
    method: "PATCH",
    body: JSON.stringify({ password }),
  });
}

export function updateUserEmail(id: number, email: string): Promise<ManagedUser> {
  return request<ManagedUser>(`/users/${id}/email`, {
    method: "PATCH",
    body: JSON.stringify({ email }),
  });
}

export function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  return request<void>("/auth/me/password", {
    method: "PATCH",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export interface OverviewStats {
  visitorsToday: number;
  currentOccupancy: number;
  peakToday: number;
  peakHour: number | null;
  entriesToday: number;
  exitsToday: number;
  lastEventAt: string | null;
}

export interface HourlyPoint {
  hour: number;
  count: number;
}

export interface MovementBucket {
  period: string;
  label: "Baixo" | "Médio" | "Alto";
  value: number;
}

export interface DailyPoint {
  date: string;
  count: number;
}

export interface DailySummary {
  days: DailyPoint[];
  totalVisitors: number;
  averagePerDay: number;
  bestDay: DailyPoint | null;
}

export function getOverview(): Promise<OverviewStats> {
  return request<OverviewStats>("/stats/overview");
}

export function getHourly(): Promise<HourlyPoint[]> {
  return request<HourlyPoint[]>("/stats/hourly");
}

export interface Last24HourPoint {
  bucketStart: string;
  count: number;
}

/** Volume por hora numa janela deslizante das últimas 24h (não reseta à
 * meia-noite como getHourly — sempre mostra as 24h mais recentes). */
export function getLast24Hours(tenantId?: string): Promise<Last24HourPoint[]> {
  const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
  return request<Last24HourPoint[]>(`/stats/last-24h${qs}`);
}

export function getMovement(): Promise<MovementBucket[]> {
  return request<MovementBucket[]>("/stats/movement");
}

/** Período de um relatório: ou um número de dias terminando hoje (botões
 * rápidos 7/15/30), ou um intervalo de datas explícito (filtro customizado). */
export interface ReportPeriod {
  days?: number;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
}

export function periodLabel(period: ReportPeriod): string {
  if (period.from && period.to) {
    const f = new Date(`${period.from}T00:00:00`).toLocaleDateString("pt-BR");
    const t = new Date(`${period.to}T00:00:00`).toLocaleDateString("pt-BR");
    return `${f} a ${t}`;
  }
  return `últimos ${period.days ?? 7} dias`;
}

function periodQuery(period: ReportPeriod): string {
  if (period.from && period.to) {
    return `from=${encodeURIComponent(period.from)}&to=${encodeURIComponent(period.to)}`;
  }
  return `days=${period.days ?? 7}`;
}

export function getDaily(period: ReportPeriod, tenantId?: string): Promise<DailySummary> {
  const qs = tenantId ? `&tenantId=${encodeURIComponent(tenantId)}` : "";
  return request<DailySummary>(`/stats/daily?${periodQuery(period)}${qs}`);
}

export function getHourlyPattern(period: ReportPeriod, tenantId?: string): Promise<HourlyPoint[]> {
  const qs = tenantId ? `&tenantId=${encodeURIComponent(tenantId)}` : "";
  return request<HourlyPoint[]>(`/stats/hourly-pattern?${periodQuery(period)}${qs}`);
}

export interface DailyHourlyRow {
  date: string;
  hours: number[];
}

export function getDailyHourlyMatrix(period: ReportPeriod, tenantId?: string): Promise<DailyHourlyRow[]> {
  const qs = tenantId ? `&tenantId=${encodeURIComponent(tenantId)}` : "";
  return request<DailyHourlyRow[]>(`/stats/daily-hourly-matrix?${periodQuery(period)}${qs}`);
}

export interface HeatmapCell {
  x: number;
  y: number;
  count: number;
}

export interface HeatmapResult {
  gridSize: number;
  cells: HeatmapCell[];
  maxCount: number;
  totalPoints: number;
  from: string;
  to: string;
}

export interface EdgeHealthStatus {
  edgeDeviceId: string | null;
  cameraId: string | null;
  status: string | null;
  cameraConnected: boolean | null;
  modelReady: boolean | null;
  framesProcessed: number | null;
  personsCurrent: number | null;
  lastFrameAt: string | null;
  lastError: string | null;
  reportedAt: string | null;
}

export function getEdgeHealth(): Promise<EdgeHealthStatus> {
  return request<EdgeHealthStatus>("/stats/edge-health");
}

export interface TenantSummary {
  tenantId: string;
  tenantName: string;
  active: boolean;
  userCount: number;
  createdAt: string;
  visitorsInPeriod: number;
  lastEventAt: string | null;
}

export function getTenantSummaries(period: ReportPeriod = { days: 30 }): Promise<TenantSummary[]> {
  return request<TenantSummary[]>(`/stats/tenant-summaries?${periodQuery(period)}`);
}

export interface EventLogEntry {
  eventId: string;
  timestamp: string;
  type: string;
  payload: Record<string, unknown>;
}

export function getEvents(params: { type?: string; limit?: number } = {}): Promise<EventLogEntry[]> {
  const query = new URLSearchParams();
  if (params.type) query.set("type", params.type);
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return request<EventLogEntry[]>(`/stats/events${qs ? `?${qs}` : ""}`);
}

export function getHeatmap(params: {
  from?: string;
  to?: string;
  cameraId?: string;
  gridSize?: number;
} = {}): Promise<HeatmapResult> {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.cameraId) query.set("cameraId", params.cameraId);
  if (params.gridSize) query.set("gridSize", String(params.gridSize));
  const qs = query.toString();
  return request<HeatmapResult>(`/stats/heatmap${qs ? `?${qs}` : ""}`);
}

export interface CameraOption {
  id: string;
  label: string;
}

export function getCameras(): Promise<CameraOption[]> {
  return request<CameraOption[]>("/stats/cameras");
}

/** Status ao vivo do edge (persons_current, entries/exits, camera_connected
 * etc.) de uma câmera - forma solta pq o shape vem direto do VisionStats do
 * edge (ver vision/models.py), não vale a pena duplicar a interface aqui. */
export function getCameraStatus(cameraId?: string): Promise<Record<string, unknown>> {
  const qs = cameraId ? `?cameraId=${encodeURIComponent(cameraId)}` : "";
  return request<Record<string, unknown>>(`/stats/camera-status${qs}`);
}

/**
 * Abre o stream MJPEG (multipart/x-mixed-replace) de detecção ao vivo de
 * uma câmera - lê como vídeo contínuo, não fotos atualizando num intervalo.
 * Não dá pra usar <img src="URL do stream"> direto porque a API exige o
 * header Authorization (a tag <img> não manda headers customizados), então
 * isso faz um fetch manual e faz o parsing do multipart HTTP na mão,
 * entregando cada frame como um blob: URL via onFrame - quem chamar deve
 * revogar a URL anterior antes de usar a nova (mesmo cuidado do
 * getSnapshotBlobUrl). Retorna uma função de limpeza que fecha a conexão.
 */
export function openDebugStream(
  cameraId: string | undefined,
  onFrame: (blobUrl: string) => void,
  onError: (message: string) => void,
): () => void {
  const controller = new AbortController();
  const token = getToken();
  const qs = cameraId ? `?cameraId=${encodeURIComponent(cameraId)}` : "";
  const HEADER_END = "\r\n\r\n";
  const decoder = new TextDecoder();

  (async () => {
    try {
      const res = await fetch(`${API_URL}/stats/debug-stream${qs}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        onError(`Erro ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      let buffer = new Uint8Array(0);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          const merged = new Uint8Array(buffer.length + value.length);
          merged.set(buffer);
          merged.set(value, buffer.length);
          buffer = merged;
        }

        // Extrai quantos frames completos já estiverem no buffer.
        for (;;) {
          const headSlice = buffer.subarray(0, Math.min(buffer.length, 300));
          const headerEndIdx = decoder.decode(headSlice).indexOf(HEADER_END);
          if (headerEndIdx === -1) break; // header ainda não chegou por completo

          const headerText = decoder.decode(buffer.subarray(0, headerEndIdx));
          const lengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
          if (!lengthMatch) {
            buffer = buffer.subarray(headerEndIdx + HEADER_END.length);
            continue;
          }

          const contentLength = parseInt(lengthMatch[1], 10);
          const frameStart = headerEndIdx + HEADER_END.length;
          const frameEnd = frameStart + contentLength;
          if (buffer.length < frameEnd) break; // corpo do frame ainda não chegou por completo

          const frameBytes = buffer.slice(frameStart, frameEnd);
          onFrame(URL.createObjectURL(new Blob([frameBytes], { type: "image/jpeg" })));
          buffer = buffer.subarray(frameEnd);
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        onError("Conexão com a câmera perdida");
      }
    }
  })();

  return () => controller.abort();
}

/**
 * Snapshot ao vivo de uma câmera, via proxy autenticado da API (o edge só
 * existe na rede local de quem roda o serviço - o navegador do cliente não
 * alcança direto). debug=true pede a versão com bounding boxes desenhadas
 * (verde = contado, vermelho = filtrado como objeto estático). Retorna um
 * blob: URL para usar em <img src>; quem chamar deve revogar com
 * URL.revokeObjectURL quando não precisar mais.
 */
export async function getSnapshotBlobUrl(
  options: { cameraId?: string; debug?: boolean } = {},
): Promise<string> {
  const token = getToken();
  const query = new URLSearchParams();
  if (options.cameraId) query.set("cameraId", options.cameraId);
  if (options.debug) query.set("debug", "true");
  const qs = query.toString();
  const res = await fetch(`${API_URL}/stats/snapshot${qs ? `?${qs}` : ""}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      clearSession();
    }
    throw new ApiError(res.status, `Erro ${res.status}`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export interface ManagedDevice {
  id: number;
  tenantId: string;
  name: string;
  edgeDeviceId: string | null;
  cameraId: string | null;
  active: boolean;
  createdAt: string;
}

export function getDevices(tenantId?: string): Promise<ManagedDevice[]> {
  const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
  return request<ManagedDevice[]>(`/devices${qs}`);
}

export function createDevice(data: {
  name: string;
  edgeDeviceId?: string;
  cameraId?: string;
  tenantId?: string;
}): Promise<ManagedDevice> {
  return request<ManagedDevice>("/devices", { method: "POST", body: JSON.stringify(data) });
}

export function deleteDevice(id: number): Promise<void> {
  return request<void>(`/devices/${id}`, { method: "DELETE" });
}

export interface LineCrossingPoint {
  x: number;
  y: number;
}

export interface CameraLineCrossing {
  enabled: boolean;
  pointA: LineCrossingPoint;
  pointB: LineCrossingPoint;
  enterDirection: "A_TO_B" | "B_TO_A";
}

export function getAllLineCrossings(tenantId: string): Promise<Record<string, CameraLineCrossing>> {
  return request<Record<string, CameraLineCrossing>>(
    `/tenants/${encodeURIComponent(tenantId)}/line-crossing`,
  );
}

export function getLineCrossing(
  tenantId: string,
  cameraId: string,
): Promise<CameraLineCrossing | null> {
  return request<CameraLineCrossing | null>(
    `/tenants/${encodeURIComponent(tenantId)}/line-crossing/${encodeURIComponent(cameraId)}`,
  );
}

export function setLineCrossing(
  tenantId: string,
  cameraId: string,
  data: CameraLineCrossing,
): Promise<CameraLineCrossing> {
  return request<CameraLineCrossing>(
    `/tenants/${encodeURIComponent(tenantId)}/line-crossing/${encodeURIComponent(cameraId)}`,
    { method: "PATCH", body: JSON.stringify(data) },
  );
}

export interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

export interface OperatingHours {
  timezone: string;
  enabled: boolean;
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
}

export function getOperatingHours(tenantId: string): Promise<OperatingHours | null> {
  return request<OperatingHours | null>(`/tenants/${encodeURIComponent(tenantId)}/hours`);
}

export function setOperatingHours(tenantId: string, hours: OperatingHours): Promise<OperatingHours> {
  return request<OperatingHours>(`/tenants/${encodeURIComponent(tenantId)}/hours`, {
    method: "PATCH",
    body: JSON.stringify(hours),
  });
}

export interface StoreLayoutPoint {
  x: number;
  y: number;
}

export interface StoreBarrier {
  id: string;
  label: string;
  points: StoreLayoutPoint[];
}

export function getStoreLayout(tenantId: string): Promise<StoreBarrier[]> {
  return request<StoreBarrier[]>(`/tenants/${encodeURIComponent(tenantId)}/store-layout`);
}

export function setStoreLayout(tenantId: string, barriers: StoreBarrier[]): Promise<StoreBarrier[]> {
  return request<StoreBarrier[]>(`/tenants/${encodeURIComponent(tenantId)}/store-layout`, {
    method: "PATCH",
    body: JSON.stringify({ barriers }),
  });
}

/** true se o último evento chegou há menos de `staleMinutes` minutos. */
export function isSystemLive(lastEventAt: string | null, staleMinutes = 3): boolean {
  if (!lastEventAt) return false;
  const diffMs = Date.now() - new Date(lastEventAt).getTime();
  return diffMs < staleMinutes * 60_000;
}

export { ApiError };
