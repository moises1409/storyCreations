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
            <div class="dropdown" id="profile-menu" role="menu" *ngIf="isProfileOpen">
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
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.7));
      padding: 0.5rem 1rem; 
      backdrop-filter: blur(8px);
      border-bottom: 2px solid var(--border-light);
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
      border: 2px solid var(--border-light); 
      background: linear-gradient(45deg, var(--primary-pink), var(--primary-yellow)); 
      color: var(--text-white); 
      cursor: pointer; 
      transition: all 0.3s ease; 
      box-shadow: 0 4px 12px rgba(255, 111, 145, 0.3);
    }
    .profile-btn:hover { 
      border-color: var(--primary-pink); 
      box-shadow: 0 6px 20px rgba(255, 111, 145, 0.4);
      transform: scale(1.05);
    }
    .avatar { width: 22px; height: 22px; border-radius: 50%; background: rgba(255, 255, 255, 0.2); color: var(--text-white); display:flex; align-items:center; justify-content:center; font-weight:700; font-family: 'Fredoka', sans-serif; }
    .avatar.lg { width: 40px; height: 40px; font-size: 1rem; }

    .dropdown { position: absolute; right: 0; top: calc(100% + 8px); background: var(--background-light); border: 2px solid var(--border-light); border-radius: 16px; box-shadow: 0 20px 60px var(--shadow-medium); min-width: 260px; z-index: 1001; }
    .caret { position:absolute; top:-6px; right:14px; width: 10px; height:10px; background: var(--background-light); border-left:2px solid var(--border-light); border-top:2px solid var(--border-light); transform: rotate(45deg); }
    .menu-inner { padding: 0.75rem; }
    .user-row { display:flex; gap:0.6rem; align-items:center; outline:none; }
    .user-meta .name { color: var(--text-dark); font-weight: 700; line-height: 1.1; font-family: 'Fredoka', sans-serif; }
    .user-meta .email { color: var(--text-medium); font-size: 0.9rem; font-family: 'Fredoka', sans-serif; }
    .divider { height: 1px; background: var(--border-light); margin: 0.75rem 0; }
    .credits-row { display:flex; align-items:center; justify-content: space-between; color: var(--text-dark); font-family: 'Fredoka', sans-serif; }
    .menu-btn { width: 100%; text-align: left; background: var(--background-light); color: var(--text-dark); border: 2px solid var(--border-light); border-radius: 12px; padding: 0.5rem 0.75rem; cursor: pointer; transition: all 0.3s ease; font-family: 'Fredoka', sans-serif; }
    .menu-btn:hover { border-color: var(--primary-pink); background: rgba(255, 111, 145, 0.1); }
    .menu-btn.cta { margin-top: 0.5rem; background: linear-gradient(45deg, var(--primary-pink), var(--primary-yellow)); color: var(--text-white); border-color: var(--primary-pink); box-shadow: 0 8px 20px rgba(255, 111, 145, 0.3); font-weight: 700; }
    .menu-btn.cta:hover { box-shadow: 0 12px 30px rgba(255, 111, 145, 0.4); transform: translateY(-2px); }
    .menu-btn.danger { color: #ff6b6b; border-color: var(--border-light); background: transparent; }
    .menu-btn.danger:hover { border-color: #ff6b6b; background: rgba(255, 107, 107, 0.1); }
    .login-btn { border: 2px solid var(--border-light); background: var(--background-light); color: var(--text-dark); border-radius: 12px; padding: 0.4rem 0.7rem; cursor:pointer; font-family: 'Fredoka', sans-serif; transition: all 0.3s ease; }
    .login-btn:hover { border-color: var(--primary-pink); background: rgba(255, 111, 145, 0.1); }
    `
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
      // Fetch fresh user data to get updated credits
      this.auth.fetchMe().subscribe({
        next: () => {
          setTimeout(() => this.firstEl?.nativeElement?.focus(), 0);
        },
        error: () => {
          // If fetch fails, still focus the element
          setTimeout(() => this.firstEl?.nativeElement?.focus(), 0);
        }
      });
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


