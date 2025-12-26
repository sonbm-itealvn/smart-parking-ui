# Camera API Documentation

## Base URL
```
/api/cameras
```

## Authentication
Tất cả các endpoint đều yêu cầu Bearer Token trong header:
```
Authorization: Bearer <token>
```

---

## 1. GET /api/cameras
**Lấy tất cả camera hoặc filter theo parkingLotId**

### Request
```http
GET /api/cameras?parkingLotId=1
Authorization: Bearer <token>
```

### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| parkingLotId | integer | No | Filter theo ID bãi đỗ xe |

### Response 200
```json
[
  {
    "id": 1,
    "name": "Camera cổng vào",
    "streamUrl": "http://camera-ip:8080/stream",
    "cameraType": "http",
    "status": "active",
    "parkingLotId": 1,
    "parkingLot": {
      "id": 1,
      "name": "Bãi đỗ xe A"
    },
    "description": "Camera tại cổng vào chính",
    "location": "Cổng vào",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

### Response 500
```json
{
  "error": "Error message"
}
```

---

## 2. GET /api/cameras/:id
**Lấy thông tin camera theo ID**

### Request
```http
GET /api/cameras/1
Authorization: Bearer <token>
```

### Path Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | integer | Yes | ID của camera |

### Response 200
```json
{
  "id": 1,
  "name": "Camera cổng vào",
  "streamUrl": "http://camera-ip:8080/stream",
  "cameraType": "http",
  "status": "active",
  "parkingLotId": 1,
  "parkingLot": {
    "id": 1,
    "name": "Bãi đỗ xe A"
  },
  "description": "Camera tại cổng vào chính",
  "location": "Cổng vào",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### Response 400
```json
{
  "error": "Invalid camera ID"
}
```

### Response 404
```json
{
  "error": "Camera not found"
}
```

---

## 3. GET /api/cameras/:id/stream
**Lấy stream URL của camera và hướng dẫn sử dụng**

### Request
```http
GET /api/cameras/1/stream
Authorization: Bearer <token>
```

### Path Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | integer | Yes | ID của camera |

### Response 200
```json
{
  "cameraId": 1,
  "cameraName": "Camera cổng vào",
  "streamUrl": "http://camera-ip:8080/stream",
  "cameraType": "http",
  "parkingLotId": 1,
  "parkingLotName": "Bãi đỗ xe A",
  "usage": {
    "fastapiEndpoints": {
      "recommendParkingSpace": {
        "method": "POST",
        "url": "/api/parking-space/recommend",
        "note": "Upload video từ stream này hoặc sử dụng streamUrl trực tiếp nếu FastAPI hỗ trợ"
      },
      "recommendParkingSpaceVideo": {
        "method": "POST",
        "url": "/api/parking-space/recommend-video",
        "note": "Upload video từ stream này"
      },
      "detectLicensePlate": {
        "method": "POST",
        "url": "/api/license-plate/detect",
        "note": "Upload frame/image từ stream này"
      }
    }
  }
}
```

### Response 400
```json
{
  "error": "Camera is not active (status: inactive)"
}
```

### Response 404
```json
{
  "error": "Camera not found"
}
```

---

## 4. POST /api/cameras
**Tạo camera mới (Admin only)**

### Request
```http
POST /api/cameras
Authorization: Bearer <token>
Content-Type: application/json
```

### Request Body
```json
{
  "name": "Camera cổng vào",
  "streamUrl": "http://camera-ip:8080/stream",
  "cameraType": "http",
  "status": "active",
  "parkingLotId": 1,
  "description": "Camera tại cổng vào chính",
  "location": "Cổng vào"
}
```

### Request Body Schema
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Tên camera |
| streamUrl | string | Yes | URL stream của camera (RTSP, HTTP, hoặc webcam) |
| cameraType | enum | No | Loại camera: "rtsp", "http", "webcam" (default: "rtsp") |
| status | enum | No | Trạng thái: "active", "inactive", "maintenance" (default: "active") |
| parkingLotId | integer | No | ID của bãi đỗ xe |
| description | string | No | Mô tả camera |
| location | string | No | Vị trí camera |

### Response 201
```json
{
  "id": 1,
  "name": "Camera cổng vào",
  "streamUrl": "http://camera-ip:8080/stream",
  "cameraType": "http",
  "status": "active",
  "parkingLotId": 1,
  "parkingLot": {
    "id": 1,
    "name": "Bãi đỗ xe A"
  },
  "description": "Camera tại cổng vào chính",
  "location": "Cổng vào",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### Response 400
```json
{
  "error": "Validation error message"
}
```

---

## 5. PUT /api/cameras/:id
**Cập nhật camera (Admin only)**

### Request
```http
PUT /api/cameras/1
Authorization: Bearer <token>
Content-Type: application/json
```

### Path Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | integer | Yes | ID của camera |

### Request Body
```json
{
  "name": "Camera cổng vào (Updated)",
  "status": "inactive",
  "description": "Camera đã được cập nhật"
}
```

### Response 200
```json
{
  "id": 1,
  "name": "Camera cổng vào (Updated)",
  "streamUrl": "http://camera-ip:8080/stream",
  "cameraType": "http",
  "status": "inactive",
  "parkingLotId": 1,
  "parkingLot": {
    "id": 1,
    "name": "Bãi đỗ xe A"
  },
  "description": "Camera đã được cập nhật",
  "location": "Cổng vào",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T12:00:00.000Z"
}
```

### Response 400
```json
{
  "error": "Invalid camera ID"
}
```

### Response 404
```json
{
  "error": "Camera not found"
}
```

---

## 6. DELETE /api/cameras/:id
**Xóa camera (Admin only)**

### Request
```http
DELETE /api/cameras/1
Authorization: Bearer <token>
```

### Path Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | integer | Yes | ID của camera |

### Response 204
```
No Content
```

### Response 400
```json
{
  "error": "Invalid camera ID"
}
```

### Response 404
```json
{
  "error": "Camera not found"
}
```

---

## 7. POST /api/cameras/:id/detect-license-plate
**Lấy frame từ camera stream và detect biển số xe**

### Request
```http
POST /api/cameras/1/detect-license-plate
Authorization: Bearer <token>
```

### Path Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | integer | Yes | ID của camera |

### Response 200
**Content-Type: image/png**

**Headers:**
- `X-License-Plate: "30A-12345"` (nếu detect được)

**Body:** PNG image (binary) với biển số được annotate

### Response 400
```json
{
  "error": "Camera is not active (status: inactive)"
}
```

hoặc

```json
{
  "error": "Camera type rtsp requires HTTP snapshot URL. Please use HTTP camera or provide snapshot URL."
}
```

### Response 404
```json
{
  "error": "Camera not found"
}
```

### Response 500
```json
{
  "error": "Failed to fetch frame from camera: <error message>"
}
```

### Example Usage (JavaScript)
```javascript
const response = await fetch('/api/cameras/1/detect-license-plate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const licensePlate = response.headers.get('X-License-Plate');
const imageBlob = await response.blob();
const imageUrl = URL.createObjectURL(imageBlob);

console.log('Biển số:', licensePlate);
// Hiển thị image
document.getElementById('image').src = imageUrl;
```

---

## 8. POST /api/cameras/:id/detect-parking-space
**Lấy video từ camera stream và detect vị trí đỗ xe trống**

### Request
```http
POST /api/cameras/1/detect-parking-space
Authorization: Bearer <token>
Content-Type: application/json
```

### Path Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | integer | Yes | ID của camera |

### Request Body (Optional)
```json
{
  "parkingLotId": 1
}
```

### Request Body Schema
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| parkingLotId | integer | No | ID của bãi đỗ xe (nếu camera chưa có parkingLotId) |

### Response 200
**Content-Type: image/png**

**Body:** PNG image (binary) với slot trống được đánh dấu

**Lưu ý:** Hệ thống tự động:
- Detect xe từ video
- Lấy tọa độ polygon của xe từ FastAPI
- So khớp với tọa độ polygon của các slot trong DB
- Nếu intersection area > 50% diện tích slot → đánh dấu slot là OCCUPIED

### Response 400
```json
{
  "error": "parkingLotId is required. Either set it in camera or provide in request body."
}
```

### Response 404
```json
{
  "error": "Camera not found"
}
```

### Response 500
```json
{
  "error": "Failed to fetch video from camera: <error message>"
}
```

### Example Usage (JavaScript)
```javascript
const response = await fetch('/api/cameras/1/detect-parking-space', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    parkingLotId: 1
  })
});

