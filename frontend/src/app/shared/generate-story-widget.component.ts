import { Component, EventEmitter, Output, Input, inject, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CharacterPickerModalComponent } from './character-picker-modal.component';

@Component({
  standalone: true,
  selector: 'app-generate-story-widget',
  imports: [CommonModule, ReactiveFormsModule, CharacterPickerModalComponent],
  template: `
    <div class="welcome-card start-card" style="padding-bottom:2rem;">
      <div class="char-section">
        <h2 class="section-title" style="margin:0 0 0.75rem 0;">Who are your characters?</h2>
        <div class="char-grid">
          <div class="char-col" *ngFor="let _ of slots; let i = index">
            <button type="button" class="char-card add-card" *ngIf="!characterImages[i]" title="Add character image" (click)="openPicker(i)">
              <div class="plus">+</div>
            </button>
            <div class="char-card has-image" *ngIf="characterImages[i]">
              <button type="button" class="remove-btn" (click)="removeCharacter(i)" aria-label="Remove character image">×</button>
              <img class="char-img" [src]="characterImages[i]" alt="Character image" />
            </div>
            <div class="char-caption" *ngIf="i>0">(optional)</div>
          </div>
        </div>
      </div>

      <form [formGroup]="form" (ngSubmit)="emitSeed()">
        <div class="prompt-area column">
          <h2 class="section-title" style="margin:0 0 0.5rem 0;">How would you like to start your story?</h2>
          <textarea class="form-input big-input" rows="4" formControlName="seed" placeholder="Give me a topic, premise and short instructions in any language"></textarea>
          <div class="prompt-chips">
            <button type="button" class="small" (click)="setSeed('A brave dragon in an enchanted forest')">A brave dragon</button>
            <button type="button" class="small" (click)="setSeed('An enchanted forest full of secrets')">An enchanted forest</button>
            <button type="button" class="small" (click)="setSeed('A space journey with new friends')">A space journey</button>
          </div>
          <div class="language-selection" style="margin-top: 1rem;" *ngIf="hasText">
            <label for="language-select" style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #333;">Language:</label>
            <select id="language-select" class="form-input" formControlName="language" style="width: 100%; padding: 0.75rem; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 1rem;">
              <option *ngFor="let option of languageOptions" [value]="option.value">{{ option.label }}</option>
            </select>
          </div>
          <div class="prompt-actions">
            <button class="dashboard-btn" type="submit" [disabled]="form.invalid">Generate my story</button>
          </div>
        </div>
      </form>
    </div>
    <app-character-picker-modal [open]="pickerOpen" (close)="closePicker()" (pick)="onPicked($event)"></app-character-picker-modal>
  `,
  styles: [
    `
    .welcome-card { background: var(--background-light); padding: 1.5rem; border-radius: 20px; border: 2px solid var(--border-light); transition: all 0.3s ease; text-align: left; box-shadow: 0 8px 20px var(--shadow-light); }
    .welcome-card:hover { border-color: var(--primary-pink); box-shadow: 0 12px 30px var(--shadow-medium); transform: translateY(-2px); }
    .start-card { max-width: 720px; margin: 0; text-align: left; }

    .prompt-area { padding: 0.75rem; display:grid; grid-template-columns: 1fr auto; gap: 0.75rem; align-items: start; }
    .prompt-area.column { grid-template-columns: 1fr; }
    .big-input { min-height: 96px; }
    .prompt-actions { display:flex; justify-content: flex-end; }

    .form-input { background: var(--background-light); border: 2px solid var(--border-light); border-radius: 12px; padding: 0.7rem 0.9rem; color: var(--text-dark); font-family: 'Fredoka', sans-serif; transition: all 0.3s ease; }
    .form-input:focus { outline: none; border-color: var(--primary-pink); box-shadow: 0 0 0 3px rgba(255, 111, 145, 0.1); }

    .dashboard-btn { background: linear-gradient(45deg, var(--primary-pink), var(--primary-yellow)); border:none; padding:0.8rem 1.4rem; border-radius: 30px; color: var(--text-white); font-weight: 700; cursor:pointer; box-shadow: 0 8px 20px rgba(255, 111, 145, 0.3); font-family: 'Fredoka', sans-serif; transition: all 0.3s ease; }
    .dashboard-btn:hover { transform: translateY(-3px); box-shadow: 0 12px 30px rgba(255, 111, 145, 0.4); }

    .prompt-chips { padding: 0 0.75rem 0.75rem; display:flex; gap: 0.5rem; flex-wrap: wrap; }
    .small { background: var(--primary-pink); color: var(--text-white); border:2px solid var(--primary-pink); border-radius: 12px; padding: 0.4rem 0.6rem; cursor:pointer; font-family: 'Fredoka', sans-serif; font-weight: 600; transition: all 0.3s ease; }
    .small:hover { background: var(--primary-yellow); border-color: var(--primary-yellow); transform: translateY(-1px); }

    /* Characters section */
    .char-section { margin-bottom: 1rem; padding: 0 0.75rem; }
    .char-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; align-items: start; justify-items: start; }
    .char-col { display:flex; flex-direction: column; align-items: flex-start; }
    .char-card { width: 120px; aspect-ratio: 1 / 1; border-radius: 16px; display:flex; align-items:center; justify-content:center; background: var(--background-light); border: 2px dashed var(--primary-pink); overflow: hidden; position: relative; transition: all 0.3s ease; }
    .char-card.premium { border-color: var(--primary-yellow); }
    .char-card.add-card { cursor: pointer; border-color: var(--border-light); color: var(--text-dark); position: relative; display:flex; align-items:center; justify-content:center; }
    .char-card.add-card:hover { border-color: var(--primary-pink); background: rgba(255, 111, 145, 0.05); transform: scale(1.05); }
    .plus { font-size: 1.6rem; color: var(--text-dark); line-height: 1; font-family: 'Fredoka', sans-serif; }
    .hidden-file { display:none; }
    .crown { width: 28px; height: 28px; }
    .char-card.has-image { border-style: solid; border-color: var(--border-light); background: var(--background-light); align-items: stretch; }
    .char-img { width: 100%; height: 100%; object-fit: cover; display:block; }
    .remove-btn { position: absolute; top: 6px; right: 6px; width: 26px; height: 26px; border-radius: 50%; border:2px solid var(--border-light); background: rgba(255, 111, 145, 0.8); color: var(--text-white); display:flex; align-items:center; justify-content:center; cursor: pointer; transition: all 0.3s ease; }
    .remove-btn:hover { background: #ff6b6b; border-color: #ff6b6b; transform: scale(1.1); }
    .char-caption { margin-top: 0.25rem; color: var(--text-medium); font-size: 0.9rem; font-family: 'Fredoka', sans-serif; }

    @media (max-width: 600px) { .char-grid { grid-template-columns: repeat(2, 1fr); } }
    `
  ]
})
export class GenerateStoryWidgetComponent implements OnChanges {
  private fb = inject(FormBuilder);

