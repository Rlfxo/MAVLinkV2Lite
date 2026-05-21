# MAVLink V2 Lite Monitor

DC Charger ↔ Host(App Tester / PC Android / PC Windows / JIG) UART 통신을 위한 **MAVLink V2 Lite** 기반 Electron 데스크톱 모니터링·제어 애플리케이션. 이 앱은 SYSID **201 (App Tester)** 로 송신한다.

- **프로토콜**: MAVLink V2 Lite (자체 dialect — STX `0xFC`, 7-byte header, CRC-16/MODBUS over payload). 사양은 [`PROTOCOL.md`](./PROTOCOL.md) 참조
- **통신**: UART Serial (115200 baud, 8N1)
- **스택**: Electron + React + TypeScript + Vite, 테스트는 Vitest

---

## 현재 상태 (2026-05-21, spec v2.2)

- ✅ V2 Lite dialect 적용 (STX 0xFC, 헤더 8B, INCOMPAT/COMPAT 제거)
- ✅ CRC-16/MODBUS over payload only (per-msg seed 폐지)
- ✅ SYSID: Charger=1, PC Android=100, PC Windows=101, JIG=200, **AppTester=201** (이 앱), Broadcast=255
- ✅ COMPID: ALL=0, DURA=1, MOOEV=2, Parky=3 (모델 식별)
- ✅ **fixed_t** (int32 value + int8 exp, 5B) — SENSOR_DATA / METER_DATA 모든 물리량
- ✅ CHARGER_STATUS 슬림화 16B→10B (state/relay/uptime/storage_soc만)
- ✅ **METER_DATA (10003, 50B, 2Hz) 신규** — SPM90 meter1/meter2 V/I/P/E + 합산 total
- ✅ SENSOR_DATA 재설계 (53B, all fixed_t, meter 필드 제거)
- ✅ **uuid (u32)** — CHARGER_COMMAND / COMMAND_ACK / CONFIG_REQUEST / CONFIG_RESPONSE 모두 매 요청 단조 증가 카운터로 PC가 부여, FW가 echo. ACK 분실 시 재전송 안전
- ✅ MAV_STATE: 6=FW_OTA, 7=PLC_OTA 추가
- ✅ EVCC(20xxx) 폐지
- ✅ 모델 기반 탭 UI: **DURA 활성**, MOOEV/Parky 탭은 비활성(placeholder)
- ✅ MeterDataPanel 신규 UI 추가
- ✅ 141개 protocol 테스트 통과 (`vitest run`)

### 구현된 메시지

| MSG ID | Name | Direction | Rate | Payload | Status |
|--------|------|-----------|------|---------|--------|
| 0     | HEARTBEAT       | Bidirectional | 1000 ms | 2 B  | ✅ |
| 10001 | CHARGER_STATUS  | Board → Host  | 100 ms  | 10 B | ✅ |
| 10002 | SENSOR_DATA     | Board → Host  | 500 ms  | 53 B | ✅ |
| 10003 | METER_DATA      | Board → Host  | 500 ms  | 50 B | ✅ |
| 10100 | CHARGER_COMMAND | Host → Board  | On cmd  | 7 B  | ✅ |
| 10102 | COMMAND_ACK     | Board → Host  | On ACK  | 5 B  | ✅ |
| 10200 | CONFIG_REQUEST  | Host → Board  | On req  | 4 B  | ✅ |
| 10201 | CONFIG_RESPONSE | Board → Host  | On req  | 40 B | ✅ |
| 10101 | MANUAL_CONTROL  | Host → Board  | On cmd  | 6 B  | 🟡 defined, UI pending |

---

## 빠른 시작

### 필수 요구사항
- Node.js 18+
- USB-UART 어댑터 (실제 하드웨어 테스트용)
- DC Charger 보드 (UART5: TX=PC12, RX=PD2)

### 설치
```bash
npm install
```

### Electron GUI
```bash
npm run electron:dev      # 개발 모드 (HMR)
npm run build             # 프로덕션 빌드
```

### CLI Heartbeat 테스트
```bash
npm run test:heartbeat                       # 자동 포트 감지
npm run test:heartbeat /dev/ttyUSB0          # Linux
npm run test:heartbeat /dev/tty.usbserial-*  # macOS
npm run test:heartbeat COM3                  # Windows
```

