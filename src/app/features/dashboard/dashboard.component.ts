import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';
import { ApiClientService } from '../../core/services/api-client.service';
import { ParkingLot, ParkingSession, ParkingSlot, Payment, Vehicle } from '../../core/models/api.models';

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
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiClientService);

  loading = true;
  error: string | null = null;

  // Revenue data
  selectedDate: string = new Date().toISOString().split('T')[0];
  selectedParkingLotId: number | null = null;
  parkingLots = signal<ParkingLot[]>([]);
  dailyRevenue = signal<any>(null);
  revenueByHour = signal<Array<{ hour: number; revenue: number; vehicles: number }>>([]);
  revenueByWeek = signal<Array<{ date: string; revenue: number; vehicles: number }>>([]);

  stats = signal<StatCard[]>([]);
  revenueData = signal<RevenuePoint[]>([]);
  occupancyData = signal<OccupancyPoint[]>([]);
  recentActivities = signal<ActivityItem[]>([]);

  revenueMax = computed(() => {
    const data = this.revenueByHour();
    if (!data.length) return Math.max(...this.revenueData().map((point) => point.value), 0);
    return Math.max(...data.map((item) => item.revenue), 0);
  });
  
  revenueWeekMax = computed(() => Math.max(...this.revenueByWeek().map((point) => point.revenue), 0));
  
  occupancyChart = computed(() => this.buildLineChart());
  occupancyPath = computed(() => this.occupancyChart().map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '));
  occupancyMax = computed(() => Math.max(...this.occupancyData().map((point) => point.rate), 0));

  ngOnInit(): void {
    this.loadParkingLots();
    this.loadData();
    this.loadRevenueData();
  }

  onDateChange(): void {
    this.loadRevenueData();
  }

  onParkingLotChange(): void {
    this.loadRevenueData();
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

  private loadRevenueData(): void {
    // Load today's revenue
    const params: any = { date: this.selectedDate };
    if (this.selectedParkingLotId) {
      params.parkingLotId = this.selectedParkingLotId;
    }

    this.api.getDailyRevenue(params).subscribe({
      next: (response) => {
        this.dailyRevenue.set(response);
        if (response.revenueByHour) {
          this.revenueByHour.set(response.revenueByHour);
        }
        // Update stats with daily revenue
        this.updateStatsWithRevenue(response);
      },
      error: (err) => {
        console.error('Error loading daily revenue:', err);
      }
    });

    // Load last 7 days revenue
    this.loadWeeklyRevenue();
  }

  private loadWeeklyRevenue(): void {
    const weekData: Array<{ date: string; revenue: number; vehicles: number }> = [];
    const today = new Date();
    
    // Load revenue for last 7 days
    const promises = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const params: any = { date: dateStr };
      if (this.selectedParkingLotId) {
        params.parkingLotId = this.selectedParkingLotId;
      }
      
      return this.api.getDailyRevenue(params).toPromise().then(response => ({
        date: dateStr,
        revenue: response?.totalRevenue || 0,
        vehicles: response?.totalVehicles || 0
      })).catch(() => ({
        date: dateStr,
        revenue: 0,
        vehicles: 0
      }));
    });

    Promise.all(promises).then(data => {
      const reversed = data.reverse(); // Reverse to show oldest to newest
      this.revenueByWeek.set(reversed);
      // Update revenueData after loading weekly data
      this.updateRevenueDataFromWeek();
    });
  }

  private updateRevenueDataFromWeek(): void {
    const weekdays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const weekData = this.revenueByWeek();
    
    if (weekData.length > 0) {
      const data: RevenuePoint[] = weekData.map((item) => {
        const date = new Date(item.date);
        const dayIndex = date.getDay();
        return {
          name: weekdays[dayIndex],
          value: Math.round(item.revenue / 1000) // Convert to thousands
        };
      });
      this.revenueData.set(data);
    }
  }

  private updateStatsWithRevenue(revenue: any): void {
    const stats = this.stats();
    if (stats.length > 0 && revenue) {
      // Update first stat card with revenue if it exists
      const revenueStat = stats.find(s => s.title.includes('Doanh thu') || s.title.includes('revenue'));
      if (revenueStat) {
        revenueStat.value = `${revenue.totalRevenue.toLocaleString()} VNĐ`;
      }
    }
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

  getYAxisTicks(max: number): number[] {
    if (max === 0) return [0];
    const ticks: number[] = [];
    const step = max / 4;
    for (let i = 0; i <= 4; i++) {
      ticks.push(Math.round(step * i));
    }
    return ticks;
  }

  formatYAxisValue(value: number): string {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(0) + 'K';
    }
    return value.toString();
  }

  formatRevenue(value: number): string {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(0) + 'K';
    }
    return value.toLocaleString();
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
          // Load weekly revenue after initial data
          if (this.revenueByWeek().length === 0) {
            this.loadWeeklyRevenue();
          }
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
    // This method is kept for backward compatibility
    // But we'll use revenueByWeek from API instead
    const weekdays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const weekData = this.revenueByWeek();
    
    if (weekData.length > 0) {
      const data: RevenuePoint[] = weekData.map((item, index) => {
        const date = new Date(item.date);
        const dayIndex = date.getDay();
        return {
          name: weekdays[dayIndex],
          value: Math.round(item.revenue / 1000) // Convert to thousands
        };
      });
      this.revenueData.set(data);
    } else {
      // Fallback to old method if no API data
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
        // Handle both registered vehicles (vehicleId exists) and guest vehicles (vehicleId is null)
        const vehicle = session.vehicleId ? vehicleMap.get(session.vehicleId) : null;
        const slot = slotMap.get(session.parkingSlotId);
        // Get license plate: from vehicle if exists, otherwise from session (guest vehicle)
        const licensePlate = vehicle?.licensePlate || session.licensePlate || 'N/A';
        return {
          id: session.id,
          type: session.status === 'active' ? 'in' : 'out',
          plate: licensePlate,
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
