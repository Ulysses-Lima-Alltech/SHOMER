const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const TOKEN_KEY = "shomer-token";
const USER_KEY = "shomer-user";

export interface SessionUser {
  userId: number;
  email: string;
  role: string;
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
    user: { id: number; email: string; role: string };
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  const user: SessionUser = {
    userId: result.user.id,
    email: result.user.email,
    role: result.user.role,
  };
  setSession(result.accessToken, user);
  return { accessToken: result.accessToken, user };
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

export function getMovement(): Promise<MovementBucket[]> {
  return request<MovementBucket[]>("/stats/movement");
}

export function getDaily(days: number): Promise<DailySummary> {
  return request<DailySummary>(`/stats/daily?days=${days}`);
}

export function getHourlyPattern(days: number): Promise<HourlyPoint[]> {
  return request<HourlyPoint[]>(`/stats/hourly-pattern?days=${days}`);
}

/** true se o último evento chegou há menos de `staleMinutes` minutos. */
export function isSystemLive(lastEventAt: string | null, staleMinutes = 3): boolean {
  if (!lastEventAt) return false;
  const diffMs = Date.now() - new Date(lastEventAt).getTime();
  return diffMs < staleMinutes * 60_000;
}

export { ApiError };
