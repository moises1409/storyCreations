import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CharacterPickerModalComponent } from '../shared/character-picker-modal.component';
import { NavComponent } from '../shared/nav.component';
import { HeaderComponent } from '../shared/header.component';
import { ConfirmationModalComponent } from '../shared/confirmation-modal.component';
import { AuthService } from '../auth/auth.service';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-characters',
  imports: [CommonModule, HttpClientModule, FormsModule, NavComponent, HeaderComponent, ConfirmationModalComponent, CharacterPickerModalComponent],
  template: `
    <app-nav></app-nav>
    <app-header></app-header>
    <div class="dashboard-container main-with-sidebar">
      <div class="characters-section">
        <div style="display:flex; align-items:center; justify-content: space-between; gap: 1rem;">
          <h1>My Characters</h1>
          <button class="solid" (click)="openPicker()">+ New Character</button>
        </div>
        
        <!-- Loading Spinner -->
        <div *ngIf="loading" class="loading-container">
          <div class="spinner"></div>
          <p>Loading your characters...</p>
        </div>
        
        <!-- Characters Grid -->
        <div class="characters-grid" *ngIf="!loading && myCharacters.length > 0">
          <div class="character-card" *ngFor="let character of myCharacters">
            <div class="character-image">
              <img [src]="character.image" [alt]="character.name || 'Character'" />
            </div>
            <div class="character-info">
              <h3 class="character-name">{{ character.name || 'Unnamed Character' }}</h3>
              <div class="edit-controls">
                <button class="outline" (click)="openEdit(character)">Edit</button>
              </div>
            </div>
            <button class="delete-btn" (click)="deleteCharacter(character.id)" title="Delete character">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- No Characters Message -->
        <div *ngIf="!loading && myCharacters.length === 0" class="no-characters">
          <p>No characters created yet. Create your first character!</p>
        </div>
      </div>
    </div>
    
    <!-- Character Picker Modal -->
    <app-character-picker-modal [open]="pickerOpen" [createOnly]="true" (close)="onPickerClose()" (created)="onPickedCreated()" (pick)="onPicked($event)"></app-character-picker-modal>

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
    
    <!-- Edit Modal -->
    <div class="edit-modal-overlay" *ngIf="showEditModal" (click)="closeEdit()">
      <div class="edit-modal" (click)="$event.stopPropagation()">
        <div class="edit-header">
          <h3>Edit Character</h3>
          <button class="close" (click)="closeEdit()">×</button>
        </div>
        <div class="edit-body">
          <div class="edit-builder">
            <div class="left-col">
              <div class="preview">
                <img *ngIf="editingCharacter?.image" [src]="editingCharacter?.image" alt="character" />
                <div class="spinner-overlay" *ngIf="saving"><div class="spinner"></div></div>
              </div>
            </div>
            <div class="controls">
              <label class="field" *ngIf="!editingImage">Name
                <input type="text" [(ngModel)]="editName" placeholder="Character name" />
              </label>
              <div *ngIf="!editingImage" class="row" style="margin-top:0.5rem;">
                <button class="outline" (click)="startEditingImage()">Edit image</button>
              </div>
              <div *ngIf="editingImage" class="row">
                <label class="field">Edit prompt
                  <textarea [(ngModel)]="editPrompt" rows="3" placeholder="Describe changes. Identity and pose must stay the same. Use a white background."></textarea>
                </label>
                <div class="row">
                  <button class="solid" (click)="regenerateCharacterImage()" [disabled]="saving">{{ saving ? 'Generating…' : 'Generate' }}</button>
                  <button class="outline" (click)="cancelEditingImage()" [disabled]="saving">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="edit-footer" *ngIf="!editingImage">
          <button class="outline" (click)="closeEdit()">Cancel</button>
          <button class="solid" (click)="saveCharacter()" [disabled]="saving || !editName.trim()">{{ saving ? 'Saving…' : 'Save' }}</button>
        </div>
      </div>
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
    .character-card { background: var(--background-light); border: 2px solid var(--border-light); border-radius: 16px; padding: 1rem; position: relative; transition: all 0.3s ease; box-shadow: 0 4px 12px var(--shadow-light); }
    .character-card:hover { transform: translateY(-4px); border-color: var(--primary-pink); box-shadow: 0 8px 20px var(--shadow-medium); }
    .character-image { width: 100%; aspect-ratio: 1; border-radius: 12px; overflow: hidden; margin-bottom: 0.75rem; }
    .character-image img { width: 100%; height: 100%; object-fit: cover; }
    .character-info { text-align: center; }
    .edit-controls { margin-top: 0.5rem; display: flex; justify-content: center; gap: 0.5rem; }
    .outline, .solid { padding: 0.5rem 0.9rem; border-radius: 8px; cursor: pointer; font-family: 'Fredoka', sans-serif; border: 2px solid var(--border-light); }
    .solid { background: linear-gradient(45deg, var(--primary-pink), var(--primary-yellow)); color: var(--text-white); border: none; }
    .outline { background: transparent; color: var(--text-dark); }
    .edit-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center; z-index: 3000; }
    .edit-modal { background: var(--background-light); border: 2px solid var(--border-light); border-radius: 12px; width: 90%; max-width: 560px; box-shadow: 0 20px 60px var(--shadow-medium); }
    .edit-header { display:flex; align-items:center; justify-content: space-between; padding: 1rem; border-bottom: 1px solid var(--border-light); }
    .edit-body { padding: 1rem; }
    .edit-builder { display:grid; grid-template-columns: 1.2fr 1fr; gap: 1rem; align-items: start; }
    .left-col { display:flex; flex-direction: column; }
    .preview { position:relative; width:100%; aspect-ratio: 4/3; background: var(--dark-gray); border-radius: 8px; display:flex; align-items:center; justify-content:center; overflow:hidden; }
    .preview img { width:100%; height:100%; object-fit:cover; display:block; }
    .spinner-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background: rgba(0,0,0,0.25); }
    .edit-footer { padding: 1rem; display:flex; justify-content:flex-end; gap: 0.5rem; border-top: 1px solid var(--border-light); }
    .field { display:flex; flex-direction:column; gap: 0.25rem; align-items: stretch; }
    .field input, .field textarea { border: 2px solid var(--border-light); border-radius: 8px; padding: 0.5rem; font-family: 'Fredoka', sans-serif; }
    .close { background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); width: 28px; height: 28px; border-radius: 50%; cursor: pointer; }
    .character-name { color: var(--text-dark); font-size: 1rem; font-weight: 600; margin: 0; font-family: 'Fredoka', sans-serif; }
    .delete-btn { position: absolute; top: 0.5rem; right: 0.5rem; background: rgba(255, 0, 0, 0.8); border: none; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background-color 0.2s ease; }
    .delete-btn:hover { background: rgba(255, 0, 0, 1); }
    .delete-btn svg { width: 14px; height: 14px; color: white; }
    .no-characters { text-align: center; padding: 2rem; color: var(--text-medium); }
    .no-characters p { margin: 0; font-size: 1.1rem; font-family: 'Fredoka', sans-serif; }
    
    /* Loading Spinner Styles */
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 2rem;
      color: var(--text-medium);
    }
    
    .loading-container p {
      margin-top: 1rem;
      font-size: 1.1rem;
      color: var(--text-medium);
      font-family: 'Fredoka', sans-serif;
    }
    
    .spinner {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 4px solid var(--border-light);
      border-top-color: var(--primary-pink);
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
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
  private cdr = inject(ChangeDetectorRef);
  
  myCharacters: { id: number; image: string; name?: string | null }[] = [];
  showDeleteModal = false;
  characterToDelete: number | null = null;
  loading = true;
  // Edit state
  showEditModal = false;
  editingCharacter: { id: number; image: string; name?: string | null } | null = null;
  editName: string = '';
  editingImage = false;
  editPrompt: string = '';
  saving = false;
  // Picker state
  pickerOpen = false;

  ngOnInit() { 
    this.loadMyCharacters();
  }

  loadMyCharacters() {
    this.loading = true;
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
          this.loading = false;
        },
        error: () => { 
          this.myCharacters = [];
          this.loading = false;
        }
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

  openEdit(character: { id:number; image:string; name?: string | null }) {
    this.editingCharacter = { ...character };
    this.editName = (character.name || '').trim();
    this.editingImage = false;
    this.editPrompt = '';
    this.showEditModal = true;
    // Ensure current data from server (in case name changed elsewhere)
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.http.get<{ items?: {id:number; image:string; name?: string | null}[] }>(`${this.auth.baseUrl}/characters`, { headers })
      .subscribe({ next: (res) => {
        const found = (res?.items || []).find(it => it.id === character.id);
        if (found && this.editingCharacter && this.editingCharacter.id === character.id) {
          this.editingCharacter.image = found.image;
          this.editName = (found.name || '').trim();
          this.cdr.detectChanges();
        }
      }});
  }

  closeEdit() {
    this.showEditModal = false;
    this.editingCharacter = null;
    this.editName = '';
    this.editingImage = false;
    this.editPrompt = '';
    this.saving = false;
  }

  startEditingImage() { this.editingImage = true; }
  cancelEditingImage() { this.editingImage = false; this.editPrompt = ''; }

  regenerateCharacterImage() {
    if (!this.editingCharacter) return;
    const prompt = `Keep identity and pose. ${this.editPrompt || 'Slightly improve the character.'} Use a white background.`;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.saving = true;
    // Use current character image as reference
    this.http.post<{ imageUrl?: string }>(`${this.auth.baseUrl}/ai/generate-image`, { prompt, images: [this.editingCharacter.image], mode: 'character_refine', persist: false }, { headers })
      .subscribe({
        next: (res) => {
          if (res?.imageUrl && this.editingCharacter) {
            this.editingCharacter.image = res.imageUrl;
            this.editingImage = false; this.editPrompt='';
            this.cdr.detectChanges();
          }
        },
        error: () => { this.saving = false; },
        complete: () => { this.saving = false; }
      });
  }

  saveCharacter() {
    if (!this.editingCharacter) return;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.saving = true;
    this.http.patch<{ id:number; image:string; name?: string }>(`${this.auth.baseUrl}/characters/${this.editingCharacter.id}`, { name: (this.editName || '').trim(), image: this.editingCharacter.image }, { headers })
      .subscribe({
        next: () => { this.loadMyCharacters(); this.closeEdit(); },
        error: () => { this.saving = false; },
      });
  }

  // Character picker modal methods
  openPicker() { this.pickerOpen = true; }
  onPickerClose() { this.pickerOpen = false; }
  onPicked(item: { id:number; image:string; name?: string | null }) {
    // After creating a new character from picker, refresh list and close
    this.pickerOpen = false;
    this.loadMyCharacters();
  }

  onPickedCreated() {
    this.pickerOpen = false;
    this.loadMyCharacters();
  }
}


