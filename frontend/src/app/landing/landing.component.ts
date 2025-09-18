import { Component, OnInit, OnDestroy, HostListener, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { ModalService } from '../auth/modal.service';
import { AuthModalContainerComponent } from '../auth/auth-modal-container/auth-modal-container.component';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterModule, AuthModalContainerComponent],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.css']
})
export class LandingComponent implements OnInit, OnDestroy {
  private isScrolled = false;
  private modalService = inject(ModalService);

  constructor(private router: Router) {}

  ngOnInit() {
    this.checkScroll();
  }

  ngOnDestroy() {}

  @HostListener('window:scroll', ['$event'])
  onWindowScroll() {
    this.checkScroll();
  }

  private checkScroll() {
    const scrollPosition = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const shouldBeScrolled = scrollPosition > 50;
    
    if (shouldBeScrolled !== this.isScrolled) {
      this.isScrolled = shouldBeScrolled;
      const navbar = document.querySelector('.nav-bar') as HTMLElement;
      if (navbar) {
        navbar.classList.toggle('scrolled', this.isScrolled);
      }
    }
  }

  startApp() {
    this.modalService.openSignIn();
  }

  onPrimaryCta() {
    // If authenticated, go to dashboard; else open sign-in modal
    const isAuthed = (window as any).ng?.getInjector?.(document.querySelector('app-root'))?.get
      ? false
      : false;
    // Simpler: rely on route guard; open modal for unauthenticated by default
    // We don't have direct AuthService injection here to keep imports minimal
    // so navigate and let guard/modal control behavior via existing flows
    try {
      // Attempt navigate; guard will enforce auth
      this.router.navigate(['/dashboard']);
    } catch {
      this.modalService.openSignIn();
    }
  }

  scrollToHowItWorks() {
    const el = document.getElementById('how-it-works');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  openSignIn() {
    this.modalService.openSignIn();
  }

  openSignup() {
    this.modalService.openSignup();
  }
}
