# Smart Parking API – Danh sách endpoint và trường dữ liệu

- Base URL mặc định: `http://localhost:3000`
- Mọi route (trừ `/api/auth/*`, `/api/vehicle-detection`, `/health`) yêu cầu header `Authorization: Bearer <accessToken>`.
- OpenAPI có sẵn tại `http://localhost:3000/api-docs` và `http://localhost:3000/api-docs.json`.

## Schema chung

- `User`: `id`, `fullName`, `email`, `roleId`, `createdAt`
- `Role`: `id`, `name`
- `ParkingLot`: `id`, `name`, `location`, `totalSlots`, `pricePerHour`, `createdAt`
- `ParkingSlot`: `id`, `parkingLotId`, `slotCode`, `status` (`available|occupied|out_of_service`)
- `Vehicle`: `id`, `userId`, `licensePlate`, `vehicleType` (`car|motorcycle|truck`), `createdAt`
- `Notification`: `id`, `userId`, `message`, `isRead`, `createdAt`
- `ParkingSession`: `id`, `vehicleId`, `parkingSlotId`, `entryTime`, `exitTime?`, `fee?`, `status` (`active|completed|cancelled`)
- `Payment`: `id`, `parkingSessionId`, `amount`, `paymentMethod` (`credit_card|cash|mobile_pay`), `paymentTime`, `status` (`successful|failed|pending`)

## Authentication

- `POST /api/auth/register`
  - Body: `fullName`, `email`, `password` (>=6 ký tự), `roleId?` (mặc định 2).
  - Res: `message`, `user`, `accessToken`, `refreshToken`.
- `POST /api/auth/login`
  - Body: `email`, `password`.
  - Res: như register.
- `POST /api/auth/refresh-token`
  - Body: `refreshToken`.
  - Res: `message`, `accessToken`, `refreshToken`.
- `POST /api/auth/logout`
  - Body: `refreshToken`.
  - Res: `message`.
- `GET /api/auth/profile`
  - Res: `User`.

## Users (Bearer)

- `POST /api/users` (Admin) — body `RegisterRequest`.
- `GET /api/users` (Admin) — list `User`.
- `GET /api/users/{id}` — params: `id`; res: `User`.
- `PUT /api/users/{id}` — params: `id`; body: `fullName?`, `email?`, `roleId?`.
- `DELETE /api/users/{id}` (Admin) — params: `id`.

## Roles (Bearer)

- `POST /api/roles` (Admin) — body: `name`.
- `GET /api/roles` — list `Role`.
- `GET /api/roles/{id}` — params: `id`.
- `PUT /api/roles/{id}` (Admin) — params: `id`; body: `name?`.
- `DELETE /api/roles/{id}` (Admin) — params: `id`.

## Parking Lots (Bearer)

- `POST /api/parking-lots` (Admin) — body: `ParkingLot`.
- `GET /api/parking-lots` — list.
- `GET /api/parking-lots/{id}` — params: `id`.
- `PUT /api/parking-lots/{id}` (Admin) — params: `id`; body: `ParkingLot`.
- `DELETE /api/parking-lots/{id}` (Admin) — params: `id`.

## Parking Slots (Bearer)

- `POST /api/parking-slots` (Admin) — body: `ParkingSlot`.
- `GET /api/parking-slots` — list.
- `GET /api/parking-slots/{id}` — params: `id`.
- `PUT /api/parking-slots/{id}` (Admin) — params: `id`; body: `ParkingSlot`.
- `DELETE /api/parking-slots/{id}` (Admin) — params: `id`.

## Vehicles (Bearer)

- `POST /api/vehicles` — body: `Vehicle`.
- `GET /api/vehicles` — list.
- `GET /api/vehicles/{id}` — params: `id`.
- `PUT /api/vehicles/{id}` (Admin) — params: `id`; body: `Vehicle`.
- `DELETE /api/vehicles/{id}` (Admin) — params: `id`.

## Notifications (Bearer)

- `POST /api/notifications` (Admin) — body: `Notification`.
- `GET /api/notifications` — list.
- `GET /api/notifications/{id}` — params: `id`.
- `PUT /api/notifications/{id}` (Admin) — params: `id`; body: `Notification`.
- `DELETE /api/notifications/{id}` (Admin) — params: `id`.

## Parking Sessions (Bearer)

- `POST /api/parking-sessions` (Admin) — body: `ParkingSession`.
- `GET /api/parking-sessions` — list.
- `GET /api/parking-sessions/{id}` — params: `id`.
- `PUT /api/parking-sessions/{id}` (Admin) — params: `id`; body: `ParkingSession`.
- `DELETE /api/parking-sessions/{id}` (Admin) — params: `id`.
- `POST /api/parking-sessions/{id}/exit`
  - Params: `id` (session).
  - Res: `message`, `parkingSession`, `feeDetails { entryTime, exitTime, durationHours, firstHourFee, increaseRate, feeBreakdown[], totalFee }`.

## Payments (Bearer)

- `POST /api/payments` — body: `Payment`.
- `GET /api/payments` — list.
- `GET /api/payments/{id}` — params: `id`.
- `PUT /api/payments/{id}` (Admin) — params: `id`; body: `Payment`.
- `DELETE /api/payments/{id}` (Admin) — params: `id`.

## Vehicle Detection Webhook (Public)

- `POST /api/vehicle-detection`
  - Body: `licensePlate` (string), `flag` (0 xe vào | 1 xe ra), `slotId?`, `parkingLotId?`, `image?` (base64).
  - Res: `message`, `isRegistered`, `vehicle`, `parkingSession`, `slot`.

## FastAPI integration (Bearer)

- `POST /api/parking-space/recommend`
  - Form-data: `file` (image/video, bắt buộc), `parkingLotId?`.
  - Res: PNG annotated (binary).
- `POST /api/parking-space/recommend-video`
  - Form-data: `file` (video), `parkingLotId?`.
  - Res: PNG annotated (binary).
- `POST /api/parking-space/annotate-video`
  - Form-data: `file` (video), `parkingLotId?`.
  - Res: MP4 annotated (binary).
- `POST /api/license-plate/detect`
  - Form-data: `file` (image).
  - Res: PNG annotated (binary); header `X-License-Plate` chứa biển số.
- `GET /api/license-plate/logs`
  - Res: danh sách `{ licensePlate, timestamp }`.

## Health

- `GET /health` (public) — res: `{ status: "OK", message: "Server is running" }`.


