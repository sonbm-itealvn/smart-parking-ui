import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { finalize, forkJoin } from 'rxjs';
import { ApiClientService } from '../../core/services/api-client.service';
import { ParkingSession, ParkingSlot, ParkingSlotStatus, ParkingLot, Vehicle } from '../../core/models/api.models';

type SpotStatus = ParkingSlotStatus;

interface ParkingSpot {
  id: string;
  status: SpotStatus;
  vehicle?: string;
  time?: string;
  parkingLotId?: number;
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
export class ParkingMapComponent implements OnInit {
  private readonly api = inject(ApiClientService);

  readonly cameras: CameraFeed[] = [
    {
      id: 1,
      name: 'Tổng quan bãi xe',
      location: 'Khu vực trung tâm',
      imageUrl: 'https://images.unsplash.com/photo-1502877828070-33b167ad6860?auto=format&fit=crop&w=1200&q=80',
      status: 'active'
    },
    {
      id: 2,
      name: 'Lối vào chính',
      location: 'Cổng A',
      imageUrl: 'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=1200&q=80',
      status: 'active'
    }
  ];

  readonly statDefinitions: Array<{ key: StatKey; label: string; indicator?: SpotStatus }> = [
    { key: 'total', label: 'Tổng số chỗ' },
    { key: 'available', label: 'Còn trống', indicator: 'available' },
    { key: 'occupied', label: 'Đang đỗ', indicator: 'occupied' }
  ];

  parkingLots: ParkingLot[] = [];
  spots: ParkingSpot[] = [];

  searchQuery = '';
  selectedZone = 'all';
  selectedCameraId: number | null = null;
  readonly now = new Date();
  loading = true;
  error: string | null = null;

  get zoneFilters() {
    return [{ value: 'all', label: 'Tất cả khu vực' }, ...this.parkingLots.map((lot) => ({ value: String(lot.id), label: lot.name }))];
  }

  get stats(): Record<StatKey, number> {
    return {
      total: this.filteredSpots.length,
      available: this.filteredSpots.filter((spot) => spot.status === 'available').length,
      occupied: this.filteredSpots.filter((spot) => spot.status === 'occupied').length
    };
  }

  get filteredSpots(): ParkingSpot[] {
    const selectedLotId = this.selectedZone;
    const query = this.searchQuery.trim().toLowerCase();

    return this.spots.filter((spot) => {
      const lotMatch = selectedLotId === 'all' || String(spot.parkingLotId) === selectedLotId;
      const searchMatch =
        !query ||
        spot.id.toLowerCase().includes(query) ||
        (spot.vehicle?.toLowerCase().includes(query) ?? false);

      return lotMatch && searchMatch;
    });
  }

  get activeCamera(): CameraFeed | null {
    return this.selectedCameraId ? this.cameras.find((cam) => cam.id === this.selectedCameraId) ?? null : null;
  }

  ngOnInit(): void {
    this.loadData();
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
      case 'out_of_service':
        return 'Bảo trì';
      default:
        return status;
    }
  }

  trackBySpot(_: number, spot: ParkingSpot): string {
    return spot.id;
  }

  private loadData(): void {
    this.loading = true;
    this.error = null;
    forkJoin({
      slots: this.api.getParkingSlots(),
      sessions: this.api.getParkingSessions(),
      vehicles: this.api.getVehicles(),
      lots: this.api.getParkingLots()
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: ({ slots, sessions, vehicles, lots }) => {
          this.parkingLots = lots;
          this.spots = this.hydrateSlots(slots, sessions, vehicles);
        },
        error: () => {
          this.error = 'Không tải được sơ đồ bãi xe từ máy chủ.';
        }
      });
  }

  private hydrateSlots(slots: ParkingSlot[], sessions: ParkingSession[], vehicles: Vehicle[]): ParkingSpot[] {
    const activeSessions = sessions.filter((session) => session.status === 'active');
    const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
    const sessionBySlot = new Map<number, ParkingSession>();
    activeSessions.forEach((session) => {
      sessionBySlot.set(session.parkingSlotId, session);
    });

    return slots.map((slot) => {
      const session = sessionBySlot.get(slot.id);
      const vehicle = session ? vehicleMap.get(session.vehicleId) : undefined;
      return {
        id: slot.slotCode,
        status: slot.status,
        vehicle: vehicle?.licensePlate,
        time: session ? new Date(session.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
        parkingLotId: slot.parkingLotId
      };
    });
  }
}