  @Output() generate = new EventEmitter<{ seed: string; language: string; character_ids: number[]; characters: { id: number; name?: string | null }[]; character_images: string[] }>();

  // Language options
  languageOptions = [
    { value: '', label: 'Auto-detect' },
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Spanish' },
    { value: 'fr', label: 'French' },
    { value: 'de', label: 'German' },
    { value: 'it', label: 'Italian' }
  ];

  form = this.fb.group({
    seed: ['', Validators.required],
    language: [''],
    character_ids: [[] as number[]]
  });

  // Character data (progressive slots)
  characterImages: (string | null)[] = [null, null, null];
  characterIds: (number | null)[] = [null, null, null];
  characterNames: (string | null)[] = [null, null, null];
  get slots() { return this.getVisibleSlots(); }
  pickerOpen = false;
  private pickingIndex: number | null = null;

  get hasText(): boolean {
    const seedValue = this.form.get('seed')?.value || '';
    return seedValue.trim().length > 0;
  }

  @Input() initialImages: string[] = [];

  private getVisibleSlots(): number[] {
    // Always show first slot. Reveal next only if previous has an image.
    const visible: number[] = [0];
    if (this.characterImages[0]) visible.push(1);
    if (this.characterImages[1]) visible.push(2);
    return visible;
  }

  setSeed(value: string) {
    this.form.patchValue({ seed: value });
  }

  onAddCharacter(event: Event, index: number) {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.characterImages[index] = String(reader.result || '');
      this.syncCharactersField();
    };
    reader.readAsDataURL(file);
  }

  removeCharacter(index: number) {
    this.characterImages[index] = null;
    this.syncCharactersField();
  }

  openPicker(index: number) {
    this.pickingIndex = index;
    this.pickerOpen = true;
  }

  closePicker() { this.pickerOpen = false; this.pickingIndex = null; }

  onPicked(item: { id:number; image:string; name?: string | null }) {
    if (this.pickingIndex === null) return;
    this.characterImages[this.pickingIndex] = item?.image || null;
    this.characterIds[this.pickingIndex] = typeof item?.id === 'number' ? item.id : null;
    this.characterNames[this.pickingIndex] = (typeof item?.name === 'string' ? item.name : null) as (string | null);
    this.syncCharactersField();
    this.pickerOpen = false; this.pickingIndex = null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialImages']) {
      const imgs = (this.initialImages || []).filter(Boolean);
      for (let i = 0; i < Math.min(imgs.length, this.characterImages.length); i++) {
        this.characterImages[i] = imgs[i];
      }
      this.syncCharactersField();
    }
  }

  emitSeed() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const seed = (this.form.value.seed ?? '').trim();
    const language = this.form.value.language || '';
    if (!seed) return;
    this.syncCharactersField();
    const ids = (this.form.value.character_ids as number[]) || [];
    const images = this.characterImages.filter((v): v is string => typeof v === 'string');
    const characters = ids.map((id) => {
      // Find the first slot where this id appears to pair with a name
      const idx = this.characterIds.findIndex((x) => x === id);
      const name = idx >= 0 ? (this.characterNames[idx] || null) : null;
      return { id, name };
    });
    this.generate.emit({ seed, language, character_ids: ids, characters, character_images: images });
  }

  private syncCharactersField() {
    const ids = this.characterIds.filter((v): v is number => typeof v === 'number');
    this.form.patchValue({ character_ids: ids }, { emitEvent: false });
  }
}


