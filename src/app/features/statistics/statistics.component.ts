import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';
import { ApiClientService } from '../../core/services/api-client.service';
import { ParkingLot, ParkingSession, ParkingSlot, Payment, Vehicle } from '../../core/models/api.models';

type SummaryCard = {
  title: string;
  value: string;
  change?: string;
  note?: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
};

type RevenuePoint = { month: string; revenue: number; vehicles: number };

type VehicleType = { name: string; value: number; color: string };

type PeakHour = { hour: string; count: number; entry?: number; exit?: number };

type DurationPoint = { day: string; duration: number };

type TopSpot = { spot: string; usage: number };

type LineNode<T> = T & { x: number; y: number };

@Component({
  selector: 'app-statistics-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.scss',
  preserveWhitespaces: false
})
export class StatisticsComponent implements OnInit {
  private readonly api = inject(ApiClientService);

  loading = true;
  error: string | null = null;

  // Filters
  selectedDate: string = new Date().toISOString().split('T')[0]; // Today
  selectedParkingLotId: number | null = null;
  parkingLots = signal<ParkingLot[]>([]);
  dailyRevenue = signal<any>(null);
  revenueByHour = signal<Array<{ hour: number; revenue: number; vehicles: number }>>([]);

  summaryCards = signal<SummaryCard[]>([]);
  revenueByMonth = signal<RevenuePoint[]>([]);
  vehicleTypeData = signal<VehicleType[]>([]);
  peakHours = signal<PeakHour[]>([]);
  averageDuration = signal<DurationPoint[]>([]);
  topSpots = signal<TopSpot[]>([]);

  revenueChart = computed(() => this.buildDualLineChart(this.revenueByMonth()));
  revenueChartRevenuePath = computed(() =>
    this.revenueChart().revenue.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
  );
  revenueChartVehiclesPath = computed(() =>
    this.revenueChart().vehicles.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
  );
  maxPeak = computed(() => {
    const data = this.peakHours();
    if (!data.length) return 0;
    return Math.max(...data.map((item) => (item.entry || 0) + (item.exit || 0)), 0);
  });
  maxDuration = computed(() => Math.max(...this.averageDuration().map((item) => item.duration), 0));
  averageDurationLine = computed(() => this.buildLineSeries(this.averageDuration(), (item) => item.duration));
  averageDurationPath = computed(() =>
    this.averageDurationLine()
      .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(' ')
  );
  vehiclePieBackground = computed(() => this.buildPieBackground(this.vehicleTypeData()));
  
  // Daily revenue by hour chart
  revenueByHourChart = computed(() => {
    const data = this.revenueByHour();
    if (!data.length) return { revenue: [], vehicles: [] };
    const revenueMax = Math.max(...data.map((item) => item.revenue), 1);
    const vehiclesMax = Math.max(...data.map((item) => item.vehicles), 1);
    const steps = Math.max(data.length - 1, 1);
    
    const revenue = data.map((item, index) => {
      const x = (index / steps) * 100;
      const y = 100 - (item.revenue / revenueMax) * 100;
      return { ...item, x, y };
    });
    
    const vehicles = data.map((item, index) => {
      const x = (index / steps) * 100;
      const y = 100 - (item.vehicles / vehiclesMax) * 100;
      return { ...item, x, y };
    });
    
    return { revenue, vehicles };
  });
  
  revenueByHourRevenuePath = computed(() =>
    this.revenueByHourChart().revenue.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
  );
  revenueByHourVehiclesPath = computed(() =>
    this.revenueByHourChart().vehicles.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
  );

  ngOnInit(): void {
    this.loadParkingLots();
    this.loadData();
  }

  onDateChange(): void {
    this.loadDailyRevenue();
  }

  onParkingLotChange(): void {
    this.loadDailyRevenue();
  }

  private loadParkingLots(): void {
    this.api.getParkingLots().subscribe({
      next: (lots) => {
        this.parkingLots.set(lots);
      },
      error: (err) => {
        console.error('Error loading parking lots:', err);
      }
    });
  }

  private loadDailyRevenue(): void {
    const params: any = {};
    if (this.selectedDate) {
      params.date = this.selectedDate;
    }
    if (this.selectedParkingLotId) {
      params.parkingLotId = this.selectedParkingLotId;
    }

    this.api.getDailyRevenue(params).subscribe({
      next: (response) => {
        this.dailyRevenue.set(response);
        if (response.revenueByHour) {
          this.revenueByHour.set(response.revenueByHour);
        }
        // Update summary cards with daily revenue
        this.updateSummaryWithDailyRevenue(response);
      },
      error: (err) => {
        console.error('Error loading daily revenue:', err);
      }
    });
  }

