import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ModalType = 'login' | 'signup' | 'forgot' | 'reset' | null;

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  private _currentModal$ = new BehaviorSubject<ModalType>(null);
  private _resetToken: string | null = null;
  
  currentModal$ = this._currentModal$.asObservable();

  openLogin() {
    this._currentModal$.next('login');
  }

  openSignIn() {
    this._currentModal$.next('login');
  }

  openSignup() {
    this._currentModal$.next('signup');
  }

  openForgotPassword() {
    this._currentModal$.next('forgot');
  }

  openResetPassword() {
    this._currentModal$.next('reset');
  }

  openResetPasswordWithToken(token: string) {
    this._resetToken = token || null;
    this._currentModal$.next('reset');
  }

  getResetToken() {
    return this._resetToken;
  }

  clearResetToken() {
    this._resetToken = null;
  }

  close() {
    this._currentModal$.next(null);
  }

  switchToLogin() {
    this._currentModal$.next('login');
  }

  switchToSignIn() {
    this._currentModal$.next('login');
  }

  switchToSignup() {
    this._currentModal$.next('signup');
  }
}
