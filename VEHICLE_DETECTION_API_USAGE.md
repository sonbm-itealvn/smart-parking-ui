# Hướng dẫn sử dụng API Vehicle Detection

## Endpoint

```
POST /api/vehicle-detection
```

**Lưu ý:** Endpoint này KHÔNG cần authentication (public endpoint), được dùng cho FastAPI webhook.

---

## Request Body

### Trường bắt buộc (Required)

| Trường | Kiểu | Mô tả | Ví dụ |
|--------|------|-------|-------|
| `licensePlate` | string | Biển số xe đã được nhận diện | `"30A-12345"` |
| `flag` | number | Trạng thái: `0` = Xe vào, `1` = Xe ra | `0` hoặc `1` |

### Trường tùy chọn (Optional)

| Trường | Kiểu | Mô tả | Ví dụ |
|--------|------|-------|-------|
| `slotId` | number | ID của slot (nếu FastAPI detect được) | `1` |
| `parkingLotId` | number | ID của bãi đỗ xe | `1` |
| `image` | string | Ảnh xe dưới dạng base64 (optional) | `"data:image/jpeg;base64,..."` |

---

## Ví dụ Request

### 1. Xe vào (flag = 0) - Xe đã đăng ký

```json
{
  "licensePlate": "30A-12345",
  "flag": 0,
  "parkingLotId": 1,
  "slotId": 5
}
```

### 2. Xe vào (flag = 0) - Xe vãng lai (không có trong DB)

```json
{
  "licensePlate": "51G-99999",
  "flag": 0,
  "parkingLotId": 1
}
```

**Lưu ý:** Xe vãng lai không cần `vehicleId`, hệ thống sẽ tự động tạo session với `vehicleId = null` và lưu `licensePlate`.

### 3. Xe ra (flag = 1)

```json
{
  "licensePlate": "30A-12345",
  "flag": 1
}
```

---

## Response

### Khi xe vào (flag = 0) - Xe đã đăng ký

**Status:** `200 OK`

```json
{
  "message": "Vehicle entry processed successfully",
  "isRegistered": true,
  "vehicle": {
    "id": 1,
    "licensePlate": "30A-12345",
    "userId": 2
  },
  "parkingSession": {
    "id": 10,
    "vehicleId": 1,
    "licensePlate": "30A-12345",
    "parkingSlotId": 5,
    "entryTime": "2025-12-25T10:30:00.000Z",
    "exitTime": null,
    "fee": null,
    "status": "active"
  },
  "slot": {
    "id": 5,
    "slotCode": "A-05"
  },
  "notificationSent": true
}
```

### Khi xe vào (flag = 0) - Xe vãng lai

**Status:** `200 OK`

```json
{
  "message": "Vehicle entry processed - Guest vehicle (pay by hour)",
  "isRegistered": false,
  "licensePlate": "51G-99999",
  "parkingSession": {
    "id": 11,
    "vehicleId": null,
    "licensePlate": "51G-99999",
    "parkingSlotId": 6,
    "entryTime": "2025-12-25T10:35:00.000Z",
    "exitTime": null,
    "fee": null,
    "status": "active"
  },
  "slot": {
    "id": 6,
    "slotCode": "A-06"
  },
  "note": "This is a guest vehicle, will be charged by hour when exiting"
}
```

### Khi xe ra (flag = 1)

**Status:** `200 OK`

```json
{
  "message": "Vehicle exit processed successfully",
  "isRegistered": true,
  "licensePlate": "30A-12345",
  "vehicle": {
    "id": 1,
    "licensePlate": "30A-12345",
    "userId": 2
  },
  "parkingSession": {
    "id": 10,
    "vehicleId": 1,
    "licensePlate": "30A-12345",
    "parkingSlotId": 5,
    "entryTime": "2025-12-25T10:30:00.000Z",
    "exitTime": "2025-12-25T13:45:00.000Z",
    "fee": 96300,
    "status": "completed"
  },
  "feeDetails": {
    "entryTime": "2025-12-25T10:30:00.000Z",
    "exitTime": "2025-12-25T13:45:00.000Z",
    "durationHours": 4,
    "pricePerHour": 30000,
    "firstHourFee": 30000,
    "increaseRate": "10%",
    "feeBreakdown": [
      { "hour": 1, "fee": 30000 },
      { "hour": 2, "fee": 33000 },
      { "hour": 3, "fee": 36300 },
      { "hour": 4, "fee": 39930 }
    ],
    "totalFee": 139230
  },
  "notificationSent": true
}
```

### Khi xe ra (flag = 1) - Xe vãng lai

**Status:** `200 OK`

