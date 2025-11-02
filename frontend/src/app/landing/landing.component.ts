import { Component, OnInit, OnDestroy, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router, RouterModule } from '@angular/router';
import { ModalService } from '../auth/modal.service';
import { AuthModalContainerComponent } from '../auth/auth-modal-container/auth-modal-container.component';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterModule, CommonModule, AuthModalContainerComponent],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.css']
})
export class LandingComponent implements OnInit, OnDestroy {
  private isScrolled = false;
  private modalService = inject(ModalService);
  public demoVideoUrl: string = 'https://youtu.be/roxqg8e0_5U';
  public safeDemoUrl: SafeResourceUrl | null = null;
  public showDemoVideo: boolean = false;

  constructor(private router: Router, private sanitizer: DomSanitizer) {}

  ngOnInit() {
    this.checkScroll();
    // Build safe embed URL for the demo video
    try {
      const embed = this.toEmbedUrl(this.demoVideoUrl);
      this.safeDemoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`${embed}?rel=0&modestbranding=1&autoplay=1&mute=1&playsinline=1`);
    } catch {}
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
    // Open signup modal for CTAs
    this.modalService.openSignup();
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

  openSharedStory(storyId: string) {
    // Mapeo de IDs de ejemplo a IDs reales de historias
    const storyIdMap: { [key: string]: string } = {
      'STORY_ID_1': '87', // Reemplaza con el ID real de "The Moonlight Detective"
      'STORY_ID_2': '88', // Reemplaza con el ID real de "Jungle of Giggles"
      'STORY_ID_3': '89', // Reemplaza con el ID real de "The Rainbow Bakery"
      'STORY_ID_4': '92'  // Reemplaza con el ID real de "Captain Star and the Lost Planet"
    };

    const realStoryId = storyIdMap[storyId];
    if (realStoryId) {
      // Abrir en nueva pestaña para que el usuario pueda ver la historia sin registrarse
      window.open(`https://www.talikoo.com/share/story/${realStoryId}`, '_blank');
    }
  }

  onWatchDemoClick(event: Event) {
    try { event.preventDefault(); } catch {}
    this.showDemoVideo = true;
    // Optionally scroll to video after rendering
    setTimeout(() => {
      const el = document.querySelector('.demo-video') as HTMLElement;
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  private toEmbedUrl(url: string): string {
    try {
      if (!url) return '';
      // Already an embed link
      if (url.includes('/embed/')) return url;
      // youtu.be short link
      const shortIdx = url.indexOf('youtu.be/');
      if (shortIdx !== -1) {
        const id = url.substring(shortIdx + 'youtu.be/'.length).split(/[?&#]/)[0];
        return `https://www.youtube.com/embed/${id}`;
      }
      // watch?v=
      const vMatch = url.match(/[?&#]v=([^&#]+)/);
      if (vMatch && vMatch[1]) {
        return `https://www.youtube.com/embed/${vMatch[1]}`;
      }
      return url;
    } catch {
      return url;
    }
  }
}
