import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, forkJoin, firstValueFrom, catchError, of, throwError } from 'rxjs';
import Konva from 'konva';
import { ApiClientService } from '../../core/services/api-client.service';
import { ParkingSession, ParkingSlot, ParkingSlotStatus, ParkingLot, Vehicle, ProcessVehicleResponse, Camera, CameraType, CameraStatus, User, ParkingLotVehiclesResponse, CurrentOccupantResponse } from '../../core/models/api.models';

type SpotStatus = ParkingSlotStatus;

interface ParkingSpot {
  id: string;
  slotId?: number; // ID thực tế của slot trong database
  status: SpotStatus;
  vehicle?: string;
  time?: string;
  parkingLotId?: number;
  session?: ParkingSession; // Thông tin session để hiển thị chi tiết
  vehicleInfo?: Vehicle; // Thông tin đầy đủ về xe
  userInfo?: User; // Thông tin chủ xe (nếu có)
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
  lotCamerasMap: Map<number, Camera[]> = new Map();

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

  // Map Image
  @ViewChild('mapCanvasContainer', { static: false }) mapCanvasContainer!: ElementRef<HTMLDivElement>;
  mapImageUrl: string | null = null;
  mapImageFile: File | null = null;
  mapStage: Konva.Stage | null = null;
  mapImageLayer: Konva.Layer | null = null;
  mapSlotsLayer: Konva.Layer | null = null;
  mapZoomLevel = 1;
  mapStagePosition = { x: 0, y: 0 };
  uploadingMapImage = false;

  // Modals
  showAddLotModal = false;
  showAddSlotModal = false;
  showSlotEditorModal = false;
  showSpotDetailModal = false;
  selectedSpot: ParkingSpot | null = null;
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
  originalImageDimensions: { width: number; height: number } | null = null; // Kích thước ảnh gốc để tính phần trăm

  // Add Camera Modal
  showAddCameraModal = false;
  addCameraForLot: ParkingLot | null = null;
  availableDevices: MediaDeviceInfo[] = [];
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

  // Forms
  newLot: Partial<ParkingLot> = {
    name: '',
    location: '',
    totalSlots: 0,
    pricePerHour: 0
  };

