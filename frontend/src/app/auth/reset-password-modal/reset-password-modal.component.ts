import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService } from '../auth.service';
import { ModalService } from '../modal.service';

@Component({
  standalone: true,
  selector: 'app-reset-password-modal',
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="modal-overlay" (click)="closeModal()">
      <div class="modal-container" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2 class="modal-title">Set a new password</h2>
          <button class="close-btn" (click)="closeModal()" type="button">×</button>
        </div>
        <div class="modal-body">
          <form [formGroup]="form" (ngSubmit)="onSubmit()" class="auth-form">
            <input id="token" type="hidden" formControlName="token" />
            <div class="form-group">
              <label for="password" class="form-label">New password</label>
              <input id="password" [type]="showPassword ? 'text':'password'" class="form-input" formControlName="password" placeholder="New password" />
              <div class="error-message" *ngIf="form.controls.password.invalid && form.controls.password.touched">
                Minimum 8 characters
              </div>
            </div>
            <div class="form-group">
              <label for="confirm" class="form-label">Confirm password</label>
              <input id="confirm" [type]="showConfirm ? 'text':'password'" class="form-input" formControlName="confirm" placeholder="Confirm password" />
              <div class="error-message" *ngIf="(form.hasError('mismatch') || form.controls.confirm.invalid) && form.controls.confirm.touched">
                Passwords do not match
              </div>
            </div>
            <div class="error-message" *ngIf="error">{{ error }}</div>
            <div class="success-message" *ngIf="success">Your password has been updated. You can sign in now.</div>
            <button *ngIf="!success" type="submit" class="submit-btn" [disabled]="form.invalid || loading">{{ loading ? 'Saving…' : 'Update password' }}</button>
          </form>
          <div class="modal-footer" *ngIf="success">
            <button type="button" class="switch-btn" (click)="goLogin()">Go to sign in</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000}
    .modal-container{background:#fff;border-radius:12px;max-width:420px;width:100%;overflow:hidden;border:1px solid #eee}
    .modal-header{display:flex;justify-content:space-between;align-items:center;padding:1rem 1rem;border-bottom:1px solid #eee}
    .modal-title{margin:0;font-size:1.25rem}
    .close-btn{background:none;border:none;cursor:pointer;font-size:1.2rem}
    .modal-body{padding:1rem}
    .auth-form{display:flex;flex-direction:column;gap:1rem}
    .form-input{width:100%;padding:0.75rem;border:1px solid #ddd;border-radius:8px}
    .submit-btn{padding:0.75rem 1rem;border-radius:8px;border:none;background:#6a5acd;color:#fff;cursor:pointer}
    .error-message{color:#d33;font-size:0.9rem}
    .success-message{color:#2e7d32;font-size:0.95rem}
    .modal-footer{margin-top:1rem;text-align:center}
    .switch-btn{background:none;border:none;color:#6a5acd;cursor:pointer;text-decoration:underline}
  `]
})
export class ResetPasswordModalComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private modal = inject(ModalService);

  loading = false;
  error = '';
  success = false;
  showPassword = false;
  showConfirm = false;

  form = this.fb.group({
    token: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirm: ['', [Validators.required]]
  }, { validators: this.match });

  match(group: AbstractControl): ValidationErrors | null {
    const p = group.get('password')?.value;
    const c = group.get('confirm')?.value;
    if (!p || !c) return null;
    return p === c ? null : { mismatch: true };
  }

  onSubmit() {
    if (this.form.invalid) return;
    this.loading = true; this.error = ''; this.success = false;
    const { token, password } = this.form.value;
    this.auth.resetPassword(token!, password!).subscribe({
      next: () => { this.loading = false; this.success = true; },
      error: (e) => { this.loading = false; this.error = e?.error?.error || 'Reset failed'; }
    })
  }

  closeModal() { this.modal.close(); }
  goLogin() { this.modal.switchToLogin(); }

  constructor() {
    // Prefill token if modal service carries one
    const token = this.modal.getResetToken?.() as string | null;
    if (token) {
      this.form.controls.token.setValue(token);
      this.modal.clearResetToken?.();
    }
  }
}
