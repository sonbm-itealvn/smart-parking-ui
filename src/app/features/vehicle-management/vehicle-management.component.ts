import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

type VehicleStatus = 'parked' | 'exited';

type Vehicle = {
  id: number;
  plate: string;
  spot: string;
  entryTime: string;
  exitTime?: string;
  duration?: string;
  fee?: number;
  status: VehicleStatus;
  vehicleType: 'Ô tô' | 'Xe máy';
};

@Component({
  selector: 'app-vehicle-management-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './vehicle-management.component.html',
  styleUrl: './vehicle-management.component.scss'
})
export class VehicleManagementComponent {
  searchQuery = '';
  showAddModal = false;
  selectedVehicle: Vehicle | null = null;
  filterStatus: 'all' | VehicleStatus = 'all';

  vehicles: Vehicle[] = [
    { id: 1, plate: '29A-12345', spot: 'A-15', entryTime: '2025-11-30 08:30', status: 'parked', vehicleType: 'Ô tô' },
    {
      id: 2,
      plate: '30B-67890',
      spot: 'B-08',
      entryTime: '2025-11-30 09:15',
      exitTime: '2025-11-30 10:25',
      duration: '1h 10p',
      fee: 30000,
      status: 'exited',
      vehicleType: 'Ô tô'
    },
    { id: 3, plate: '51C-11111', spot: 'C-22', entryTime: '2025-11-30 10:20', status: 'parked', vehicleType: 'Xe máy' },
    {
      id: 4,
      plate: '92D-99999',
      spot: 'A-03',
      entryTime: '2025-11-30 07:45',
      exitTime: '2025-11-30 10:15',
      duration: '2h 30p',
      fee: 50000,
      status: 'exited',
      vehicleType: 'Ô tô'
    },
    { id: 5, plate: '43E-55555', spot: 'D-17', entryTime: '2025-11-30 10:10', status: 'parked', vehicleType: 'Ô tô' }
  ];

  newVehicle: { plate: string; spot: string; vehicleType: 'Ô tô' | 'Xe máy' } = {
    plate: '',
    spot: '',
    vehicleType: 'Ô tô'
  };

  get filteredVehicles(): Vehicle[] {
    return this.vehicles.filter((vehicle) => {
      const query = this.searchQuery.trim().toLowerCase();
      const searchMatch =
        !query ||
        vehicle.plate.toLowerCase().includes(query) ||
        vehicle.spot.toLowerCase().includes(query);
      const statusMatch = this.filterStatus === 'all' || vehicle.status === this.filterStatus;
      return searchMatch && statusMatch;
    });
  }

  get stats() {
    const parked = this.vehicles.filter((v) => v.status === 'parked').length;
    const exitedVehicles = this.vehicles.filter((v) => v.status === 'exited');
    const exited = exitedVehicles.length;
    const totalFee = exitedVehicles.reduce((sum, vehicle) => sum + (vehicle.fee || 0), 0);
    return { parked, exited, totalFee };
  }

  handleAddVehicle(): void {
    if (!this.newVehicle.plate || !this.newVehicle.spot) {
      return;
    }

    const now = new Date();
    const formatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    this.vehicles = [
      ...this.vehicles,
      {
        id: this.vehicles.length + 1,
        plate: this.newVehicle.plate,
        spot: this.newVehicle.spot,
        entryTime: formatted,
        status: 'parked',
        vehicleType: this.newVehicle.vehicleType
      }
    ];

    this.newVehicle = { plate: '', spot: '', vehicleType: 'Ô tô' };
    this.showAddModal = false;
  }

  handleCheckout(vehicle: Vehicle): void {
    const entryTime = new Date(vehicle.entryTime);
    const exitTime = new Date();
    const minutes = Math.floor((exitTime.getTime() - entryTime.getTime()) / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const remainderMinutes = minutes % 60;
    const baseFee = vehicle.vehicleType === 'Ô tô' ? 20000 : 10000;
    const fee = baseFee + hours * 15000;

    this.vehicles = this.vehicles.map((v) =>
      v.id === vehicle.id
        ? {
            ...v,
            status: 'exited',
            exitTime: `${exitTime.getFullYear()}-${String(exitTime.getMonth() + 1).padStart(2, '0')}-${String(exitTime.getDate()).padStart(2, '0')} ${String(exitTime.getHours()).padStart(2, '0')}:${String(exitTime.getMinutes()).padStart(2, '0')}`,
            duration: `${hours}h ${remainderMinutes}p`,
            fee
          }
        : v
    );

    this.selectedVehicle = null;
  }

  openCheckout(vehicle: Vehicle): void {
    this.selectedVehicle = vehicle;
  }

  trackByVehicle(_: number, vehicle: Vehicle): number {
    return vehicle.id;
  }
}