const imageBlob = await response.blob();
const imageUrl = URL.createObjectURL(imageBlob);

// Hiển thị image với slot trống được đánh dấu
document.getElementById('image').src = imageUrl;
```

---

## 9. POST /api/cameras/:id/process-vehicle ⭐
**Detect biển số từ camera và tự động quyết định RA/VÀO**

### Mô tả
Endpoint này tự động:
1. Lấy frame từ camera stream
2. Gọi FastAPI để detect biển số xe
3. Backend tự động kiểm tra active session:
   - **Nếu KHÔNG có bản ghi IN (active session)** → tự động tạo bản ghi **VÀO**
   - **Nếu ĐÃ CÓ bản ghi IN (active session)** → tự động đánh dấu **RA** + tính tiền
4. Tạo/cập nhật parking session và lưu vào DB
5. Cập nhật slot status
6. Gửi notification cho user (nếu có)

### Request
```http
POST /api/cameras/1/process-vehicle
Authorization: Bearer <token>
Content-Type: application/json
```

### Path Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | integer | Yes | ID của camera |

### Request Body (Optional)
```json
{
  "parkingLotId": 1,
  "slotId": 5
}
```

### Request Body Schema
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| parkingLotId | integer | No | ID của bãi đỗ xe (nếu camera chưa có parkingLotId) |
| slotId | integer | No | ID của slot (nếu FastAPI detect được) |

### Response 200 - Xe VÀO

```json
{
  "message": "Vehicle entry processed successfully",
  "isRegistered": true,
  "vehicle": {
    "id": 1,
    "licensePlate": "30A-12345",
    "userId": 1
  },
  "parkingSession": {
    "id": 1,
    "vehicleId": 1,
    "licensePlate": "30A-12345",
    "parkingSlotId": 5,
    "entryTime": "2024-01-01T10:00:00.000Z",
    "exitTime": null,
    "fee": null,
    "status": "active"
  },
  "slot": {
    "id": 5,
    "slotCode": "A1"
  },
  "notificationSent": true
}
```

**Hoặc xe vãng lai:**
```json
{
  "message": "Vehicle entry processed - Guest vehicle (pay by hour)",
  "isRegistered": false,
  "licensePlate": "30A-99999",
  "parkingSession": {
    "id": 2,
    "vehicleId": null,
    "licensePlate": "30A-99999",
    "parkingSlotId": 6,
    "entryTime": "2024-01-01T10:00:00.000Z",
    "exitTime": null,
    "fee": null,
    "status": "active"
  },
  "slot": {
    "id": 6,
    "slotCode": "A2"
  },
  "note": "This is a guest vehicle, will be charged by hour when exiting"
}
```

### Response 200 - Xe RA

```json
{
  "message": "Vehicle exit processed successfully",
  "isRegistered": true,
  "licensePlate": "30A-12345",
  "vehicle": {
    "id": 1,
    "licensePlate": "30A-12345",
    "userId": 1
  },
  "parkingSession": {
    "id": 1,
    "vehicleId": 1,
    "licensePlate": "30A-12345",
    "parkingSlotId": 5,
    "entryTime": "2024-01-01T10:00:00.000Z",
    "exitTime": "2024-01-01T12:00:00.000Z",
    "fee": 22000,
    "status": "completed"
  },
  "feeDetails": {
    "entryTime": "2024-01-01T10:00:00.000Z",
    "exitTime": "2024-01-01T12:00:00.000Z",
    "durationHours": 2,
    "pricePerHour": 10000,
    "firstHourFee": 10000,
    "increaseRate": "10%",
    "feeBreakdown": [
      { "hour": 1, "fee": 10000 },
      { "hour": 2, "fee": 11000 }
    ],
    "totalFee": 21000
  },
  "notificationSent": true
}
```

### Response 400
```json
{
  "error": "Camera is not active (status: inactive)"
}
```

hoặc

```json
{
  "error": "Could not detect license plate from camera frame"
}
```

hoặc

```json
{
  "error": "parkingLotId is required. Either set it in camera or provide in request body."
}
```

### Response 404
```json
{
  "error": "Camera not found"
}
```

hoặc (khi VÀO)

```json
{
  "error": "No available parking slot found in parking lot 1"
}
```

hoặc (khi RA)

```json
{
  "error": "No active parking session found for this vehicle"
}
```

### Response 500
```json
{
  "error": "Failed to fetch frame from camera: <error message>"
}
```

### Example Usage (JavaScript)
```javascript
// Gọi endpoint - KHÔNG CẦN gửi flag
const response = await fetch('/api/cameras/1/process-vehicle', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    parkingLotId: 1  // Optional
  })
});

