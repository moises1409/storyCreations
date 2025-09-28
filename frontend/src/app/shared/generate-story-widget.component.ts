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

      <h2 class="section-title" style="margin:0 0 0.5rem 0;">What would you like to create today?</h2>
      <form [formGroup]="form" (ngSubmit)="emitSeed()">
        <div class="prompt-area column">
          <textarea class="form-input big-input" rows="4" formControlName="seed" placeholder="Give me a topic, premise and short instructions in any language"></textarea>
          <div class="prompt-chips">
            <button type="button" class="small" (click)="setSeed('A brave dragon in an enchanted forest')">A brave dragon</button>
            <button type="button" class="small" (click)="setSeed('An enchanted forest full of secrets')">An enchanted forest</button>
            <button type="button" class="small" (click)="setSeed('A space journey with new friends')">A space journey</button>
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
    .welcome-card { background: var(--medium-gray); padding: 1.5rem; border-radius: 16px; border: 2px solid var(--light-gray); transition: all 0.3s ease; text-align: left; }
    .welcome-card:hover { border-color: var(--primary-green); box-shadow: 0 20px 40px rgba(0,255,136,0.1); }
    .start-card { max-width: 720px; margin: 0; text-align: left; }

    .prompt-area { padding: 0.75rem; display:grid; grid-template-columns: 1fr auto; gap: 0.75rem; align-items: start; }
    .prompt-area.column { grid-template-columns: 1fr; }
    .big-input { min-height: 96px; }
    .prompt-actions { display:flex; justify-content: flex-end; }

    .form-input { background: var(--dark-gray); border: 2px solid var(--light-gray); border-radius: 12px; padding: 0.7rem 0.9rem; color: var(--white); }
    .form-input:focus { outline: none; border-color: var(--primary-green); box-shadow: 0 0 0 3px rgba(0,255,136,0.1); }

    .dashboard-btn { background: linear-gradient(45deg, var(--primary-green), var(--secondary-green)); border:none; padding:0.8rem 1.4rem; border-radius: 24px; color: var(--black); font-weight: 700; cursor:pointer; box-shadow: 0 10px 30px rgba(0,255,136,0.3); }
    .dashboard-btn:hover { transform: translateY(-2px); box-shadow: 0 15px 40px rgba(0,255,136,0.4); }

    .prompt-chips { padding: 0 0.75rem 0.75rem; display:flex; gap: 0.5rem; flex-wrap: wrap; }
    .small { background: var(--light-gray); color: var(--white); border:1px solid var(--light-gray); border-radius: 8px; padding: 0.4rem 0.6rem; cursor:pointer; }
    .small:hover { border-color: var(--primary-green); }

    /* Characters section */
    .char-section { margin-bottom: 1rem; padding: 0 0.75rem; }
    .char-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; align-items: start; justify-items: start; }
    .char-col { display:flex; flex-direction: column; align-items: flex-start; }
    .char-card { width: 120px; aspect-ratio: 1 / 1; border-radius: 16px; display:flex; align-items:center; justify-content:center; background: var(--medium-gray); border: 2px dashed #ffa726; overflow: hidden; position: relative; }
    .char-card.premium { border-color: #ffa726; }
    .char-card.add-card { cursor: pointer; border-color: var(--light-gray); color: var(--white); position: relative; display:flex; align-items:center; justify-content:center; }
    .char-card.add-card:hover { border-color: var(--primary-green); }
    .plus { font-size: 1.6rem; color: var(--white); line-height: 1; }
    .hidden-file { display:none; }
    .crown { width: 28px; height: 28px; }
    .char-card.has-image { border-style: solid; border-color: var(--light-gray); background: var(--dark-gray); align-items: stretch; }
    .char-img { width: 100%; height: 100%; object-fit: cover; display:block; }
    .remove-btn { position: absolute; top: 6px; right: 6px; width: 26px; height: 26px; border-radius: 50%; border:1px solid var(--light-gray); background: rgba(0,0,0,0.35); color: #ffffff; display:flex; align-items:center; justify-content:center; cursor: pointer; }
    .remove-btn:hover { background: #ff6b6b; border-color: #ff6b6b; }
    .char-caption { margin-top: 0.25rem; color: var(--text-gray); font-size: 0.9rem; }

    @media (max-width: 600px) { .char-grid { grid-template-columns: repeat(2, 1fr); } }
    `
  ]
})
export class GenerateStoryWidgetComponent implements OnChanges {
  private fb = inject(FormBuilder);

  @Output() generate = new EventEmitter<{ seed: string; character_ids: number[] }>();

  form = this.fb.group({
    seed: ['', Validators.required],
    character_ids: [[] as number[]]
  });

  // Character images data URLs (progressive slots)
  characterImages: (string | null)[] = [null, null, null];
  characterIds: (number | null)[] = [null, null, null];
  get slots() { return this.getVisibleSlots(); }
  pickerOpen = false;
  private pickingIndex: number | null = null;

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
    if (!seed) return;
    this.syncCharactersField();
    const ids = (this.form.value.character_ids as number[]) || [];
    this.generate.emit({ seed, character_ids: ids });
  }

  private syncCharactersField() {
    const ids = this.characterIds.filter((v): v is number => typeof v === 'number');
    this.form.patchValue({ character_ids: ids }, { emitEvent: false });
  }
}


