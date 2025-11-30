import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

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
export class DashboardComponent {
  readonly stats: StatCard[] = [
    { title: 'Tổng số chỗ', value: '250', icon: 'pin', color: 'blue', change: { value: '+0%', type: 'neutral' } },
    { title: 'Đang đỗ', value: '187', icon: 'car', color: 'green', change: { value: '+12%', type: 'up' } },
    { title: 'Còn trống', value: '63', icon: 'pin', color: 'orange', change: { value: '-12%', type: 'down' } },
    { title: 'Tỷ lệ sử dụng', value: '74.8%', icon: 'trend', color: 'purple', change: { value: '+5.2%', type: 'up' } }
  ];

  readonly revenueData: RevenuePoint[] = [
    { name: 'T2', value: 4500 },
    { name: 'T3', value: 5200 },
    { name: 'T4', value: 4800 },
    { name: 'T5', value: 6100 },
    { name: 'T6', value: 7200 },
    { name: 'T7', value: 8500 },
    { name: 'CN', value: 7800 }
  ];

  readonly occupancyData: OccupancyPoint[] = [
    { time: '06:00', rate: 20 },
    { time: '09:00', rate: 85 },
    { time: '12:00', rate: 65 },
    { time: '15:00', rate: 70 },
    { time: '18:00', rate: 90 },
    { time: '21:00', rate: 45 },
    { time: '00:00', rate: 15 }
  ];

  readonly recentActivities: ActivityItem[] = [
    { id: 1, type: 'in', plate: '29A-12345', time: '10:30', spot: 'A-15' },
    { id: 2, type: 'out', plate: '30B-67890', time: '10:25', spot: 'B-08' },
    { id: 3, type: 'in', plate: '51C-11111', time: '10:20', spot: 'C-22' },
    { id: 4, type: 'out', plate: '92D-99999', time: '10:15', spot: 'A-03' },
    { id: 5, type: 'in', plate: '43E-55555', time: '10:10', spot: 'D-17' }
  ];

  readonly revenueMax = Math.max(...this.revenueData.map((point) => point.value));
  readonly occupancyChart = this.buildLineChart();
  readonly occupancyPath = this.occupancyChart.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  readonly occupancyMax = Math.max(...this.occupancyData.map((point) => point.rate));

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

  private buildLineChart() {
    const max = Math.max(...this.occupancyData.map((point) => point.rate));
    const steps = Math.max(this.occupancyData.length - 1, 1);
    return this.occupancyData.map((point, index) => {
      const x = (index / steps) * 100;
      const y = 100 - (point.rate / max) * 100;
      return { ...point, x, y };
    });
  }
}
