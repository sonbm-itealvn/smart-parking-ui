import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, forkJoin, switchMap } from 'rxjs';
import { ApiClientService } from '../../core/services/api-client.service';
import { ParkingSession, ParkingSlot, Vehicle as ApiVehicle } from '../../core/models/api.models';

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
    this.loadData();
  }

  get filteredVehicles(): VehicleRow[] {
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
    const parked = this.vehicles.filter((v) => v.status === 'parked').length;
    const exitedVehicles = this.vehicles.filter((v) => v.status === 'exited');
    const exited = exitedVehicles.length;
    const totalFee = exitedVehicles.reduce((sum, vehicle) => sum + (vehicle.fee || 0), 0);
    return { parked, exited, totalFee };
  }

  handleAddVehicle(): void {
    if (!this.newVehicle.plate || this.newVehicle.parkingSlotId === undefined) {
      this.error = 'Vui lòng nhập biển số và chọn vị trí đỗ.';
      return;
    }

    this.submitting = true;
    this.error = null;

    // Create vehicle first, then create parking session for the selected slot
    this.api
      .createVehicle({ licensePlate: this.newVehicle.plate, vehicleType: this.newVehicle.vehicleType })
      .pipe(
        switchMap((vehicle: ApiVehicle) =>
          this.api.createParkingSession({
            vehicleId: vehicle.id,
            parkingSlotId: this.newVehicle.parkingSlotId
          })
        ),
        finalize(() => (this.submitting = false))
      )
      .subscribe({
        next: () => {
          this.showAddModal = false;
          this.newVehicle = { plate: '', parkingSlotId: undefined, vehicleType: 'car' };
          this.loadData();
        },
        error: () => {
          this.error = 'Không thể thêm xe. Vui lòng kiểm tra lại thông tin hoặc quyền truy cập.';
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

  private loadData(): void {
    this.loading = true;
    this.error = null;

    forkJoin({
      sessions: this.api.getParkingSessions(),
      vehicles: this.api.getVehicles(),
      slots: this.api.getParkingSlots()
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: ({ sessions, vehicles, slots }) => {
          this.parkingSlots = slots.filter((slot) => slot.status === 'available');
          this.vehicles = this.composeRows(sessions, vehicles, slots);
        },
        error: () => {
          this.error = 'Không tải được danh sách phương tiện.';
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
