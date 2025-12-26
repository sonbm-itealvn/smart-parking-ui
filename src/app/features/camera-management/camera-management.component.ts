import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiClientService } from '../../core/services/api-client.service';
import { Camera, CameraType, CameraStatus, ParkingLot } from '../../core/models/api.models';

@Component({
  selector: 'app-camera-management-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './camera-management.component.html',
  styleUrl: './camera-management.component.scss'
})
export class CameraManagementComponent implements OnInit {
  private readonly api = inject(ApiClientService);

  cameras: Camera[] = [];
  parkingLots: ParkingLot[] = [];
  availableDevices: MediaDeviceInfo[] = [];
  
  loading = true;
  submitting = false;
  error: string | null = null;
  
  showAddModal = false;
  showEditModal = false;
  selectedCamera: Camera | null = null;
  
  newCamera: {
    name: string;
    streamUrl: string;
    cameraType: CameraType;
    status: CameraStatus;
    parkingLotId: number | null;
    description: string;
    location: string;
    deviceId?: string;
  } = {
    name: '',
    streamUrl: '',
    cameraType: 'webcam',
    status: 'active',
    parkingLotId: null,
    description: '',
    location: ''
  };

  ngOnInit(): void {
    this.loadData();
    this.loadAvailableDevices();
  }

  loadData(): void {
    this.loading = true;
    this.error = null;
    
    this.api.getParkingLots().subscribe({
      next: (lots) => {
        this.parkingLots = lots;
      },
      error: (err) => {
        console.error('Error loading parking lots:', err);
      }
    });

    this.api.getCameras()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (cameras) => {
          this.cameras = cameras;
        },
        error: (err) => {
          this.error = err?.error?.message || 'Không thể tải danh sách camera.';
        }
      });
  }

  async loadAvailableDevices(): Promise<void> {
    try {
      // Request permission first
      await navigator.mediaDevices.getUserMedia({ video: true });
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.availableDevices = devices.filter(device => device.kind === 'videoinput');
    } catch (err) {
      console.error('Error accessing devices:', err);
      this.error = 'Không thể truy cập camera. Vui lòng cấp quyền truy cập camera.';
    }
  }

  selectDevice(deviceId: string): void {
    const device = this.availableDevices.find(d => d.deviceId === deviceId);
    if (device) {
      this.newCamera.deviceId = deviceId;
      this.newCamera.streamUrl = deviceId; // Use deviceId as streamUrl for webcam
      this.newCamera.name = device.label || `Camera ${this.availableDevices.indexOf(device) + 1}`;
      this.newCamera.cameraType = 'webcam';
    }
  }

  openAddModal(): void {
    this.newCamera = {
      name: '',
      streamUrl: '',
      cameraType: 'webcam',
      status: 'active',
      parkingLotId: null,
      description: '',
      location: ''
    };
    this.showAddModal = true;
  }

  closeAddModal(): void {
    this.showAddModal = false;
    this.newCamera.deviceId = undefined;
  }

  openEditModal(camera: Camera): void {
    this.selectedCamera = camera;
    this.newCamera = {
      name: camera.name,
      streamUrl: camera.streamUrl,
      cameraType: camera.cameraType,
      status: camera.status,
      parkingLotId: camera.parkingLotId,
      description: camera.description || '',
      location: camera.location || ''
    };
    this.showEditModal = true;
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.selectedCamera = null;
  }

  handleCreateCamera(): void {
    if (!this.newCamera.name || !this.newCamera.streamUrl) {
      this.error = 'Vui lòng điền đầy đủ thông tin.';
      return;
    }

    this.submitting = true;
    this.error = null;

    const payload: any = {
      name: this.newCamera.name,
      streamUrl: this.newCamera.streamUrl,
      cameraType: this.newCamera.cameraType,
      status: this.newCamera.status
    };

    if (this.newCamera.parkingLotId) {
      payload.parkingLotId = this.newCamera.parkingLotId;
    }
    if (this.newCamera.description) {
      payload.description = this.newCamera.description;
    }
    if (this.newCamera.location) {
      payload.location = this.newCamera.location;
    }

    this.api.createCamera(payload)
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: () => {
          this.closeAddModal();
          this.loadData();
        },
        error: (err) => {
          this.error = err?.error?.message || 'Không thể tạo camera.';
        }
      });
  }

  handleUpdateCamera(): void {
    if (!this.selectedCamera || !this.newCamera.name || !this.newCamera.streamUrl) {
      this.error = 'Vui lòng điền đầy đủ thông tin.';
      return;
    }

    this.submitting = true;
    this.error = null;

    const payload: any = {
      name: this.newCamera.name,
      streamUrl: this.newCamera.streamUrl,
      cameraType: this.newCamera.cameraType,
      status: this.newCamera.status
    };

    if (this.newCamera.parkingLotId) {
      payload.parkingLotId = this.newCamera.parkingLotId;
    } else {
      payload.parkingLotId = null;
    }
    if (this.newCamera.description) {
      payload.description = this.newCamera.description;
    }
    if (this.newCamera.location) {
      payload.location = this.newCamera.location;
    }

    this.api.updateCamera(this.selectedCamera.id, payload)
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: () => {
          this.closeEditModal();
          this.loadData();
        },
        error: (err) => {
          this.error = err?.error?.message || 'Không thể cập nhật camera.';
        }
      });
  }

  handleDeleteCamera(camera: Camera): void {
    if (!confirm(`Bạn có chắc chắn muốn xóa camera "${camera.name}"?`)) {
      return;
    }

    this.api.deleteCamera(camera.id).subscribe({
      next: () => {
        this.loadData();
      },
      error: (err) => {
        this.error = err?.error?.message || 'Không thể xóa camera.';
      }
    });
  }

  getStatusLabel(status: CameraStatus): string {
    switch (status) {
      case 'active':
        return 'Hoạt động';
      case 'inactive':
        return 'Không hoạt động';
      case 'maintenance':
        return 'Bảo trì';
      default:
        return status;
    }
  }

  getStatusClass(status: CameraStatus): string {
    switch (status) {
      case 'active':
        return 'status-active';
      case 'inactive':
        return 'status-inactive';
      case 'maintenance':
        return 'status-maintenance';
      default:
        return '';
    }
  }

  getCameraTypeLabel(type: CameraType): string {
    switch (type) {
      case 'webcam':
        return 'Webcam';
      case 'http':
        return 'HTTP';
      case 'rtsp':
        return 'RTSP';
      default:
        return type;
    }
  }
}

