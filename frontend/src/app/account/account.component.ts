import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavComponent } from '../shared/nav.component';
import { HeaderComponent } from '../shared/header.component';
import { AccountDeleteModalComponent } from './account-delete-modal.component';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

@Component({
  standalone: true,
  selector: 'app-account',
  imports: [CommonModule, HttpClientModule, NavComponent, HeaderComponent, AccountDeleteModalComponent],
  template: `
    <app-nav></app-nav>
    <app-header></app-header>
    <div class="dashboard-container main-with-sidebar">
      <h1 class="title">Account</h1>
      <div class="page">
        <div class="tabs">
          <button class="tab" [class.active]="tab==='account'" (click)="tab='account'">Account</button>
          <button class="tab" [class.active]="tab==='billing'" (click)="tab='billing'">Billing</button>
        </div>

        <div class="panel" *ngIf="tab==='account'">
        <div class="profile-row">
          <div class="avatar lg">{{ initial }}</div>
          <div>
            <div class="name">{{ userName }}</div>
            <div class="email">{{ userEmail }}</div>
          </div>
        </div>

        <div class="field">
          <label>Name</label>
          <div class="input like">{{ userName }}</div>
        </div>
        <div class="field">
          <label>Email</label>
          <div class="input like">{{ userEmail }}</div>
        </div>

        <div class="actions">
          <button class="danger-btn" (click)="openDelete()">Delete account</button>
        </div>
        </div>

        <div class="panel" *ngIf="tab==='billing'">
          <table class="table" *ngIf="billing.length; else noBilling">
            <thead>
              <tr><th>Date</th><th>Credits added</th><th>Total credits</th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let r of billing">
                <td>{{ r.created_at | date:'medium' }}</td>
                <td>{{ r.added }}</td>
                <td>{{ r.total_after }}</td>
              </tr>
            </tbody>
          </table>
          <ng-template #noBilling><div class="empty">No billing data yet.</div></ng-template>
        </div>
        <app-account-delete-modal *ngIf="showDelete" (cancel)="showDelete=false" (confirmDelete)="confirmDelete($event)"></app-account-delete-modal>
      </div>
    </div>
  `,
  styles: [
    `
    .dashboard-container { padding: 2rem; width: 100%; margin: 0; }
    .dashboard-container.main-with-sidebar { padding-left: calc(var(--sidebar-width) + var(--sidebar-gap)); box-sizing: border-box; }
    @media (max-width: 900px) { .dashboard-container.main-with-sidebar { padding-left: 30px; } }

    .page { max-width: 820px; }
    .title { color: var(--white); font-size: 2rem; font-weight: 800; margin: 0 0 1rem 0; }
    .tabs { display:flex; gap: 0.5rem; margin-bottom: 1rem; }
    .tab { background: var(--medium-gray); color: var(--white); border:1px solid var(--light-gray); border-radius: 10px; padding: 0.4rem 0.8rem; cursor:pointer; }
    .tab.active, .tab:hover { border-color: var(--primary-green); }
    .panel { background: var(--medium-gray); border:1px solid var(--light-gray); border-radius: 16px; padding: 1rem; }
    .profile-row { display:flex; align-items:center; gap: 0.75rem; margin-bottom: 1rem; }
    .avatar.lg { width: 60px; height: 60px; border-radius: 50%; background: var(--dark-gray); color: var(--white); display:flex; align-items:center; justify-content:center; font-weight:800; font-size: 1.4rem; }
    .name { color: var(--white); font-weight: 800; }
    .email { color: var(--text-gray); }
    .field { margin: 0.75rem 0; }
    .field label { display:block; color: var(--text-gray); font-size: 0.9rem; margin-bottom: 0.25rem; }
    .input.like { background: var(--dark-gray); color: var(--white); border:1px solid var(--light-gray); border-radius: 10px; padding: 0.6rem 0.8rem; }
    .actions { margin-top: 1rem; display:flex; justify-content:flex-end; }
    .danger-btn { background: transparent; color: #ff6b6b; border:1px solid #ff6b6b; border-radius: 10px; padding: 0.5rem 0.9rem; cursor:pointer; }
    .danger-btn:hover { box-shadow: 0 0 0 3px rgba(255,107,107,0.2); }
    .empty { color: var(--text-gray); }
    .table { width:100%; border-collapse: collapse; }
    .table th, .table td { text-align:left; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--light-gray); color: var(--white); }
    .table th { color: var(--text-gray); font-weight: 600; }
    `
  ]
})
export class AccountComponent {
  private auth = inject(AuthService);
  private http = inject(HttpClient);
  private router = inject(Router);
  tab: 'account'|'billing' = 'account';
  showDelete = false;
  billing: Array<{ id:number; added:number; total_after:number; created_at:string|null }> = [];

  get userName(): string { return (this.auth.user$.value?.name || this.auth.user$.value?.email || '').trim(); }
  get userEmail(): string { return this.auth.user$.value?.email || ''; }
  get initial(): string { const s = this.userName || this.userEmail; return (s?.trim()?.charAt(0) || 'U').toUpperCase(); }

  openDelete() { this.showDelete = true; }
  confirmDelete(payload: { choice?: string; text?: string }) {
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.http.request('DELETE', `${this.auth.baseUrl}/account`, { body: { reason_choice: payload?.choice, reason_text: payload?.text }, headers })
      .subscribe({
        next: () => { this.auth.logout(); this.router.navigateByUrl('/'); },
        error: () => { this.showDelete = false; },
        complete: () => { this.showDelete = false; }
      });
  }
  ngOnInit() { this.loadBilling(); }
  loadBilling() {
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.http.get<Array<{ id:number; added:number; total_after:number; created_at:string|null }>>(`${this.auth.baseUrl}/billing/credit-additions`, { headers })
      .subscribe({ next: (rows) => this.billing = rows || [] });
  }
}


