import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth/auth.service';
import { ModalService } from './auth/modal.service';

import { routes } from './app.routes';
import { catchError, switchMap, throwError, from } from 'rxjs';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }), 
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
};

let refreshInFlight: Promise<void> | null = null;

function doRefresh(auth: AuthService, http: HttpClient): Promise<void> {
  if (!auth.refreshToken) return Promise.reject(new Error('no_refresh_token'));
  if (!refreshInFlight) {
    refreshInFlight = new Promise<void>((resolve, reject) => {
      auth.refreshAccess().subscribe({ next: () => resolve(), error: reject });
    }).finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

function authInterceptor(req: any, next: any) {
  const auth = inject(AuthService);
  const http = inject(HttpClient);
  const router = inject(Router);
  const modal = inject(ModalService);
  const token = auth.token;
  const isAuthUrl = String(req.url).includes('/auth/');
  const withAuth = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(withAuth).pipe(
    catchError((err: any) => {
      if (err && err.status === 401 && !isAuthUrl) {
        if (auth.refreshToken) {
          return from(doRefresh(auth, http)).pipe(
            switchMap(() => {
              const retry = withAuth.clone({ setHeaders: { Authorization: `Bearer ${auth.token}` } });
              return next(retry);
            }),
            catchError(() => {
              // Refresh failed → logout, redirect to public, open login modal
              auth.logout();
              router.navigateByUrl('/');
              setTimeout(() => modal.openLogin(), 0);
              return throwError(() => err);
            })
          );
        } else {
          // No refresh token → logout, redirect to public, open login modal
          auth.logout();
          router.navigateByUrl('/');
          setTimeout(() => modal.openLogin(), 0);
          return throwError(() => err);
        }
      }
      return throwError(() => err);
    })
  );
}