  private updateSummaryWithDailyRevenue(revenue: any): void {
    const cards = this.summaryCards();
    if (cards.length > 0) {
      cards[0] = {
        ...cards[0],
        value: `${revenue.totalRevenue.toLocaleString()} VNĐ`,
        change: revenue.date ? `Ngày ${new Date(revenue.date).toLocaleDateString('vi-VN')}` : 'Hôm nay'
      };
      this.summaryCards.set([...cards]);
    }
  }

  trackByMonth(_: number, item: RevenuePoint): string {
    return item.month;
  }

  trackByHour(_: number, item: PeakHour): string {
    return item.hour;
  }

  trackByType(_: number, item: VehicleType): string {
    return item.name;
  }

  trackByDuration(_: number, item: DurationPoint): string {
    return item.day;
  }

  trackBySpot(_: number, item: TopSpot): string {
    return item.spot;
  }

  getYAxisTicks(max: number): number[] {
    if (max === 0) return [0];
    const ticks: number[] = [];
    const step = max / 4;
    for (let i = 0; i <= 4; i++) {
      ticks.push(Math.round(step * i));
    }
    return ticks;
  }

  private loadData(): void {
    this.loading = true;
    this.error = null;

    forkJoin({
      payments: this.api.getPayments(),
      sessions: this.api.getParkingSessions(),
      slots: this.api.getParkingSlots(),
      vehicles: this.api.getVehicles()
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: ({ payments, sessions, slots, vehicles }) => {
          this.summaryCards.set(this.buildSummaryCards(payments, sessions, slots));
          this.revenueByMonth.set(this.buildRevenue(payments, sessions));
          this.vehicleTypeData.set(this.buildVehicleTypes(vehicles));
          this.peakHours.set(this.buildPeakHours(sessions));
          this.averageDuration.set(this.buildDurations(sessions));
          this.topSpots.set(this.buildTopSpots(sessions, slots));
          // Load daily revenue after initial data
          this.loadDailyRevenue();
        },
        error: () => {
          this.error = 'Không tải được dữ liệu thống kê.';
        }
      });
  }

  private buildSummaryCards(payments: Payment[], sessions: ParkingSession[], slots: ParkingSlot[]): SummaryCard[] {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const currentMonthPayments = payments.filter((payment) => {
      const date = new Date(payment.paymentTime);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });
    const currentMonthSessions = sessions.filter((session) => {
      const date = new Date(session.entryTime);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });

    const revenue = currentMonthPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const avgDurationHours = this.calculateAverageDurationHours(currentMonthSessions);
    const utilization = slots.length
      ? Math.round((slots.filter((slot) => slot.status === 'occupied').length / slots.length) * 100)
      : 0;

    return [
      { title: 'Doanh thu tháng này', value: `${revenue.toLocaleString()} VNĐ`, change: 'Theo tháng hiện tại', color: 'blue' },
      { title: 'Lượt xe trong tháng', value: `${currentMonthSessions.length} lượt`, note: 'Tính theo lượt vào', color: 'green' },
      { title: 'Thời gian đỗ trung bình', value: `${avgDurationHours.toFixed(1)} giờ`, note: 'Các phiên đã hoàn tất', color: 'purple' },
      { title: 'Tỷ lệ sử dụng TB', value: `${utilization}%`, change: 'Trạng thái hiện tại', color: 'orange' }
    ];
  }

  private buildRevenue(payments: Payment[], sessions: ParkingSession[]): RevenuePoint[] {
    const months = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
    const revenue = new Array(12).fill(0);
    const vehicles = new Array(12).fill(0);

    payments.forEach((payment) => {
      const date = new Date(payment.paymentTime);
      const index = date.getMonth();
      revenue[index] += payment.amount;
    });

    sessions.forEach((session) => {
      const date = new Date(session.entryTime);
      const index = date.getMonth();
      vehicles[index] += 1;
    });

    return months.map((month, index) => ({
      month,
      revenue: Math.round(revenue[index] / 1000), // nghìn VNĐ
      vehicles: vehicles[index]
    }));
  }

  private buildVehicleTypes(vehicles: Vehicle[]): VehicleType[] {
    const colors: Record<string, string> = {
      car: '#3b82f6',
      motorcycle: '#10b981',
      truck: '#f59e0b'
    };
    const counts: Record<string, number> = {};
    vehicles.forEach((vehicle) => {
      counts[vehicle.vehicleType] = (counts[vehicle.vehicleType] || 0) + 1;
    });

    return Object.entries(counts).map(([name, value]) => ({
      name: this.mapVehicleName(name),
      value,
      color: colors[name] || '#6366f1'
    }));
  }