const result = await response.json();

// Kiểm tra là VÀO hay RA
if (result.message.includes('entry')) {
  console.log('✅ Xe đã VÀO:', result.vehicle?.licensePlate);
  console.log('Vị trí:', result.slot?.slotCode);
} else if (result.message.includes('exit')) {
  console.log('✅ Xe đã RA:', result.licensePlate);
  console.log('Phí:', result.feeDetails?.totalFee);
}
```

### Example Usage (React)
```tsx
const [loading, setLoading] = useState(false);

const handleProcess = async () => {
  setLoading(true);
  try {
    const response = await fetch(`/api/cameras/${cameraId}/process-vehicle`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ parkingLotId: 1 })
    });
    
    const result = await response.json();
    
    if (result.message.includes('entry')) {
      alert(`Xe ${result.vehicle?.licensePlate} đã vào vị trí ${result.slot?.slotCode}`);
    } else {
      alert(`Xe ${result.licensePlate} đã ra. Phí: ${result.feeDetails?.totalFee} VNĐ`);
    }
  } catch (error) {
    alert('Lỗi: ' + error.message);
  } finally {
    setLoading(false);
  }
};

<button onClick={handleProcess} disabled={loading}>
  {loading ? 'Đang xử lý...' : 'Xử lý xe từ camera'}
