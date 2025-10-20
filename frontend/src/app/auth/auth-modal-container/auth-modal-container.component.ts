import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalService, ModalType } from '../modal.service';
import { LoginModalComponent } from '../login-modal/login-modal.component';
import { SignupModalComponent } from '../signup-modal/signup-modal.component';
import { ForgotPasswordModalComponent } from '../forgot-password-modal/forgot-password-modal.component';
import { ResetPasswordModalComponent } from '../reset-password-modal/reset-password-modal.component';

@Component({
  standalone: true,
  selector: 'app-auth-modal-container',
  imports: [CommonModule, LoginModalComponent, SignupModalComponent, ForgotPasswordModalComponent, ResetPasswordModalComponent],
  template: `
    <ng-container *ngIf="currentModal$ | async as modalType">
      <app-login-modal *ngIf="modalType === 'login'"></app-login-modal>
      <app-signup-modal *ngIf="modalType === 'signup'"></app-signup-modal>
      <app-forgot-password-modal *ngIf="modalType === 'forgot'"></app-forgot-password-modal>
      <app-reset-password-modal *ngIf="modalType === 'reset'"></app-reset-password-modal>
    </ng-container>
  `
})
export class AuthModalContainerComponent {
  private modalService = inject(ModalService);
  
  currentModal$ = this.modalService.currentModal$;
}
