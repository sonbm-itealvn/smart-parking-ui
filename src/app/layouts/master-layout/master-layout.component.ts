import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

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
  readonly primaryNavigation: NavigationItem[] = [
    { label: 'Tổng quan', icon: 'overview', route: '/', exact: true },
    { label: 'Sơ đồ bãi xe', icon: 'map', route: '/parking-map' },
    { label: 'Quản lý xe', icon: 'car', route: '/vehicle-management' },
    { label: 'Thống kê', icon: 'chart', route: '/statistics' }
  ];

  readonly secondaryNavigation: NavigationItem[] = [{ label: 'Cài đặt', icon: 'settings' }];

  trackByLabel(_: number, item: NavigationItem): string {
    return item.label;
  }
}
