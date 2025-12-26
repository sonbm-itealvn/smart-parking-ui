import { Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { ParkingMapComponent } from './features/parking-map/parking-map.component';
import { StatisticsComponent } from './features/statistics/statistics.component';
import { VehicleManagementComponent } from './features/vehicle-management/vehicle-management.component';
import { CameraManagementComponent } from './features/camera-management/camera-management.component';
import { MasterLayoutComponent } from './layouts/master-layout/master-layout.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent)
  },
  {
    path: '',
    component: MasterLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', component: DashboardComponent },
      { path: 'parking-map', component: ParkingMapComponent },
      { path: 'vehicle-management', component: VehicleManagementComponent },
      { path: 'statistics', component: StatisticsComponent },
      { path: 'camera-management', component: CameraManagementComponent }
    ]
  },
  { path: '**', redirectTo: '' }
];
