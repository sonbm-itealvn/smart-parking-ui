import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

type SpotStatus = 'available' | 'occupied';

interface ParkingSpot {
  id: string;
  status: SpotStatus;
  vehicle?: string;
  time?: string;
}

interface CameraFeed {
  id: number;
  name: string;
  location: string;
  imageUrl: string;
  status: 'active' | 'offline';
}

type StatKey = 'total' | 'available' | 'occupied';

@Component({
  selector: 'app-parking-map-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './parking-map.component.html',
  styleUrl: './parking-map.component.scss'
})
export class ParkingMapComponent {
  private readonly zones = ['A', 'B', 'C', 'D'];
  private readonly spotsPerZone = 25;
  private readonly vehicles = ['29A-12345', '30B-67890', '51C-11111', '92D-99999', '43E-55555'];
  private readonly statuses: SpotStatus[] = ['available', 'occupied'];

  readonly spots: ParkingSpot[] = this.generateSpots();

  readonly cameras: CameraFeed[] = [
    {
      id: 1,
      name: 'Khu vực A - Tổng quan',
      location: 'Khu vực A',
      imageUrl: 'https://images.unsplash.com/photo-1656644177899-a83d045640e9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwYXJraW5nJTIwbG90JTIwYWVyaWFsJTIwdmlld3xlbnwxfHx8fDE3NjQ0NjkxODB8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
      status: 'active'
    },
    {
      id: 2,
      name: 'Khu vực B - Camera giám sát',
      location: 'Khu vực B',
      imageUrl: 'https://images.unsplash.com/photo-1653750366046-289780bd8125?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYXIlMjBwYXJrJTIwc2VjdXJpdHklMjBjYW1lcmF8ZW58MXx8fHwxNzY0NDY5MTgwfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
      status: 'active'
    }
  ];

  readonly statDefinitions: Array<{ key: StatKey; label: string; indicator?: SpotStatus }> = [
    { key: 'total', label: 'Tổng số chỗ' },
    { key: 'available', label: 'Còn trống', indicator: 'available' },
    { key: 'occupied', label: 'Đang đỗ', indicator: 'occupied' }
  ];

  readonly zoneFilters = [
    { value: 'all', label: 'Tất cả khu vực' },
    ...this.zones.map((zone) => ({ value: zone, label: `Khu vực ${zone}` }))
  ];

  searchQuery = '';
  selectedZone = 'all';
  selectedCameraId: number | null = null;
  readonly now = new Date();

  get stats(): Record<StatKey, number> {
    return {
      total: this.spots.length,
      available: this.spots.filter((spot) => spot.status === 'available').length,
      occupied: this.spots.filter((spot) => spot.status === 'occupied').length
    };
  }

  get filteredSpots(): ParkingSpot[] {
    const zone = this.selectedZone.toLowerCase();
    const query = this.searchQuery.trim().toLowerCase();

    return this.spots.filter((spot) => {
      const zoneMatch = zone === 'all' || spot.id.toLowerCase().startsWith(zone);
      const searchMatch =
        !query ||
        spot.id.toLowerCase().includes(query) ||
        (spot.vehicle?.toLowerCase().includes(query) ?? false);

      return zoneMatch && searchMatch;
    });
  }

  get activeCamera(): CameraFeed | null {
    return this.selectedCameraId ? this.cameras.find((cam) => cam.id === this.selectedCameraId) ?? null : null;
  }

  handleSearch(value: string): void {
    this.searchQuery = value;
  }

  changeZone(value: string): void {
    this.selectedZone = value;
  }

  selectCamera(id: number): void {
    this.selectedCameraId = id;
  }

  closeCameraModal(): void {
    this.selectedCameraId = null;
  }

  getStatusLabel(status: SpotStatus): string {
    switch (status) {
      case 'available':
        return 'Trống';
      case 'occupied':
        return 'Đang đỗ';
      default:
        return status;
    }
  }

  trackBySpot(_: number, spot: ParkingSpot): string {
    return spot.id;
  }

  private generateSpots(): ParkingSpot[] {
    const spots: ParkingSpot[] = [];

    this.zones.forEach((zone) => {
      for (let i = 1; i <= this.spotsPerZone; i += 1) {
        const status = this.statuses[Math.floor(Math.random() * this.statuses.length)];
        const isOccupied = status === 'occupied';

        spots.push({
          id: `${zone}-${i.toString().padStart(2, '0')}`,
          status,
          vehicle: isOccupied ? this.vehicles[Math.floor(Math.random() * this.vehicles.length)] : undefined,
          time: isOccupied ? `${Math.floor(Math.random() * 4)}h ${Math.floor(Math.random() * 60)}p` : undefined
        });
      }
    });

    return spots;
  }
}
