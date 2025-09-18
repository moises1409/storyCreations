import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
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

  form = this.fb.group({
    name: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

  onSubmit() {
    if (this.form.invalid) return;
    this.loading = true; 
    this.error = '';
    const { name, email, password } = this.form.value;
    this.auth.signup(email!, password!, name || undefined).subscribe({
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

  closeModal() {
    this.modalService.close();
  }

  switchToLogin() {
    this.modalService.switchToSignIn();
  }
}
