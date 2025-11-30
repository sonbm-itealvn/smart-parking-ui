import { Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { ParkingMapComponent } from './features/parking-map/parking-map.component';
import { StatisticsComponent } from './features/statistics/statistics.component';
import { VehicleManagementComponent } from './features/vehicle-management/vehicle-management.component';
import { MasterLayoutComponent } from './layouts/master-layout/master-layout.component';

export const routes: Routes = [
  {
    path: '',
    component: MasterLayoutComponent,
    children: [
      { path: '', component: DashboardComponent },
      { path: 'parking-map', component: ParkingMapComponent },
      { path: 'vehicle-management', component: VehicleManagementComponent },
      { path: 'statistics', component: StatisticsComponent }
    ]
  },
  { path: '**', redirectTo: '' }
];
