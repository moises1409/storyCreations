// src/app/auth/auth.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, tap } from 'rxjs';

export interface User {
  id: number;
  email: string;
  name?: string | null;
  credits?: number;
}

const TOKEN_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';
const USER_KEY = 'user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  private _token: string | null = null;
  user$ = new BehaviorSubject<User | null>(null);

  // baseUrl la inicializamos desde AppComponent (o usa environments si prefieres)
  baseUrl = '';

  constructor() {
    // Restaura token/usuario si existen
    const t = sessionStorage.getItem(TOKEN_KEY);
    if (t) { this._token = t; this.scheduleProactiveRefresh(); }
    const u = sessionStorage.getItem(USER_KEY);
    if (u) this.user$.next(JSON.parse(u));
    const r = sessionStorage.getItem(REFRESH_KEY);
    if (r) this._refresh = r;
  }

  setBaseUrl(getApiUrl: (ep: string) => string) {
    this.baseUrl = getApiUrl('').replace(/\/$/, '');
  }

  get token(): string | null { return this._token; }
  set token(t: string | null) {
    this._token = t;
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
    this.scheduleProactiveRefresh();
  }

  private _refresh: string | null = null;
  get refreshToken(): string | null { return this._refresh; }
  set refreshToken(t: string | null) {
    this._refresh = t;
    if (t) sessionStorage.setItem(REFRESH_KEY, t);
    else sessionStorage.removeItem(REFRESH_KEY);
  }

  private setUser(user: User | null) {
    this.user$.next(user);
    if (user) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(USER_KEY);
  }

  signup(email: string, password: string, name?: string) {
    return this.http.post<any>(`${this.baseUrl}/auth/register`, { email, password, name })
      .pipe(tap(res => {
        if (res?.access_token) {
          this.token = res.access_token; // usa setter (persiste)
          if (res?.refresh_token) this.refreshToken = res.refresh_token;
          const user: User = { id: res.id, email: res.email, name: res.name ?? null, credits: res?.credits };
          this.setUser(user);
        }
      }));
  }

  login(email: string, password: string) {
    return this.http.post<any>(`${this.baseUrl}/auth/login`, { email, password })
      .pipe(tap(res => {
        if (res?.access_token) {
          this.token = res.access_token; // persiste
          if (res?.refresh_token) this.refreshToken = res.refresh_token;
          if (res.user) {
            const user: User = res.user;
            this.setUser(user);
          }
        }
      }));
  }

  requestPasswordReset(email: string) {
    const normalized = (email || '').trim().toLowerCase();
    return this.http.post<{ ok: boolean; reset_token?: string }>(`${this.baseUrl}/auth/forgot-password`, { email: normalized });
  }

  resetPassword(token: string, password: string) {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/auth/reset-password`, { token, password });
  }

  fetchMe() {
    return this.http.get<User>(`${this.baseUrl}/me`)
      .pipe(tap(u => this.setUser(u)));
  }

  logout() {
    this.token = null;     // limpia sessionStorage
    this.setUser(null);    // limpia sessionStorage
    this.refreshToken = null;
  }

  isAuthenticated(): boolean {
    return !!this._token;
  }

  refreshAccess() {
    if (!this.refreshToken) return this.http.post<any>(`${this.baseUrl}/auth/refresh`, { refresh_token: null });
    return this.http.post<any>(`${this.baseUrl}/auth/refresh`, { refresh_token: this.refreshToken })
      .pipe(tap(res => {
        if (res?.access_token) this.token = res.access_token;
        if (res?.refresh_token) this.refreshToken = res.refresh_token;
      }));
  }

  // ---- credits ----
  addCredits(plan: 'starter'|'pro'|'max'|null, credits?: number) {
    const body: any = {};
    if (plan) body.plan = plan;
    if (typeof credits === 'number') body.credits = credits;
    return this.http.post<{ ok: boolean; credits: number; user: User }>(`${this.baseUrl}/billing/add-credits`, body)
      .pipe(tap((res) => { if (res?.user) this.setUser(res.user); }));
  }

  // ---- proactive refresh ----
  private refreshTimerId: any;
  private scheduleProactiveRefresh() {
    if (this.refreshTimerId) { clearTimeout(this.refreshTimerId); this.refreshTimerId = null; }
    const exp = this.getTokenExp(this._token);
    if (!exp) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const lead = 60; // refresh 60s before expiry
    const delayMs = Math.max((exp - nowSec - lead) * 1000, 0);
    if (delayMs === 0) return;
    this.refreshTimerId = setTimeout(() => {
      this.refreshAccess().subscribe({ next: () => {}, error: () => {} });
    }, delayMs);
  }

  private getTokenExp(token: string | null): number | null {
    try {
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1] || ''));
      const exp = Number(payload?.exp);
      return Number.isFinite(exp) ? exp : null;
    } catch {
      return null;
    }
  }
}


