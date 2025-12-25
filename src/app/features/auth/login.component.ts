import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);

  error: string | null = null;
  loading = false;

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  handleSubmit(): void {
    console.log('[LoginComponent] Form submitted');
    console.log('[LoginComponent] Form valid:', this.form.valid);
    console.log('[LoginComponent] Form value:', this.form.getRawValue());
    
    if (this.form.invalid) {
      console.log('[LoginComponent] Form is invalid, marking as touched');
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.error = null;

    const payload = this.form.getRawValue();
    console.log('[LoginComponent] Calling authService.login with:', { email: payload.email, password: '***' });
    
    this.authService
      .login({ email: payload.email!, password: payload.password! })
      .pipe(finalize(() => {
        console.log('[LoginComponent] Login request completed');
        this.loading = false;
      }))
      .subscribe({
        next: (response) => {
          console.log('[LoginComponent] Login successful, redirecting...');
          const redirect = this.route.snapshot.queryParamMap.get('redirect') || '/';
          this.router.navigateByUrl(redirect);
        },
        error: (err) => {
          console.error('[LoginComponent] Login error:', err);
          this.error = err?.error?.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại.';
        }
      });
  }
}

