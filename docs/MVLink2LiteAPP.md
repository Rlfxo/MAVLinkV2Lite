# MAVLink V2 Lite PC Application Specification

## 1. Overview

DC Charger와 PC 간 통신을 위한 MAVLink V2 Lite 기반 모니터링 및 제어 애플리케이션

**프로토콜**: MAVLink V2 Lite (Custom Implementation)
**통신**: UART Serial (UART5: PC12/PD2)
**Baud Rate**: 115200, 8N1
**용도**: PC/App/JIG를 통한 DC Charger 모니터링, 제어, 테스트

---

## 2. Hardware Connection

### 2.1 UART 연결
- **DC Charger UART5**
  - TX: PC12 (Board → PC)
  - RX: PD2 (PC → Board)
  - GND: 공통 접지

### 2.2 USB-UART 변환기
- FTDI FT232, CP2102, CH340 등 사용
- **설정**: 115200 baud, 8 data bits, No parity, 1 stop bit

---

## 3. Protocol Implementation

### 3.1 MAVLink V2 Lite Frame Structure
```
[STX] [LEN] [IFLAGS] [CFLAGS] [SEQ] [SYSID] [COMPID] [MSGID_L] [MSGID_M] [MSGID_H] [PAYLOAD...] [CRC_L] [CRC_H]
  0xFD   1      1        1       1      1       1         1         1         1       0~255        2
```

### 3.2 CRC Calculation
- **Algorithm**: CRC-16-CCITT-FALSE
- **Initial**: 0xFFFF
- **Polynomial**: 0x1021
- **Range**: LEN ~ end of PAYLOAD
- **CRC Extra**: Message-specific seed 추가

### 3.3 System/Component ID
- **DC Charger**: SYSID=1, COMPID=1
- **PC/App**: SYSID=255, COMPID=0 (권장)

---

## 4. Required Features

### 4.1 수신 기능 (DC Charger → PC)

#### 4.1.1 HEARTBEAT (MSG_ID: 0) - 1000ms
**목적**: 연결 상태 확인, Keep-alive

**Payload (9 bytes)**:
```c
uint32_t custom_mode;    // Charger state
uint8_t  type;           // 31 (MAV_TYPE_CHARGING_STATION)
uint8_t  autopilot;      // 0 (Generic)
uint8_t  base_mode;      // Base mode bitmap
uint8_t  system_status;  // 4 (MAV_STATE_ACTIVE)
uint8_t  mavlink_version; // 3 (MAVLink V2)
```

**필수 기능**:
- 3초 이내 heartbeat 미수신 시 "Disconnected" 표시
- Last seen timestamp 표시
- Packet loss rate 계산

#### 4.1.2 CHARGER_STATUS (MSG_ID: 10001) - 500ms (예정)
**목적**: 충전기 실시간 상태 모니터링

**Payload (32 bytes)**:
```c
float    voltage_V;      // DC 전압 (V)
float    current_A;      // DC 전류 (A)
float    power_kW;       // 전력 (kW)
uint32_t energy_Wh;      // 누적 에너지 (Wh)
uint32_t uptime_sec;     // 업타임 (초)
uint32_t relay_bitmap;   // 릴레이 상태 (bit 0-15: RY1-16, bit 16: MC)
uint16_t error_code;     // 에러 코드
uint8_t  state;          // 충전 상태 (IDLE/PRECHARGE/CHARGE/...)
uint8_t  soc_pct;        // SOC (%)
uint8_t  fault_flags;    // 고장 플래그
uint8_t  reserved;
```

**필수 기능**:
- 실시간 그래프: 전압, 전류, 전력 (최근 60초)
- 누적 에너지 표시
- 릴레이 상태 비트맵 시각화 (17개 릴레이)
- 에러 코드 해석 및 표시
- 충전 상태 표시 (색상 코딩)

#### 4.1.3 SENSOR_DATA (MSG_ID: 10002) - 1000ms (예정)
**목적**: 센서 데이터 모니터링

**Payload (40 bytes)**:
```c
float    temperature_C;  // 온도 (°C)
float    humidity_pct;   // 습도 (%)
float    accel_x_mps2;   // 가속도 X (m/s²)
float    accel_y_mps2;   // 가속도 Y (m/s²)
float    accel_z_mps2;   // 가속도 Z (m/s²)
float    gyro_x_dps;     // 자이로 X (deg/s)
float    gyro_y_dps;     // 자이로 Y (deg/s)
float    gyro_z_dps;     // 자이로 Z (deg/s)
uint16_t dcgf_fault;     // DCGF 고장 코드
uint16_t dcgf_volt1;     // DCGF 전압1
uint16_t dcgf_volt2;     // DCGF 전압2
uint8_t  reserved[2];
```

**필수 기능**:
- 온도/습도 실시간 표시
- IMU 데이터 시각화 (3D orientation, 진동 감지)
- DCGF 센서 데이터 표시

#### 4.1.4 CONFIG_RESPONSE (MSG_ID: 10201)
**목적**: 펌웨어/하드웨어 정보 조회 응답