  private buildPeakHours(sessions: ParkingSession[]): PeakHour[] {
    const entryBuckets = new Map<number, number>();
    const exitBuckets = new Map<number, number>();
    
    sessions.forEach((session) => {
      const entryHour = new Date(session.entryTime).getHours();
      entryBuckets.set(entryHour, (entryBuckets.get(entryHour) || 0) + 1);
      
      if (session.exitTime) {
        const exitHour = new Date(session.exitTime).getHours();
        exitBuckets.set(exitHour, (exitBuckets.get(exitHour) || 0) + 1);
      }
    });

    return Array.from({ length: 24 }, (_, index) => ({
      hour: `${index.toString().padStart(2, '0')}:00`,
      count: (entryBuckets.get(index) || 0) + (exitBuckets.get(index) || 0),
      entry: entryBuckets.get(index) || 0,
      exit: exitBuckets.get(index) || 0
    })).filter((_, index) => index % 3 === 0); // mỗi 3 giờ
  }

  private buildDurations(sessions: ParkingSession[]): DurationPoint[] {
    const weekDays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const totals = new Array(7).fill(0);
    const counts = new Array(7).fill(0);

    sessions
      .filter((session) => session.exitTime)
      .forEach((session) => {
        const entry = new Date(session.entryTime);
        const exit = new Date(session.exitTime!);
        const hours = Math.max(0, (exit.getTime() - entry.getTime()) / (1000 * 60 * 60));
        const dayIndex = entry.getDay();
        totals[dayIndex] += hours;
        counts[dayIndex] += 1;
      });

    return weekDays.map((day, index) => ({
      day,
      duration: counts[index] ? parseFloat((totals[index] / counts[index]).toFixed(2)) : 0
    }));
  }

  private buildTopSpots(sessions: ParkingSession[], slots: ParkingSlot[]): TopSpot[] {
    const slotMap = new Map(slots.map((slot) => [slot.id, slot.slotCode]));
    const counts: Record<string, number> = {};

    sessions.forEach((session) => {
      const code = slotMap.get(session.parkingSlotId) || `#${session.parkingSlotId}`;
      counts[code] = (counts[code] || 0) + 1;
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([spot, usage]) => ({ spot, usage }));
  }

  private calculateAverageDurationHours(sessions: ParkingSession[]): number {
    const completed = sessions.filter((session) => session.exitTime);
    if (!completed.length) {
      return 0;
    }
    const totalHours = completed.reduce((sum, session) => {
      const entry = new Date(session.entryTime);
      const exit = new Date(session.exitTime!);
      return sum + Math.max(0, (exit.getTime() - entry.getTime()) / (1000 * 60 * 60));
    }, 0);
    return totalHours / completed.length;
  }

  private mapVehicleName(type: string): string {
    switch (type) {
      case 'car':
        return 'Ô tô';
      case 'motorcycle':
        return 'Xe máy';
      case 'truck':
        return 'Xe tải';
      default:
        return type;
    }
  }

  private buildLineSeries<T>(items: T[], projector: (item: T) => number): LineNode<T>[] {
    if (!items.length) {
      return [];
    }
    const max = Math.max(...items.map((item) => projector(item)), 1);
    const steps = Math.max(items.length - 1, 1);
    return items.map((item, index) => {
      const x = (index / steps) * 100;
      const y = 100 - (projector(item) / max) * 100;
      return { ...(item as object), x, y } as LineNode<T>;
    });
  }

  private buildPieBackground(data: VehicleType[]): string {
    if (!data.length) {
      return 'conic-gradient(#e5e7eb 0% 100%)';
    }
    const total = data.reduce((sum, item) => sum + item.value, 0);
    let current = 0;
    const segments: string[] = [];
    data.forEach((item) => {
      const next = current + (item.value / total) * 100;
      segments.push(`${item.color} ${current}% ${next}%`);
      current = next;
    });
    return `conic-gradient(${segments.join(', ')})`;
  }

  private buildDualLineChart(data: RevenuePoint[]): { revenue: LineNode<RevenuePoint>[]; vehicles: LineNode<RevenuePoint>[] } {
    if (!data.length) {
      return { revenue: [], vehicles: [] };
    }
    const revenueMax = Math.max(...data.map((item) => item.revenue), 1);
    const vehiclesMax = Math.max(...data.map((item) => item.vehicles), 1);
    const steps = Math.max(data.length - 1, 1);

    const revenue = data.map((item, index) => {
      const x = (index / steps) * 100;
      const y = 100 - (item.revenue / revenueMax) * 100;
      return { ...item, x, y };
    });

    const vehicles = data.map((item, index) => {
      const x = (index / steps) * 100;
      const y = 100 - (item.vehicles / vehiclesMax) * 100;
      return { ...item, x, y };
    });

    return { revenue, vehicles };
  }
}
