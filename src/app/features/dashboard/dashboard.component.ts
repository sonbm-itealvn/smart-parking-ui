import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { finalize, forkJoin, of } from 'rxjs';
import { ApiClientService } from '../../core/services/api-client.service';
import { ParkingSession, ParkingSlot, Payment, Vehicle } from '../../core/models/api.models';

type StatCard = {
  title: string;
  value: string;
  icon: 'pin' | 'car' | 'available' | 'trend';
  color: 'blue' | 'green' | 'orange' | 'purple';
  change?: {
    value: string;
    type: 'up' | 'down' | 'neutral';
  };
};

type ActivityItem = {
  id: number;
  type: 'in' | 'out';
  plate: string;
  time: string;
  spot: string;
};

type RevenuePoint = { name: string; value: number };

type OccupancyPoint = { time: string; rate: number };

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiClientService);

  loading = true;
  error: string | null = null;

  stats = signal<StatCard[]>([]);
  revenueData = signal<RevenuePoint[]>([]);
  occupancyData = signal<OccupancyPoint[]>([]);
  recentActivities = signal<ActivityItem[]>([]);

  revenueMax = computed(() => Math.max(...this.revenueData().map((point) => point.value), 0));
  occupancyChart = computed(() => this.buildLineChart());
  occupancyPath = computed(() => this.occupancyChart().map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '));
  occupancyMax = computed(() => Math.max(...this.occupancyData().map((point) => point.rate), 0));

  ngOnInit(): void {
    this.loadData();
  }

  trackByStat(_: number, item: StatCard): string {
    return item.title;
  }

  trackByRevenue(_: number, item: RevenuePoint): string {
    return item.name;
  }

  trackByOccupancy(_: number, item: OccupancyPoint): string {
    return item.time;
  }

  trackByActivity(_: number, item: ActivityItem): number {
    return item.id;
  }

  getTrendIcon(change?: StatCard['change']): 'up' | 'down' | null {
    if (!change || change.type === 'neutral') {
      return null;
    }
    return change.type;
  }

  private loadData(): void {
    this.loading = true;
    this.error = null;

    forkJoin({
      slots: this.api.getParkingSlots(),
      sessions: this.api.getParkingSessions(),
      payments: this.api.getPayments(),
      vehicles: this.api.getVehicles()
    })
      .pipe(
        finalize(() => {
          this.loading = false;
        })
      )
      .subscribe({
        next: ({ slots, sessions, payments, vehicles }) => {
          this.populateStats(slots, sessions);
          this.populateRevenue(payments);
          this.populateOccupancy(sessions);
          this.populateActivities(sessions, vehicles, slots);
        },
        error: () => {
          this.error = 'Không tải được dữ liệu tổng quan từ máy chủ.';
        }
      });
  }

  private populateStats(slots: ParkingSlot[], sessions: ParkingSession[]): void {
    const totalSlots = slots.length;
    const occupied = slots.filter((slot) => slot.status === 'occupied').length;
    const available = slots.filter((slot) => slot.status === 'available').length;
    const utilization = totalSlots ? ((occupied / totalSlots) * 100).toFixed(1) : '0';

    this.stats.set([
      { title: 'Tổng số chỗ', value: `${totalSlots}`, icon: 'pin', color: 'blue' },
      { title: 'Đang đỗ', value: `${occupied}`, icon: 'car', color: 'green' },
      { title: 'Còn trống', value: `${available}`, icon: 'pin', color: 'orange' },
      { title: 'Tỷ lệ sử dụng', value: `${utilization}%`, icon: 'trend', color: 'purple' }
    ]);
  }

  private populateRevenue(payments: Payment[]): void {
    const weekdays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const now = new Date();
    const last7Days = payments.filter((payment) => {
      const day = new Date(payment.paymentTime);
      const diff = (now.getTime() - day.getTime()) / (1000 * 60 * 60 * 24);
      return diff <= 7;
    });

    const grouped = new Array(7).fill(0);
    last7Days.forEach((payment) => {
      const dayIndex = new Date(payment.paymentTime).getDay();
      grouped[dayIndex] += payment.amount;
    });

    const data: RevenuePoint[] = grouped.map((value, index) => ({
      name: weekdays[index],
      value: Math.round(value / 1000)
    }));

    this.revenueData.set(data);
  }

  private populateOccupancy(sessions: ParkingSession[]): void {
    const hours = [0, 3, 6, 9, 12, 15, 18, 21];
    const data: OccupancyPoint[] = hours.map((hour) => {
      const count = sessions.filter((session) => {
        const start = new Date(session.entryTime);
        return start.getHours() === hour;
      }).length;
      return { time: `${hour.toString().padStart(2, '0')}:00`, rate: count };
    });

    this.occupancyData.set(data);
  }

  private populateActivities(sessions: ParkingSession[], vehicles: Vehicle[], slots: ParkingSlot[]): void {
    const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
    const slotMap = new Map(slots.map((s) => [s.id, s]));

    const activities: ActivityItem[] = sessions
      .sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime())
      .slice(0, 6)
      .map((session) => {
        const vehicle = vehicleMap.get(session.vehicleId);
        const slot = slotMap.get(session.parkingSlotId);
        return {
          id: session.id,
          type: session.status === 'active' ? 'in' : 'out',
          plate: vehicle?.licensePlate || 'N/A',
          time: new Date(session.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          spot: slot?.slotCode || 'N/A'
        };
      });

    this.recentActivities.set(activities);
  }

  private buildLineChart() {
    const occupancyData = this.occupancyData();
    const max = Math.max(...occupancyData.map((point) => point.rate), 1);
    const steps = Math.max(occupancyData.length - 1, 1);
    return occupancyData.map((point, index) => {
      const x = (index / steps) * 100;
      const y = 100 - (point.rate / max) * 100;
      return { ...point, x, y };
    });
  }
}
