# MAVLink V2 Lite Monitor

DC Charger와 PC 간 UART 통신을 위한 MAVLink V2 Lite 기반 모니터링 및 제어 애플리케이션

## 개요

- **프로토콜**: MAVLink V2 Lite (Custom Implementation)
- **통신**: UART Serial (115200 baud, 8N1)
- **기술 스택**: Electron + React + TypeScript
- **현재 Phase**: Phase 2 - 기본 통신 (HEARTBEAT 송수신)

## 현재 진행 상태

### ✅ 완료된 작업 (Day 1-5)

#### Day 1: 프로젝트 초기 설정
- [x] package.json, tsconfig.json, vite.config.ts, vitest.config.ts 설정
- [x] 폴더 구조 생성 (electron/, src/, test/)
- [x] .gitignore 및 문서화

#### Day 2-3: 프로토콜 레이어
- [x] **CRC-16-CCITT 구현 및 테스트** (21 tests passed)
- [x] **MAVLink 프로토콜 상수 및 타입 정의**
- [x] **MAVLink Parser 구현** (state machine, 24 tests passed)
- [x] **Message Encoder 구현** (HEARTBEAT, 17 tests passed)
- [x] **Python 참조 구현과 100% 호환 검증**

#### Day 4-5: Serial 통신 레이어 (CLI 기반)
- [x] **SerialPortManager 구현** (포트 연결, 데이터 송수신)
- [x] **HeartbeatManager 구현** (1Hz TX, RX 모니터링, timeout)
- [x] **CLI 테스트 스크립트** (`scripts/test-heartbeat.ts`)

### 📊 테스트 현황
```
✓ test/protocol/crc16.test.ts     (21 tests)
✓ test/protocol/encoder.test.ts   (17 tests)
✓ test/protocol/parser.test.ts    (24 tests)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total: 62 tests passed | 1 skipped
```

자세한 작업 목록은 [TODO.md](./TODO.md) 참조

## 기능 로드맵

### Phase 2 (진행 중)
- [ ] Serial port 자동 검색 및 연결
- [ ] HEARTBEAT 메시지 송수신 (1Hz)
- [ ] 연결 상태 모니터링 (3초 timeout)
- [ ] 패킷 통계 표시 (RX/TX count, CRC errors)

### Phase 3 (예정)
- [ ] CHARGER_STATUS 실시간 모니터링 (10Hz)
- [ ] SENSOR_DATA 표시 (2Hz)
- [ ] 실시간 그래프 (전압, 전류, 전력)

### Phase 4 (예정)
- [ ] CHARGER_COMMAND 전송 (충전 제어)
- [ ] RELAY_CONTROL (17개 릴레이 제어)
- [ ] CONFIG_REQUEST/RESPONSE

## 빠른 시작

### 필수 요구사항
- Node.js 18.x 이상
- npm 또는 yarn
- USB-UART 어댑터 (실제 하드웨어 테스트용)
- DC Charger 보드 (UART5: TX=PC12, RX=PD2)

### 설치

```bash
# 의존성 설치
npm install
```

### CLI로 보드 테스트 (추천)

**1. 보드 연결**
```bash
# 시리얼 포트 자동 감지 및 연결
npm run test:heartbeat

# 특정 포트 지정
npm run test:heartbeat /dev/ttyUSB0    # Linux
npm run test:heartbeat /dev/tty.usbserial-*  # macOS
npm run test:heartbeat COM3           # Windows
```

**2. 출력 예시**
```
╔═══════════════════════════════════════════════════════════╗
║         MAVLink V2 Lite Heartbeat Test Tool             ║
╚═══════════════════════════════════════════════════════════╝

📡 Scanning for serial ports...
✅ Found 1 port(s):
   1. /dev/ttyUSB0 (FTDI)

🔌 Auto-selected: /dev/ttyUSB0
⏳ Connecting...
✅ Connected to /dev/ttyUSB0 (115200 baud, 8N1)

🚀 Starting heartbeat (1Hz TX, monitoring RX)...

📤 TX Heartbeat #0 (sent: 1)
📥 RX Heartbeat from SYS:1 COMP:1 SEQ:0 STATE:ACTIVE TYPE:31 (received: 1)
🎉 ✅ CONNECTION ESTABLISHED!

────────────────────────────────────────────────────────────
📊 STATUS
   Connection:     ● CONNECTED
   Heartbeats:     TX: 5  RX: 5
   Last RX:        15:30:45 (1.2s ago)
   Parser:         Total: 5  CRC Errors: 0  Parse Errors: 0
   Serial:         TX: 105 bytes  RX: 105 bytes
   Remote Status:  ACTIVE (Type: 31)
────────────────────────────────────────────────────────────
```

### 프로토콜 테스트

```bash
# 전체 테스트 실행
npm test

# 특정 테스트만 실행
npm test -- crc16.test.ts
npm test -- encoder.test.ts
npm test -- parser.test.ts

# UI 모드
npm run test:ui
```

## 개발

### 개발 서버 실행

```bash
npm run electron:dev
```

### 빌드

```bash
npm run build
```