```json
{
  "message": "Vehicle exit processed successfully",
  "isRegistered": false,
  "licensePlate": "51G-99999",
  "vehicle": null,
  "parkingSession": {
    "id": 11,
    "vehicleId": null,
    "licensePlate": "51G-99999",
    "parkingSlotId": 6,
    "entryTime": "2025-12-25T10:35:00.000Z",
    "exitTime": "2025-12-25T12:35:00.000Z",
    "fee": 63000,
    "status": "completed"
  },
  "feeDetails": {
    "entryTime": "2025-12-25T10:35:00.000Z",
    "exitTime": "2025-12-25T12:35:00.000Z",
    "durationHours": 2,
    "pricePerHour": 30000,
    "firstHourFee": 30000,
    "increaseRate": "10%",
    "feeBreakdown": [
      { "hour": 1, "fee": 30000 },
      { "hour": 2, "fee": 33000 }
    ],
    "totalFee": 63000
  },
  "notificationSent": false
}
```

---

## Error Responses

### 400 Bad Request - Thiếu trường bắt buộc

```json
{
  "error": "License plate is required"
}
```

hoặc

```json
{
  "error": "Flag must be 0 (entry) or 1 (exit)"
}
```

### 400 Bad Request - Xe đã có session active

```json
{
  "error": "Vehicle already has an active parking session",
  "sessionId": 10
}
```

### 404 Not Found - Không tìm thấy slot trống

```json
{
  "error": "No available parking slot found"
}
```

### 404 Not Found - Không tìm thấy session khi xe ra

```json
{
  "error": "No active parking session found for this vehicle",
  "licensePlate": "30A-12345"
}
```

### 500 Internal Server Error - Lỗi database schema

```json
{
  "error": "Database schema needs to be updated. Please run the migration script: fix_parking_session_schema.sql",
  "details": "Field 'user_id' doesn't have a default value"
}
```

---

## Cách sử dụng từ Frontend

### JavaScript/TypeScript (Fetch API)

```javascript
// Xe vào
const vehicleEntry = async (licensePlate, parkingLotId, slotId) => {
  try {
    const response = await fetch('http://localhost:3000/api/vehicle-detection', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        licensePlate: licensePlate,
        flag: 0, // 0 = xe vào
        parkingLotId: parkingLotId,
        slotId: slotId // optional
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('Xe vào thành công:', data);
      if (data.isRegistered) {
        console.log('Xe đã đăng ký');
      } else {
        console.log('Xe vãng lai');
      }
    } else {
      console.error('Lỗi:', data.error);
    }
  } catch (error) {
    console.error('Lỗi kết nối:', error);
  }
};

// Xe ra
const vehicleExit = async (licensePlate) => {
  try {
    const response = await fetch('http://localhost:3000/api/vehicle-detection', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        licensePlate: licensePlate,
        flag: 1 // 1 = xe ra
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('Xe ra thành công:', data);
      console.log('Tổng phí:', data.feeDetails.totalFee);
    } else {
      console.error('Lỗi:', data.error);
    }
  } catch (error) {
    console.error('Lỗi kết nối:', error);
  }
};
```

### Axios

```javascript
import axios from 'axios';

// Xe vào
const vehicleEntry = async (licensePlate, parkingLotId, slotId) => {
  try {
    const response = await axios.post('http://localhost:3000/api/vehicle-detection', {
      licensePlate: licensePlate,
      flag: 0,
      parkingLotId: parkingLotId,
      slotId: slotId
    });
    
    console.log('Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
};

// Xe ra
const vehicleExit = async (licensePlate) => {
  try {
    const response = await axios.post('http://localhost:3000/api/vehicle-detection', {
      licensePlate: licensePlate,
      flag: 1
    });
    
    console.log('Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
};
```

---

## Lưu ý quan trọng

1. **Xe vãng lai:**
   - Không cần có trong bảng `vehicles`
   - Hệ thống tự động tạo session với `vehicleId = null`
   - Vẫn tính tiền theo giờ khi ra
   - Không gửi notification (vì không có userId)

2. **Xe đã đăng ký:**
   - Phải có trong bảng `vehicles`
   - Có `vehicleId` trong session
   - Gửi notification cho user khi vào/ra

3. **Tính tiền:**
   - Dựa trên `pricePerHour` của `parkingLot`
   - Giờ đầu: `pricePerHour`
   - Giờ tiếp theo: tăng 10% mỗi giờ

4. **Database Schema:**
   - Đảm bảo đã chạy migration script `fix_parking_session_schema.sql`
   - Cột `vehicle_id` phải cho phép NULL
   - Cột `license_plate` phải tồn tại

---

## Test với cURL

```bash
# Xe vào - Xe đã đăng ký
curl -X POST http://localhost:3000/api/vehicle-detection \
  -H "Content-Type: application/json" \
  -d '{
    "licensePlate": "30A-12345",
    "flag": 0,
    "parkingLotId": 1,
    "slotId": 5
  }'

# Xe vào - Xe vãng lai
curl -X POST http://localhost:3000/api/vehicle-detection \
  -H "Content-Type: application/json" \
  -d '{
    "licensePlate": "51G-99999",
    "flag": 0,
    "parkingLotId": 1
  }'

# Xe ra
curl -X POST http://localhost:3000/api/vehicle-detection \
  -H "Content-Type: application/json" \
  -d '{
    "licensePlate": "30A-12345",
    "flag": 1
  }'
```

