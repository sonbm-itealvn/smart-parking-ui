import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, forkJoin, firstValueFrom, catchError, of } from 'rxjs';
import Konva from 'konva';
import { ApiClientService } from '../../core/services/api-client.service';
import { ParkingSession, ParkingSlot, ParkingSlotStatus, ParkingLot, Vehicle, ProcessVehicleResponse, Camera } from '../../core/models/api.models';

type SpotStatus = ParkingSlotStatus;

interface ParkingSpot {
  id: string;
  status: SpotStatus;
  vehicle?: string;
  time?: string;
  parkingLotId?: number;
}

interface CameraFeed {
  id: number;
  name: string;
  location: string;
  status: 'active' | 'offline';
  loading?: boolean;
  lastResult?: ProcessVehicleResponse;
  cameraType?: string;
  parkingLotId?: number | null;
  streamUrl?: string;
  stream?: MediaStream;
  streamError?: string;
}

type StatKey = 'total' | 'available' | 'occupied';

@Component({
  selector: 'app-parking-map-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './parking-map.component.html',
  styleUrl: './parking-map.component.scss'
})
export class ParkingMapComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('canvasContainer', { static: false }) canvasContainer!: ElementRef<HTMLDivElement>;
  
  private readonly api = inject(ApiClientService);
  private stage: Konva.Stage | null = null;
  private layer: Konva.Layer | null = null;
  private imageLayer: Konva.Layer | null = null;
  private transformer: Konva.Transformer | null = null;

  cameras: CameraFeed[] = [];

  readonly statDefinitions: Array<{ key: StatKey; label: string; indicator?: SpotStatus }> = [
    { key: 'total', label: 'Tổng số chỗ' },
    { key: 'available', label: 'Còn trống', indicator: 'available' },
    { key: 'occupied', label: 'Đang đỗ', indicator: 'occupied' }
  ];

  parkingLots: ParkingLot[] = [];
  spots: ParkingSpot[] = [];

  // View state
  selectedLotId: number | null = null; // null = list view, number = detail view
  selectedLot: ParkingLot | null = null;

  searchQuery = '';
  selectedZone = 'all';
  selectedCameraId: number | null = null;
  readonly now = new Date();
  loading = true;
  error: string | null = null;

  // Modals
  showAddLotModal = false;
  showAddSlotModal = false;
  showSlotEditorModal = false;
  submitting = false;
  
  // Slot Editor
  uploadedImageUrl: string | null = null;
  uploadedImageFile: File | null = null;
  slots: Array<{ id: string; rect: Konva.Rect | null; slotCode: string; x: number; y: number; width: number; height: number }> = [];
  currentSlotIndex: number | null = null;
  isDrawing = false;
  isEditing = false;
  zoomLevel = 1;
  stagePosition = { x: 0, y: 0 };

  // Forms
  newLot: Partial<ParkingLot> = {
    name: '',
    location: '',
    totalSlots: 0,
    pricePerHour: 0
  };

  newSlot: Partial<ParkingSlot> = {
    parkingLotId: undefined,
    slotCode: '',
    status: 'available',
    coordinates: undefined
  };

  coordinatesText = '';

  get zoneFilters() {
    return [{ value: 'all', label: 'Tất cả khu vực' }, ...this.parkingLots.map((lot) => ({ value: String(lot.id), label: lot.name }))];
  }

  get stats(): Record<StatKey, number> {
    return {
      total: this.filteredSpots.length,
      available: this.filteredSpots.filter((spot) => spot.status === 'available').length,
      occupied: this.filteredSpots.filter((spot) => spot.status === 'occupied').length
    };
  }

  get availableCount(): number {
    return this.filteredSpots.filter((spot) => spot.status === 'available').length;
  }

  get occupiedCount(): number {
    return this.filteredSpots.filter((spot) => spot.status === 'occupied').length;
  }

  get outOfServiceCount(): number {
    return this.filteredSpots.filter((spot) => spot.status === 'out_of_service').length;
  }

  get filteredSpots(): ParkingSpot[] {
    const selectedLotId = this.selectedZone;
    const query = this.searchQuery.trim().toLowerCase();

    return this.spots.filter((spot) => {
      const lotMatch = selectedLotId === 'all' || String(spot.parkingLotId) === selectedLotId;
      const searchMatch =
        !query ||
        spot.id.toLowerCase().includes(query) ||
        (spot.vehicle?.toLowerCase().includes(query) ?? false);

      return lotMatch && searchMatch;
    });
  }

  get activeCamera(): CameraFeed | null {
    return this.selectedCameraId ? this.cameras.find((cam) => cam.id === this.selectedCameraId) ?? null : null;
  }

  ngOnInit(): void {
    this.loadParkingLots();
    this.loadCameras();
  }

  loadCameras(): void {
    this.api.getCameras().subscribe({
      next: (cameras) => {
        // Map Camera từ API sang CameraFeed
        this.cameras = cameras.map(camera => ({
          id: camera.id,
          name: camera.name,
          location: camera.location || camera.name,
          status: (camera.status === 'active' ? 'active' : 'offline') as 'active' | 'offline',
          loading: false,
          cameraType: camera.cameraType,
          parkingLotId: camera.parkingLotId,
          streamUrl: camera.streamUrl
        }));
        // Start streams for active webcam cameras
        this.cameras.forEach(camera => {
          if (camera.status === 'active' && camera.cameraType === 'webcam' && camera.streamUrl) {
            this.startCameraStream(camera);
          }
        });
      },
      error: (err) => {
        console.error('Error loading cameras:', err);
        // Fallback to empty array if error
        this.cameras = [];
      }
    });
  }

  ngAfterViewInit(): void {
    // Canvas sẽ được khởi tạo khi mở modal
  }

  ngOnDestroy(): void {
    this.destroyCanvas();
    // Stop all camera streams
    this.cameras.forEach(camera => {
      this.stopCameraStream(camera);
    });
  }

  selectLot(lot: ParkingLot): void {
    this.selectedLotId = lot.id;
    this.selectedLot = lot;
    this.selectedZone = String(lot.id);
    this.loadSlotsForLot(lot.id);
    // Load cameras for this parking lot
    this.loadCamerasForLot(lot.id);
  }

  loadCamerasForLot(parkingLotId: number): void {
    this.api.getCameras(parkingLotId).subscribe({
      next: (cameras) => {
        // Stop streams for cameras being replaced
        const oldLotCameras = this.cameras.filter(c => c.parkingLotId === parkingLotId);
        oldLotCameras.forEach(camera => {
          this.stopCameraStream(camera);
        });

        // Update cameras for this parking lot
        const lotCameras: CameraFeed[] = cameras.map(camera => ({
          id: camera.id,
          name: camera.name,
          location: camera.location || camera.name,
          status: (camera.status === 'active' ? 'active' : 'offline') as 'active' | 'offline',
          loading: false,
          cameraType: camera.cameraType,
          parkingLotId: camera.parkingLotId,
          streamUrl: camera.streamUrl
        }));
        
        // Merge with existing cameras (keep cameras not in this lot, update/add cameras for this lot)
        const otherCameras = this.cameras.filter(c => c.parkingLotId !== parkingLotId);
        this.cameras = [...otherCameras, ...lotCameras];
        
        // Start streams for active webcam cameras
        lotCameras.forEach(camera => {
          if (camera.status === 'active' && camera.cameraType === 'webcam' && camera.streamUrl) {
            this.startCameraStream(camera);
          }
        });
      },
      error: (err) => {
        console.error('Error loading cameras for lot:', err);
      }
    });
  }

  async startCameraStream(camera: CameraFeed): Promise<void> {
    if (!camera.streamUrl || camera.cameraType !== 'webcam') {
      return;
    }

    try {
      // Request permission first
      await navigator.mediaDevices.getUserMedia({ video: true });
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: camera.streamUrl }
        }
      });
      
      camera.stream = stream;
      camera.streamError = undefined;
    } catch (err: any) {
      console.error(`Error starting stream for camera ${camera.id}:`, err);
      camera.streamError = err.message || 'Không thể truy cập camera';
      camera.stream = undefined;
    }
  }

  stopCameraStream(camera: CameraFeed): void {
    if (camera.stream) {
      camera.stream.getTracks().forEach(track => track.stop());
      camera.stream = undefined;
    }
  }

  backToList(): void {
    this.selectedLotId = null;
    this.selectedLot = null;
    this.selectedZone = 'all';
    this.spots = [];
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

  private loadSlotsForLot(lotId: number): void {
    this.loading = true;
    this.error = null;

    forkJoin({
      slots: this.api.getParkingSlots({ parkingLotId: lotId }),
      sessions: this.api.getParkingSessions(),
      vehicles: this.api.getVehicles()
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: ({ slots, sessions, vehicles }) => {
          this.spots = this.hydrateSlots(slots, sessions, vehicles);
        },
        error: (err) => {
          this.error = err?.error?.message || 'Không thể tải dữ liệu vị trí đỗ.';
        }
      });
  }


  handleSearch(value: string): void {
    this.searchQuery = value;
  }

  changeZone(value: string): void {
    this.selectedZone = value;
  }

  selectCamera(id: number): void {
    this.selectedCameraId = id;
    const camera = this.cameras.find(c => c.id === id);
    if (camera && !camera.stream && camera.cameraType === 'webcam' && camera.streamUrl && camera.status === 'active') {
      // Start stream if not already started
      this.startCameraStream(camera);
    }
  }

  closeCameraModal(): void {
    this.selectedCameraId = null;
  }

  async processVehicle(cameraId: number): Promise<void> {
    const camera = this.cameras.find(c => c.id === cameraId);
    if (!camera) {
      this.error = 'Không tìm thấy camera';
      return;
    }

    camera.loading = true;
    camera.status = 'active';
    this.error = null;

    // Use camera's parkingLotId if available, otherwise use selectedLotId
    const parkingLotId = camera.parkingLotId || this.selectedLotId || undefined;

    // For webcam, capture frame from video stream and send to backend
    if (camera.cameraType === 'webcam' && camera.stream) {
      try {
        // Capture frame from video element
        const videoElement = document.querySelector(`video[srcObject]`) as HTMLVideoElement;
        if (!videoElement) {
          // Try to find video element in modal
          const modalVideo = document.querySelector('.camera-modal__video') as HTMLVideoElement;
          if (modalVideo && modalVideo.srcObject === camera.stream) {
            const frameBlob = await this.captureFrameFromVideo(modalVideo);
            if (frameBlob) {
              // Upload frame and process
              await this.processVehicleWithImage(cameraId, frameBlob, parkingLotId, camera);
              return;
            }
          }
          throw new Error('Không tìm thấy video element để capture frame');
        } else {
          const frameBlob = await this.captureFrameFromVideo(videoElement);
          if (frameBlob) {
            await this.processVehicleWithImage(cameraId, frameBlob, parkingLotId, camera);
            return;
          }
        }
      } catch (err: any) {
        console.error('Error capturing frame from webcam:', err);
        camera.loading = false;
        this.error = err.message || 'Không thể capture frame từ webcam';
        alert(`Lỗi: ${this.error}`);
        return;
      }
    }

    // For non-webcam cameras, use normal API call
    // Backend will automatically:
    // 1. Detect license plate from camera frame
    // 2. Find available slot based on camera's parkingLotId
    // 3. Assign vehicle to that slot
    // So we don't need to send anything, backend knows everything from camera context
    this.api.processVehicleFromCamera(cameraId, {})
      .subscribe({
        next: (response) => {
          camera.loading = false;
          camera.lastResult = response;
          
          // Reload slots after processing
          if (this.selectedLotId) {
            this.loadSlotsForLot(this.selectedLotId);
          }

          // Show success message
          const isEntry = response.message.toLowerCase().includes('entry') || 
                         response.message.toLowerCase().includes('vào');
          const isExit = response.message.toLowerCase().includes('exit') || 
                        response.message.toLowerCase().includes('ra');
          
          if (isEntry) {
            console.log('✅ Xe đã VÀO:', response);
          } else if (isExit) {
            console.log('✅ Xe đã RA:', response);
          }
        },
        error: (err) => {
          this.handleProcessVehicleError(err, camera);
          
          // Don't change status to offline on error, keep it as active if stream is working
          if (!camera.stream && camera.cameraType === 'webcam') {
            camera.status = 'offline';
          }
        }
      });
  }

  private async captureFrameFromVideo(video: HTMLVideoElement): Promise<Blob | null> {
    return new Promise((resolve) => {
      // Wait for video to be ready (readyState 2 = HAVE_CURRENT_DATA, 3 = HAVE_FUTURE_DATA, 4 = HAVE_ENOUGH_DATA)
      if (video.readyState < 2) {
        const onLoadedData = () => {
          video.removeEventListener('loadeddata', onLoadedData);
          this.captureFrameFromVideo(video).then(resolve);
        };
        video.addEventListener('loadeddata', onLoadedData);
        return;
      }

      const canvas = document.createElement('canvas');
      // Increase max size to maintain better quality for license plate detection
      const maxWidth = 1920; // Increased for better quality
      const maxHeight = 1080; // Increased for better quality
      
      let width = video.videoWidth || video.clientWidth;
      let height = video.videoHeight || video.clientHeight;
      
      // Ensure we have valid dimensions
      if (!width || !height || width === 0 || height === 0) {
        // Fallback to video element dimensions
        width = video.clientWidth || 640;
        height = video.clientHeight || 480;
      }
      
      // Ensure minimum size for license plate detection
      if (width < 640) width = 640;
      if (height < 480) height = 480;
      
      // Calculate aspect ratio and resize if needed
      if (width > maxWidth || height > maxHeight) {
        const aspectRatio = width / height;
        if (width > height) {
          width = maxWidth;
          height = width / aspectRatio;
        } else {
          height = maxHeight;
          width = height * aspectRatio;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        resolve(null);
        return;
      }

      // Use better image smoothing for license plate detection
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      ctx.drawImage(video, 0, 0, width, height);
      
      // Use higher quality (0.85) to ensure license plate is readable
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/jpeg', 0.85);
    });
  }

  private async processVehicleWithImage(
    cameraId: number, 
    imageBlob: Blob, 
    parkingLotId: number | undefined,
    camera: CameraFeed
  ): Promise<void> {
    try {
      // Check image size - if too large, compress further
      // Increased max size to 800KB to maintain better quality for license plate detection
      const maxSize = 800 * 1024; // 800KB max (increased from 500KB)
      let finalBlob = imageBlob;
      
      if (imageBlob.size > maxSize) {
        // Compress image further, but try to maintain quality
        finalBlob = await this.compressImage(imageBlob, maxSize);
      }
      
      // Upload image to server first (for AI module to read from URL)
      const imageFile = new File([finalBlob], `camera-${cameraId}-${Date.now()}.jpg`, { type: 'image/jpeg' });
      
      console.log('📤 Uploading image to server...');
      const uploadResult = await firstValueFrom(
        this.api.uploadImage(imageFile, parkingLotId).pipe(
          catchError((err) => {
            console.error('Error uploading image:', err);
            camera.loading = false;
            this.error = 'Không thể upload ảnh lên server. Vui lòng thử lại.';
            alert('Lỗi: Không thể upload ảnh lên server. Vui lòng thử lại.');
            throw err;
          })
        )
      );
      
      console.log('✅ Image uploaded, full response:', uploadResult);
      
      // Get URL from response - URL is in image.url
      const imageUrl = uploadResult?.image?.url;
      
      if (!imageUrl) {
        console.error('❌ No URL in upload response:', uploadResult);
        camera.loading = false;
        this.error = 'Upload ảnh thành công nhưng không nhận được URL. Vui lòng thử lại.';
        alert('Lỗi: Upload ảnh thành công nhưng không nhận được URL. Vui lòng thử lại.');
        return;
      }
      
      console.log('✅ Image URL:', imageUrl);
      
      // Backend will automatically:
      // 1. Detect license plate from imageUrl
      // 2. Find available slot based on camera's parkingLotId
      // 3. Assign vehicle to that slot
      // So we only need to send imageUrl, backend knows everything else from camera context
      const options: { imageUrl: string } = {
        imageUrl: imageUrl
      };

      console.log('📤 Calling process-vehicle with imageUrl only');
      this.api.processVehicleFromCamera(cameraId, options)
        .subscribe({
          next: (response) => {
            camera.loading = false;
            camera.lastResult = response;
            
            // Reload slots after processing
            if (this.selectedLotId) {
              this.loadSlotsForLot(this.selectedLotId);
            }

            // Show success message
            const isEntry = response.message.toLowerCase().includes('entry') || 
                           response.message.toLowerCase().includes('vào');
            const isExit = response.message.toLowerCase().includes('exit') || 
                          response.message.toLowerCase().includes('ra');
            
            if (isEntry) {
              console.log('✅ Xe đã VÀO:', response);
            } else if (isExit) {
              console.log('✅ Xe đã RA:', response);
            }
          },
          error: (err) => {
            this.handleProcessVehicleError(err, camera);
          }
        });

      // Alternative approach: Upload image and use URL (if backend supports)
      // This is commented out because backend may not support image URL in process-vehicle
      /*
      const imageFile = new File([imageBlob], `camera-${cameraId}-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const uploadResult = await firstValueFrom(this.api.uploadImage(imageFile, parkingLotId));
      
      // Try to use the uploaded image URL (if backend supports it)
      const options: { parkingLotId?: number; imageUrl?: string } = {};
      if (parkingLotId) {
        options.parkingLotId = parkingLotId;
      }
      options.imageUrl = uploadResult.url;

      this.api.processVehicleFromCamera(cameraId, options as any)
        .subscribe({
          next: (response) => {
            camera.loading = false;
            camera.lastResult = response;
            
            if (this.selectedLotId) {
              this.loadSlotsForLot(this.selectedLotId);
            }

            const isEntry = response.message.toLowerCase().includes('entry') || 
                           response.message.toLowerCase().includes('vào');
            const isExit = response.message.toLowerCase().includes('exit') || 
                          response.message.toLowerCase().includes('ra');
            
            if (isEntry) {
              console.log('✅ Xe đã VÀO:', response);
            } else if (isExit) {
              console.log('✅ Xe đã RA:', response);
            }
          },
          error: (err) => {
            this.handleProcessVehicleError(err, camera);
          }
        });
      */
    } catch (err: any) {
      console.error('Error processing vehicle with image:', err);
      camera.loading = false;
      this.error = err?.message || 'Có lỗi xảy ra khi xử lý ảnh';
      alert(`Lỗi: ${this.error}`);
    }
  }

  private handleProcessVehicleError(err: any, camera: CameraFeed): void {
    console.error('Error processing vehicle:', err);
    camera.loading = false;
    camera.lastResult = undefined;
    
    // Handle specific HTTP status codes
    let errorMessage = 'Có lỗi xảy ra khi xử lý xe';
    
    if (err?.status === 413) {
      errorMessage = 'Ảnh quá lớn. Vui lòng thử lại hoặc cấu hình snapshot URL cho camera webcam.';
    } else if (err?.status === 400) {
      const backendError = err?.error?.error || err?.error?.message || '';
      
      // Check for specific license plate detection errors
      if (backendError.toLowerCase().includes('could not detect license plate') || 
          backendError.toLowerCase().includes('không thể nhận diện biển số')) {
        errorMessage = 'Không thể nhận diện biển số xe. Vui lòng:\n' +
          '1. Đảm bảo biển số xe rõ ràng và nằm trong khung hình\n' +
          '2. Đảm bảo đủ ánh sáng\n' +
          '3. Thử lại sau vài giây\n' +
          '4. Hoặc sử dụng camera HTTP/RTSP với snapshot URL';
      } else {
        errorMessage = backendError || 'Yêu cầu không hợp lệ. Vui lòng kiểm tra cấu hình camera.';
      }
    } else if (err?.status === 404) {
      errorMessage = 'Không tìm thấy camera hoặc endpoint.';
    } else if (err?.status === 500) {
      errorMessage = 'Lỗi server. Vui lòng thử lại sau.';
    } else if (err?.error) {
      // Check if error is a string (HTML response)
      if (typeof err.error === 'string') {
        // Try to extract error from HTML or use generic message
        if (err.error.includes('<!DOCTYPE') || err.error.includes('<html')) {
          errorMessage = 'Backend trả về lỗi. Vui lòng kiểm tra cấu hình camera hoặc liên hệ admin.';
        } else {
          errorMessage = err.error;
        }
      } else if (err.error.error) {
        errorMessage = err.error.error;
      } else if (err.error.message) {
        errorMessage = err.error.message;
      }
    } else if (err?.message) {
      errorMessage = err.message;
    }
    
    this.error = errorMessage;
    console.error('Camera error:', errorMessage, err);
    alert(`Lỗi: ${errorMessage}`);
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        // Remove data:image/jpeg;base64, prefix if present
        const base64 = base64String.includes(',') ? base64String.split(',')[1] : base64String;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private async compressImage(blob: Blob, maxSize: number): Promise<Blob> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        let quality = 0.6;
        let attempts = 0;
        const maxAttempts = 10;
        
        const tryCompress = (): void => {
          attempts++;
          
          if (attempts > maxAttempts) {
            // If we've tried too many times, just return the smallest we can get
            canvas.width = Math.floor(width * 0.5);
            canvas.height = Math.floor(height * 0.5);
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              canvas.toBlob((finalBlob) => {
                resolve(finalBlob || blob);
              }, 'image/jpeg', 0.4);
            } else {
              resolve(blob);
            }
            return;
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve(blob);
            return;
          }
          
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((compressedBlob) => {
            if (!compressedBlob) {
              resolve(blob);
              return;
            }
            
            if (compressedBlob.size <= maxSize || (quality <= 0.1 && width < 200)) {
              resolve(compressedBlob);
            } else {
              // Reduce quality first
              if (quality > 0.2) {
                quality -= 0.1;
              } else {
                // Then reduce size
                width = Math.floor(width * 0.85);
                height = Math.floor(height * 0.85);
                quality = 0.6; // Reset quality when resizing
              }
              
              // Try again with new settings
              tryCompress();
            }
          }, 'image/jpeg', quality);
        };
        
        tryCompress();
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(blob); // Return original if compression fails
      };
      
      img.src = url;
    });
  }

  getStatusLabel(status: SpotStatus): string {
    switch (status) {
      case 'available':
        return 'Trống';
      case 'occupied':
        return 'Đang đỗ';
      case 'out_of_service':
        return 'Bảo trì';
      default:
        return status;
    }
  }

  trackBySpot(_: number, spot: ParkingSpot): string {
    return spot.id;
  }

  trackByCamera(_: number, camera: CameraFeed): number {
    return camera.id;
  }

  openAddLotModal(): void {
    this.newLot = { name: '', location: '', totalSlots: 0, pricePerHour: 0 };
    this.showAddLotModal = true;
  }

  closeAddLotModal(): void {
    this.showAddLotModal = false;
  }

  openAddSlotModal(): void {
    this.newSlot = { parkingLotId: this.selectedLotId || undefined, slotCode: '', status: 'available', coordinates: undefined };
    this.coordinatesText = '';
    this.showAddSlotModal = true;
  }

  closeAddSlotModal(): void {
    this.showAddSlotModal = false;
  }

  openSlotEditorModal(): void {
    this.uploadedImageUrl = null;
    this.uploadedImageFile = null;
    this.slots = [];
    this.currentSlotIndex = null;
    this.isDrawing = false;
    this.isEditing = false;
    this.zoomLevel = 1;
    this.stagePosition = { x: 0, y: 0 };
    this.showSlotEditorModal = true;
    // Khởi tạo canvas sau khi modal mở
    setTimeout(() => {
      if (this.uploadedImageUrl) {
        this.initCanvas();
      }
    }, 100);
  }

  closeSlotEditorModal(): void {
    this.showSlotEditorModal = false;
    this.destroyCanvas();
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.uploadedImageFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.uploadedImageUrl = e.target?.result as string;
        setTimeout(() => this.initCanvas(), 100);
      };
      reader.readAsDataURL(file);
    }
  }

  initCanvas(): void {
    if (!this.canvasContainer || !this.uploadedImageUrl) {
      return;
    }

    this.destroyCanvas();

    const container = this.canvasContainer.nativeElement;
    const width = container.offsetWidth || 800;
    const height = container.offsetHeight || 600;

    this.stage = new Konva.Stage({
      container: container,
      width: width,
      height: height
    });

    this.imageLayer = new Konva.Layer();
    this.stage.add(this.imageLayer);

    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    this.transformer = new Konva.Transformer({
      nodes: [],
      enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center'],
      rotateEnabled: false
    });
    this.layer.add(this.transformer);

    this.loadImageToCanvas();
  }

  loadImageToCanvas(): void {
    if (!this.stage || !this.imageLayer || !this.uploadedImageUrl) {
      return;
    }

    const imageObj = new Image();
    imageObj.onload = () => {
      const stageWidth = this.stage!.width();
      const stageHeight = this.stage!.height();
      const imageAspect = imageObj.width / imageObj.height;
      const stageAspect = stageWidth / stageHeight;

      let width, height, x, y;
      if (imageAspect > stageAspect) {
        width = stageWidth;
        height = stageWidth / imageAspect;
        x = 0;
        y = (stageHeight - height) / 2;
      } else {
        width = stageHeight * imageAspect;
        height = stageHeight;
        x = (stageWidth - width) / 2;
        y = 0;
      }

      const konvaImage = new Konva.Image({
        x: x,
        y: y,
        image: imageObj,
        width: width,
        height: height
      });

      this.imageLayer!.destroyChildren();
      this.imageLayer!.add(konvaImage);
      this.imageLayer!.draw();
    };
    imageObj.src = this.uploadedImageUrl;
  }

  startDrawing(): void {
    if (!this.stage || !this.layer || !this.uploadedImageUrl) {
      this.error = 'Vui lòng upload ảnh trước.';
      return;
    }

    this.isDrawing = true;
    this.disableEdit();

    let startPos: { x: number; y: number } | null = null;
    let currentRect: Konva.Rect | null = null;

    const mousedownHandler = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!this.isDrawing) return;
      e.evt.preventDefault();
      const pos = this.stage!.getPointerPosition();
      if (!pos) return;

      startPos = {
        x: (pos.x - this.stage!.x()) / this.stage!.scaleX(),
        y: (pos.y - this.stage!.y()) / this.stage!.scaleY()
      };

      currentRect = new Konva.Rect({
        x: startPos.x,
        y: startPos.y,
        width: 0,
        height: 0,
        stroke: '#3b82f6',
        strokeWidth: 2,
        fill: 'rgba(59, 130, 246, 0.2)',
        draggable: false,
        name: 'slot-rect'
      });

      this.layer!.add(currentRect);
    };

    const mousemoveHandler = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!this.isDrawing || !startPos || !currentRect) return;
      e.evt.preventDefault();
      const pos = this.stage!.getPointerPosition();
      if (!pos) return;

      const currentPos = {
        x: (pos.x - this.stage!.x()) / this.stage!.scaleX(),
        y: (pos.y - this.stage!.y()) / this.stage!.scaleY()
      };

      const width = currentPos.x - startPos.x;
      const height = currentPos.y - startPos.y;

      currentRect.width(Math.abs(width));
      currentRect.height(Math.abs(height));
      currentRect.x(width < 0 ? currentPos.x : startPos.x);
      currentRect.y(height < 0 ? currentPos.y : startPos.y);

      this.layer!.draw();
    };

    const mouseupHandler = () => {
      if (!this.isDrawing || !currentRect || !startPos) return;

      const width = currentRect.width();
      const height = currentRect.height();

      if (width > 10 && height > 10) {
        // Tạo slot mới
        const slotId = `slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const slotCode = `A-${String(this.slots.length + 1).padStart(2, '0')}`;
        
        currentRect.draggable(true);
        currentRect.on('click', () => this.selectSlot(slotId));
        currentRect.on('dragend', () => {
          const slot = this.slots.find(s => s.id === slotId);
          if (slot) {
            slot.x = currentRect!.x();
            slot.y = currentRect!.y();
          }
        });

        this.slots.push({
          id: slotId,
          rect: currentRect,
          slotCode: slotCode,
          x: currentRect.x(),
          y: currentRect.y(),
          width: width,
          height: height
        });

        this.layer!.draw();
      } else {
        currentRect.destroy();
      }

      startPos = null;
      currentRect = null;
    };

    this.stage.on('mousedown', mousedownHandler);
    this.stage.on('mousemove', mousemoveHandler);
    this.stage.on('mouseup', mouseupHandler);
  }

  finishDrawing(): void {
    this.isDrawing = false;
    if (this.stage) {
      this.stage.off('mousedown mousemove mouseup');
    }
  }

  selectSlot(slotId: string): void {
    const slot = this.slots.find(s => s.id === slotId);
    if (!slot || !slot.rect || !this.transformer) return;

    this.currentSlotIndex = this.slots.findIndex(s => s.id === slotId);
    this.transformer.nodes([slot.rect]);
    this.transformer.getLayer()?.draw();
  }

  enableEdit(): void {
    if (this.slots.length === 0) {
      this.error = 'Vui lòng vẽ ít nhất một vị trí đỗ.';
      return;
    }
    this.isEditing = true;
    this.finishDrawing();
  }

  disableEdit(): void {
    if (this.transformer) {
      this.transformer.nodes([]);
      this.transformer.getLayer()?.draw();
    }
    this.isEditing = false;
    this.currentSlotIndex = null;
  }

  deleteSlot(index: number): void {
    const slot = this.slots[index];
    if (slot && slot.rect) {
      slot.rect.destroy();
    }
    this.slots.splice(index, 1);
    if (this.currentSlotIndex === index) {
      this.disableEdit();
    }
    this.layer?.draw();
  }

  clearAllSlots(): void {
    this.slots.forEach(slot => {
      if (slot.rect) {
        slot.rect.destroy();
      }
    });
    this.slots = [];
    this.disableEdit();
    this.layer?.draw();
  }

  zoomIn(): void {
    if (!this.stage) return;
    const oldScale = this.stage.scaleX();
    const newScale = Math.min(3, oldScale * 1.2);
    this.zoomLevel = newScale;
    this.stage.scale({ x: newScale, y: newScale });
    this.layer?.draw();
  }

  zoomOut(): void {
    if (!this.stage) return;
    const oldScale = this.stage.scaleX();
    const newScale = Math.max(0.5, oldScale / 1.2);
    this.zoomLevel = newScale;
    this.stage.scale({ x: newScale, y: newScale });
    this.layer?.draw();
  }

  resetZoom(): void {
    if (!this.stage) return;
    this.zoomLevel = 1;
    this.stage.scale({ x: 1, y: 1 });
    this.stagePosition = { x: 0, y: 0 };
    this.stage.position({ x: 0, y: 0 });
    this.layer?.draw();
  }

  getCoordinatesFromRect(rect: Konva.Rect): number[][][] {
    const x = rect.x();
    const y = rect.y();
    const width = rect.width();
    const height = rect.height();

    // Tạo polygon từ rectangle (4 điểm + đóng)
    return [[
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
      [x, y] // Đóng polygon
    ]];
  }

  async uploadImageAndCreateSlots(): Promise<void> {
    if (!this.uploadedImageFile || !this.selectedLotId) {
      this.error = 'Vui lòng upload ảnh và chọn bãi đỗ.';
      return;
    }

    if (this.slots.length === 0) {
      this.error = 'Vui lòng vẽ ít nhất một vị trí đỗ.';
      return;
    }

    // Validate tất cả slots đều có slotCode
    const invalidSlots = this.slots.filter(s => !s.slotCode || s.slotCode.trim() === '');
    if (invalidSlots.length > 0) {
      this.error = 'Vui lòng nhập mã vị trí cho tất cả các vị trí đỗ.';
      return;
    }

    this.submitting = true;
    this.error = null;

    try {
      // Upload ảnh
      await firstValueFrom(this.api.uploadImage(this.uploadedImageFile, this.selectedLotId));
      
      // Tạo tất cả slots
      const createPromises = this.slots.map(slot => {
        const coordinates = slot.rect ? this.getCoordinatesFromRect(slot.rect) : [];
        const payload = {
          parkingLotId: this.selectedLotId!,
          slotCode: slot.slotCode.trim(),
          status: 'available' as ParkingSlotStatus,
          coordinates: coordinates
        };
        return firstValueFrom(this.api.createParkingSlot(payload));
      });

      await Promise.all(createPromises);

      this.closeSlotEditorModal();
      if (this.selectedLotId) {
        this.loadSlotsForLot(this.selectedLotId);
      }
    } catch (err: any) {
      this.error = err?.error?.message || 'Không thể tạo vị trí đỗ. Vui lòng thử lại.';
    } finally {
      this.submitting = false;
    }
  }

  destroyCanvas(): void {
    if (this.stage) {
      this.stage.destroy();
      this.stage = null;
      this.layer = null;
      this.imageLayer = null;
      this.transformer = null;
    }
  }

  handleCreateLot(): void {
    if (!this.newLot.name || !this.newLot.location || !this.newLot.totalSlots || !this.newLot.pricePerHour) {
      return;
    }

    this.submitting = true;
    this.api
      .createParkingLot(this.newLot)
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: () => {
          this.closeAddLotModal();
          this.loadParkingLots();
        },
        error: (err) => {
          const errorMessage = err?.error?.error || err?.error?.message || err?.message;
          if (errorMessage?.includes('permission') || errorMessage?.includes('Access denied')) {
            this.error = 'Bạn không có quyền thực hiện thao tác này. Chức năng này chỉ dành cho quản trị viên.';
          } else {
            this.error = errorMessage || 'Không thể tạo bãi đỗ mới. Vui lòng thử lại.';
          }
        }
      });
  }

  handleCreateSlot(): void {
    if (!this.newSlot.parkingLotId || !this.newSlot.slotCode) {
      return;
    }

    this.submitting = true;
    const payload: Partial<ParkingSlot> = {
      parkingLotId: this.newSlot.parkingLotId,
      slotCode: this.newSlot.slotCode,
      status: this.newSlot.status || 'available'
    };

    // Parse coordinates từ text nếu có
    if (this.coordinatesText.trim()) {
      try {
        const parsed = JSON.parse(this.coordinatesText.trim());
        if (Array.isArray(parsed)) {
          payload.coordinates = parsed;
        }
      } catch (e) {
        // Invalid JSON, ignore
      }
    }

    this.api
      .createParkingSlot(payload)
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: () => {
          this.closeAddSlotModal();
          if (this.selectedLotId) {
            this.loadSlotsForLot(this.selectedLotId);
          }
        },
        error: (err) => {
          const errorMessage = err?.error?.error || err?.error?.message || err?.message;
          if (errorMessage?.includes('permission') || errorMessage?.includes('Access denied')) {
            this.error = 'Bạn không có quyền thực hiện thao tác này. Chức năng này chỉ dành cho quản trị viên.';
          } else {
            this.error = errorMessage || 'Không thể tạo vị trí đỗ mới. Vui lòng thử lại.';
          }
        }
      });
  }

  private loadData(): void {
    this.loading = true;
    this.error = null;
    forkJoin({
      slots: this.api.getParkingSlots(),
      sessions: this.api.getParkingSessions(),
      vehicles: this.api.getVehicles(),
      lots: this.api.getParkingLots()
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: ({ slots, sessions, vehicles, lots }) => {
          this.parkingLots = lots;
          this.spots = this.hydrateSlots(slots, sessions, vehicles);
        },
        error: () => {
          this.error = 'Không tải được sơ đồ bãi xe từ máy chủ.';
        }
      });
  }

  private hydrateSlots(slots: ParkingSlot[], sessions: ParkingSession[], vehicles?: Vehicle[]): ParkingSpot[] {
    const activeSessions = sessions.filter((session) => session.status === 'active');
    const vehicleMap = vehicles ? new Map(vehicles.map((v) => [v.id, v])) : new Map();
    const sessionBySlot = new Map<number, ParkingSession>();
    activeSessions.forEach((session) => {
      sessionBySlot.set(session.parkingSlotId, session);
    });

    return slots.map((slot) => {
      const session = sessionBySlot.get(slot.id);
      const vehicle = session ? vehicleMap.get(session.vehicleId) : undefined;
      return {
        id: slot.slotCode,
        status: slot.status,
        vehicle: vehicle?.licensePlate,
        time: session ? new Date(session.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
        parkingLotId: slot.parkingLotId
      };
    });
  }
}
