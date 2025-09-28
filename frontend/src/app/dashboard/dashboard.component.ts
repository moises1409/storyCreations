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

  // Co-creator state (English)
  phase: 'seed' | 'chapter' | 'final' = 'seed';
  
  error = '';
  showAddCredits = false;


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
    // Read images passed from character builder
    try {
      const state: any = (history && history.state) || {};
      if (Array.isArray(state.images)) this.initialImagesFromNav = state.images.filter(Boolean);
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
  onGenerate(payload: { seed: string; character_ids: number[] }) {
    const value = (payload?.seed ?? '').trim();
    if (!value) return;
    // Pass seed and optional character IDs via navigation state
    this.router.navigate(['/story/new'], { queryParams: { seed: value }, state: { character_ids: payload.character_ids || [] } });
  }

  setFilter(f: 'all'|'in_progress'|'finished') { this.filter = f; }

  onAddCredits(plan: 'starter'|'pro'|'max') {
    this.auth.addCredits(plan).subscribe({ next: () => { this.showAddCredits = false; this.error = ''; }, error: () => {} });
  }

  closeAddCreditsModal() {
    this.showAddCredits = false;
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

