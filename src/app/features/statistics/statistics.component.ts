import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

type SummaryCard = {
  title: string;
  value: string;
  change?: string;
  note?: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
};

type RevenuePoint = { month: string; revenue: number; vehicles: number };

type VehicleType = { name: string; value: number; color: string };

type PeakHour = { hour: string; count: number };

type DurationPoint = { day: string; duration: number };

type TopSpot = { spot: string; usage: number };

type LineNode<T> = T & { x: number; y: number };

@Component({
  selector: 'app-statistics-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.scss',
  preserveWhitespaces: false
})
export class StatisticsComponent {
  readonly summaryCards: SummaryCard[] = [
    { title: 'Doanh thu tháng này', value: '63,000,000 VNĐ', change: '+6.8% so với tháng trước', color: 'blue' },
    { title: 'Lượt xe trong tháng', value: '1,750 lượt', change: '+8.0% so với tháng trước', color: 'green' },
    { title: 'Thời gian đỗ trung bình', value: '3.2 giờ', note: 'Trong tuần qua', color: 'purple' },
    { title: 'Tỷ lệ sử dụng TB', value: '76.5%', change: '+3.2% so với tháng trước', color: 'orange' }
  ];

  readonly revenueByMonth: RevenuePoint[] = [
    { month: 'T1', revenue: 45000, vehicles: 1200 },
    { month: 'T2', revenue: 48000, vehicles: 1350 },
    { month: 'T3', revenue: 52000, vehicles: 1450 },
    { month: 'T4', revenue: 49000, vehicles: 1380 },
    { month: 'T5', revenue: 55000, vehicles: 1520 },
    { month: 'T6', revenue: 58000, vehicles: 1600 },
    { month: 'T7', revenue: 62000, vehicles: 1720 },
    { month: 'T8', revenue: 60000, vehicles: 1680 },
    { month: 'T9', revenue: 56000, vehicles: 1550 },
    { month: 'T10', revenue: 59000, vehicles: 1620 },
    { month: 'T11', revenue: 63000, vehicles: 1750 }
  ];

  readonly vehicleTypeData: VehicleType[] = [
    { name: 'Ô tô', value: 68, color: '#3b82f6' },
    { name: 'Xe máy', value: 32, color: '#10b981' }
  ];

  readonly peakHours: PeakHour[] = [
    { hour: '00:00', count: 15 },
    { hour: '03:00', count: 8 },
    { hour: '06:00', count: 45 },
    { hour: '09:00', count: 180 },
    { hour: '12:00', count: 140 },
    { hour: '15:00', count: 150 },
    { hour: '18:00', count: 190 },
    { hour: '21:00', count: 95 }
  ];

  readonly averageDuration: DurationPoint[] = [
    { day: 'T2', duration: 2.5 },
    { day: 'T3', duration: 2.8 },
    { day: 'T4', duration: 2.3 },
    { day: 'T5', duration: 3.1 },
    { day: 'T6', duration: 3.5 },
    { day: 'T7', duration: 4.2 },
    { day: 'CN', duration: 3.8 }
  ];

  readonly topSpots: TopSpot[] = [
    { spot: 'A-15', usage: 95 },
    { spot: 'B-08', usage: 92 },
    { spot: 'C-22', usage: 89 },
    { spot: 'A-03', usage: 87 },
    { spot: 'D-17', usage: 85 }
  ];

  readonly maxRevenue = Math.max(...this.revenueByMonth.map((item) => item.revenue));
  readonly maxVehicles = Math.max(...this.revenueByMonth.map((item) => item.vehicles));
  readonly maxPeak = Math.max(...this.peakHours.map((item) => item.count));
  readonly maxDuration = Math.max(...this.averageDuration.map((item) => item.duration));

  readonly revenuePathRevenue = this.buildLinePath(this.revenueByMonth.map((item) => item.revenue));
  readonly revenuePathVehicles = this.buildLinePath(this.revenueByMonth.map((item) => item.vehicles));
  readonly averageDurationLine: LineNode<DurationPoint>[] = this.buildLineSeries(this.averageDuration, (item) => item.duration);
  readonly averageDurationPath = this.averageDurationLine.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  readonly vehiclePieBackground = this.buildPieBackground();

  get revenueChart(): { revenue: LineNode<RevenuePoint>[]; vehicles: LineNode<RevenuePoint>[] } {
    return this.buildDualLineChart();
  }

  get revenueChartRevenuePath(): string {
    return this.revenueChart.revenue.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  }

  get revenueChartVehiclesPath(): string {
    return this.revenueChart.vehicles.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
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

  private buildLinePath(values: number[]): string {
    const max = Math.max(...values);
    const steps = Math.max(values.length - 1, 1);
    return values
      .map((value, index) => {
        const x = (index / steps) * 100;
        const y = 100 - (value / max) * 100;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }

  private buildLineSeries<T>(items: T[], projector: (item: T) => number): LineNode<T>[] {
    const max = Math.max(...items.map((item) => projector(item)));
    const steps = Math.max(items.length - 1, 1);
    return items.map((item, index) => {
      const x = (index / steps) * 100;
      const y = 100 - (projector(item) / max) * 100;
      return { ...(item as object), x, y } as LineNode<T>;
    });
  }

  private buildPieBackground(): string {
    let current = 0;
    const segments: string[] = [];
    this.vehicleTypeData.forEach((item) => {
      const next = current + item.value;
      segments.push(`${item.color} ${current}% ${next}%`);
      current = next;
    });
    return `conic-gradient(${segments.join(', ')})`;
  }

  private buildDualLineChart(): { revenue: LineNode<RevenuePoint>[]; vehicles: LineNode<RevenuePoint>[] } {
    const revenueMax = Math.max(...this.revenueByMonth.map((item) => item.revenue));
    const vehiclesMax = Math.max(...this.revenueByMonth.map((item) => item.vehicles));
    const steps = Math.max(this.revenueByMonth.length - 1, 1);

    const revenue = this.revenueByMonth.map((item, index) => {
      const x = (index / steps) * 100;
      const y = 100 - (item.revenue / revenueMax) * 100;
      return { ...item, x, y };
    });

    const vehicles = this.revenueByMonth.map((item, index) => {
      const x = (index / steps) * 100;
      const y = 100 - (item.vehicles / vehiclesMax) * 100;
      return { ...item, x, y };
    });

    return { revenue, vehicles };
  }
}
