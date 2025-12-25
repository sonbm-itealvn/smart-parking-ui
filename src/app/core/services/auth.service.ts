import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private readonly userSubject = new BehaviorSubject<User | null>(null);
  readonly user$ = this.userSubject.asObservable();

  get currentUser(): User | null {
    return this.userSubject.value;
  }

  get isAdmin(): boolean {
    const user = this.currentUser;
    if (!user) {
      return false;
    }
    
    // roleId = 2 is admin (can be string '2' or number 2)
    const roleId = user.roleId;
    const isAdmin = roleId === 2 || roleId === '2';
    
    console.log('[AuthService] isAdmin check:', { 
      user, 
      roleId, 
      roleIdType: typeof roleId,
      isAdmin 
    });
    
    return isAdmin;
  }

  private refreshInProgress = false;
  private refreshTokenSubject: BehaviorSubject<{ accessToken: string; refreshToken: string } | null> | null = null;

  constructor() {
    if (this.isBrowser) {
      this.restoreUserFromStorage();
    }
  }

  get accessToken(): string | null {
    if (!this.isBrowser) {
      return null;
    }
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    // Debug: log when token is accessed
    if (!token) {
      console.warn('[AuthService] accessToken getter: No token found in localStorage');
    }
    return token;
  }

  get refreshToken(): string | null {
    if (!this.isBrowser) {
      return null;
    }
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  get isAuthenticated(): boolean {
    // User is considered authenticated if they have either accessToken or refreshToken
    // This allows the app to stay logged in even if accessToken expires (will refresh)
    return !!(this.accessToken || this.refreshToken);
  }

  login(payload: { email: string; password: string }): Observable<AuthResponse> {
    console.log('[AuthService] Login called with:', payload);
    return this.api.login(payload).pipe(
      tap((response) => {
        console.log('[AuthService] Login response received:', response);
        this.persistAuth(response);
      }),
      tap(() => {
        console.log('[AuthService] Loading profile after login');
        this.loadProfile().subscribe();
      })
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
      tap((user) => {
        console.log('[AuthService] Profile loaded successfully:', user);
        this.userSubject.next(user);
      }),
      catchError((err) => {
        console.error('[AuthService] Profile load failed:', err);
        // Don't clear auth if we have refreshToken - let interceptor handle refresh
        if (!this.refreshToken) {
          console.log('[AuthService] No refreshToken, clearing auth');
          this.clearAuth();
        } else {
          console.log('[AuthService] RefreshToken exists, keeping auth state');
        }
        return of(null);
      })
    );
  }

  refreshTokens(): Observable<{ accessToken: string; refreshToken: string }> {
    if (!this.isBrowser) {
      return throwError(() => new Error('Not in browser environment'));
    }

    const refreshToken = this.refreshToken;
    if (!refreshToken) {
      return throwError(() => new Error('Missing refresh token'));
    }

    // If refresh is already in progress, return the observable that will emit when refresh completes
    if (this.refreshInProgress && this.refreshTokenSubject) {
      return this.refreshTokenSubject.asObservable().pipe(
        switchMap((tokens) => {
          if (tokens) {
            return of(tokens);
          }
          return throwError(() => new Error('Refresh failed'));
        })
      );
    }

    // Start new refresh process
    this.refreshInProgress = true;
    this.refreshTokenSubject = new BehaviorSubject<{ accessToken: string; refreshToken: string } | null>(null);

    return this.api.refreshToken(refreshToken).pipe(
      tap((tokens) => {
        if (this.isBrowser) {
          localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
          localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
        }
        // Notify all waiting requests
        if (this.refreshTokenSubject) {
          this.refreshTokenSubject.next({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
          });
          this.refreshTokenSubject.complete();
          this.refreshTokenSubject = null;
        }
      }),
      tap(() => (this.refreshInProgress = false)),
      catchError((error) => {
        this.refreshInProgress = false;
        // Notify all waiting requests of failure
        if (this.refreshTokenSubject) {
          this.refreshTokenSubject.error(error);
          this.refreshTokenSubject = null;
        }
        this.clearAuth();
        return throwError(() => error);
      })
    );
  }

  handleAuthError(error: HttpErrorResponse): void {
    // Only redirect to login if we don't have a refresh token
    // If we have refresh token, let interceptor handle the refresh
    if (!this.refreshToken) {
      console.log('[AuthService] No refresh token available, redirecting to login');
      this.clearAuth();
      this.router.navigate(['/login']);
    } else {
      console.log('[AuthService] Refresh token available, will try to refresh');
      // Don't clear auth or redirect - let interceptor handle refresh
    }
  }

  private persistAuth(response: AuthResponse): void {
    console.log('[AuthService] persistAuth called, isBrowser:', this.isBrowser);
    console.log('[AuthService] Response:', response);
    
    if (this.isBrowser) {
      try {
        console.log('[AuthService] Saving tokens to localStorage');
        localStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
        
        // Verify tokens were saved
        const savedAccess = localStorage.getItem(ACCESS_TOKEN_KEY);
        const savedRefresh = localStorage.getItem(REFRESH_TOKEN_KEY);
        
        if (!savedAccess || !savedRefresh) {
          console.error('[AuthService] Failed to save tokens to localStorage');
          console.error('[AuthService] Access token saved:', !!savedAccess);
          console.error('[AuthService] Refresh token saved:', !!savedRefresh);
        } else {
          console.log('[AuthService] Tokens saved successfully');
          console.log('[AuthService] Access token length:', savedAccess.length);
          console.log('[AuthService] Refresh token length:', savedRefresh.length);
        }
      } catch (error) {
        console.error('[AuthService] Error saving to localStorage:', error);
      }
    } else {
      console.warn('[AuthService] Not in browser environment, cannot save to localStorage');
    }
    
    // Always update user subject, regardless of browser environment
    console.log('[AuthService] Updating user subject with:', response.user);
    this.userSubject.next(response.user);
  }

  clearAuth(): void {
    if (this.isBrowser) {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
    this.userSubject.next(null);
  }

  private restoreUserFromStorage(): void {
    if (!this.isBrowser) {
      return;
    }
    
    console.log('[AuthService] Restoring user from storage...');
    console.log('[AuthService] Has accessToken:', !!this.accessToken);
    console.log('[AuthService] Has refreshToken:', !!this.refreshToken);
    
    // If we have accessToken, try to load profile
    // If accessToken is expired, profile API will return 401 and interceptor will refresh
    if (this.accessToken) {
      console.log('[AuthService] AccessToken found, loading profile...');
      this.loadProfile().subscribe({
        next: (user) => {
          console.log('[AuthService] Profile restored successfully:', user);
        },
        error: (err) => {
          console.error('[AuthService] Profile restore failed:', err);
          // Don't clear auth here - loadProfile already handles it
        }
      });
    } else if (this.refreshToken) {
      // If only refreshToken exists (accessToken expired), try to refresh
      console.log('[AuthService] Only refreshToken found, attempting to refresh...');
      this.refreshTokens().subscribe({
        next: () => {
          console.log('[AuthService] Token refreshed successfully, loading profile');
          this.loadProfile().subscribe();
        },
        error: (err) => {
          console.error('[AuthService] Token refresh failed:', err);
          // Only clear if refresh really failed (both tokens invalid)
          console.log('[AuthService] Clearing auth due to refresh failure');
          this.clearAuth();
        }
      });
    } else {
      console.log('[AuthService] No tokens found in storage');
    }
  }
}