</button>
```

---

## Error Codes Summary

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 201 | Created (POST /api/cameras) |
| 204 | No Content (DELETE /api/cameras/:id) |
| 400 | Bad Request - Invalid input, camera not active, etc. |
| 404 | Not Found - Camera not found, no available slot, etc. |
| 500 | Internal Server Error - Server error, FastAPI error, etc. |

---

## Camera Entity Schema

```typescript
{
  id: number;
  name: string;
  streamUrl: string;
  cameraType: "rtsp" | "http" | "webcam";
  status: "active" | "inactive" | "maintenance";
  parkingLotId: number | null;
  parkingLot: ParkingLot | null;
  description: string | null;
  location: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Notes

1. **Camera Types:**
   - `http`: Hỗ trợ tốt nhất cho detect (có thể fetch frame trực tiếp)
   - `rtsp`: Cần HTTP snapshot URL
   - `webcam`: Cần HTTP snapshot URL

2. **Auto VÀO/RA Logic:**
   - Endpoint `/process-vehicle` tự động quyết định VÀO/RA dựa trên active session
   - Không cần gửi `flag` từ FE
   - Xử lý cả xe đã đăng ký và xe vãng lai

3. **Xe vãng lai:**
   - `isRegistered: false`
   - `vehicleId: null` trong parking session
   - Vẫn tính phí khi ra (theo giờ)

4. **Authentication:**
   - Tất cả endpoint yêu cầu Bearer Token
   - CRUD operations (POST, PUT, DELETE) yêu cầu Admin role

