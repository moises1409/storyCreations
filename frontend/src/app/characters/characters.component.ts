import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { NavComponent } from '../shared/nav.component';
import { HeaderComponent } from '../shared/header.component';
import { ConfirmationModalComponent } from '../shared/confirmation-modal.component';
import { AuthService } from '../auth/auth.service';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-characters',
  imports: [CommonModule, HttpClientModule, NavComponent, HeaderComponent, ConfirmationModalComponent],
  template: `
    <app-nav></app-nav>
    <app-header></app-header>
    <div class="dashboard-container main-with-sidebar">
      <div class="characters-section">
        <h1>My Characters</h1>
        <div class="characters-grid" *ngIf="myCharacters.length > 0; else noCharacters">
          <div class="character-card" *ngFor="let character of myCharacters">
            <div class="character-image">
              <img [src]="character.image" [alt]="character.name || 'Character'" />
            </div>
            <div class="character-info">
              <h3 class="character-name">{{ character.name || 'Unnamed Character' }}</h3>
            </div>
            <button class="delete-btn" (click)="deleteCharacter(character.id)" title="Delete character">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
        <ng-template #noCharacters>
          <div class="no-characters">
            <p>No characters created yet. Create your first character!</p>
          </div>
        </ng-template>
      </div>
    </div>
    
    <!-- Confirmation Modal -->
    <app-confirmation-modal 
      *ngIf="showDeleteModal" 
      title="Delete Character" 
      message="Are you sure you want to delete this character? This action cannot be undone."
      confirmText="Delete"
      (confirm)="confirmDelete()" 
      (cancel)="cancelDelete()" 
      (close)="cancelDelete()">
    </app-confirmation-modal>
  `,
  styles: [
    `
    .dashboard-container { padding: 2rem; width: 100%; margin: 0; }
    .dashboard-container.main-with-sidebar { padding-left: calc(var(--sidebar-width) + var(--sidebar-gap)); box-sizing: border-box; }
    .dashboard-container h1 {
      color: var(--white);
      font-size: 2.2rem;
      font-weight: 700;
      margin-bottom: 1.25rem;
      background: linear-gradient(45deg, var(--white), var(--primary-green));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .characters-section { padding: 1rem 0; }
    .characters-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
    
    /* Mobile Responsive */
    @media (max-width: 768px) {
      .characters-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.75rem; }
    }
    
    @media (max-width: 480px) {
      .characters-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.5rem; }
      .character-card { padding: 0.75rem; }
      .character-name { font-size: 0.9rem; }
    }
    .character-card { background: var(--medium-gray); border: 1px solid var(--light-gray); border-radius: 12px; padding: 1rem; position: relative; transition: transform 0.2s ease, border-color 0.2s ease; }
    .character-card:hover { transform: translateY(-2px); border-color: var(--primary-green); }
    .character-image { width: 100%; aspect-ratio: 1; border-radius: 8px; overflow: hidden; margin-bottom: 0.75rem; }
    .character-image img { width: 100%; height: 100%; object-fit: cover; }
    .character-info { text-align: center; }
    .character-name { color: #fff; font-size: 1rem; font-weight: 600; margin: 0; }
    .delete-btn { position: absolute; top: 0.5rem; right: 0.5rem; background: rgba(255, 0, 0, 0.8); border: none; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background-color 0.2s ease; }
    .delete-btn:hover { background: rgba(255, 0, 0, 1); }
    .delete-btn svg { width: 14px; height: 14px; color: white; }
    .no-characters { text-align: center; padding: 2rem; color: var(--text-gray); }
    .no-characters p { margin: 0; font-size: 1.1rem; }
    @media (max-width: 900px) {
      .dashboard-container.main-with-sidebar { padding-left: 30px; }
    }
    `
  ]
})
export class CharactersComponent {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private router = inject(Router);
  
  myCharacters: { id: number; image: string; name?: string | null }[] = [];
  showDeleteModal = false;
  characterToDelete: number | null = null;

  ngOnInit() { 
    this.loadMyCharacters();
  }

  loadMyCharacters() {
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.http.get<{ items?: {id:number; image:string; name?: string | null}[]; images?: string[] }>(`${this.auth.baseUrl}/characters`, { headers })
      .subscribe({ 
        next: (res) => {
          const fromItems = (res?.items || []).filter(Boolean) as {id:number; image:string; name?: string | null}[];
          if (fromItems.length) {
            this.myCharacters = fromItems;
          } else {
            const imgs = (res?.images || []).filter(Boolean) as string[];
            this.myCharacters = imgs.map((img, idx) => ({ id: idx + 1, image: img }));
          }
        },
        error: () => { this.myCharacters = []; }
      });
  }

  deleteCharacter(characterId: number) {
    this.characterToDelete = characterId;
    this.showDeleteModal = true;
  }

  confirmDelete() {
    if (!this.characterToDelete) return;
    
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.http.delete(`${this.auth.baseUrl}/characters/${this.characterToDelete}`, { headers })
      .subscribe({ 
        next: () => {
          this.loadMyCharacters(); // Refresh the characters list
          this.cancelDelete();
        },
        error: () => {
          alert('Failed to delete character. Please try again.');
          this.cancelDelete();
        }
      });
  }

  cancelDelete() {
    this.showDeleteModal = false;
    this.characterToDelete = null;
  }
}


