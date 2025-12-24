import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, catchError, map, of, switchMap, tap, throwError } from 'rxjs';
import { ApiClientService } from './api-client.service';
import { AuthResponse, User } from '../models/api.models';

const ACCESS_TOKEN_KEY = 'sp_access_token';
const REFRESH_TOKEN_KEY = 'sp_refresh_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiClientService);
  private readonly router = inject(Router);

  private readonly userSubject = new BehaviorSubject<User | null>(null);
  readonly user$ = this.userSubject.asObservable();

  private refreshInProgress = false;

  constructor() {
    this.restoreUserFromStorage();
  }

  get accessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  get refreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  get isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  login(payload: { email: string; password: string }): Observable<AuthResponse> {
    return this.api.login(payload).pipe(
      tap((response) => this.persistAuth(response)),
      tap(() => this.loadProfile().subscribe())
    );
  }

  logout(): Observable<void> {
    return this.api.logout(this.refreshToken).pipe(
      catchError(() => of({ message: 'Logged out locally' })),
      tap(() => this.clearAuth()),
      map(() => void 0)
    );
  }

  loadProfile(): Observable<User | null> {
    if (!this.accessToken) {
      return of(null);
    }
    return this.api.profile().pipe(
      tap((user) => this.userSubject.next(user)),
      catchError(() => {
        this.clearAuth();
        return of(null);
      })
    );
  }

  refreshTokens(): Observable<{ accessToken: string; refreshToken: string }> {
    if (this.refreshInProgress) {
      const access = this.accessToken;
      const refresh = this.refreshToken;
      if (access && refresh) {
        return of({ accessToken: access, refreshToken: refresh });
      }
    }

    const refreshToken = this.refreshToken;
    if (!refreshToken) {
      return throwError(() => new Error('Missing refresh token'));
    }

    this.refreshInProgress = true;

    return this.api.refreshToken(refreshToken).pipe(
      tap((tokens) => {
        localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      }),
      tap(() => (this.refreshInProgress = false)),
      catchError((error) => {
        this.refreshInProgress = false;
        this.clearAuth();
        return throwError(() => error);
      })
    );
  }

  handleAuthError(error: HttpErrorResponse): Observable<never> {
    if (error.status === 401) {
      this.clearAuth();
      this.router.navigate(['/login']);
    }
    return throwError(() => error);
  }

  private persistAuth(response: AuthResponse): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
    this.userSubject.next(response.user);
  }

  private clearAuth(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    this.userSubject.next(null);
  }

  private restoreUserFromStorage(): void {
    if (!this.accessToken) {
      return;
    }
    this.loadProfile().subscribe();
  }
}

