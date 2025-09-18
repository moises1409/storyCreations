import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { ModalService } from '../modal.service';

@Component({
  standalone: true,
  selector: 'app-login-modal',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login-modal.component.html',
  styleUrls: ['./login-modal.component.css']
})
export class LoginModalComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private modalService = inject(ModalService);

  loading = false;
  error = '';

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  onSubmit() {
    if (this.form.invalid) return;
    this.loading = true; 
    this.error = '';
    const { email, password } = this.form.value;
    this.auth.login(email!, password!).subscribe({
      next: () => { 
        this.loading = false; 
        this.modalService.close();
        this.router.navigateByUrl('/dashboard'); 
      },
      error: (e) => { 
        this.loading = false; 
        this.error = e?.error?.error || 'Login error. Please try again.'; 
      }
    });
  }

  closeModal() {
    this.modalService.close();
  }

  switchToSignup() {
    this.modalService.switchToSignup();
  }
}