### 테스트

```bash
npm test
```

## 하드웨어 연결

1. USB-UART 어댑터를 DC Charger UART5에 연결
   - TX: PC12 (Board → PC)
   - RX: PD2 (PC → Board)
   - GND: 공통 접지

2. Serial port 확인
   - Linux: `/dev/ttyUSB0` 또는 `/dev/ttyACM0`
   - macOS: `/dev/tty.usbserial-*`
   - Windows: `COM3`, `COM4` 등

## 프로젝트 구조

```
MAVLinkV2Lite/
├── package.json                    # ✅ 완료
├── tsconfig.json                   # ✅ 완료
├── vite.config.ts                  # ✅ 완료
├── vitest.config.ts                # ✅ 완료
├── index.html                      # ✅ 완료
├── README.md                       # ✅ 완료
├── TODO.md                         # ✅ 완료
│
├── docs/
│   └── MVLink2LiteAPP.md          # ✅ 사양서 (기존)
│
├── electron/                       # Main process (Node.js)
│   ├── main.ts                    # ⏳ 미구현
│   ├── preload.ts                 # ⏳ 미구현
│   ├── protocol/                  # MAVLink 프로토콜 레이어
│   │   ├── crc16.ts              # ⏳ 다음 작업
│   │   ├── constants.ts          # ⏳ 다음 작업
│   │   ├── types.ts              # ⏳ 다음 작업
│   │   ├── parser.ts             # ⏳ 다음 작업
│   │   └── encoder.ts            # ⏳ 다음 작업
│   ├── serial/
│   │   ├── SerialPortManager.ts  # ⏳ Day 4
│   │   └── HeartbeatManager.ts   # ⏳ Day 4
│   └── ipc/
│       ├── serialHandlers.ts     # ⏳ Day 5
│       └── heartbeatHandlers.ts  # ⏳ Day 5
│
├── src/                           # Renderer process (React)
│   ├── main.tsx                   # ⏳ Day 6
│   ├── App.tsx                    # ⏳ Day 6
│   ├── components/
│   │   ├── ConnectionPanel.tsx   # ⏳ Day 6
│   │   ├── StatusDisplay.tsx     # ⏳ Day 6
│   │   ├── StatisticsPanel.tsx   # ⏳ Day 7
│   │   └── MessageLog.tsx        # ⏳ Day 7
│   ├── context/
│   │   ├── AppContext.tsx        # ⏳ Day 6
│   │   └── appReducer.ts         # ⏳ Day 6
│   ├── hooks/
│   │   ├── useSerialConnection.ts # ⏳ Day 6
│   │   └── useHeartbeat.ts       # ⏳ Day 6
│   └── types/
│       └── electron.d.ts         # ⏳ Day 5
│
└── test/                          # 테스트
    ├── protocol/
    │   ├── crc16.test.ts         # ⏳ Day 2
    │   ├── parser.test.ts        # ⏳ Day 3
    │   └── encoder.test.ts       # ⏳ Day 3
    ├── mocks/
    │   └── MockSerialPort.ts     # ⏳ Day 4
    └── fixtures/
        └── heartbeat-frames.bin  # ⏳ Day 3

범례: ✅ 완료, ⏳ 미구현
```

## 참고 문서

### 프로젝트 문서
- [TODO 리스트](./TODO.md) - 다음 작업 항목 (우선순위별 정리)
- [MAVLink V2 Lite 사양서](./docs/MVLink2LiteAPP.md) - 전체 시스템 사양
- [구현 계획](~/.claude/plans/playful-sprouting-pillow.md) - 상세 구현 계획 (8일 일정)

### 참조 구현 (기존 펌웨어 프로젝트)
- **Python 테스트 툴**: `/Users/gilbert/00_EVAR/01_code/03_DC_Charger/evar-dc-charger/test/`
  - `test_crc16_ccitt.py` - CRC 구현 참조
  - `test_mavlink_protocol.py` - 프로토콜 인코더/디코더 참조
- **C 펌웨어**: `/Users/gilbert/00_EVAR/01_code/03_DC_Charger/evar-dc-charger/drivers/serial_link/`
  - `serial_link_protocol.h` - 메시지 정의
  - `serial_link_protocol.c` - 인코더/디코더 구현

## 개발 가이드

### 다음 세션 시작 방법
1. `TODO.md` 파일 확인하여 다음 작업 파악
2. Day 2 작업부터 시작: CRC-16-CCITT 구현
3. Python 참조 구현(`test_crc16_ccitt.py`)을 TypeScript로 포팅
4. 단위 테스트 작성 및 검증

### 코딩 규칙
- **TypeScript**: 엄격한 타입 체크 사용 (`strict: true`)
- **명명 규칙**:
  - 파일명: camelCase.ts
  - 클래스: PascalCase
  - 함수/변수: camelCase
  - 상수: UPPER_SNAKE_CASE
- **주석**: JSDoc 스타일로 공개 API 문서화
- **테스트**: 각 모듈마다 대응하는 테스트 파일 작성

## 라이센스

MIT License - Copyright (c) 2026 Gilbert
