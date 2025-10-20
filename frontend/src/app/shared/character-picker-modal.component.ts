import { Component, EventEmitter, Input, Output, inject, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth/auth.service';
import { AddCreditsModalComponent } from './add-credits-modal.component';

@Component({
  standalone: true,
  selector: 'app-character-picker-modal',
  imports: [CommonModule, HttpClientModule, FormsModule, AddCreditsModalComponent],
  template: `
    <div class="overlay" *ngIf="open" (click)="onBackdrop($event)">
      <div class="modal" [class.inactive]="showBuilder" (click)="$event.stopPropagation()">
        <div class="header">
          <h2 class="title">Choose a character image</h2>
          <button type="button" class="close" (click)="close.emit()">×</button>
        </div>

        <div class="body">

          <!-- Loading Spinner -->
          <div *ngIf="loadingItems" class="loading-container">
            <div class="spinner"></div>
            <p>Loading characters...</p>
          </div>

          <!-- Characters Grid -->
          <div class="grid" *ngIf="!loadingItems && items.length > 0">
            <button type="button" class="cell" *ngFor="let item of items" (click)="pick.emit(item)">
              <img [src]="item.image" alt="character" />
              <div class="cell-name" *ngIf="item.name">{{ item.name }}</div>
            </button>
          </div>

          <!-- No Characters Message -->
          <div *ngIf="!loadingItems && items.length === 0" class="no-characters">
            <p>No characters available. Create your first character!</p>
          </div>
        </div>

        <div class="footer">
          <button type="button" class="create-btn" (click)="openBuilder()">Create new character</button>
          <button type="button" class="cancel" (click)="close.emit()">Cancel</button>
        </div>
      </div>

      <div class="inner-backdrop" *ngIf="showBuilder" (click)="onInnerBackdrop($event)"></div>
      <div class="modal inner" *ngIf="showBuilder" (click)="$event.stopPropagation()">
        <div class="header">
          <h3 class="title">New character</h3>
          <button type="button" class="close" (click)="closeBuilder()">×</button>
        </div>
        <div class="body">
          <div class="tabs">
            <button class="tab" [class.active]="activeTab === 'upload'" (click)="activeTab = 'upload'">Upload Photo</button>
            <button class="tab" [class.active]="activeTab === 'describe'" (click)="activeTab = 'describe'">Describe Character</button>
          </div>
          
          <div class="builder">
            <div class="left-col">
              <div class="preview" [class.empty]="!generatedImage && !baseImage && !cameraActive">
                <img *ngIf="generatedImage" [src]="generatedImage" alt="generated" />
                <img *ngIf="!generatedImage && baseImage" [src]="baseImage" alt="uploaded" />
                
                <!-- Camera Preview -->
                <div *ngIf="!generatedImage && !baseImage && cameraActive" class="camera-preview-container">
                  <video #videoElement class="camera-preview" autoplay muted playsinline></video>
                  <canvas #canvasElement class="camera-canvas hidden"></canvas>
                   <div class="camera-controls-overlay">
                     <button type="button" class="camera-capture-btn" (click)="capturePhoto()">
                       📸
                     </button>
                   </div>
                   <button type="button" class="camera-close-btn" (click)="stopCamera()">
                     ×
                   </button>
                  <div class="camera-error" *ngIf="cameraError">
                    {{ cameraError }}
                  </div>
                </div>
                
                <!-- Placeholder -->
                <div *ngIf="!generatedImage && !baseImage && !cameraActive" class="placeholder">
                  {{ activeTab === 'describe' ? 'Describe your character' : '' }}
                </div>
                
              <div class="spinner-overlay" *ngIf="loading"><div class="spinner"></div></div>
              </div>
              
              <!-- Upload Tab -->
              <div *ngIf="activeTab === 'upload'">
                <div class="upload-buttons" style="margin-top:0.6rem;">
                  <label class="upload-btn icon-only">
                  <input type="file" accept="image/*" (change)="onBuilderUpload($event)" />
                    <span class="icon">📤</span>
                </label>
                  
                  <button type="button" class="camera-btn icon-only" *ngIf="!cameraActive" (click)="startCamera()">
                    <span class="icon">📷</span>
                  </button>
                </div>
              </div>
            </div>
            
            <div class="controls">
              <!-- Name field appears only after image has been generated in Upload tab, or always in Describe tab -->
              <label class="field" *ngIf="generatedImage && !isEditingGenerated">
                Character name
                <input type="text" [(ngModel)]="characterName" placeholder="e.g., Emma the Explorer" />
                <div *ngIf="nameError" style="color:#d33; font-size:0.85rem; margin-top:0.25rem;">Please enter a name.</div>
              </label>

              <!-- Character description for describe tab -->
              <label *ngIf="activeTab === 'describe' && !generatedImage" class="field">
                Character description
                <textarea [(ngModel)]="characterDescription" placeholder="e.g., A brave young knight with golden hair, wearing a blue cape and carrying a wooden sword" rows="4"></textarea>
                <div *ngIf="descError && !generatedImage" style="color:#d33; font-size:0.85rem; margin-top:0.25rem;">Please enter a description.</div>
              </label>

              <!-- Edit prompt appears when editing after generation (both Upload and Describe) -->
              <label *ngIf="generatedImage && isEditingGenerated" class="field">
                Edit prompt
                <textarea [(ngModel)]="editPrompt" placeholder="Describe changes (e.g., add a small star on the hat). Identity and pose must stay the same. Use a white background." rows="3"></textarea>
              </label>

              <div class="row">
                <!-- Before generation (Upload tab): only Generate button -->
                <button class="solid" *ngIf="activeTab === 'upload' && baseImage && !generatedImage" (click)="onBuilderGenerate()" [disabled]="loading">{{ loading ? 'Generating…' : 'Generate' }}</button>
                <button class="solid" *ngIf="activeTab === 'describe' && !generatedImage" (click)="onBuilderGenerate()" [disabled]="loading">{{ loading ? 'Generating…' : 'Generate' }}</button>

                <!-- After generation (Upload tab, not editing): show Create + Edit -->
                <ng-container *ngIf="generatedImage && !isEditingGenerated">
                  <button class="outline" (click)="onBuilderSave()" [disabled]="savingCharacter">
                    {{ savingCharacter ? 'Creating...' : 'Create Character' }}
                  </button>
                  <button class="outline" (click)="onStartEditGenerated()">Edit Character</button>
                  <button class="outline" (click)="onBuilderReset()">Reset</button>
                </ng-container>

                <!-- Editing state: Regenerate + Cancel -->
                <ng-container *ngIf="generatedImage && isEditingGenerated">
                  <button class="solid" (click)="onRefineGenerated()" [disabled]="loading">{{ loading ? 'Regenerating…' : 'Regenerate' }}</button>
                  <button class="outline" (click)="onCancelEditGenerated()" [disabled]="loading">Cancel</button>
                </ng-container>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Add Credits Modal -->
    <app-add-credits-modal *ngIf="showAddCredits" (closeModal)="showAddCredits=false" (choosePlan)="onAddCredits($event)"></app-add-credits-modal>
  `,
  styles: [
    `
    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center; z-index: 2000; }
    .modal { position: relative; z-index: 1; width: 90%; max-width: 720px; background: var(--background-light); color: var(--text-dark); border: 2px solid var(--border-light); border-radius: 20px; box-shadow: 0 20px 60px var(--shadow-medium); display: flex; flex-direction: column; max-height: 90vh; overflow: hidden; }
    .modal.inactive { pointer-events: none; }
    .inner-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 3000; }
    .modal.inner { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 3001; max-width: 860px; }
    .header { display:flex; align-items:center; justify-content: space-between; padding: 1rem 1rem 0.5rem; border-bottom: 1px solid var(--border-light); background: linear-gradient(45deg, var(--primary-pink), var(--primary-yellow)); border-radius: 18px 18px 0 0; }
    .title { margin: 0; font-size: 1.25rem; color: var(--text-white); font-family: 'Fredoka', sans-serif; font-weight: 700; }
    .close { background: rgba(255, 255, 255, 0.2); color: var(--text-white); border: 1px solid rgba(255, 255, 255, 0.3); width: 28px; height: 28px; border-radius: 50%; cursor: pointer; }
    .close:hover { background: rgba(255, 255, 255, 0.3); transform: scale(1.1); }
    .body { padding: 1rem; flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
    .upload { margin-bottom: 0.75rem; }
    .create-btn { background: linear-gradient(45deg, var(--primary-pink), var(--primary-yellow)); border:none; color: var(--text-white); font-weight:700; border-radius:30px; padding:0.6rem 0.9rem; cursor:pointer; font-family: 'Fredoka', sans-serif; box-shadow: 0 4px 12px rgba(255, 111, 145, 0.3); transition: all 0.3s ease; }
    .create-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(255, 111, 145, 0.4); }
    .upload-btn { display:inline-block; border:2px dashed var(--border-light); color: var(--text-dark); padding: 0.6rem 0.9rem; border-radius: 12px; cursor: pointer; background: var(--background-light); transition: all 0.3s ease; }
    .upload-btn:hover { border-color: var(--primary-pink); background: rgba(255, 111, 145, 0.05); }
    .upload-btn input { display:none; }
    
    /* Upload options layout */
    .upload-options { display: flex; flex-direction: row; gap: 0.6rem; }
    .upload-buttons { 
      display: flex !important; 
      flex-direction: row !important; 
      gap: 0.6rem; 
      align-items: center; 
      justify-content: center;
      margin-top: 0.6rem;
      width: 100%;
    }
    
    /* Icon-only buttons */
    .icon-only {
      width: 60px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border-radius: 50%;
      border: 2px solid var(--border-light);
      background: var(--background-light);
      color: var(--text-dark);
      transition: all 0.3s ease;
    }
    
    .icon-only:hover {
      border-color: var(--primary-pink);
      background: rgba(255, 111, 145, 0.05);
      transform: scale(1.05);
    }
    
    /* Override upload-btn styles when using icon-only */
    .upload-btn.icon-only {
      border: 2px solid var(--border-light);
      background: var(--background-light);
      border-radius: 50%;
      padding: 0;
    }
    
    /* Mobile override for upload button */
    @media (max-width: 768px) {
      .upload-btn.icon-only {
        border-radius: 8px;
      }
    }
    
    .icon-only .icon {
      font-size: 1.2rem;
      line-height: 1;
    }
    
    /* Mobile responsive */
    @media (max-width: 768px) {
      .upload-buttons {
        gap: 0.4rem;
        justify-content: center;
        margin-top: 0.6rem;
        width: 100%;
      }
      
      .icon-only {
        width: 70px;
        height: 45px;
        border-radius: 8px;
      }
      
      .icon-only .icon {
        font-size: 1.4rem;
      }
    }
    
    /* Camera styles */
    .camera-preview-container { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; min-height: 200px; }
    .camera-preview { width: 100%; height: 100%; background: var(--background-cream); border-radius: 12px; object-fit: cover; border: 2px solid var(--border-light); min-height: 200px; }
    .camera-canvas { display: none; }
     .camera-controls-overlay { 
       position: absolute; 
       bottom: 15px; 
       left: 50%; 
       transform: translateX(-50%); 
       display: flex; 
       align-items: center;
     }
     
     .camera-capture-btn { 
       width: 50px; 
       height: 50px; 
       border-radius: 50%; 
       background: linear-gradient(45deg, var(--primary-pink), var(--primary-yellow)); 
       border: 3px solid white; 
       color: var(--text-white); 
       font-size: 1.2rem; 
       cursor: pointer; 
       display: flex; 
       align-items: center; 
       justify-content: center;
       box-shadow: 0 4px 12px rgba(255, 111, 145, 0.4);
       transition: all 0.2s ease;
     }
     
     .camera-close-btn { 
       position: absolute;
       top: 10px;
       right: 10px;
       width: 30px; 
       height: 30px; 
       border-radius: 50%; 
       background: rgba(255, 111, 145, 0.8); 
       border: 2px solid rgba(255,255,255,0.3); 
       color: white; 
       font-size: 1.2rem; 
       cursor: pointer; 
       display: flex; 
       align-items: center; 
       justify-content: center;
       z-index: 10;
       transition: all 0.3s ease;
     }
     
     .camera-capture-btn:hover { 
       transform: scale(1.1); 
       box-shadow: 0 4px 16px rgba(0,0,0,0.5);
       cursor: pointer;
       transition: all 0.2s ease;
     }
     
     .camera-capture-btn:active {
       transform: scale(0.95);
       box-shadow: 0 2px 8px rgba(0,0,0,0.3);
     }
     
     .camera-close-btn:hover { 
       background: rgba(255, 111, 145, 1); 
       transform: scale(1.1);
     }
    .camera-error { color: #ff6b6b; font-size: 0.9rem; text-align: center; position: absolute; top: 10px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); padding: 0.5rem; border-radius: 4px; }
    .hidden { display: none !important; }
    .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.75rem; }
    .cell { padding: 0; border: 2px solid var(--border-light); background: var(--background-light); border-radius: 16px; overflow: hidden; cursor: pointer; position: relative; transition: all 0.3s ease; }
    .cell:hover { border-color: var(--primary-pink); transform: translateY(-2px); box-shadow: 0 8px 20px var(--shadow-medium); }
    .cell img { width: 100%; height: 100%; object-fit: cover; display:block; }
    .cell-name { position:absolute; left:0; right:0; bottom:0; background: rgba(0,0,0,0.5); color:#fff; font-size: 0.8rem; padding: 0.25rem 0.4rem; text-align:center; }
    .footer { display:flex; gap: 0.5rem; justify-content:flex-end; padding: 0.5rem 1rem 1rem; }
    .cancel { background: transparent; color: var(--text-medium); border: 2px solid var(--border-light); border-radius: 12px; padding: 0.4rem 0.7rem; cursor: pointer; font-family: 'Fredoka', sans-serif; transition: all 0.3s ease; }
    .cancel:hover { color: var(--primary-pink); border-color: var(--primary-pink); background: rgba(255, 111, 145, 0.05); }
     
     /* Loading Spinner Styles */
     .loading-container {
       display: flex;
       flex-direction: column;
       align-items: center;
       justify-content: center;
       padding: 2rem;
       color: var(--text-gray);
     }
     
     .loading-container p {
       margin-top: 1rem;
       font-size: 1rem;
       color: var(--text-gray);
     }
     
     .spinner {
       width: 32px;
       height: 32px;
       border-radius: 50%;
       border: 3px solid var(--border-light);
       border-top-color: var(--primary-pink);
       animation: spin 1s linear infinite;
     }
     
     @keyframes spin {
       to { transform: rotate(360deg); }
     }
     
     .no-characters {
       text-align: center;
       padding: 2rem;
       color: var(--text-gray);
     }
     
     .no-characters p {
       margin: 0;
       font-size: 1rem;
     }

    /* Builder */
    .builder { display:grid; grid-template-columns: 1.2fr 1fr; gap: 1rem; position: relative; z-index: 2100; }
    .left-col { display:flex; flex-direction: column; }
    .preview { position:relative; width:100%; aspect-ratio: 4/3; background: var(--dark-gray); border-radius: 8px; display:flex; align-items:center; justify-content:center; overflow:hidden; }
    .preview img { width:100%; height:100%; object-fit:cover; display:block; }
    .preview.empty { border: 2px dashed var(--light-gray); }
    .spinner-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background: rgba(0,0,0,0.25); }
    .spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--light-gray); border-top-color: var(--primary-green); animation: spin 0.9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .placeholder { 
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      background: #f0f0f0;
      border-radius: 12px;
      border: 2px dashed var(--border-light);
      color: var(--text-medium);
      font-family: 'Fredoka', sans-serif;
      font-size: 1rem;
      min-height: 200px;
    }
    .controls { display:flex; flex-direction:column; gap: 0.6rem; }
    .field { color: var(--text-dark); display:flex; flex-direction:column; gap:0.25rem; }
    .field input { background: var(--background-light); color: var(--text-dark); border:2px solid var(--border-light); border-radius:12px; padding: 0.5rem 0.6rem; width: 100%; max-width: 280px; font-family: 'Fredoka', sans-serif; transition: all 0.3s ease; }
    .field input:focus { outline: none; border-color: var(--primary-pink); box-shadow: 0 0 0 3px rgba(255, 111, 145, 0.1); }
    .field textarea { background: var(--background-light); color: var(--text-dark); border:2px solid var(--border-light); border-radius:12px; padding: 0.5rem 0.6rem; width: 100%; max-width: 280px; resize: vertical; min-height: 80px; font-family: 'Fredoka', sans-serif; transition: all 0.3s ease; }
    .field textarea:focus { outline: none; border-color: var(--primary-pink); box-shadow: 0 0 0 3px rgba(255, 111, 145, 0.1); }
    .row { display:flex; gap:0.5rem; flex-wrap: wrap; }
    .solid { background: linear-gradient(45deg, var(--primary-pink), var(--primary-yellow)); border:none; color: var(--text-white); font-weight:700; border-radius:30px; padding:0.6rem 0.9rem; cursor:pointer; flex: 1; min-width: 120px; font-family: 'Fredoka', sans-serif; box-shadow: 0 4px 12px rgba(255, 111, 145, 0.3); transition: all 0.3s ease; }
    .solid:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(255, 111, 145, 0.4); }
    .outline { background: transparent; border:2px solid var(--border-light); color: var(--text-dark); border-radius:12px; padding:0.6rem 0.9rem; cursor:pointer; flex: 1; min-width: 120px; font-family: 'Fredoka', sans-serif; transition: all 0.3s ease; }
    .outline:hover { border-color: var(--primary-pink); background: rgba(255, 111, 145, 0.05); }
    
    /* Tabs */
    .tabs { display: flex; margin-bottom: 1rem; border-bottom: 2px solid var(--border-light); }
    .tab { background: transparent; color: var(--text-medium); border: none; padding: 0.5rem 1rem; cursor: pointer; border-bottom: 2px solid transparent; flex: 1; text-align: center; font-family: 'Fredoka', sans-serif; transition: all 0.3s ease; }
    .tab.active { color: var(--primary-pink); border-bottom-color: var(--primary-pink); }
    .tab:hover { color: var(--primary-pink); }
    
    /* Mobile Responsive */
    @media (max-width: 768px) {
      .modal { width: 95%; max-width: none; margin: 1rem; max-height: 92vh; }
      .builder { grid-template-columns: 1fr; gap: 1rem; }
      .field input, .field textarea { max-width: none; width: 100%; }
      .upload-buttons { flex-direction: column; gap: 0.6rem; }
      .upload-btn { width: 100%; text-align: center; padding: 0.8rem 1rem; }
      .camera-btn { width: 100%; padding: 0.8rem 1rem; }
      .row { flex-direction: column; }
      .solid, .outline { width: 100%; min-width: auto; }
      .tabs { flex-direction: row; }
      .tab { padding: 0.5rem 0.75rem; font-size: 0.9rem; }
      .preview { aspect-ratio: 1; max-width: 200px; margin: 0 auto; }
       .camera-controls-overlay { 
         bottom: 10px; 
       }
       
       .camera-capture-btn { 
         width: 40px; 
         height: 40px; 
         font-size: 1rem; 
         border: 2px solid white;
         transition: all 0.2s ease;
       }
       
       .camera-capture-btn:active {
         transform: scale(0.9);
         box-shadow: 0 1px 4px rgba(0,0,0,0.3);
       }
       
       .camera-close-btn { 
         top: 8px;
         right: 8px;
         width: 25px; 
         height: 25px; 
         font-size: 1rem; 
       }
      .upload-options { gap: 0.8rem; }
    }
    
    @media (max-width: 480px) {
      .modal { width: 98%; margin: 0.5rem; }
      .body { padding: 0.75rem; }
      .header { padding: 0.75rem 0.75rem 0.5rem; }
      .preview { aspect-ratio: 1; max-width: 150px; margin: 0 auto; }
      .upload-btn { padding: 1rem; font-size: 0.9rem; }
      .camera-btn { width: 100px; padding: 0.4rem 0.6rem; font-size: 0.8rem; }
      .tab { padding: 0.4rem 0.6rem; font-size: 0.85rem; }
    }
    `
  ]
})
export class CharacterPickerModalComponent implements OnDestroy {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement!: ElementRef<HTMLCanvasElement>;

  private _open = false;
  @Input() createOnly = false;
  @Input() set open(v: boolean) {
    this._open = v;
    if (v) {
      if (this.createOnly) {
        this.showBuilder = true;
      } else {
        this.loadExisting();
      }
    }
  }
  get open() { return this._open; }
  @Output() close = new EventEmitter<void>();
  @Output() pick = new EventEmitter<{ id:number; image:string; name?: string | null }>();
  @Output() created = new EventEmitter<void>();

  // Items from backend
  items: { id:number; image:string; name?: string | null }[] = [];
  loadingItems = false;

  // Builder state
  showBuilder = false;
  activeTab: 'upload' | 'describe' = 'upload';
  baseImage: string | null = null;
  generatedImage: string | null = null;
  characterName: string = '';
  characterDescription: string = '';
  editPrompt: string = '';
  loading = false;
  savingCharacter = false;
  showAddCredits = false;
  isEditingGenerated = false;
  nameError = false;
  descError = false;
  
  // Camera state
  cameraActive = false;
  cameraError: string | null = null;
  private mediaStream: MediaStream | null = null;

  onBackdrop(_: MouseEvent) {
    // If the inner builder is open, do not close the outer picker.
    // This keeps the picker visible in the background.
    if (this.showBuilder) return;
    this.close.emit();
  }

  onInnerBackdrop(_: MouseEvent) {
    // Close only the inner builder and return to the picker modal
    this.closeBuilder();
  }

  openBuilder() { this.showBuilder = true; }
  closeBuilder() { 
    this.showBuilder = false; 
    this.activeTab = 'upload';
    this.baseImage = null; 
    this.generatedImage = null; 
    this.characterName = ''; 
    this.characterDescription = '';
    this.loading = false; 
    this.savingCharacter = false;
    this.stopCamera();
  }

  onBuilderReset() {
    // Reset builder state to initial
    this.baseImage = null;
    this.generatedImage = null;
    this.characterName = '';
    this.editPrompt = '';
    this.characterDescription = '';
    this.loading = false;
    this.savingCharacter = false;
    this.isEditingGenerated = false;
    this.stopCamera();
  }

  canGenerate(): boolean {
    if (this.activeTab === 'upload') {
      return !!this.baseImage;
    } else {
      return !!(this.characterDescription && this.characterDescription.trim());
    }
  }

  onBuilderUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { this.baseImage = String(reader.result || ''); this.generatedImage = null; this.editPrompt = ''; };
    reader.readAsDataURL(file);
  }

  onBuilderGenerate() {
    if (!this.canGenerate()) {
      if (this.activeTab === 'describe' && !((this.characterDescription || '').trim())) {
        this.descError = true;
      }
      return;
    }
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.loading = true;
    
    if (this.activeTab === 'upload') {
      // Upload mode: transform existing image
      const prompt = `Keep identity and pose. Transform into a kid-friendly character${this.characterName ? ' named ' + this.characterName : ''}.`;
      // Force white background
      const fullPrompt = `${prompt} Use a white background.`;
      this.http.post<{ imageUrl?: string }>(`${this.auth.baseUrl}/ai/generate-character`, { prompt: fullPrompt, image: this.baseImage }, { headers })
        .subscribe({ 
          next: (res) => { this.generatedImage = res?.imageUrl || null; }, 
          error: (error) => {
            this.loading = false;
            if (error.status === 402) {
              this.showAddCredits = true;
            }
          },
          complete: () => { this.loading = false; } 
        });
    } else {
      // Describe mode: generate from text description
      const prompt = `Create a kid-friendly character${this.characterName ? ' named ' + this.characterName : ''}. ${this.characterDescription}. Disney Pixar style, friendly and colorful.`;
      this.http.post<{ imageUrl?: string }>(`${this.auth.baseUrl}/ai/generate-character-from-text`, { prompt }, { headers })
        .subscribe({ 
          next: (res) => { this.generatedImage = res?.imageUrl || null; this.descError = false; }, 
          error: (error) => {
            this.loading = false;
            if (error.status === 402) {
              this.showAddCredits = true;
            }
          },
          complete: () => { this.loading = false; } 
        });
    }
  }

  onRefineGenerated() {
    if (!this.generatedImage) return;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.loading = true;
    // Use original uploaded photo as identity reference; new prompt refines the output
    const refine = (this.editPrompt || '').trim();
    const prompt = `Keep identity and pose from the first reference. ${refine || 'Slightly improve the lighting and clarity.'} Use a white background.`;
    // Build references: prefer original base if available; otherwise use the current generated image as self-reference
    const refs = this.baseImage ? [this.baseImage, this.generatedImage] : [this.generatedImage];
    this.http.post<{ imageUrl?: string }>(`${this.auth.baseUrl}/ai/generate-image`, { prompt, images: refs, mode: 'character_refine' }, { headers })
      .subscribe({
        next: (res) => { this.generatedImage = res?.imageUrl || this.generatedImage; },
        error: (error) => {
          this.loading = false;
          if (error.status === 402) {
            this.showAddCredits = true;
          }
        },
        complete: () => { this.loading = false; this.isEditingGenerated = false; }
      });
  }

  onStartEditGenerated() { this.isEditingGenerated = true; }
  onCancelEditGenerated() { this.isEditingGenerated = false; this.editPrompt = ''; }

  onBuilderSave() {
    if (!this.generatedImage || this.savingCharacter) return;
    const trimmed = (this.characterName || '').trim();
    if (!trimmed) { this.nameError = true; return; }
    this.nameError = false;
    
    this.savingCharacter = true;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.http.post<{ id:number; image:string; name?: string }>(`${this.auth.baseUrl}/characters`, { image: this.generatedImage, name: trimmed }, { headers })
      .subscribe({ 
        next: () => { 
          this.closeBuilder(); 
          this.loadExisting(); 
          this.savingCharacter = false;
          try { this.created.emit(); } catch {}
        },
        error: () => {
          this.savingCharacter = false;
        }
      });
  }

  onAddCredits(plan: 'starter'|'pro'|'max') {
    this.auth.addCredits(plan).subscribe({
      next: (res) => { this.showAddCredits = false; },
      error: () => {}
    });
  }

  ngOnDestroy() {
    this.stopCamera();
  }

  // Camera methods
  async startCamera() {
    try {
      console.log('Starting camera...');
      this.cameraError = null;
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        } 
      });
      
      console.log('Camera stream obtained:', this.mediaStream);
      this.cameraActive = true;
      console.log('Camera active set to:', this.cameraActive);
      
      // Use setTimeout to ensure the DOM is updated
      setTimeout(() => {
        const videoElement = this.videoElement?.nativeElement || document.querySelector('.camera-preview') as HTMLVideoElement;
        if (videoElement) {
          videoElement.srcObject = this.mediaStream;
          console.log('Video element updated with stream');
        } else {
          console.log('Video element not found');
        }
      }, 100);
    } catch (error) {
      console.error('Error accessing camera:', error);
      this.cameraError = 'Unable to access camera. Please check permissions.';
      this.cameraActive = false;
    }
  }

  stopCamera() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    this.cameraActive = false;
    this.cameraError = null;
    
    const videoElement = this.videoElement?.nativeElement || document.querySelector('.camera-preview') as HTMLVideoElement;
    if (videoElement) {
      videoElement.srcObject = null;
    }
  }

  capturePhoto() {
    const videoElement = this.videoElement?.nativeElement || document.querySelector('.camera-preview') as HTMLVideoElement;
    const canvasElement = this.canvasElement?.nativeElement || document.querySelector('.camera-canvas') as HTMLCanvasElement;
    
    if (!videoElement || !canvasElement) {
      console.log('Video or canvas element not found');
      return;
    }
    
    const context = canvasElement.getContext('2d');
    if (!context) return;
    
    // Set canvas dimensions to match video
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    
    // Draw the video frame to canvas
    context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    // Convert canvas to data URL
    const dataURL = canvasElement.toDataURL('image/jpeg', 0.8);
    
    // Set as base image for character generation
    this.baseImage = dataURL;
    
    // Stop camera after capture
    this.stopCamera();
  }

  private loadExisting() {
    this.loadingItems = true;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    const url = `${this.auth.baseUrl}/characters`;
    this.http.get<{ items?: {id:number; image:string; name?: string | null}[]; images?: string[] }>(url, { headers }).subscribe({
      next: (res) => {
        const fromItems = (res?.items || []).filter(Boolean) as {id:number; image:string; name?: string | null}[];
        if (fromItems.length) {
          this.items = fromItems;
        } else {
          const imgs = (res?.images || []).filter(Boolean) as string[];
          this.items = imgs.map((img, idx) => ({ id: idx + 1, image: img }));
        }
        this.loadingItems = false;
      },
      error: () => { 
        this.items = [];
        this.loadingItems = false;
      }
    });
  }
}


