import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { NavComponent } from '../shared/nav.component';
import { HeaderComponent } from '../shared/header.component';
import { StoryCardsComponent, StorySummary } from '../shared/story-cards.component';
import { AuthService } from '../auth/auth.service';

@Component({
  standalone: true,
  selector: 'app-creations',
  imports: [CommonModule, HttpClientModule, NavComponent, HeaderComponent, StoryCardsComponent],
  template: `
    <app-nav></app-nav>
    <app-header></app-header>
    <div class="dashboard-container main-with-sidebar">
      <h1>My creations</h1>
      <div class="filters" style="display:flex; gap:0.5rem; margin:0 0 0.75rem;">
        <button class="small" [class.selected]="filter==='all'" (click)="setFilter('all')">All</button>
        <button class="small" [class.selected]="filter==='in_progress'" (click)="setFilter('in_progress')">In progress</button>
        <button class="small" [class.selected]="filter==='finished'" (click)="setFilter('finished')">Finished</button>
      </div>
      <div *ngIf="storiesLoading" style="display:flex; justify-content:center; padding: 1rem 0;">
        <div class="spinner"></div>
      </div>
      <app-story-cards *ngIf="!storiesLoading" [stories]="filteredStories" (storyDeleted)="refresh(true)"></app-story-cards>
    </div>
  `,
  styles: [
    `
    .dashboard-container { 
      padding: 2rem; 
      width: 100%; 
      margin: 0; 
      background: linear-gradient(135deg, var(--background-cream) 0%, var(--background-blue) 100%);
      min-height: 100vh;
    }
    .dashboard-container.main-with-sidebar { padding-left: calc(var(--sidebar-width) + var(--sidebar-gap)); box-sizing: border-box; }
    .dashboard-container h1 {
      color: var(--text-dark);
      font-size: 2.2rem;
      font-weight: 700;
      margin-bottom: 1.25rem;
      background: linear-gradient(45deg, var(--primary-pink), var(--primary-yellow), var(--primary-purple));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
      font-family: 'Fredoka', sans-serif;
    }
    .filters .small { background: transparent; border-color: var(--border-light); color: var(--text-medium); }
    .filters .small:hover { background: var(--primary-pink); color: var(--text-white); }
    .filters .small.selected { border-color: var(--primary-pink); background: rgba(255, 111, 145, 0.1); }
    /* Button chip styles (match dashboard) */
    .small { 
      background: var(--primary-pink); 
      color: var(--text-white); 
      border:2px solid var(--primary-pink); 
      border-radius: 12px; 
      padding: 0.4rem 0.6rem; 
      cursor:pointer; 
      font-family: 'Fredoka', sans-serif;
      font-weight: 600;
      transition: all 0.3s ease;
    }
    .small:hover { background: var(--primary-yellow); border-color: var(--primary-yellow); transform: translateY(-1px); }
    .small.selected { border-color: var(--primary-pink); background: rgba(255, 111, 145, 0.1); }
    .spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--border-light); border-top-color: var(--primary-pink); animation: spin 0.9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 900px) {
      .dashboard-container.main-with-sidebar { padding-left: 30px; }
    }
    `
  ]
})
export class CreationsComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  stories: StorySummary[] = [];
  filter: 'all'|'in_progress'|'finished' = 'all';
  storiesLoading = false;

  ngOnInit(): void {
    this.refresh();
  }

  get filteredStories(): StorySummary[] {
    if (this.filter === 'all') return this.stories;
    return this.stories.filter(s => (s.status || 'in_progress') === this.filter);
  }

  setFilter(f: 'all'|'in_progress'|'finished') { this.filter = f; }

  refresh(skipSpinner: boolean = false) {
    if (!skipSpinner) this.storiesLoading = true;
    const url = `${this.auth.baseUrl}/stories`;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.http.get<StorySummary[]>(url, { headers }).subscribe({ next: (res) => this.stories = res || [], error: () => {}, complete: () => { this.storiesLoading = false; } });
  }
}


