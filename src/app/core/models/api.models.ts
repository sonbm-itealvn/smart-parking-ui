export type RoleName = 'admin' | 'user' | string;

export interface User {
  id: number | string;
  fullName: string;
  email: string;
  roleId: number | string;
  createdAt?: string;
}

export interface Role {
  id: number;
  name: RoleName;
}

export interface ParkingLot {
  id: number;
  name: string;
  location: string;
  totalSlots: number;
  pricePerHour: number;
  createdAt?: string;
}

export type ParkingSlotStatus = 'available' | 'occupied' | 'out_of_service';

export interface ParkingSlot {
  id: number;
  parkingLotId: number;
  slotCode: string;
  status: ParkingSlotStatus;
  coordinates?: number[][][];
}

export type VehicleType = 'car' | 'motorcycle' | 'truck';

export interface Vehicle {
  id: number;
  userId?: number;
  licensePlate: string;
  vehicleType: VehicleType;
  createdAt?: string;
}

export interface NotificationItem {
  id: number;
  userId: number;
  message: string;
  isRead: boolean;
  createdAt?: string;
}

export type ParkingSessionStatus = 'active' | 'completed' | 'cancelled';

export interface ParkingSession {
  id: number;
  vehicleId: number | null;
  licensePlate?: string; // For guest vehicles (when vehicleId is null)
  parkingSlotId: number;
  entryTime: string;
  exitTime?: string | null;
  fee?: number;
  status: ParkingSessionStatus;
}

export type PaymentMethod = 'credit_card' | 'cash' | 'mobile_pay';
export type PaymentStatus = 'successful' | 'failed' | 'pending';

export interface Payment {
  id: number;
  parkingSessionId: number;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentTime: string;
  status: PaymentStatus;
}

export interface FeeDetails {
  entryTime: string;
  exitTime: string;
  durationHours: number;
  firstHourFee: number;
  increaseRate: number;
  feeBreakdown: Array<{ label: string; amount: number }>;
  totalFee: number;
}

export interface ExitSessionResponse {
  message: string;
  parkingSession: ParkingSession;
  feeDetails?: FeeDetails;
}

export interface LicensePlateLog {
  licensePlate: string;
  timestamp: string;
}

export interface AuthResponse {
  message: string;
  user: User;
  accessToken: string;
  refreshToken: string;
}

// Parking Lot Vehicles Response
export interface ParkingLotVehicleItem {
  sessionId: number;
  licensePlate: string;
  vehicleType: 'car' | 'motorcycle' | 'truck';
  isRegistered: boolean;
  status?: ParkingSessionStatus; // 'active' = đang đỗ, 'completed' = đã ra
  vehicle?: {
    id: number;
    licensePlate: string;
    vehicleType: string;
    userId: number;
    user?: {
      id: number;
      fullName: string;
      email: string;
    };
  };
  parkingSlot: {
    id: number;
    slotCode: string;
    status: string;
  };
  entryTime: string;
  exitTime?: string; // For completed sessions
  fee?: number;
}

export interface ParkingLotVehiclesResponse {
  parkingLot: {
    id: number;
    name: string;
    address: string;
  };
  totalVehicles: number;
  vehicles: ParkingLotVehicleItem[];
}

// Revenue Response
export interface DailyRevenueResponse {
  date: string;
  parkingLotId?: number;
  parkingLotName?: string;
  totalRevenue: number;
  totalVehicles: number;
  revenueByHour?: Array<{ hour: number; revenue: number; vehicles: number }>;
}

