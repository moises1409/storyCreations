import { Component, ElementRef, HostListener, OnDestroy, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ModalService } from '../auth/modal.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="app-header main-with-sidebar">
      <div class="header-content" #host>
        <div class="spacer"></div>
        <ng-container *ngIf="auth.isAuthenticated(); else loginBtn">
          <div class="profile-wrap">
            <button class="profile-btn" aria-label="Profile menu" aria-haspopup="menu" [attr.aria-expanded]="isProfileOpen" aria-controls="profile-menu" (click)="toggleProfile()">
              <span class="avatar">{{ initial }}</span>
            </button>
            <div class="dropdown" id="profile-menu" role="menu" *ngIf="isProfileOpen" [@fadeSlide]>
              <div class="caret"></div>
              <div class="menu-inner">
                <div class="user-row" tabindex="-1" #firstEl>
                  <div class="avatar lg">{{ initial }}</div>
                  <div class="user-meta">
                    <div class="name">{{ userName }}</div>
                    <div class="email">{{ userEmail }}</div>
                  </div>
                </div>
                <button class="menu-btn cta" type="button" role="menuitem" (click)="onAddCredits()">Add credits</button>
                <div class="divider"></div>
                <div class="credits-row">
                  <span>Remaining credits</span>
                  <strong>{{ userCredits }}</strong>
                </div>
                <div class="divider"></div>
                <button class="menu-btn" type="button" role="menuitem" (click)="onAccount()">Account</button>
                <div class="divider"></div>
                <button class="menu-btn danger" type="button" role="menuitem" (click)="onLogout()">Logout</button>
              </div>
            </div>
          </div>
        </ng-container>
        <ng-template #loginBtn>
          <button class="login-btn" (click)="openLogin()">Login</button>
        </ng-template>
      </div>
    </header>
  `,
  styles: [
    `
    .app-header { 
      position: sticky; 
      top: 0; 
      z-index: 500; 
      background: linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0));
      padding: 0.5rem 1rem; 
      backdrop-filter: blur(4px);
    }
    .header-content { 
      display: flex; 
      align-items: center; 
    }
    .spacer { flex: 1; }
    .profile-wrap { position: relative; }
    .profile-btn { 
      display: inline-flex; 
      align-items: center; 
      justify-content: center; 
      width: 36px; height: 36px; border-radius: 50%; 
      border: 1px solid var(--light-gray); 
      background: var(--medium-gray); 
      color: var(--white); 
      cursor: pointer; 
      transition: border-color 0.2s ease, box-shadow 0.2s ease; 
    }
    .profile-btn:hover { 
      border-color: var(--primary-green); 
      box-shadow: 0 0 0 3px rgba(0,255,136,0.12); 
    }
    .avatar { width: 22px; height: 22px; border-radius: 50%; background: var(--dark-gray); color: var(--white); display:flex; align-items:center; justify-content:center; font-weight:700; }
    .avatar.lg { width: 40px; height: 40px; font-size: 1rem; }

    .dropdown { position: absolute; right: 0; top: calc(100% + 8px); background: var(--medium-gray); border: 1px solid var(--light-gray); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); min-width: 260px; z-index: 1001; }
    .caret { position:absolute; top:-6px; right:14px; width: 10px; height:10px; background: var(--medium-gray); border-left:1px solid var(--light-gray); border-top:1px solid var(--light-gray); transform: rotate(45deg); }
    .menu-inner { padding: 0.75rem; }
    .user-row { display:flex; gap:0.6rem; align-items:center; outline:none; }
    .user-meta .name { color: var(--white); font-weight: 700; line-height: 1.1; }
    .user-meta .email { color: var(--text-gray); font-size: 0.9rem; }
    .divider { height: 1px; background: var(--light-gray); margin: 0.75rem 0; }
    .credits-row { display:flex; align-items:center; justify-content: space-between; color: var(--white); }
    .menu-btn { width: 100%; text-align: left; background: var(--medium-gray); color: var(--white); border: 1px solid var(--light-gray); border-radius: 10px; padding: 0.5rem 0.75rem; cursor: pointer; transition: border-color 0.2s ease; }
    .menu-btn:hover { border-color: var(--primary-green); }
    .menu-btn.cta { margin-top: 0.5rem; background: linear-gradient(45deg, var(--primary-green), var(--primary-green)); color: var(--black); border-color: var(--primary-green); box-shadow: 0 10px 30px rgba(0,255,136,0.25); font-weight: 700; }
    .menu-btn.cta:hover { box-shadow: 0 14px 40px rgba(0,255,136,0.35); }
    .menu-btn.danger { color: #ff6b6b; border-color: var(--light-gray); background: transparent; }
    .menu-btn.danger:hover { border-color: #ff6b6b; }
    .login-btn { border: 1px solid var(--light-gray); background: var(--medium-gray); color: var(--white); border-radius: 10px; padding: 0.4rem 0.7rem; cursor:pointer; }
    .login-btn:hover { border-color: var(--primary-green); }
    `
  ],
  animations: [
  ]
})
export class HeaderComponent implements OnDestroy {
  auth = inject(AuthService);
  private router = inject(Router);
  private modal = inject(ModalService);
  isProfileOpen = false;
  private sub?: Subscription;

  @ViewChild('firstEl') firstEl?: ElementRef<HTMLElement>;
  @ViewChild('host', { read: ElementRef }) hostRef?: ElementRef<HTMLElement>;

  constructor() {
    this.sub = this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => this.closeProfile());
  }

  get userName(): string { return (this.auth.user$.value?.name || this.auth.user$.value?.email || '').trim(); }
  get userEmail(): string { return this.auth.user$.value?.email || ''; }
  get userCredits(): number { return (this.auth.user$.value as any)?.credits ?? 0; }
  get initial(): string { const s = this.userName || this.userEmail; return (s?.trim()?.charAt(0) || 'U').toUpperCase(); }

  toggleProfile() {
    this.isProfileOpen = !this.isProfileOpen;
    if (this.isProfileOpen) {
      setTimeout(() => this.firstEl?.nativeElement?.focus(), 0);
    }
  }
  closeProfile() { this.isProfileOpen = false; }
  openLogin() { this.modal.openLogin(); }
  onAddCredits() { this.closeProfile(); (window as any).dispatchEvent(new CustomEvent('open-add-credits')); }
  onAccount() { this.closeProfile(); this.router.navigateByUrl('/account'); }
  onLogout() { this.auth.logout(); this.closeProfile(); this.router.navigateByUrl('/'); }

  @HostListener('document:click', ['$event']) onDocClick(ev: MouseEvent) {
    if (!this.isProfileOpen) return;
    const host = this.hostRef?.nativeElement;
    if (host && !host.contains(ev.target as Node)) this.closeProfile();
  }
  @HostListener('document:keydown.escape') onEsc() { this.closeProfile(); }

  ngOnDestroy(): void { this.sub?.unsubscribe(); this.closeProfile(); }
}