### 프로토콜 단위 테스트
```bash
npm test                            # 전체 (126 tests)
npm test -- crc16.test.ts           # 특정 파일
npm run test:ui                     # UI 모드
```

---

## 하드웨어 연결

```
DC Charger (UART5)          USB-UART Adapter          Host PC
 TX (PC12) ──────────────── RX                  Serial Port
 RX (PD2)  ──────────────── TX                  (/dev/ttyUSB0, COM3, ...)
 GND       ──────────────── GND
```

지원 USB-UART 칩: FTDI FT232, CP2102, CH340.

---

## 프로젝트 구조

```
MAVLinkV2Lite/
├── PROTOCOL.md                      # ⭐ V2 Lite wire format 사양 (authoritative)
├── README.md                        # 이 문서
├── TODO.md                          # 후속 작업 목록
│
├── docs/
│   ├── DEBUGGING.md                 # 트러블슈팅 가이드
│   └── MVLink2LiteAPP.md            # 레거시 사양 (참고용)
│
├── electron/                        # Main process (Node.js)
│   ├── main.ts                      # Electron entry
│   ├── preload.ts                   # contextBridge API
│   ├── protocol/                    # Wire format
│   │   ├── constants.ts             # STX/SYSID/COMPID/MSG_ID/CRC extras
│   │   ├── types.ts                 # 메시지/payload 타입
│   │   ├── crc16.ts                 # CRC-16-CCITT
│   │   ├── parser.ts                # State-machine 파서
│   │   └── encoder.ts               # Frame 인코더
│   ├── serial/                      # Serial 통신
│   │   ├── SerialPortManager.ts
│   │   └── HeartbeatManager.ts      # TX 스케줄러 + RX dispatch
│   └── ipc/
│       └── heartbeatHandlers.ts     # Main ↔ Renderer IPC
│
├── src/                             # Renderer (React)
│   ├── App.tsx                      # 모델 탭 + 패널 레이아웃
│   ├── App.css
│   ├── context/
│   │   ├── AppContext.tsx
│   │   └── appReducer.ts            # detectedModel / activeModel 등
│   ├── hooks/                       # useHeartbeat, useChargerData, ...
│   ├── components/                  # ConnectionPanel, ChargerStatusPanel, ...
│   └── types/electron.d.ts
│
├── test/protocol/                   # Vitest (126 tests, 7 files)
└── scripts/test-heartbeat.ts        # CLI 검증 도구
```

### 데이터 흐름 (RX)
```
SerialPort 'data'
  → HeartbeatManager.setupDataHandler()
    → MAVLinkParser.parseBuffer()
    → switch(msgid) → emit 메시지별 이벤트
  → heartbeatHandlers.ts (webContents.send)
  → preload.ts (ipcRenderer.on)
  → React hooks → reducer → 컴포넌트 리렌더
```

### 데이터 흐름 (TX, on-demand)
```
React 버튼 클릭
  → window.electron.*.send()
  → ipcMain.handle
  → HeartbeatManager.send*()  (heartbeat와 txSeq 공유)
  → serialManager.write()
```

---

## 모델 탭 UI

`useHeartbeat` 훅이 charger heartbeat의 COMPID(1/2/3)를 모델(DURA/MOOEV/Parky)로 매핑하여 `detectedModel` 상태에 반영하고, 헤더 우측 배지에 표시한다. 탭은 사용자가 선택한 `activeModel`로 별도 관리되며 — 현재는 **DURA만 활성**, MOOEV/Parky 탭은 disabled 상태로 후속 구현을 대기한다.

---

## 참고 문서

- **[PROTOCOL.md](./PROTOCOL.md)** — Wire format / 메시지 / CRC / 예제 (인증된 단일 출처)
- **[TODO.md](./TODO.md)** — 다음 작업
- **[docs/DEBUGGING.md](./docs/DEBUGGING.md)** — 통신 트러블슈팅
- **[docs/MVLink2LiteAPP.md](./docs/MVLink2LiteAPP.md)** — 레거시 사양 (배경 정보용)

---

## 라이센스

MIT License — Copyright (c) 2026 Gilbert
