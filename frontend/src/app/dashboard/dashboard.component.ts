import { Component, HostListener, inject, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../auth/auth.service';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { NavComponent } from '../shared/nav.component';
import { HeaderComponent } from '../shared/header.component';
import { AddCreditsModalComponent } from '../shared/add-credits-modal.component';
import { StoryCardsComponent } from '../shared/story-cards.component';
import { Router } from '@angular/router';
import { GenerateStoryWidgetComponent } from '../shared/generate-story-widget.component';

@Component({
  standalone: true,
  selector: 'app-dashboard',
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule, RouterModule, NavComponent, HeaderComponent, AddCreditsModalComponent, StoryCardsComponent, GenerateStoryWidgetComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  private auth = inject(AuthService);
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  router = inject(Router);
  user = this.auth.user$.value;
  initialImagesFromNav: string[] = [];
  initialSeedFromNav: string = '';
  initialLanguageFromNav: string = '';
  initialCharactersFromNav: Array<{ id:number; name?: string | null }> = [];

  // Co-creator state (English)
  phase: 'seed' | 'chapter' | 'final' = 'seed';
  
  error = '';
  showAddCredits = false;
  // Credits purchase feedback
  creditsPurchased = false;
  purchasedCredits = 0;
  totalCredits = 0;


  // Seed and user continuation (legacy continuation kept for convenience)
  seedForm = this.fb.group({
    seed: ['', Validators.required]
  });
  

  // Mis historias (local)
  myStories: Array<{ id: string; title: string; createdAt: Date; scenesCount: number }> = [];
  userStories: Array<{ id: number; title: string; chapters_count: number; status?: 'in_progress'|'finished' }> = [];

  // UI filtering
  filter: 'all' | 'in_progress' | 'finished' = 'all';
  get filteredStories() {
    if (this.filter === 'all') return this.userStories;
    return this.userStories.filter(s => (s.status || 'in_progress') === this.filter);
  }

  // Loading flags
  storiesLoading = false;

  ngOnInit(): void {
    // Restore user if needed
    if (!this.user && this.auth.token) {
      this.auth.fetchMe().subscribe({ next: u => this.user = u });
    }
    this.loadStories();
    // Read prefill data passed from story page
    try {
      const state: any = (history && history.state) || {};
      if (typeof state.seed === 'string') this.initialSeedFromNav = (state.seed || '').trim();
      if (typeof state.language === 'string') this.initialLanguageFromNav = state.language || '';
      const imgs = Array.isArray(state.character_images) ? state.character_images : (Array.isArray(state.images) ? state.images : []);
      if (Array.isArray(imgs)) this.initialImagesFromNav = imgs.filter((s: any) => typeof s === 'string');
      if (Array.isArray(state.characters)) {
        this.initialCharactersFromNav = state.characters
          .filter((c: any) => c && Number.isFinite(Number(c.id)))
          .map((c: any) => ({ id: Number(c.id), name: (typeof c.name === 'string' ? c.name : null) }));
      }
    } catch {}
    // Listen for header add-credits request
    window.addEventListener('open-add-credits', this.openAddCreditsFromHeader);
  }

  private openAddCreditsFromHeader = () => { this.showAddCredits = true; };

  // Generate story from seed on dashboard and navigate to story page
  startFromSeed() {
    if (this.seedForm.invalid) { this.seedForm.markAllAsTouched(); return; }
    const seed = (this.seedForm.value.seed ?? '').trim();
    if (!seed) return;
    // Navigate first to the story page, passing the seed so it can start generation there
    this.router.navigate(['/story/new'], { queryParams: { seed } });
  }

  // Handle new widget output
  onGenerate(payload: { seed: string; language: string; character_ids: number[]; characters?: { id:number; name?: string | null }[]; character_images?: string[] }) {
    const value = (payload?.seed ?? '').trim();
    if (!value) return;
    // Pass seed, language and optional character IDs via navigation state
    this.router.navigate(['/story/new'], { 
      queryParams: { seed: value, language: payload.language || '' }, 
      state: { 
        character_ids: payload.character_ids || [],
        characters: (payload.characters || []).filter(Boolean),
        character_images: (payload.character_images || []).filter(Boolean)
      } 
    });
  }

  setFilter(f: 'all'|'in_progress'|'finished') { this.filter = f; }

  onAddCredits(plan: 'starter'|'pro'|'max') {
    this.auth.addCredits(plan).subscribe({ next: (res) => { 
      this.error = '';
      this.purchasedCredits = Number((res as any)?.added) || 0;
      this.totalCredits = Number((res as any)?.credits) || Number(this.auth.user$.value?.credits) || 0;
      this.creditsPurchased = true; 
    }, error: () => {} });
  }

  closeAddCreditsModal() {
    this.showAddCredits = false; this.creditsPurchased = false; this.purchasedCredits = 0; this.totalCredits = 0;
  }

  ngOnDestroy(): void {
    window.removeEventListener('open-add-credits', this.openAddCreditsFromHeader);
  }

  loadStories() {
    this.storiesLoading = true;
    const url = `${this.auth.baseUrl}/stories`;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.http.get<Array<{ id: number; title: string; chapters_count: number; status?: 'in_progress'|'finished' }>>(url, { headers })
      .subscribe({ next: (res) => { this.userStories = res || []; }, error: () => {}, complete: () => { this.storiesLoading = false; } });
  }

  

  

  

  

  

  
}

