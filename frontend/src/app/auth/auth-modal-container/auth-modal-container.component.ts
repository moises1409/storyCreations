import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalService, ModalType } from '../modal.service';
import { LoginModalComponent } from '../login-modal/login-modal.component';
import { SignupModalComponent } from '../signup-modal/signup-modal.component';

@Component({
  standalone: true,
  selector: 'app-auth-modal-container',
  imports: [CommonModule, LoginModalComponent, SignupModalComponent],
  template: `
    <ng-container *ngIf="currentModal$ | async as modalType">
      <app-login-modal *ngIf="modalType === 'login'"></app-login-modal>
      <app-signup-modal *ngIf="modalType === 'signup'"></app-signup-modal>
    </ng-container>
  `
})
export class AuthModalContainerComponent {
  private modalService = inject(ModalService);
  
  currentModal$ = this.modalService.currentModal$;
}
