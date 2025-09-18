import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ModalType = 'login' | 'signup' | null;

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  private _currentModal$ = new BehaviorSubject<ModalType>(null);
  
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
