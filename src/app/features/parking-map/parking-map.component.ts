import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, forkJoin, firstValueFrom } from 'rxjs';
import Konva from 'konva';
import { ApiClientService } from '../../core/services/api-client.service';
import { ParkingSession, ParkingSlot, ParkingSlotStatus, ParkingLot, Vehicle } from '../../core/models/api.models';

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
  imageUrl: string;
  status: 'active' | 'offline';
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

  readonly cameras: CameraFeed[] = [
    {
      id: 1,
      name: 'Tổng quan bãi xe',
      location: 'Khu vực trung tâm',
      imageUrl: 'https://images.unsplash.com/photo-1502877828070-33b167ad6860?auto=format&fit=crop&w=1200&q=80',
      status: 'active'
    },
    {
      id: 2,
      name: 'Lối vào chính',
      location: 'Cổng A',
      imageUrl: 'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=1200&q=80',
      status: 'active'
    }
  ];

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
  }

  ngAfterViewInit(): void {
    // Canvas sẽ được khởi tạo khi mở modal
  }

  ngOnDestroy(): void {
    this.destroyCanvas();
  }

  selectLot(lot: ParkingLot): void {
    this.selectedLotId = lot.id;
    this.selectedLot = lot;
    this.selectedZone = String(lot.id);
    this.loadSlotsForLot(lot.id);
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
  }

  closeCameraModal(): void {
    this.selectedCameraId = null;
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
