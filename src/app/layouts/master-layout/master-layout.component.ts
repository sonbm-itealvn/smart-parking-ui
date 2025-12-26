import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { User } from '../../core/models/api.models';

type NavigationItem = {
  label: string;
  icon: 'overview' | 'map' | 'car' | 'chart' | 'settings';
  route?: string;
  exact?: boolean;
};

@Component({
  selector: 'app-master-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './master-layout.component.html',
  styleUrl: './master-layout.component.scss'
})
export class MasterLayoutComponent {
  readonly user$: Observable<User | null>;

  constructor(private readonly authService: AuthService, private readonly router: Router) {
    this.user$ = this.authService.user$;
  }

  readonly primaryNavigation: NavigationItem[] = [
    { label: 'Tổng quan', icon: 'overview', route: '/', exact: true },
    { label: 'Sơ đồ bãi xe', icon: 'map', route: '/parking-map' },
    { label: 'Quản lý xe', icon: 'car', route: '/vehicle-management' },
    { label: 'Thống kê', icon: 'chart', route: '/statistics' },
    { label: 'Quản lý camera', icon: 'settings', route: '/camera-management' }
  ];

  readonly secondaryNavigation: NavigationItem[] = [{ label: 'Cài đặt', icon: 'settings' }];

  trackByLabel(_: number, item: NavigationItem): string {
    return item.label;
  }

  handleLogout(): void {
    this.authService.logout().subscribe(() => this.router.navigate(['/login']));
  }
}