  // New lot map upload
  newLotMapFile: File | null = null;
  newLotMapPreviewUrl: string | null = null;

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
    this.loadAllCamerasForLotMap();
  }

  loadCameras(): void {
    // Only load cameras if not viewing a specific lot
    // If viewing a lot, cameras will be loaded via loadCamerasForLot()
    if (this.selectedLotId) {
      return;
    }
    
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

  loadAllCamerasForLotMap(): void {
    this.api.getCameras().subscribe({
      next: (cameras) => {
        this.lotCamerasMap.clear();
        cameras.forEach(camera => {
          if (camera.parkingLotId) {
            const existing = this.lotCamerasMap.get(camera.parkingLotId) || [];
            existing.push(camera);
            this.lotCamerasMap.set(camera.parkingLotId, existing);
          }
        });
      },
      error: (err) => {
        console.error('Error loading cameras for lot map:', err);
      }
    });
  }

  lotHasCamera(lotId: number): boolean {
    const cameras = this.lotCamerasMap.get(lotId);
    return !!cameras && cameras.length > 0;
  }

  getLotCameraCount(lotId: number): number {
    return this.lotCamerasMap.get(lotId)?.length || 0;
  }

  openAddCameraForLot(lot: ParkingLot, event: Event): void {
    event.stopPropagation();
    this.addCameraForLot = lot;
    this.newCamera = {
      name: '',
      streamUrl: '',
      cameraType: 'webcam',
      status: 'active',
      parkingLotId: lot.id,
      description: '',
      location: lot.location || ''
    };
    this.showAddCameraModal = true;
    this.loadAvailableDevices();
  }

  closeAddCameraModal(): void {
    this.showAddCameraModal = false;
    this.addCameraForLot = null;
    this.newCamera.deviceId = undefined;
  }

  async loadAvailableDevices(): Promise<void> {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.availableDevices = devices.filter(device => device.kind === 'videoinput');
    } catch (err) {
      console.error('Error accessing devices:', err);
    }
  }

  selectDeviceForNewCamera(deviceId: string): void {
    const device = this.availableDevices.find(d => d.deviceId === deviceId);
    if (device) {
      this.newCamera.deviceId = deviceId;
      this.newCamera.streamUrl = deviceId;
      this.newCamera.name = device.label || `Camera ${this.availableDevices.indexOf(device) + 1}`;
      this.newCamera.cameraType = 'webcam';
    }
  }

  handleCreateCamera(): void {
    if (!this.newCamera.name || !this.newCamera.streamUrl) {
      this.error = 'Vui lòng điền đầy đủ thông tin camera.';
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
          this.closeAddCameraModal();
          this.loadAllCamerasForLotMap();
          if (this.selectedLotId) {
            this.loadCamerasForLot(this.selectedLotId);
          }
        },
        error: (err) => {
          this.error = err?.error?.message || 'Không thể tạo camera. Vui lòng thử lại.';
        }
      });
  }

  ngAfterViewInit(): void {
    // Canvas sẽ được khởi tạo khi mở modal
  }

  ngOnDestroy(): void {
    this.destroyCanvas();
    this.destroyMapCanvas();
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
    // Reset map image when switching lots
    this.mapImageFile = null;
    this.destroyMapCanvas();
    
    // Load map image from parking lot's map field if available
    if (lot.map) {
      this.mapImageUrl = lot.map;
      // Initialize map canvas after a short delay to ensure DOM is ready
      setTimeout(() => {
        this.initMapCanvas();
      }, 100);
    } else {
      this.mapImageUrl = null;
    }
  }

  loadCamerasForLot(parkingLotId: number): void {
    // Stop all existing camera streams before loading new ones
    this.cameras.forEach(camera => {
      this.stopCameraStream(camera);
    });

    this.api.getCameras(parkingLotId).subscribe({
      next: (cameras) => {
        // Only show cameras for this specific parking lot
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
        console.error('Error loading cameras for lot:', err);
        // Set empty array on error
        this.cameras = [];
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
    // Stop all camera streams before clearing
    this.cameras.forEach(camera => {
      this.stopCameraStream(camera);
    });
    
    this.selectedLotId = null;
    this.selectedLot = null;
    this.selectedZone = 'all';
    this.spots = [];
    this.cameras = []; // Clear cameras when going back to list
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
          
          // If viewing a specific lot, update its info (including map) from the refreshed list
          if (this.selectedLotId) {
            const updatedLot = lots.find(lot => lot.id === this.selectedLotId);
            if (updatedLot) {
              this.selectedLot = updatedLot;
              // Update map image if it exists
              if (updatedLot.map) {
                const mapChanged = this.mapImageUrl !== updatedLot.map;
                this.mapImageUrl = updatedLot.map;
                // Reinitialize map canvas if map URL changed
                if (mapChanged) {
                  this.destroyMapCanvas();
                  setTimeout(() => {
                    this.initMapCanvas();
                  }, 100);
                }
              } else if (this.mapImageUrl) {
                // If lot no longer has map, clear it
                this.mapImageUrl = null;
                this.destroyMapCanvas();
              }
            }
          }
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
      vehicles: this.api.getVehicles(),
      users: this.api.getUsers().pipe(catchError(() => of([]))) // Load users, fallback to empty array if error
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: ({ slots, sessions, vehicles, users }) => {
          this.spots = this.hydrateSlots(slots, sessions, vehicles, users);
          // Draw slots on map if map image is loaded - always redraw after reload
          if (this.mapImageUrl && this.mapStage) {
            // Use setTimeout to ensure map stage is ready
            setTimeout(() => {
              this.drawSlotsOnMap(slots);
            }, 100);
          }
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

    // Reset lastResult when starting new process
    camera.lastResult = undefined;
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

          // Reset lastResult after 5 seconds to return to camera view
          setTimeout(() => {
            if (camera.lastResult === response) {
              camera.lastResult = undefined;
            }
          }, 5000);
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
            // Add imageUrl to response for display
            const responseWithImage: ProcessVehicleResponse = {
              ...response,
              imageUrl: imageUrl
            };
            camera.lastResult = responseWithImage;
            
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

            // Reset lastResult after 5 seconds to return to camera view
            setTimeout(() => {
              if (camera.lastResult === responseWithImage) {
                camera.lastResult = undefined;
              }
            }, 5000);
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
    this.newLotMapFile = null;
    this.newLotMapPreviewUrl = null;
    this.showAddLotModal = true;
  }

  onNewLotMapSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.newLotMapFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.newLotMapPreviewUrl = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  clearNewLotMap(): void {
    this.newLotMapFile = null;
    this.newLotMapPreviewUrl = null;
    // Reset file input - find the one in the add lot modal
    setTimeout(() => {
      const modal = document.querySelector('.modal');
      if (modal) {
        const fileInput = modal.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
        if (fileInput) {
          fileInput.value = '';
        }
      }
    }, 0);
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
    // Use map image from parking lot if available, otherwise reset
    if (this.selectedLot?.map) {
      this.uploadedImageUrl = this.selectedLot.map;
      this.uploadedImageFile = null; // No file since it's from the parking lot
      // Set original image dimensions from parking lot
      if (this.selectedLot.mapWidth && this.selectedLot.mapHeight) {
        this.originalImageDimensions = {
          width: this.selectedLot.mapWidth,
          height: this.selectedLot.mapHeight
        };
      } else {
        this.originalImageDimensions = null;
      }
    } else {
      this.uploadedImageUrl = null;
      this.uploadedImageFile = null;
      this.originalImageDimensions = null;
    }
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
      // Lưu kích thước ảnh gốc để tính phần trăm
      this.originalImageDimensions = {
        width: imageObj.naturalWidth,
        height: imageObj.naturalHeight
      };

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
    if (!this.originalImageDimensions) {
      // Fallback: nếu không có kích thước gốc, trả về pixel (tương thích ngược)
      const x = rect.x();
      const y = rect.y();
      const width = rect.width();
      const height = rect.height();
      return [[
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
        [x, y]
      ]];
    }

    // Lấy tọa độ pixel trên canvas
    const x = rect.x();
    const y = rect.y();
    const width = rect.width();
    const height = rect.height();

    // Lấy kích thước ảnh gốc
    const originalWidth = this.originalImageDimensions.width;
    const originalHeight = this.originalImageDimensions.height;

    // Lấy ảnh trên canvas để tính scale
    const imageNode = this.imageLayer?.children[0] as Konva.Image;
    if (!imageNode) {
      // Fallback
      return [[[x, y], [x + width, y], [x + width, y + height], [x, y + height], [x, y]]];
    }

    // Tính scale từ canvas về ảnh gốc
    const canvasImageWidth = imageNode.width();
    const canvasImageHeight = imageNode.height();
    const scaleX = originalWidth / canvasImageWidth;
    const scaleY = originalHeight / canvasImageHeight;

    // Chuyển từ tọa độ canvas về tọa độ ảnh gốc
    const imageX = imageNode.x();
    const imageY = imageNode.y();
    const relativeX = (x - imageX) * scaleX;
    const relativeY = (y - imageY) * scaleY;
    const relativeWidth = width * scaleX;
    const relativeHeight = height * scaleY;

    // Clamp tọa độ về trong bounds của ảnh gốc
    const clampedX = Math.max(0, Math.min(relativeX, originalWidth));
    const clampedY = Math.max(0, Math.min(relativeY, originalHeight));
    const clampedWidth = Math.max(0, Math.min(relativeWidth, originalWidth - clampedX));
    const clampedHeight = Math.max(0, Math.min(relativeHeight, originalHeight - clampedY));

    // Chuyển sang phần trăm (0-100)
    const percentX = (clampedX / originalWidth) * 100;
    const percentY = (clampedY / originalHeight) * 100;
    const percentWidth = (clampedWidth / originalWidth) * 100;
    const percentHeight = (clampedHeight / originalHeight) * 100;

    // Đảm bảo giá trị phần trăm hợp lệ (0-100)
    const finalPercentX = Math.max(0, Math.min(100, percentX));
    const finalPercentY = Math.max(0, Math.min(100, percentY));
    const finalPercentWidth = Math.max(0, Math.min(100 - finalPercentX, percentWidth));
    const finalPercentHeight = Math.max(0, Math.min(100 - finalPercentY, percentHeight));

    // Tạo polygon từ rectangle dưới dạng phần trăm (chỉ 1 polygon)
    return [[
      [finalPercentX, finalPercentY],
      [finalPercentX + finalPercentWidth, finalPercentY],
      [finalPercentX + finalPercentWidth, finalPercentY + finalPercentHeight],
      [finalPercentX, finalPercentY + finalPercentHeight],
      [finalPercentX, finalPercentY] // Đóng polygon
    ]];
  }

  async uploadImageAndCreateSlots(): Promise<void> {
    if (!this.uploadedImageUrl || !this.selectedLotId) {
      this.error = 'Vui lòng có ảnh bản đồ và chọn bãi đỗ.';
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
      // If a new image file was uploaded, upload it first
      // Otherwise, the image is already from the parking lot's map field
      if (this.uploadedImageFile) {
        await firstValueFrom(this.api.uploadImage(this.uploadedImageFile, this.selectedLotId));
      }
      
      // Tạo tất cả slots
      const createPromises = this.slots.map(slot => {
        const coordinates = slot.rect ? this.getCoordinatesFromRect(slot.rect) : [];
        // Đảm bảo coordinates là array hợp lệ và chỉ có 1 polygon
        const validCoordinates = Array.isArray(coordinates) && coordinates.length > 0 ? coordinates : [];
        
        const payload = {
          parkingLotId: this.selectedLotId!,
          slotCode: slot.slotCode.trim(),
          status: 'available' as ParkingSlotStatus,
          coordinates: validCoordinates
        };
        
        console.log('Creating slot:', slot.slotCode, 'with coordinates:', validCoordinates);
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

  async handleCreateLot(): Promise<void> {
    if (!this.newLot.name || !this.newLot.location || !this.newLot.totalSlots || !this.newLot.pricePerHour) {
      return;
    }

    this.submitting = true;
    this.error = null;

    try {
      const payload: Partial<ParkingLot> = {
        name: this.newLot.name,
        location: this.newLot.location,
        totalSlots: this.newLot.totalSlots,
        pricePerHour: this.newLot.pricePerHour
      };

      // If map image is provided, upload it first and get dimensions
      if (this.newLotMapFile) {
        try {
          // Upload image
          const uploadResult = await firstValueFrom(
            this.api.uploadImage(this.newLotMapFile).pipe(
              catchError((err) => {
                this.error = err?.error?.message || 'Không thể upload ảnh bản đồ. Vui lòng thử lại.';
                throw err;
              })
            )
          );

          // Get image URL from response
          const imageUrl = uploadResult?.image?.url;
          if (imageUrl) {
            payload.map = imageUrl;

            // Get original image dimensions
            const dimensions = await this.getImageDimensions(this.newLotMapFile);
            if (dimensions) {
              payload.mapWidth = dimensions.width;
              payload.mapHeight = dimensions.height;
            }
          }
        } catch (err) {
          // Error already set in catchError above
          this.submitting = false;
          return;
        }
      }

      // Create parking lot with map data
      this.api
        .createParkingLot(payload)
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
    } catch (err: any) {
      this.submitting = false;
      this.error = err?.message || 'Có lỗi xảy ra khi tạo bãi đỗ.';
    }
  }

  private getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      
      img.src = url;
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

  handleDeleteLot(lot: ParkingLot, event: Event): void {
    event.stopPropagation(); // Ngăn chặn click event bubble lên lot-card
    if (!confirm(`Bạn có chắc chắn muốn xóa bãi đỗ "${lot.name}"? Hành động này không thể hoàn tác.`)) {
      return;
    }

    this.api
      .deleteParkingLot(lot.id)
      .subscribe({
        next: () => {
          // Nếu đang xem bãi đỗ này, quay về danh sách
          if (this.selectedLotId === lot.id) {
            this.backToList();
          }
          this.loadParkingLots();
        },
        error: (err) => {
          const errorMessage = err?.error?.error || err?.error?.message || err?.message;
          if (errorMessage?.includes('permission') || errorMessage?.includes('Access denied')) {
            this.error = 'Bạn không có quyền thực hiện thao tác này. Chức năng này chỉ dành cho quản trị viên.';
          } else {
            this.error = errorMessage || 'Không thể xóa bãi đỗ. Vui lòng thử lại.';
          }
        }
      });
  }

  showSpotDetail(spot: ParkingSpot): void {
    // Set initial spot data
    this.selectedSpot = spot;
    this.showSpotDetailModal = true;

    // Load detailed information from API
    if (spot.slotId) {
      this.loading = true;
      this.api.getParkingSlotCurrentOccupant(spot.slotId).subscribe({
        next: (response) => {
          if (response.isOccupied && response.currentOccupant && this.selectedSpot) {
            const occupant = response.currentOccupant;
            
            // Update selectedSpot with detailed information from API
            this.selectedSpot = {
              ...this.selectedSpot,
              vehicle: occupant.vehicle?.licensePlate || occupant.session.licensePlate,
              session: {
                id: occupant.session.id,
                vehicleId: occupant.vehicle?.id || null,
                licensePlate: occupant.vehicle?.licensePlate || occupant.session.licensePlate,
                parkingSlotId: response.parkingSlot.id,
                entryTime: occupant.session.entryTime,
                exitTime: occupant.session.exitTime || null,
                fee: occupant.session.fee,
                status: occupant.session.status || 'active'
              },
              vehicleInfo: occupant.vehicle ? {
                id: occupant.vehicle.id,
                licensePlate: occupant.vehicle.licensePlate,
                vehicleType: occupant.vehicle.vehicleType,
                userId: occupant.vehicle.userId
              } : undefined,
              userInfo: occupant.user ? {
                id: occupant.user.id,
                fullName: occupant.user.fullName,
                email: occupant.user.email,
                roleId: 0 // Default value, not provided in response
              } : undefined
            };
          }
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading vehicle details:', err);
          this.loading = false;
          // Keep the modal open with existing data
        }
      });
    }
  }

  closeSpotDetailModal(): void {
    this.showSpotDetailModal = false;
    this.selectedSpot = null;
  }

  handleDeleteSpot(spot: ParkingSpot, event: Event): void {
    event.stopPropagation(); // Ngăn chặn click event bubble
    if (!confirm(`Bạn có chắc chắn muốn xóa vị trí đỗ "${spot.id}"? Hành động này không thể hoàn tác.`)) {
      return;
    }

    if (!spot.slotId) {
      this.error = 'Không tìm thấy ID vị trí đỗ.';
      return;
    }

    this.api
      .deleteParkingSlot(spot.slotId)
      .subscribe({
        next: () => {
          if (this.selectedLotId) {
            this.loadSlotsForLot(this.selectedLotId);
          }
        },
        error: (err) => {
          const errorMessage = err?.error?.error || err?.error?.message || err?.message;
          if (errorMessage?.includes('permission') || errorMessage?.includes('Access denied')) {
            this.error = 'Bạn không có quyền thực hiện thao tác này. Chức năng này chỉ dành cho quản trị viên.';
          } else {
            this.error = errorMessage || 'Không thể xóa vị trí đỗ. Vui lòng thử lại.';
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
      lots: this.api.getParkingLots(),
      users: this.api.getUsers().pipe(catchError(() => of([])))
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: ({ slots, sessions, vehicles, lots, users }) => {
          this.parkingLots = lots;
          this.spots = this.hydrateSlots(slots, sessions, vehicles, users);
        },
        error: () => {
          this.error = 'Không tải được sơ đồ bãi xe từ máy chủ.';
        }
      });
  }

  private hydrateSlots(slots: ParkingSlot[], sessions: ParkingSession[], vehicles?: Vehicle[], users?: User[]): ParkingSpot[] {
    const activeSessions = sessions.filter((session) => session.status === 'active');
    const vehicleMap = vehicles ? new Map(vehicles.map((v) => [v.id, v])) : new Map();
    const userMap = users ? new Map(users.map((u) => [u.id, u])) : new Map();
    const sessionBySlot = new Map<number, ParkingSession>();
    activeSessions.forEach((session) => {
      sessionBySlot.set(session.parkingSlotId, session);
    });

    return slots.map((slot) => {
      const session = sessionBySlot.get(slot.id);
      const vehicle = session ? vehicleMap.get(session.vehicleId) : undefined;
      const userInfo = vehicle?.userId ? userMap.get(vehicle.userId) : undefined;
      return {
        id: slot.slotCode,
        slotId: slot.id, // Lưu ID thực tế để xóa
        status: slot.status,
        vehicle: vehicle?.licensePlate || session?.licensePlate,
        time: session ? new Date(session.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
        parkingLotId: slot.parkingLotId,
        session: session, // Lưu session để hiển thị chi tiết
        vehicleInfo: vehicle, // Lưu thông tin đầy đủ về xe
        userInfo: userInfo // Lưu thông tin chủ xe
      };
    });
  }

  // Map Image Methods
  onMapImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.mapImageFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.mapImageUrl = e.target?.result as string;
        setTimeout(() => this.initMapCanvas(), 100);
      };
      reader.readAsDataURL(file);
    }
  }

  async uploadMapImage(): Promise<void> {
    if (!this.mapImageFile || !this.selectedLotId) {
      this.error = 'Vui lòng chọn ảnh và bãi đỗ.';
      return;
    }

    this.uploadingMapImage = true;
    this.error = null;

    try {
      // Upload image first
      const result = await firstValueFrom(
        this.api.uploadImage(this.mapImageFile, this.selectedLotId).pipe(
          catchError((err) => {
            this.error = err?.error?.message || 'Không thể upload ảnh. Vui lòng thử lại.';
            return throwError(() => err);
          })
        )
      );
      
      // Get image URL from response
      const imageUrl = result?.image?.url;
      if (!imageUrl) {
        this.error = 'Upload ảnh thành công nhưng không nhận được URL. Vui lòng thử lại.';
        this.uploadingMapImage = false;
        return;
      }

      // Get original image dimensions
      const dimensions = await this.getImageDimensions(this.mapImageFile);
      
      // Update parking lot with map image URL and dimensions
      const updatePayload: Partial<ParkingLot> = {
        map: imageUrl
      };
      
      if (dimensions) {
        updatePayload.mapWidth = dimensions.width;
        updatePayload.mapHeight = dimensions.height;
      }

      // Update parking lot in database
      await firstValueFrom(
        this.api.updateParkingLot(this.selectedLotId, updatePayload).pipe(
          catchError((err) => {
            this.error = err?.error?.message || 'Không thể cập nhật thông tin bãi đỗ. Vui lòng thử lại.';
            return throwError(() => err);
          })
        )
      );

      // Update local state
      this.mapImageUrl = imageUrl;
      if (this.selectedLot) {
        this.selectedLot.map = imageUrl;
        if (dimensions) {
          this.selectedLot.mapWidth = dimensions.width;
          this.selectedLot.mapHeight = dimensions.height;
        }
      }
      
      // Reload parking lots to get updated data
      this.loadParkingLots();
      
      // Reload slots to draw on map
      if (this.selectedLotId) {
        this.loadSlotsForLot(this.selectedLotId);
      }
    } catch (err) {
      console.error('Error uploading map image:', err);
    } finally {
      this.uploadingMapImage = false;
    }
  }

  initMapCanvas(): void {
    if (!this.mapCanvasContainer || !this.mapImageUrl) {
      return;
    }

    this.destroyMapCanvas();

    const container = this.mapCanvasContainer.nativeElement;
    const width = container.offsetWidth || 800;
    const height = container.offsetHeight || 600;

    this.mapStage = new Konva.Stage({
      container: container,
      width: width,
      height: height
    });

    this.mapImageLayer = new Konva.Layer();
    this.mapStage.add(this.mapImageLayer);

    this.mapSlotsLayer = new Konva.Layer();
    this.mapStage.add(this.mapSlotsLayer);

    this.loadMapImageToCanvas();
    
    // Add zoom and pan functionality
    this.mapStage.on('wheel', (e) => {
      e.evt.preventDefault();
      const oldScale = this.mapStage!.scaleX();
      const pointer = this.mapStage!.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - this.mapStage!.x()) / oldScale,
        y: (pointer.y - this.mapStage!.y()) / oldScale
      };

      const newScale = e.evt.deltaY > 0 ? oldScale * 0.9 : oldScale * 1.1;
      const clampedScale = Math.max(0.5, Math.min(3, newScale));
      this.mapZoomLevel = clampedScale;

      this.mapStage!.scale({ x: clampedScale, y: clampedScale });

      const newPos = {
        x: pointer.x - mousePointTo.x * clampedScale,
        y: pointer.y - mousePointTo.y * clampedScale
      };
      this.mapStage!.position(newPos);
      this.mapStagePosition = newPos;
    });

    // Pan functionality
    let isDragging = false;
    let lastPointerPosition: { x: number; y: number } | null = null;

    this.mapStage.on('mousedown', () => {
      isDragging = true;
      lastPointerPosition = this.mapStage!.getPointerPosition();
    });

    this.mapStage.on('mousemove', () => {
      if (!isDragging || !lastPointerPosition) return;
      const pointer = this.mapStage!.getPointerPosition();
      if (!pointer) return;

      const dx = pointer.x - lastPointerPosition.x;
      const dy = pointer.y - lastPointerPosition.y;

      const newPos = {
        x: this.mapStage!.x() + dx,
        y: this.mapStage!.y() + dy
      };
      this.mapStage!.position(newPos);
      this.mapStagePosition = newPos;
      lastPointerPosition = pointer;
    });

    this.mapStage.on('mouseup', () => {
      isDragging = false;
      lastPointerPosition = null;
    });
  }

  loadMapImageToCanvas(): void {
    if (!this.mapStage || !this.mapImageLayer || !this.mapImageUrl) {
      return;
    }

    const imageObj = new Image();
    imageObj.onload = () => {
      const stageWidth = this.mapStage!.width();
      const stageHeight = this.mapStage!.height();
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

      this.mapImageLayer!.destroyChildren();
      this.mapImageLayer!.add(konvaImage);
      this.mapImageLayer!.draw();

      // Draw slots after image is loaded
      if (this.selectedLotId) {
        this.api.getParkingSlots({ parkingLotId: this.selectedLotId }).subscribe({
          next: (slots) => {
            this.drawSlotsOnMap(slots);
          }
        });
      }
    };
    imageObj.src = this.mapImageUrl;
  }

  drawSlotsOnMap(slots: ParkingSlot[]): void {
    if (!this.mapStage || !this.mapSlotsLayer || !this.mapImageLayer || !this.selectedLot) {
      return;
    }

    // Clear existing slots
    this.mapSlotsLayer.destroyChildren();

    // Get the image bounds to calculate scale
    const imageNode = this.mapImageLayer.children[0] as Konva.Image;
    if (!imageNode) return;

    const imageX = imageNode.x();
    const imageY = imageNode.y();
    const canvasImageWidth = imageNode.width();
    const canvasImageHeight = imageNode.height();

    // Lấy kích thước ảnh gốc từ parking lot hoặc từ ảnh
    const imageSource = imageNode.image();
    let originalWidth = this.selectedLot.mapWidth || canvasImageWidth;
    let originalHeight = this.selectedLot.mapHeight || canvasImageHeight;
    
    // Nếu không có trong parking lot, lấy từ image element
    if (!this.selectedLot.mapWidth && imageSource instanceof HTMLImageElement) {
      originalWidth = imageSource.naturalWidth || canvasImageWidth;
      originalHeight = imageSource.naturalHeight || canvasImageHeight;
    }

    // Tính scale từ ảnh gốc về canvas hiện tại
    const scaleX = canvasImageWidth / originalWidth;
    const scaleY = canvasImageHeight / originalHeight;

    slots.forEach((slot) => {
      if (!slot.coordinates || slot.coordinates.length === 0) return;

      // Get the first polygon (assuming coordinates format: [[[x1,y1], [x2,y2], ...]]])
      const polygon = slot.coordinates[0];
      if (!polygon || polygon.length < 3) return;

      // Convert coordinates from percentage to pixel based on current image size
      const points: number[] = [];
      polygon.forEach((point) => {
        if (Array.isArray(point) && point.length >= 2) {
          // Coordinates are stored as percentage (0-100)
          const percentX = point[0];
          const percentY = point[1];
          
          // Convert percentage to pixel on original image
          const pixelX = (percentX / 100) * originalWidth;
          const pixelY = (percentY / 100) * originalHeight;
          
          // Scale to current canvas size and add image offset
          const canvasX = pixelX * scaleX + imageX;
          const canvasY = pixelY * scaleY + imageY;
          
          points.push(canvasX, canvasY);
        }
      });

      if (points.length < 6) return; // Need at least 3 points (x,y pairs)

      // Determine color based on status
      let fillColor = 'rgba(34, 197, 94, 0.3)'; // Green for available
      let strokeColor = '#22c55e';
      
      if (slot.status === 'occupied') {
        fillColor = 'rgba(239, 68, 68, 0.3)'; // Red for occupied
        strokeColor = '#ef4444';
      } else if (slot.status === 'out_of_service') {
        fillColor = 'rgba(234, 179, 8, 0.3)'; // Yellow for out of service
        strokeColor = '#eab308';
      }

      // Create polygon for slot
      const polygonShape = new Konva.Line({
        points: points,
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth: 2,
        closed: true,
        listening: false
      });

      // Add slot code label
      const centerX = points.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) / (points.length / 2);
      const centerY = points.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0) / (points.length / 2);

      const label = new Konva.Text({
        x: centerX - 20,
        y: centerY - 10,
        text: slot.slotCode,
        fontSize: 14,
        fontFamily: 'Arial',
        fill: '#111827',
        fontWeight: 'bold',
        padding: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        listening: false
      });

      if (this.mapSlotsLayer) {
        this.mapSlotsLayer.add(polygonShape);
        this.mapSlotsLayer.add(label);
      }
    });

    if (this.mapSlotsLayer) {
      this.mapSlotsLayer.draw();
    }
  }

  mapZoomIn(): void {
    if (!this.mapStage) return;
    const oldScale = this.mapStage.scaleX();
    const newScale = Math.min(3, oldScale * 1.2);
    this.mapZoomLevel = newScale;
    this.mapStage.scale({ x: newScale, y: newScale });
    this.mapSlotsLayer?.draw();
  }

  mapZoomOut(): void {
    if (!this.mapStage) return;
    const oldScale = this.mapStage.scaleX();
    const newScale = Math.max(0.5, oldScale / 1.2);
    this.mapZoomLevel = newScale;
    this.mapStage.scale({ x: newScale, y: newScale });
    this.mapSlotsLayer?.draw();
  }

  mapResetZoom(): void {
    if (!this.mapStage) return;
    this.mapZoomLevel = 1;
    this.mapStage.scale({ x: 1, y: 1 });
    this.mapStagePosition = { x: 0, y: 0 };
    this.mapStage.position({ x: 0, y: 0 });
    this.mapSlotsLayer?.draw();
  }

  destroyMapCanvas(): void {
    if (this.mapStage) {
      this.mapStage.destroy();
      this.mapStage = null;
      this.mapImageLayer = null;
      this.mapSlotsLayer = null;
    }
  }
}
