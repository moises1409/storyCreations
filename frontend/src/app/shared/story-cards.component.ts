import { Component, Input, OnChanges, Output, EventEmitter, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { AuthService } from '../auth/auth.service';

export interface StorySummary {
  id: number;
  title: string;
  chapters_count: number;
  status?: 'in_progress' | 'finished';
  cover_image_url?: string;
}

@Component({
  selector: 'app-story-cards',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  template: `
    <div class="cards" [style.gridTemplateColumns]="gridTemplate">
      <div class="story-card" *ngFor="let s of limitedStories" (click)="open(s)">
        <div class="thumb">
          <img [src]="getThumb(s)" alt="story cover" />
          <span class="status" [class.finished]="s.status==='finished'">{{ s.status==='finished' ? 'Finished' : 'In progress' }}</span>
        </div>
        <div class="card-body">
          <div class="title" [title]="s.title">{{ s.title }}</div>
          <div class="meta-row">
            <div class="meta">{{ s.chapters_count }} chapters</div>
            <button class="delete-btn" title="Delete story" (click)="deleteStory($event, s)">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon">
                <path d="M3 6h18" stroke="currentColor" stroke-width="2"/>
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="2"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="2"/>
                <path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div class="empty" *ngIf="!limitedStories?.length">No stories yet</div>
    </div>
  `,
  styles: [
    `
    .cards { display:grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
    .story-card { background: var(--medium-gray); border:1px solid var(--light-gray); border-radius: 14px; overflow: hidden; cursor: pointer; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
    .story-card:hover { border-color: var(--primary-green); box-shadow: 0 10px 30px rgba(0,255,136,0.15); }
    .thumb { position: relative; width: 100%; aspect-ratio: 16 / 10; background: var(--dark-gray); }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display:block; }
    .status { position: absolute; top: 10px; right: 10px; font-size: 12px; padding: 2px 8px; border-radius: 999px; border:1px solid var(--light-gray); color: var(--white); background: rgba(0,0,0,0.35); backdrop-filter: blur(2px); }
    .status.finished { border-color: var(--primary-green); color: var(--primary-green); background: rgba(0,255,136,0.08); }
    .card-body { padding: 0.75rem; }
    .title { color: var(--white); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta { color: var(--text-gray); font-size: 0.9rem; }
    .meta-row { display: flex; align-items: center; justify-content: space-between; margin-top: 0.25rem; }
    .delete-btn { width: 24px; height: 24px; border-radius: 6px; border:1px solid var(--light-gray); background: transparent; color: var(--text-gray); display:flex; align-items:center; justify-content:center; cursor:pointer; transition: border-color 0.2s ease, color 0.2s ease; }
    .delete-btn .icon { width: 14px; height: 14px; }
    .delete-btn:hover { color: #ff6b6b; border-color: #ff6b6b; }
    `
  ]
})
export class StoryCardsComponent implements OnChanges {
  @Input() stories: StorySummary[] = [];
  @Input() limit?: number;
  @Input() gridTemplate = 'repeat(auto-fill, minmax(240px, 1fr))';
  @Output() storyDeleted = new EventEmitter<number>();

  private router = inject(Router);
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  private thumbnails = new Map<number, string>();

  get limitedStories(): StorySummary[] {
    if (!this.limit) return this.stories;
    return this.stories.slice(0, this.limit);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['stories']) {
      this.ensureThumbnails();
    }
  }

  private ensureThumbnails() {
    // No extra requests needed now that stories include cover_image_url.
    for (const s of this.stories) {
      if (!this.thumbnails.has(s.id)) {
        this.thumbnails.set(s.id, s.cover_image_url || '/assets/test.jpeg');
      }
    }
  }

  getThumb(s: StorySummary): string { return s.cover_image_url || this.thumbnails.get(s.id) || '/assets/test.jpeg'; }

  open(s: StorySummary) { this.router.navigate(['/story', s.id]); }

  deleteStory(event: MouseEvent, s: StorySummary) {
    event.stopPropagation();
    const ok = confirm('Delete this story and all of its chapters?');
    if (!ok) return;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.http.delete(`${this.auth.baseUrl}/stories/${s.id}`, { headers })
      .subscribe({
        next: () => {
          this.stories = this.stories.filter(st => st.id !== s.id);
          this.thumbnails.delete(s.id);
          this.storyDeleted.emit(s.id);
        },
        error: () => {
          alert('Failed to delete story. Please try again.');
        }
      });
  }
}


