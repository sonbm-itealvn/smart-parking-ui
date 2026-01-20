import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, forkJoin, switchMap } from 'rxjs';
import { ApiClientService } from '../../core/services/api-client.service';
import { ParkingSession, ParkingSlot, Vehicle as ApiVehicle, ParkingLot, ParkingLotVehiclesResponse } from '../../core/models/api.models';

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
  vehiclesResponse: ParkingLotVehiclesResponse | null = null; // Lưu response gốc để tính tổng fee
  slotsWithSessions: any[] = []; // Lưu slots với parkingSessions để tính tổng fee

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
    this.slotsWithSessions = []; // Clear slots khi quay lại danh sách
    this.vehiclesResponse = null; // Clear response
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
    
    // Tính tổng fee từ slots với parkingSessions có status 'completed'
    let totalFee = 0;
    if (this.slotsWithSessions && this.slotsWithSessions.length > 0) {
      this.slotsWithSessions.forEach((slot: any) => {
        if (slot.parkingSessions && Array.isArray(slot.parkingSessions)) {
          slot.parkingSessions.forEach((session: any) => {
            if (session.status === 'completed') {
              // Convert fee từ string sang number, null/undefined = 0
              const fee = session.fee ? parseFloat(String(session.fee)) : 0;
              totalFee += fee;
              console.log('Found completed session with fee:', session.licensePlate, fee);
            }
          });
        }
      });
      console.log('Total fee calculated:', totalFee, 'from', this.slotsWithSessions.length, 'slots');
    } else {
      console.log('No slotsWithSessions available for fee calculation');
    }
    
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
    this.error = null;
    this.api
      .exitParkingSession(vehicle.sessionId)
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: (response) => {
          console.log('Checkout response:', response);
          this.selectedVehicle = null;
          // Reload data to get updated session with exitTime and fee
          if (this.selectedLotId) {
            this.loadVehiclesForLot(this.selectedLotId);
          }
        },
        error: (err) => {
          console.error('Checkout error:', err);
          const errorMessage = err?.error?.error || err?.error?.message || err?.message;
          this.error = errorMessage || 'Không thể thực hiện xuất xe. Vui lòng thử lại.';
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

    // Load slots với parkingSessions
    this.api.getParkingSlots({ parkingLotId: lotId })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (slots) => {
          console.log('Parking slots with sessions:', slots);
          // Lưu slots với sessions để tính tổng fee
          this.slotsWithSessions = slots;
          // Load available slots for the add vehicle modal
          this.parkingSlots = slots.filter((slot: any) => slot.status === 'available');
          
          // Compose vehicle rows từ slots với sessions
          this.vehicles = this.composeRowsFromSlots(slots);
          
          // Vẫn giữ logic cũ cho getParkingLotVehicles nếu cần
          this.api.getParkingLotVehicles(lotId).subscribe({
            next: (response) => {
              if (response.parkingLot && this.selectedLot) {
                this.selectedLot.name = response.parkingLot.name;
                this.selectedLot.location = response.parkingLot.address;
              }
              this.vehiclesResponse = response;
            },
            error: (err) => {
              console.error('Error loading parking lot vehicles:', err);
            }
          });
        },
        error: (err) => {
          console.error('Error loading slots:', err);
          this.error = err?.error?.message || 'Không tải được danh sách phương tiện.';
        }
      });
  }

  private composeRowsFromSlots(slots: any[]): VehicleRow[] {
    const rows: VehicleRow[] = [];
    
    slots.forEach((slot: any) => {
      if (slot.parkingSessions && Array.isArray(slot.parkingSessions)) {
        slot.parkingSessions.forEach((session: any) => {
          const isExited = session.status === 'completed';
          rows.push({
            sessionId: parseInt(String(session.id), 10),
            vehicleId: session.vehicleId ? parseInt(String(session.vehicleId), 10) : 0,
            plate: session.licensePlate || 'N/A',
            slot: slot.slotCode || 'N/A',
            entryTime: session.entryTime,
            exitTime: session.exitTime || undefined,
            duration: session.exitTime && session.entryTime
              ? this.buildDuration(session.entryTime, session.exitTime)
              : undefined,
            fee: session.fee ? parseFloat(String(session.fee)) : undefined,
            status: isExited ? 'exited' : 'parked',
            vehicleType: 'unknown' // Có thể lấy từ vehicle nếu có
          });
        });
      }
    });
    
    return rows;
  }

  private composeRowsFromResponse(response: any): VehicleRow[] {
    return response.vehicles.map((item: any) => {
      // Status: 'active' = đang đỗ, 'completed' = đã ra
      const sessionStatus = item.status || 'active'; // Default to 'active' if not provided
      const isExited = sessionStatus === 'completed';
      
      return {
        sessionId: item.sessionId,
        vehicleId: item.vehicle?.id || 0,
        plate: item.licensePlate || item.vehicle?.licensePlate || 'N/A',
        slot: item.parkingSlot?.slotCode || 'N/A',
        entryTime: item.entryTime, // Keep as ISO string, format in template
        exitTime: item.exitTime || undefined,
        duration: item.exitTime && item.entryTime
          ? this.buildDuration(item.entryTime, item.exitTime)
          : undefined,
        fee: item.fee,
        status: isExited ? 'exited' : 'parked',
        vehicleType: item.vehicleType || item.vehicle?.vehicleType || 'unknown'
      };
    });
  }

  // Keep old method for backward compatibility if needed
  private composeRows(sessions: ParkingSession[], vehicles: ApiVehicle[], slots: ParkingSlot[]): VehicleRow[] {
    const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
    const slotMap = new Map(slots.map((slot) => [slot.id, slot]));

    return sessions.map((session) => {
      // Get vehicle if vehicleId exists, otherwise use session.licensePlate for guest vehicles
      const vehicle = session.vehicleId ? vehicleMap.get(session.vehicleId) : null;
      const slot = slotMap.get(session.parkingSlotId);
      const isExited = session.status !== 'active';
      
      // Get license plate: from vehicle if exists, otherwise from session (guest vehicle)
      const licensePlate = vehicle?.licensePlate || session.licensePlate || 'N/A';
      
      return {
        sessionId: session.id,
        vehicleId: session.vehicleId || 0,
        plate: licensePlate,
        slot: slot?.slotCode || 'N/A',
        entryTime: session.entryTime, // Keep as ISO string, format in template
        exitTime: session.exitTime || undefined,
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
