import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, forkJoin, switchMap } from 'rxjs';
import { ApiClientService } from '../../core/services/api-client.service';
import { ParkingSession, ParkingSlot, Vehicle as ApiVehicle, ParkingLot } from '../../core/models/api.models';

type VehicleStatus = 'parked' | 'exited';

type VehicleRow = {
  sessionId: number;
  vehicleId: number;
  plate: string;
  slot: string;
  entryTime: string;
  exitTime?: string;
  duration?: string;
  fee?: number;
  status: VehicleStatus;
  vehicleType: string;
};

@Component({
  selector: 'app-vehicle-management-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './vehicle-management.component.html',
  styleUrl: './vehicle-management.component.scss'
})
export class VehicleManagementComponent implements OnInit {
  private readonly api = inject(ApiClientService);

  searchQuery = '';
  showAddModal = false;
  selectedVehicle: VehicleRow | null = null;
  filterStatus: 'all' | VehicleStatus = 'all';

  // View state
  selectedLotId: number | null = null; // null = list view, number = detail view
  selectedLot: ParkingLot | null = null;
  parkingLots: ParkingLot[] = [];
  
  vehicles: VehicleRow[] = [];
  parkingSlots: ParkingSlot[] = [];

  loading = true;
  submitting = false;
  error: string | null = null;

  newVehicle: { plate: string; parkingSlotId?: number; vehicleType: 'car' | 'motorcycle' | 'truck' } = {
    plate: '',
    parkingSlotId: undefined,
    vehicleType: 'car'
  };

  ngOnInit(): void {
    this.loadParkingLots();
  }

  selectLot(lot: ParkingLot): void {
    this.selectedLotId = lot.id;
    this.selectedLot = lot;
    this.loadVehiclesForLot(lot.id);
  }

  backToList(): void {
    this.selectedLotId = null;
    this.selectedLot = null;
    this.vehicles = [];
  }

  get filteredVehicles(): VehicleRow[] {
    if (!this.selectedLotId) {
      return [];
    }
    return this.vehicles.filter((vehicle) => {
      const query = this.searchQuery.trim().toLowerCase();
      const searchMatch =
        !query ||
        vehicle.plate.toLowerCase().includes(query) ||
        vehicle.slot.toLowerCase().includes(query);
      const statusMatch = this.filterStatus === 'all' || vehicle.status === this.filterStatus;
      return searchMatch && statusMatch;
    });
  }

  get stats() {
    if (!this.selectedLotId) {
      return { parked: 0, exited: 0, totalFee: 0 };
    }
    const parked = this.vehicles.filter((v) => v.status === 'parked').length;
    const exitedVehicles = this.vehicles.filter((v) => v.status === 'exited');
    const exited = exitedVehicles.length;
    const totalFee = exitedVehicles.reduce((sum, vehicle) => sum + (vehicle.fee || 0), 0);
    return { parked, exited, totalFee };
  }