**Payload (40 bytes)**:
```c
uint32_t fw_version;     // FW 버전 (0x00XXYYZZ)
uint32_t hw_version;     // HW 버전
uint32_t serial_number;  // 시리얼 번호
uint8_t  model_name[16]; // 모델명 (null-terminated)
uint8_t  build_date[12]; // 빌드 날짜 (YYYYMMDDHHMM)
uint8_t  reserved[4];
```

**필수 기능**:
- 버전 정보 파싱 (Major.Minor.Patch)
- Device info 표시 (S/N, 모델명, 빌드 날짜)

---

### 4.2 송신 기능 (PC → DC Charger)

#### 4.2.1 HEARTBEAT (MSG_ID: 0) - 1000ms
**목적**: PC 연결 상태 알림

**Payload (9 bytes)**:
```c
uint32_t custom_mode;    // 0
uint8_t  type;           // 6 (MAV_TYPE_GCS)
uint8_t  autopilot;      // 0
uint8_t  base_mode;      // 0
uint8_t  system_status;  // 4 (MAV_STATE_ACTIVE)
uint8_t  mavlink_version; // 3
```

**필수 기능**:
- 자동 1000ms 전송 (연결 유지)

#### 4.2.2 CHARGER_COMMAND (MSG_ID: 10100)
**목적**: 충전기 제어 명령

**Payload (20 bytes)**:
```c
float    target_voltage_V; // 목표 전압 (V)
float    target_current_A; // 목표 전류 (A)
float    max_power_kW;     // 최대 전력 (kW)
uint32_t timeout_sec;      // 명령 타임아웃 (0=무제한)
uint8_t  command;          // 명령 타입
uint8_t  reserved[3];
```

**Command Types**:
- `0`: STOP - 충전 정지
- `1`: START - 충전 시작
- `2`: EMERGENCY - 비상 정지
- `3`: PRECHARGE - 프리차지 시작
- `4`: DISCHARGE - 방전 시작

**필수 기능**:
- UI 버튼: Start, Stop, Emergency Stop
- 파라미터 입력: 목표 전압, 전류, 전력
- Safety validation (범위 체크)
- 명령 전송 확인 (ACK 필요 시)

#### 4.2.3 RELAY_CONTROL (MSG_ID: 10101)
**목적**: 릴레이 개별 제어

**Payload (8 bytes)**:
```c
uint32_t relay_bitmap;   // 릴레이 비트맵 (bit 0-15: RY1-16, bit 16: MC)
uint8_t  action;         // 0=OFF, 1=ON, 2=TOGGLE
uint8_t  reserved[3];
```

**필수 기능**:
- 17개 릴레이 개별 제어 UI (RY1~RY16, MC)
- ON/OFF/TOGGLE 버튼
- Safety interlock (충전 중 제어 방지 경고)

#### 4.2.4 CONFIG_REQUEST (MSG_ID: 10200)
**목적**: 설정 정보 요청

**Payload (0 bytes)**: 없음

**필수 기능**:
- "Get Device Info" 버튼
- CONFIG_RESPONSE 대기 및 표시

---

## 5. User Interface Requirements

### 5.1 Main Dashboard
- **연결 상태**: Connected/Disconnected, Last seen, Packet loss
- **실시간 데이터**:
  - 전압, 전류, 전력 (큰 숫자 표시)
  - 누적 에너지, SOC
  - 충전 상태 (색상 코딩: IDLE=회색, CHARGE=녹색, ERROR=빨강)
- **그래프**: 전압/전류/전력 트렌드 (최근 60초)

### 5.2 Control Panel
- **충전 제어**:
  - Start/Stop/Emergency Stop 버튼
  - 목표 전압/전류/전력 입력 필드
- **릴레이 제어**:
  - 17개 릴레이 ON/OFF 토글 스위치
  - 현재 상태 시각화

### 5.3 Sensor Monitor
- **환경 센서**: 온도, 습도
- **IMU**: 가속도계, 자이로스코프 (3D 시각화 또는 숫자)
- **DCGF**: 고장 코드, 전압 센서

### 5.4 Device Info
- FW 버전, HW 버전, S/N, 모델명, 빌드 날짜

### 5.5 Log/Debug
- 수신/송신 메시지 로그 (timestamp, msgid, payload)
- CRC 에러 카운트
- 통계: RX/TX count, error count

---

## 6. Advanced Features (Optional)

### 6.1 Data Logging
- CSV 파일 저장: timestamp, voltage, current, power, temperature, etc.
- 세션별 로그 파일 생성

### 6.2 Plotting & Analysis
- 충전 곡선 분석 (CC/CV 구간 구분)
- 에너지 효율 계산

### 6.3 Scripting/Automation
- 충전 시퀀스 자동화 (예: 프리차지 → 충전 → 완료)
- 릴레이 테스트 시퀀스

