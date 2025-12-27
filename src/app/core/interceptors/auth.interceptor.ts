import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Public endpoints that don't require authentication
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh-token',
  '/api/vehicle-detection',
  '/health'
];

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  // Get the URL path (handle both absolute and relative URLs)
  const url = request.url;
  let urlPath = url;
  
  // If it's an absolute URL, extract the pathname
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      urlPath = new URL(url).pathname;
    } catch (e) {
      // If URL parsing fails, use the original URL
      urlPath = url;
    }
  }
  
  // Check if this is a public endpoint (match the path)
  const isPublicPath = PUBLIC_PATHS.some((path) => {
    // Match exact path or path that contains the public path
    return urlPath === path || urlPath.includes(path);
  });
  
  // Get current access token
  const accessToken = authService.accessToken;
  const refreshToken = authService.refreshToken;
  
  // Add Authorization header for all non-public requests
  let authReq = request;
  
  if (!isPublicPath) {
    if (accessToken) {
      // Clone request and add Authorization header
      console.log('[AuthInterceptor] Adding Bearer token to request:', urlPath);
      authReq = request.clone({ 
        setHeaders: { 
          Authorization: `Bearer ${accessToken}` 
        } 
      });
    } else if (refreshToken) {
      // No access token but have refresh token - try to refresh first before making request
      // This prevents unnecessary 401 errors
      console.log('[AuthInterceptor] No access token but have refresh token, refreshing before request:', urlPath);
      return authService.refreshTokens().pipe(
        switchMap((tokens) => {
          // Retry the original request with new token
          const retryReq = request.clone({
            setHeaders: { 
              Authorization: `Bearer ${tokens.accessToken}` 
            }
          });
          return next(retryReq);
        }),
        catchError((refreshError) => {
          // Only clear auth and redirect if refresh token is actually invalid (401/403)
          // Don't redirect on network errors or other errors
          const isAuthError = refreshError instanceof HttpErrorResponse && 
                             (refreshError.status === 401 || refreshError.status === 403);
          
          if (isAuthError) {
            console.log('[AuthInterceptor] Refresh token is invalid (401/403) before request, clearing auth and redirecting to login');
            authService.clearAuth();
            router.navigate(['/login']);
          } else {
            console.warn('[AuthInterceptor] Token refresh failed before request with non-auth error, keeping auth state:', refreshError);
          }
          return throwError(() => refreshError);
        })
      );
    } else {
      // No tokens available - this should not happen if user is logged in
      // But we'll let the request go through so server can return proper error
      console.warn('[AuthInterceptor] No tokens for protected endpoint:', urlPath);
    }
  } else {
    // Debug: log public path requests
    console.log('[AuthInterceptor] Public endpoint, skipping auth:', urlPath);
  }

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Handle 401 (Unauthorized) - token expired or invalid
      const isUnauthorized = error.status === 401 && !isPublicPath;
      
      // Handle 403 (Forbidden) - might also need token refresh if token expired
      const isForbidden = error.status === 403 && !isPublicPath;
      
      // Try to refresh token if we have a refresh token
      if ((isUnauthorized || isForbidden) && authService.refreshToken) {
        console.log('[AuthInterceptor] Got 401/403, attempting to refresh token...');
        // Try to refresh token and retry the request
        return authService.refreshTokens().pipe(
          switchMap((tokens) => {
            console.log('[AuthInterceptor] Token refreshed successfully, retrying request');
            // Retry the original request with new token
            const retryReq = request.clone({
              setHeaders: { 
                Authorization: `Bearer ${tokens.accessToken}` 
              }
            });
            return next(retryReq);
          }),
          catchError((refreshError) => {
            // Only clear auth and redirect if refresh token is actually invalid (401/403)
            // Don't redirect on network errors or other errors
            const isAuthError = refreshError instanceof HttpErrorResponse && 
                               (refreshError.status === 401 || refreshError.status === 403);
            
            if (isAuthError) {
              console.log('[AuthInterceptor] Refresh token is invalid (401/403), clearing auth and redirecting to login');
              authService.clearAuth();
              router.navigate(['/login']);
            } else {
              console.warn('[AuthInterceptor] Token refresh failed with non-auth error, keeping auth state:', refreshError);
            }
            return throwError(() => refreshError);
          })
        );
      }
      
      // For 401/403 errors without refresh token, redirect to login
      // If we have refreshToken, we already tried to refresh above
      if ((isUnauthorized || isForbidden) && !authService.refreshToken) {
        console.log('[AuthInterceptor] No refresh token available, redirecting to login');
        authService.clearAuth();
        router.navigate(['/login']);
      }
      
      return throwError(() => error);
    })
  );
};

