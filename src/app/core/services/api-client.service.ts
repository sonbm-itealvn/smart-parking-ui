import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  AuthResponse,
  DailyRevenueResponse,
  ExitSessionResponse,
  LicensePlateLog,
  NotificationItem,
  ParkingLot,
  ParkingLotVehiclesResponse,
  ParkingSession,
  ParkingSlot,
  Payment,
  Role,
  User,
  Vehicle
} from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  // Auth
  login(payload: { email: string; password: string }) {
    const url = `${this.baseUrl}/api/auth/login`;
    console.log('[ApiClientService] Login request to:', url, payload);
    return this.http.post<AuthResponse>(url, payload);
  }

  register(payload: { fullName: string; email: string; password: string; roleId?: number }) {
    return this.http.post<AuthResponse>(`${this.baseUrl}/api/auth/register`, payload);
  }

  refreshToken(refreshToken: string) {
    return this.http.post<{ message: string; accessToken: string; refreshToken: string }>(
      `${this.baseUrl}/api/auth/refresh-token`,
      { refreshToken }
    );
  }

  logout(refreshToken: string | null) {
    return this.http.post<{ message: string }>(`${this.baseUrl}/api/auth/logout`, { refreshToken });
  }

  profile() {
    return this.http.get<User>(`${this.baseUrl}/api/auth/profile`);
  }

  // Users
  getUsers() {
    return this.http.get<User[]>(`${this.baseUrl}/api/users`);
  }

  getUser(id: number) {
    return this.http.get<User>(`${this.baseUrl}/api/users/${id}`);
  }

  updateUser(id: number, payload: Partial<User>) {
    return this.http.put<User>(`${this.baseUrl}/api/users/${id}`, payload);
  }

  deleteUser(id: number) {
    return this.http.delete<void>(`${this.baseUrl}/api/users/${id}`);
  }

  // Roles
  getRoles() {
    return this.http.get<Role[]>(`${this.baseUrl}/api/roles`);
  }

  // Parking Lots
  getParkingLots() {
    return this.http.get<ParkingLot[]>(`${this.baseUrl}/api/parking-lots`);
  }

  getParkingLotVehicles(parkingLotId: number) {
    return this.http.get<ParkingLotVehiclesResponse>(`${this.baseUrl}/api/parking-lots/${parkingLotId}/vehicles`);
  }

  createParkingLot(payload: Partial<ParkingLot>) {
    return this.http.post<ParkingLot>(`${this.baseUrl}/api/parking-lots`, payload);
  }

  // Parking Slots
  getParkingSlots(params?: { parkingLotId?: number }) {
    let httpParams = new HttpParams();
    if (params?.parkingLotId) {
      httpParams = httpParams.set('parkingLotId', params.parkingLotId);
    }
    return this.http.get<ParkingSlot[]>(`${this.baseUrl}/api/parking-slots`, { params: httpParams });
  }

  createParkingSlot(payload: Partial<ParkingSlot>) {
    return this.http.post<ParkingSlot>(`${this.baseUrl}/api/parking-slots`, payload);
  }

  // Upload Images
  uploadImage(file: File, parkingLotId?: number) {
    const formData = new FormData();
    formData.append('file', file);
    if (parkingLotId) {
      formData.append('parkingLotId', parkingLotId.toString());
    }
    return this.http.post<{ url: string; message: string }>(`${this.baseUrl}/api/upload-images`, formData);
  }

  updateParkingSlot(id: number, payload: Partial<ParkingSlot>) {
    return this.http.put<ParkingSlot>(`${this.baseUrl}/api/parking-slots/${id}`, payload);
  }

  // Vehicles
  getVehicles() {
    return this.http.get<Vehicle[]>(`${this.baseUrl}/api/vehicles`);
  }

  createVehicle(payload: Partial<Vehicle>) {
    return this.http.post<Vehicle>(`${this.baseUrl}/api/vehicles`, payload);
  }

  // Notifications
  getNotifications() {
    return this.http.get<NotificationItem[]>(`${this.baseUrl}/api/notifications`);
  }

  // Parking sessions
  getParkingSessions() {
    return this.http.get<ParkingSession[]>(`${this.baseUrl}/api/parking-sessions`);
  }

  createParkingSession(payload: Partial<ParkingSession>) {
    return this.http.post<ParkingSession>(`${this.baseUrl}/api/parking-sessions`, payload);
  }

  exitParkingSession(id: number) {
    return this.http.post<ExitSessionResponse>(`${this.baseUrl}/api/parking-sessions/${id}/exit`, {});
  }

  // Payments
  getPayments() {
    return this.http.get<Payment[]>(`${this.baseUrl}/api/payments`);
  }

  getDailyRevenue(params?: { date?: string; parkingLotId?: number }) {
    let httpParams = new HttpParams();
    if (params?.date) {
      httpParams = httpParams.set('date', params.date);
    }
    if (params?.parkingLotId) {
      httpParams = httpParams.set('parkingLotId', params.parkingLotId);
    }
    return this.http.get<DailyRevenueResponse>(`${this.baseUrl}/api/payments/revenue/daily`, { params: httpParams });
  }

  // Vehicle detection webhook
  vehicleDetection(payload: { licensePlate: string; flag: 0 | 1; slotId?: number; parkingLotId?: number; image?: string }) {
    return this.http.post(`${this.baseUrl}/api/vehicle-detection`, payload);
  }

  // FastAPI integration
  licensePlateLogs() {
    return this.http.get<LicensePlateLog[]>(`${this.baseUrl}/api/license-plate/logs`);
  }

  // Camera detection endpoints
  detectLicensePlate(cameraId: number) {
    return this.http.post(`${this.baseUrl}/api/cameras/${cameraId}/detect-license-plate`, {}, {
      responseType: 'blob',
      observe: 'response'
    });
  }

  detectParkingSpace(cameraId: number, parkingLotId?: number) {
    const body = parkingLotId ? { parkingLotId } : {};
    return this.http.post(`${this.baseUrl}/api/cameras/${cameraId}/detect-parking-space`, body, {
      responseType: 'blob',
      observe: 'response'
    });
  }
}