### 6.4 Configuration
- UART 포트 자동 검색
- Baud rate 설정
- 메시지 전송 주기 설정 (heartbeat interval)

### 6.5 Multi-device Support
- 여러 DC Charger 동시 모니터링 (서로 다른 UART 포트)

---

## 7. Technology Stack Recommendations

### 7.1 Python (권장)
**장점**: 빠른 개발, 풍부한 라이브러리, 크로스 플랫폼

**필수 라이브러리**:
- `pyserial`: UART 통신
- `struct`: 바이너리 파싱
- `tkinter` or `PyQt5`: GUI
- `matplotlib`: 그래프
- `numpy`: 데이터 처리

**파일 구조**:
```
mavlink_app/
├── mavlink_protocol.py   # 프로토콜 인코더/디코더
├── serial_comm.py        # UART 통신 관리
├── gui_main.py           # 메인 GUI
├── data_logger.py        # 데이터 로깅
└── utils.py              # 유틸리티
```

### 7.2 C++/Qt (고성능 필요 시)
**장점**: 네이티브 성능, 전문적인 UI

**필수 라이브러리**:
- Qt Serial Port
- QtCharts
- QCustomPlot

### 7.3 Web-based (원격 모니터링 필요 시)
**장점**: 브라우저 접근, 원격 제어

**기술 스택**:
- Backend: Python Flask/FastAPI + pyserial
- Frontend: React + D3.js (그래프)
- WebSocket: 실시간 데이터 푸시

---

## 8. Testing Requirements

### 8.1 기본 테스트
- [ ] Heartbeat 수신 확인 (1000ms)
- [ ] 연결 타임아웃 테스트 (3초)
- [ ] CRC 에러 감지
- [ ] 명령 송신 확인

### 8.2 통신 테스트
- [ ] 고속 수신 테스트 (500ms CHARGER_STATUS)
- [ ] Long-running stability (24시간 연속 수신)
- [ ] Packet loss 측정

### 8.3 제어 테스트
- [ ] Start/Stop 명령
- [ ] Emergency stop 즉시 반영
- [ ] 릴레이 개별/일괄 제어

---

## 9. Safety Considerations

### 9.1 명령 전송 제한
- Emergency Stop은 항상 허용
- 충전 중 릴레이 제어 시 경고 메시지
- 비정상 파라미터 입력 차단 (예: 전압 > 1000V)

### 9.2 UI Safeguards
- Emergency Stop 버튼: 크고 빨간색, 항상 접근 가능
- 중요 명령 전 확인 대화상자 (예: "Are you sure?")

### 9.3 로그 기록
- 모든 제어 명령 타임스탬프 기록
- 에러 발생 시 자동 로그 저장

---

## 10. Implementation Phases

### Phase 1: Protocol Foundation (완료)
- ✅ CRC-16 구현
- ✅ 인코더/디코더
- ✅ Python 테스트 툴

### Phase 2: Basic Communication
- [ ] UART 연결 및 heartbeat 수신
- [ ] Heartbeat 송신
- [ ] 연결 상태 모니터링

### Phase 3: Data Monitoring
- [ ] CHARGER_STATUS 수신 및 표시
- [ ] SENSOR_DATA 수신 및 표시
- [ ] 실시간 그래프

### Phase 4: Control Functions
- [ ] CHARGER_COMMAND 송신
- [ ] RELAY_CONTROL 송신
- [ ] CONFIG_REQUEST/RESPONSE

### Phase 5: Advanced Features
- [ ] 데이터 로깅 (CSV)
- [ ] 그래프 분석
- [ ] 스크립팅

---

## 11. Message ID Reference

| Message ID | Name              | Direction      | Rate   | Status      |
|------------|-------------------|----------------|--------|-------------|
| 0          | HEARTBEAT         | Bidirectional  | 1000ms    | Implemented |
| 10001      | CHARGER_STATUS    | Board → PC     | 500ms   | Planned     |
| 10002      | SENSOR_DATA       | Board → PC     | 1000ms   | Planned     |
| 10003      | RELAY_STATUS      | Board → PC     | On req | Planned     |
| 10004      | ERROR_STATUS      | Board → PC     | On evt | Planned     |
| 10100      | CHARGER_COMMAND   | PC → Board     | On cmd | Planned     |
| 10101      | RELAY_CONTROL     | PC → Board     | On cmd | Planned     |
| 10102      | EMERGENCY_STOP    | PC → Board     | On cmd | Planned     |
| 10200      | CONFIG_REQUEST    | PC → Board     | On req | Planned     |
| 10201      | CONFIG_RESPONSE   | Board → PC     | On req | Planned     |

---

## 12. Contact & Support

**프로토콜 구현 위치**: `drivers/serial_link/`
- `serial_link_protocol.h`: 메시지 정의
- `serial_link_protocol.c`: 인코더/디코더
- `serial_link.c`: Task 구현

**테스트 툴**: `scripts/test_mavlink_protocol.py`

**문서**: `drivers/_include/serial_link_protocol.h` (전체 메시지 구조 참고)
