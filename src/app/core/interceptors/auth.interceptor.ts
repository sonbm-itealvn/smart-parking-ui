import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

const AUTH_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh-token'];

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authService = inject(AuthService);
  const shouldSkip = AUTH_PATHS.some((path) => request.url.includes(path));

  const authReq = authService.accessToken && !shouldSkip
    ? request.clone({ setHeaders: { Authorization: `Bearer ${authService.accessToken}` } })
    : request;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      const isUnauthorized = error.status === 401 && !shouldSkip;
      if (isUnauthorized && authService.refreshToken) {
        return authService.refreshTokens().pipe(
          switchMap((tokens) => {
            const retryReq = request.clone({
              setHeaders: { Authorization: `Bearer ${tokens.accessToken}` }
            });
            return next(retryReq);
          }),
          catchError((refreshError) => {
            authService.handleAuthError(refreshError);
            return throwError(() => refreshError);
          })
        );
      }
      return authService.handleAuthError(error);
    })
  );
};

