import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../auth.service';
import { ModalService } from '../modal.service';

@Component({
  standalone: true,
  selector: 'app-forgot-password-modal',
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="modal-overlay" (click)="closeModal()">
      <div class="modal-container" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2 class="modal-title">Reset your password</h2>
          <button class="close-btn" (click)="closeModal()" type="button">×</button>
        </div>
        <div class="modal-body">
          <p class="modal-subtitle">Enter your email and we'll send you instructions to reset your password.</p>
          <form [formGroup]="form" (ngSubmit)="onSubmit()" class="auth-form">
            <div class="form-group">
              <label for="email" class="form-label">Email Address</label>
              <input id="email" type="email" class="form-input" formControlName="email" placeholder="you@example.com" autocomplete="email" />
              <div class="error-message" *ngIf="form.controls.email.invalid && form.controls.email.touched">
                Please enter a valid email address
              </div>
            </div>
            <div class="error-message" *ngIf="error">{{ error }}</div>
            <div class="success-message" *ngIf="success">We've sent reset instructions if the email exists.</div>
            <button type="submit" class="submit-btn" [disabled]="form.invalid || loading">
              {{ loading ? 'Sending…' : 'Send reset link' }}
            </button>
          </form>
          <div class="modal-footer">
            <button type="button" class="switch-btn" (click)="backToLogin()">Back to sign in</button>
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
    .modal-subtitle{color:#666;margin:0 0 1rem 0}
    .auth-form{display:flex;flex-direction:column;gap:1rem}
    .form-input{width:100%;padding:0.75rem;border:1px solid #ddd;border-radius:8px}
    .submit-btn{padding:0.75rem 1rem;border-radius:8px;border:none;background:#6a5acd;color:#fff;cursor:pointer}
    .error-message{color:#d33;font-size:0.9rem}
    .success-message{color:#2e7d32;font-size:0.95rem}
    .modal-footer{margin-top:1rem;text-align:center}
    .switch-btn{background:none;border:none;color:#6a5acd;cursor:pointer;text-decoration:underline}
  `]
})
export class ForgotPasswordModalComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private modal = inject(ModalService);

  loading = false;
  error = '';
  success = false;

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  onSubmit() {
    if (this.form.invalid) return;
    this.loading = true; this.error = ''; this.success = false;
    const email = (this.form.value.email || '').toString();
    this.auth.requestPasswordReset(email).subscribe({
      next: (res) => {
        this.loading = false; this.success = true;
        if (res?.reset_token) {
          // Auto-open reset modal with token if returned (no email flow)
          this.modal.openResetPasswordWithToken(res.reset_token);
        }
      },
      error: () => { this.loading = false; this.success = true; }
    });
  }

  closeModal() { this.modal.close(); }
  backToLogin() { this.modal.switchToLogin(); }
}
