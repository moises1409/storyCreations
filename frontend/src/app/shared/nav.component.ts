import { Component, HostListener, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './nav.component.html',
  styleUrls: ['./nav.component.css']
})
export class NavComponent implements OnDestroy {
  constructor(public auth: AuthService, private router: Router) {
    this.router.events.subscribe((e) => {
      if (this.isMobileMenuOpen && e instanceof NavigationEnd) {
        this.closeMenu();
      }
    });
  }

  isMobileMenuOpen = false;
  @ViewChild('closeBtn') closeBtn?: ElementRef<HTMLButtonElement>;

  toggleMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
    if (this.isMobileMenuOpen) {
      try { document.body.style.overflow = 'hidden'; } catch {}
      setTimeout(() => this.closeBtn?.nativeElement?.focus(), 0);
    } else {
      try { document.body.style.overflow = ''; } catch {}
    }
  }

  closeMenu() {
    if (!this.isMobileMenuOpen) return;
    this.isMobileMenuOpen = false;
    try { document.body.style.overflow = ''; } catch {}
  }

  onLogout() {
    this.auth.logout();
    this.router.navigateByUrl('/');
  }

  @HostListener('document:keydown.escape') onEsc() {
    this.closeMenu();
  }

  ngOnDestroy(): void {
    try { document.body.style.overflow = ''; } catch {}
  }
}
