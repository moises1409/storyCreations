import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { ModalService } from '../modal.service';

@Component({
  standalone: true,
  selector: 'app-signup-modal',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './signup-modal.component.html',
  styleUrls: ['./signup-modal.component.css']
})
export class SignupModalComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private modalService = inject(ModalService);

  loading = false;
  error = '';
  showPassword = false;
  showConfirmPassword = false;
  emailSuggestion: string | null = null;

  form = this.fb.group({
    name: [''],
    email: ['', [Validators.required, Validators.email, this.noWhitespaceValidator, this.emailDomainValidator]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]]
  }, { validators: this.passwordsMatchValidator });

  onSubmit() {
    if (this.form.invalid) return;
    this.loading = true; 
    this.error = '';
    const { name, email, password } = this.form.value;
    const normalizedEmail = (email || '').toString().trim().toLowerCase();
    this.auth.signup(normalizedEmail, password!, name || undefined).subscribe({
      next: () => { 
        this.loading = false; 
        this.modalService.close();
        this.router.navigateByUrl('/dashboard'); 
      },
      error: (e) => { 
        this.loading = false; 
        this.error = e?.error?.error || 'Registration error. Please try again.'; 
      }
    });
  }

  // Validators
  noWhitespaceValidator(control: AbstractControl): ValidationErrors | null {
    const value = (control.value || '').toString();
    return /\s/.test(value) ? { whitespace: true } : null;
  }

  emailDomainValidator(control: AbstractControl): ValidationErrors | null {
    const raw = (control.value || '').toString().trim().toLowerCase();
    if (!raw) return null;
    if (!raw.includes('@')) return { domainMissing: true };
    const parts = raw.split('@');
    if (parts.length !== 2) return { domainInvalid: true };
    const domain = parts[1];
    // Require a dot in the domain and TLD length >= 2
    if (!domain.includes('.')) return { domainDotMissing: true };
    const segs = domain.split('.');
    const tld = segs[segs.length - 1];
    if (!tld || tld.length < 2) return { domainTldShort: true };
    return null;
  }

  passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
    const password = group.get('password')?.value;
    const confirm = group.get('confirmPassword')?.value;
    if (!password || !confirm) return null;
    return password === confirm ? null : { passwordsMismatch: true };
  }

  constructor() {
    // Suggest common domain fixes as the user types
    this.form.controls.email.valueChanges.subscribe((val) => {
      const email = (val || '').toString();
      this.emailSuggestion = this.computeEmailSuggestion(email);
    });
  }

  acceptEmailSuggestion() {
    if (!this.emailSuggestion) return;
    this.form.controls.email.setValue(this.emailSuggestion);
    this.form.controls.email.markAsTouched();
    this.emailSuggestion = null;
  }

  private computeEmailSuggestion(input: string): string | null {
    const raw = (input || '').trim().toLowerCase();
    const at = raw.indexOf('@');
    if (at <= 0) return null; // need a local part
    const local = raw.slice(0, at);
    const domain = raw.slice(at + 1);
    if (!local) return null;
    if (!domain) return null;

    const known = [
      'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com',
      'icloud.com', 'proton.me', 'protonmail.com', 'live.com',
      'gmx.com', 'gmx.es', 'yahoo.es'
    ];
    const quickMap: Record<string, string> = {
      'gmail': 'gmail.com', 'gamil.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gmail.con': 'gmail.com',
      'outlook': 'outlook.com', 'outlok.com': 'outlook.com',
      'hotmail': 'hotmail.com', 'hotmial.com': 'hotmail.com',
      'yahoo': 'yahoo.com', 'yaho.com': 'yahoo.com',
      'icloud': 'icloud.com', 'iclod.com': 'icloud.com',
      'proton': 'proton.me', 'protonmail.co': 'protonmail.com'
    };

    // If the user typed a domain without dot but matches a known base
    if (!domain.includes('.') && quickMap[domain]) {
      return `${local}@${quickMap[domain]}`;
    }
    if (quickMap[domain]) {
      return `${local}@${quickMap[domain]}`;
    }

    // Find nearest known domain by simple edit distance
    let best: { d: number; cand: string } | null = null;
    for (const cand of known) {
      const d = this.stringDistance(domain, cand);
      if (best === null || d < best.d) best = { d, cand };
    }
    if (best && best.d > 0 && best.d <= 2) {
      return `${local}@${best.cand}`;
    }
    return null;
  }

  private stringDistance(a: string, b: string): number {
    // Basic Levenshtein distance
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  }

  closeModal() {
    this.modalService.close();
  }

  switchToLogin() {
    this.modalService.switchToSignIn();
  }
}
