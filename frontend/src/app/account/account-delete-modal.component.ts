import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-account-delete-modal',
  imports: [CommonModule],
  template: `
<div class="modal-root" (click)="close()">
  <div class="modal-card" (click)="$event.stopPropagation()">
    <h2 class="modal-title">Delete account</h2>
    <p class="modal-sub">Please tell us why you are leaving (optional).</p>

    <div class="choices">
      <label class="chip"><input type="radio" name="reason" [value]="'too_expensive'" (change)="reason='too_expensive'"/> Too expensive</label>
      <label class="chip"><input type="radio" name="reason" [value]="'missing_features'" (change)="reason='missing_features'"/> Missing features</label>
      <label class="chip"><input type="radio" name="reason" [value]="'bugs'" (change)="reason='bugs'"/> Bugs/quality</label>
      <label class="chip"><input type="radio" name="reason" [value]="'other'" (change)="reason='other'"/> Other</label>
    </div>

    <textarea class="free-text" rows="4" placeholder="Tell us more..." (input)="freeText=($any($event.target).value)"></textarea>

    <div class="modal-actions">
      <button class="small" (click)="close()">Cancel</button>
      <button class="danger" [disabled]="!canConfirm()" (click)="confirm()">Confirm delete</button>
    </div>
  </div>
</div>
  `,
  styles: [`
.modal-root { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(2px); z-index: 2147483647; display: flex; align-items: center; justify-content: center; }
.modal-card { background: var(--medium-gray); border: 1px solid var(--light-gray); border-radius: 16px; padding: 1.25rem; width: min(680px, 92vw); color: var(--white); box-shadow: 0 20px 60px rgba(0,0,0,0.45); }
.modal-title { margin: 0 0 0.25rem 0; font-size: 1.4rem; font-weight: 800; }
.modal-sub { margin: 0 0 0.75rem 0; color: var(--text-gray); }
.choices { display:flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; }
.chip { background: var(--dark-gray); border:1px solid var(--light-gray); border-radius: 999px; padding: 0.35rem 0.6rem; color: var(--white); cursor:pointer; display:flex; align-items:center; gap:0.4rem; }
.chip:hover { border-color: var(--primary-green); }
.free-text { width:100%; background: var(--dark-gray); color: var(--white); border:1px solid var(--light-gray); border-radius: 10px; padding: 0.6rem 0.8rem; }
.modal-actions { margin-top: 0.9rem; display:flex; justify-content: flex-end; gap: 0.5rem; }
.small { background: transparent; color: var(--white); border:1px solid var(--light-gray); border-radius: 10px; padding: 0.45rem 0.75rem; cursor:pointer; }
.small:hover { border-color: var(--primary-green); }
.danger { background: transparent; color: #ff6b6b; border:1px solid #ff6b6b; border-radius: 10px; padding: 0.5rem 0.9rem; cursor:pointer; }
.danger:disabled { opacity: 0.5; cursor:not-allowed; }
`]
})
export class AccountDeleteModalComponent {
  @Output() cancel = new EventEmitter<void>();
  @Output() confirmDelete = new EventEmitter<{ choice?: string; text?: string }>();

  reason: string | null = null;
  freeText = '';

  canConfirm(): boolean {
    return !!(this.reason || (this.freeText && this.freeText.trim().length > 0));
  }

  close() { this.cancel.emit(); }
  confirm() { this.confirmDelete.emit({ choice: this.reason || undefined, text: (this.freeText || '').trim() || undefined }); }
}