  handleAddVehicle(): void {
    if (!this.newVehicle.plate || !this.selectedLotId) {
      this.error = 'Vui lòng nhập biển số và chọn bãi đỗ.';
      return;
    }

    this.submitting = true;
    this.error = null;

    // Use vehicle-detection API (flag: 0 = entry)
    // This API will automatically:
    // - Find or create vehicle (guest vehicles will have vehicleId = null)
    // - Find available slot if slotId is not provided
    // - Create parking session
    const payload: {
      licensePlate: string;
      flag: 0;
      parkingLotId: number;
      slotId?: number;
    } = {
      licensePlate: this.newVehicle.plate,
      flag: 0, // 0 = xe vào
      parkingLotId: this.selectedLotId
    };

    // If user selected a specific slot, include it
    if (this.newVehicle.parkingSlotId !== undefined) {
      payload.slotId = this.newVehicle.parkingSlotId;
    }

    this.api
      .vehicleDetection(payload)
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: (response: any) => {
          console.log('Vehicle entry processed:', response);
          this.showAddModal = false;
          this.newVehicle = { plate: '', parkingSlotId: undefined, vehicleType: 'car' };
          if (this.selectedLotId) {
            this.loadVehiclesForLot(this.selectedLotId);
          }
        },
        error: (err) => {
          const errorMessage = err?.error?.error || err?.error?.message || err?.message;
          if (errorMessage?.includes('permission') || errorMessage?.includes('Access denied')) {
            this.error = 'Bạn không có quyền thực hiện thao tác này.';
          } else if (errorMessage?.includes('already has an active parking session')) {
            this.error = 'Xe này đã có phiên đỗ xe đang hoạt động.';
          } else if (errorMessage?.includes('No available parking slot')) {
            this.error = 'Không tìm thấy vị trí đỗ trống.';
          } else {
            this.error = errorMessage || 'Không thể thêm xe. Vui lòng kiểm tra lại thông tin.';
          }
        }
      });
  }

  handleCheckout(vehicle: VehicleRow): void {
    this.submitting = true;
    this.api
      .exitParkingSession(vehicle.sessionId)
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: (response) => {
          const session = response.parkingSession;
          this.vehicles = this.vehicles.map((v) =>
            v.sessionId === vehicle.sessionId
              ? {
                  ...v,
                  status: session.status === 'completed' ? 'exited' : v.status,
                  exitTime: session.exitTime || v.exitTime,
                  fee: session.fee ?? v.fee,
                  duration: this.buildDuration(vehicle.entryTime, session.exitTime || new Date().toISOString())
                }
              : v
          );
          this.selectedVehicle = null;
          if (this.selectedLotId) {
            this.loadVehiclesForLot(this.selectedLotId);
          }
        },
        error: () => {
          this.error = 'Không thể thực hiện xuất xe. Vui lòng thử lại.';
        }
      });
  }

  openCheckout(vehicle: VehicleRow): void {
    this.selectedVehicle = vehicle;
  }

  trackByVehicle(_: number, vehicle: VehicleRow): number {
    return vehicle.sessionId;
  }

  getVehicleTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      car: 'Ô tô',
      motorcycle: 'Xe máy',
      truck: 'Xe tải',
      unknown: 'Không xác định'
    };
    return labels[type] || type;
  }

  formatTime(timeString: string): string {
    try {
      const date = new Date(timeString);
      return date.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return timeString;
    }
  }

  private loadParkingLots(): void {
    this.loading = true;
    this.error = null;

    this.api
      .getParkingLots()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (lots) => {
          this.parkingLots = lots;
        },
        error: (err) => {
          this.error = err?.error?.message || 'Không thể tải danh sách bãi đỗ.';
        }
      });
  }

  private loadVehiclesForLot(lotId: number): void {
    this.loading = true;
    this.error = null;

    forkJoin({
      sessions: this.api.getParkingSessions(),
      vehicles: this.api.getVehicles(),
      slots: this.api.getParkingSlots({ parkingLotId: lotId })
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: ({ sessions, vehicles, slots }) => {
          this.parkingSlots = slots.filter((slot) => slot.status === 'available');
          // Filter sessions by slots in this lot
          const slotIds = new Set(slots.map(s => s.id));
          const filteredSessions = sessions.filter(s => slotIds.has(s.parkingSlotId));
          this.vehicles = this.composeRows(filteredSessions, vehicles, slots);
        },
        error: (err) => {
          this.error = err?.error?.message || 'Không tải được danh sách phương tiện.';
        }
      });
  }

  private composeRows(sessions: ParkingSession[], vehicles: ApiVehicle[], slots: ParkingSlot[]): VehicleRow[] {
    const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
    const slotMap = new Map(slots.map((slot) => [slot.id, slot]));

    return sessions.map((session) => {
      const vehicle = vehicleMap.get(session.vehicleId);
      const slot = slotMap.get(session.parkingSlotId);
      const isExited = session.status !== 'active';
      return {
        sessionId: session.id,
        vehicleId: session.vehicleId,
        plate: vehicle?.licensePlate || 'N/A',
        slot: slot?.slotCode || 'N/A',
        entryTime: new Date(session.entryTime).toLocaleString(),
        exitTime: session.exitTime ? new Date(session.exitTime).toLocaleString() : undefined,
        duration: session.exitTime
          ? this.buildDuration(session.entryTime, session.exitTime)
          : undefined,
        fee: session.fee,
        status: isExited ? 'exited' : 'parked',
        vehicleType: vehicle?.vehicleType || 'unknown'
      };
    });
  }

  private buildDuration(entry: string, exit: string): string {
    const entryDate = new Date(entry);
    const exitDate = new Date(exit);
    const minutes = Math.max(0, Math.floor((exitDate.getTime() - entryDate.getTime()) / (1000 * 60)));
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `${hours}h ${remainder}p`;
  }
}
