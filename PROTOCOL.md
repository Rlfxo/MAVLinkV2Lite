# MAVLink V2 Lite Protocol Specification

DC Charger - PC 간 UART 시리얼 통신 프로토콜 사양서

**Version**: 1.0
**Date**: 2026-02-09
**Status**: HEARTBEAT 구현 완료, 나머지 메시지 Phase 3-4 예정

---

## 1. Physical Layer

| Parameter | Value |
|-----------|-------|
| Interface | UART (Async Serial) |
| Baud Rate | 115200 bps |
| Data Bits | 8 |
| Parity | None |
| Stop Bits | 1 |
| Flow Control | None |
| Byte Order | Little-Endian |

### Hardware Connection

```
DC Charger (UART5)          USB-UART Adapter          PC
 TX (PC12) ──────────────── RX                  Serial Port
 RX (PD2)  ──────────────── TX                  (e.g. /dev/ttyUSB0, COM3)
 GND       ──────────────── GND
```

지원 USB-UART 칩: FTDI FT232, CP2102, CH340

---

## 2. Frame Structure

MAVLink V2 Lite 프레임은 다음 필드로 구성된다.

```
 Byte:  0     1     2       3       4     5       6       7        8        9       10..N    N+1   N+2
      +-----+-----+-------+-------+-----+-------+-------+--------+--------+--------+-------+-----+-----+
      | STX | LEN | IFLAGS| CFLAGS| SEQ | SYSID | COMPID| MSGID_L| MSGID_M| MSGID_H|PAYLOAD| CRC_L|CRC_H|
      +-----+-----+-------+-------+-----+-------+-------+--------+--------+--------+-------+-----+-----+
      |0xFD | 0-255|  0x00 |  0x00 |0-255| 1/255 |  0-1  |      24-bit MSG ID     | 0~255B|  CRC-16   |
```

### Field Description

| Offset | Field | Size | Description |
|--------|-------|------|-------------|
| 0 | STX | 1 | Start-of-frame marker. 항상 `0xFD` |
| 1 | LEN | 1 | Payload 길이 (0~255 bytes) |
| 2 | IFLAGS | 1 | Incompatibility flags. 항상 `0x00` |
| 3 | CFLAGS | 1 | Compatibility flags. 항상 `0x00` |
| 4 | SEQ | 1 | Packet sequence number (0~255, wrap-around) |
| 5 | SYSID | 1 | Sender system ID |
| 6 | COMPID | 1 | Sender component ID |
| 7 | MSGID_L | 1 | Message ID low byte |
| 8 | MSGID_M | 1 | Message ID mid byte |
| 9 | MSGID_H | 1 | Message ID high byte |
| 10 | PAYLOAD | LEN | Message-specific payload data |
| 10+LEN | CRC_L | 1 | CRC-16 checksum low byte |
| 11+LEN | CRC_H | 1 | CRC-16 checksum high byte |

- **Minimum frame size**: 12 bytes (payload 0 bytes)
- **Maximum frame size**: 267 bytes (payload 255 bytes)

### System ID / Component ID

| Device | SYSID | COMPID | Description |
|--------|-------|--------|-------------|
| DC Charger | 1 | 1 | 충전기 메인 컨트롤러 |
| PC / App | 255 | 0 | 모니터링/제어 앱 |

---

## 3. CRC Calculation

### Algorithm: CRC-16-CCITT-FALSE

| Parameter | Value |
|-----------|-------|
| Polynomial | 0x1021 |
| Initial Value | 0xFFFF |
| Input Reflection | No |
| Output Reflection | No |
| Final XOR | 0x0000 |

### CRC Scope

CRC는 다음 범위에 대해 계산한다:
1. **Header** (STX 제외): `LEN`, `IFLAGS`, `CFLAGS`, `SEQ`, `SYSID`, `COMPID`, `MSGID_L`, `MSGID_M`, `MSGID_H` (9 bytes)
2. **Payload**: 0~255 bytes
3. **CRC Extra**: Message ID별 고유 시드값 1 byte (아래 테이블 참조)

```
CRC Input = [LEN .. MSGID_H] + [PAYLOAD] + [CRC_EXTRA]
          = Header(9 bytes) + Payload(N bytes) + CRC_Extra(1 byte)
```

### CRC Extra Values

CRC Extra는 메시지 구조의 변경을 감지하기 위한 시드값이다.
송수신 양측이 동일한 값을 사용해야 통신이 성립한다.

| Message ID | Message Name | CRC Extra |
|------------|-------------|-----------|
| 0 | HEARTBEAT | 50 |
| 10001 | CHARGER_STATUS | 123 |
| 10002 | SENSOR_DATA | 87 |
| 10100 | CHARGER_COMMAND | 45 |
| 10101 | RELAY_CONTROL | 200 |
| 10200 | CONFIG_REQUEST | 100 |
| 10201 | CONFIG_RESPONSE | 101 |

### CRC Pseudocode

```
function crc16_accumulate(crc: uint16, byte: uint8) -> uint16:
    tmp = byte ^ (crc & 0xFF)
    tmp = tmp ^ ((tmp << 4) & 0xFF)
    return (crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)

function crc16_calculate(data: byte[], crc_extra: uint8) -> uint16:
    crc = 0xFFFF
    for each byte in data:
        crc = crc16_accumulate(crc, byte)
    crc = crc16_accumulate(crc, crc_extra)
    return crc
```

### CRC Verification Example

HEARTBEAT 메시지 (PC → Charger):
```
Frame:  FD 09 00 00 00 FF 00 00 00 00  00 00 00 00 06 00 00 04 03  XX XX
        |  |                              |--- payload (9 bytes) ---|  |CRC|
        |  +-- LEN=9                                                    |
        +-- STX                                                         |
                                                                        |
CRC Input: [09 00 00 00 FF 00 00 00 00] + [00 00 00 00 06 00 00 04 03] + [32]
           |--- header (9 bytes) ---|     |--- payload (9 bytes) ---|    |CRC Extra=50(0x32)|
```

---

## 4. Message Definitions

### 4.1 HEARTBEAT (MSG_ID: 0)

연결 상태 확인 및 Keep-alive. 양방향 1Hz 전송.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Bidirectional | 1 Hz | 9 bytes |

#### Payload Structure

```
Offset  Size    Type        Field             Description
───────────────────────────────────────────────────────────────
0       4       uint32_t    custom_mode       시스템별 커스텀 모드
4       1       uint8_t     type              MAV_TYPE (시스템 유형)
5       1       uint8_t     autopilot         MAV_AUTOPILOT
6       1       uint8_t     base_mode         Base mode bitmap
7       1       uint8_t     system_status     MAV_STATE (시스템 상태)
8       1       uint8_t     mavlink_version   MAVLink version (항상 3)
───────────────────────────────────────────────────────────────
Total: 9 bytes
```

#### MAV_TYPE Values

| Value | Name | Description |
|-------|------|-------------|
| 0 | GENERIC | 일반 |
| 6 | GCS | Ground Control Station (PC) |
| 31 | CHARGING_STATION | DC 충전기 |

#### MAV_STATE Values

| Value | Name | Description |
|-------|------|-------------|
| 0 | UNINIT | 미초기화 |
| 1 | BOOT | 부팅 중 |
| 2 | CALIBRATING | 캘리브레이션 |
| 3 | STANDBY | 대기 |
| 4 | ACTIVE | 활성 (정상 동작) |
| 5 | CRITICAL | 위험 |
| 6 | EMERGENCY | 비상 |
| 7 | POWEROFF | 종료 중 |

#### PC Heartbeat (TX)

```
custom_mode    = 0x00000000
type           = 6 (GCS)
autopilot      = 0 (GENERIC)
base_mode      = 0x00
system_status  = 4 (ACTIVE)
mavlink_version = 3
```

#### DC Charger Heartbeat (RX)

```
custom_mode    = (Charger state dependent)
type           = 31 (CHARGING_STATION)
autopilot      = 0 (GENERIC)
base_mode      = (mode bitmap)
system_status  = 4 (ACTIVE) or others
mavlink_version = 3
```

#### Connection Monitoring

- **Timeout**: 3초 이내 HEARTBEAT 미수신 시 연결 끊김 판정
- **Check interval**: 100ms 주기로 timeout 검사

---

### 4.2 CHARGER_STATUS (MSG_ID: 10001) - Phase 3

충전기 실시간 상태. DC Charger → PC, 10Hz.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Board → PC | 10 Hz | 32 bytes |

#### Payload Structure

```
Offset  Size    Type        Field             Description              Unit
──────────────────────────────────────────────────────────────────────────────
0       4       float       voltage_V         DC 출력 전압              V
4       4       float       current_A         DC 출력 전류              A
8       4       float       power_kW          출력 전력                 kW
12      4       uint32_t    energy_Wh         누적 에너지               Wh
16      4       uint32_t    uptime_sec        업타임                    sec
20      4       uint32_t    relay_bitmap      릴레이 상태 비트맵         bitmask
24      2       uint16_t    error_code        에러 코드
26      1       uint8_t     state             충전 상태
27      1       uint8_t     soc_pct           SOC                      %
28      1       uint8_t     fault_flags       고장 플래그               bitmask
29      3       uint8_t[3]  reserved          예약
──────────────────────────────────────────────────────────────────────────────
Total: 32 bytes
```

#### Charging State Values

| Value | Name | Description |
|-------|------|-------------|
| 0 | IDLE | 대기 |
| 1 | PRECHARGE | 프리차지 |
| 2 | CHARGING | 충전 중 |
| 3 | COMPLETE | 충전 완료 |
| 4 | ERROR | 에러 |
| 5 | EMERGENCY | 비상 정지 |

#### relay_bitmap Bit Assignments

| Bit | Relay | Description |
|-----|-------|-------------|
| 0 | RY1 | Relay 1 |
| 1 | RY2 | Relay 2 |
| ... | ... | ... |
| 15 | RY16 | Relay 16 |
| 16 | MC | Main Contactor |

---

### 4.3 SENSOR_DATA (MSG_ID: 10002) - Phase 3

센서 데이터. DC Charger → PC, 2Hz.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Board → PC | 2 Hz | 40 bytes |

#### Payload Structure

```
Offset  Size    Type        Field             Description              Unit
──────────────────────────────────────────────────────────────────────────────
0       4       float       temperature_C     온도                      degC
4       4       float       humidity_pct      습도                      %
8       4       float       accel_x_mps2      가속도 X                  m/s^2
12      4       float       accel_y_mps2      가속도 Y                  m/s^2
16      4       float       accel_z_mps2      가속도 Z                  m/s^2
20      4       float       gyro_x_dps        자이로 X                  deg/s
24      4       float       gyro_y_dps        자이로 Y                  deg/s
28      4       float       gyro_z_dps        자이로 Z                  deg/s
32      2       uint16_t    dcgf_fault        DCGF 고장 코드
34      2       uint16_t    dcgf_volt1        DCGF 전압 1               mV
36      2       uint16_t    dcgf_volt2        DCGF 전압 2               mV
38      2       uint8_t[2]  reserved          예약
──────────────────────────────────────────────────────────────────────────────
Total: 40 bytes
```

---

### 4.4 CHARGER_COMMAND (MSG_ID: 10100) - Phase 4

충전기 제어 명령. PC → DC Charger, On-demand.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| PC → Board | On command | 20 bytes |

#### Payload Structure

```
Offset  Size    Type        Field               Description            Unit
──────────────────────────────────────────────────────────────────────────────
0       4       float       target_voltage_V    목표 전압                V
4       4       float       target_current_A    목표 전류                A
8       4       float       max_power_kW        최대 전력                kW
12      4       uint32_t    timeout_sec         명령 타임아웃 (0=무제한)   sec
16      1       uint8_t     command             명령 타입
17      3       uint8_t[3]  reserved            예약
──────────────────────────────────────────────────────────────────────────────
Total: 20 bytes
```

#### Command Types

| Value | Name | Description |
|-------|------|-------------|
| 0 | STOP | 충전 정지 |
| 1 | START | 충전 시작 |
| 2 | EMERGENCY | 비상 정지 |
| 3 | PRECHARGE | 프리차지 시작 |
| 4 | DISCHARGE | 방전 시작 |

---

### 4.5 RELAY_CONTROL (MSG_ID: 10101) - Phase 4

릴레이 개별 제어. PC → DC Charger, On-demand.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| PC → Board | On command | 8 bytes |

#### Payload Structure

```
Offset  Size    Type        Field             Description
──────────────────────────────────────────────────────────────
0       4       uint32_t    relay_bitmap      대상 릴레이 비트맵
4       1       uint8_t     action            동작
5       3       uint8_t[3]  reserved          예약
──────────────────────────────────────────────────────────────
Total: 8 bytes
```

#### Action Values

| Value | Name | Description |
|-------|------|-------------|
| 0 | OFF | 릴레이 OFF |
| 1 | ON | 릴레이 ON |
| 2 | TOGGLE | 릴레이 토글 |

#### Example: Turn ON Relay 3 and Main Contactor

```
relay_bitmap = 0x00010004    (bit 2 = RY3, bit 16 = MC)
action       = 1             (ON)
```

---

### 4.6 CONFIG_REQUEST (MSG_ID: 10200) - Phase 4

설정 정보 요청. PC → DC Charger, On-demand.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| PC → Board | On request | 0 bytes |

Payload 없음. 프레임 전송만으로 CONFIG_RESPONSE 응답을 트리거한다.

---

### 4.7 CONFIG_RESPONSE (MSG_ID: 10201) - Phase 4

설정 정보 응답. DC Charger → PC, CONFIG_REQUEST에 대한 응답.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Board → PC | On request | 40 bytes |

#### Payload Structure

```
Offset  Size    Type         Field             Description
──────────────────────────────────────────────────────────────────
0       4       uint32_t     fw_version        FW 버전 (0x00XXYYZZ)
4       4       uint32_t     hw_version        HW 버전
8       4       uint32_t     serial_number     시리얼 번호
12      16      char[16]     model_name        모델명 (null-terminated)
28      12      char[12]     build_date        빌드 날짜 (YYYYMMDDHHSS)
40      4       uint8_t[4]   reserved          예약
──────────────────────────────────────────────────────────────────
Total: 44 bytes
```

#### Version Format

`fw_version = 0x00XXYYZZ` → Major.Minor.Patch = `XX.YY.ZZ`

Example: `0x00010203` → v1.2.3

---

## 5. Message Summary

| MSG ID | Name | Direction | Rate | Payload | CRC Extra | Status |
|--------|------|-----------|------|---------|-----------|--------|
| 0 | HEARTBEAT | Bidirectional | 1 Hz | 9 B | 50 | Implemented |
| 10001 | CHARGER_STATUS | Board → PC | 10 Hz | 32 B | 123 | Phase 3 |
| 10002 | SENSOR_DATA | Board → PC | 2 Hz | 40 B | 87 | Phase 3 |
| 10100 | CHARGER_COMMAND | PC → Board | On cmd | 20 B | 45 | Phase 4 |
| 10101 | RELAY_CONTROL | PC → Board | On cmd | 8 B | 200 | Phase 4 |
| 10200 | CONFIG_REQUEST | PC → Board | On req | 0 B | 100 | Phase 4 |
| 10201 | CONFIG_RESPONSE | Board → PC | On req | 44 B | 101 | Phase 4 |

---

## 6. Communication Sequence

### 6.1 Connection Establishment

```
PC (SYSID=255)                           DC Charger (SYSID=1)
     |                                          |
     |------- HEARTBEAT (1Hz) ----------------->|
     |                                          |
     |<------- HEARTBEAT (1Hz) -----------------|
     |                                          |
     |  (Both sides receive HEARTBEAT)          |
     |  => Connection ESTABLISHED               |
     |                                          |
```

### 6.2 Normal Operation

```
PC                                       DC Charger
     |                                          |
     |<------ HEARTBEAT (1Hz) -----------------|
     |<------ CHARGER_STATUS (10Hz) ------------|
     |<------ SENSOR_DATA (2Hz) ----------------|
     |                                          |
     |------- HEARTBEAT (1Hz) ----------------->|
     |------- CHARGER_COMMAND (on demand) ----->|
     |------- RELAY_CONTROL (on demand) ------->|
     |                                          |
```

### 6.3 Connection Loss Detection

```
PC                                       DC Charger
     |                                          |
     |<------ HEARTBEAT -----------------------|
     |                                          |
     |         (3 seconds, no HEARTBEAT)        |
     |                                          X  (power off / cable disconnected)
     |                                          |
     |  => Connection TIMEOUT                   |
     |  => State: DISCONNECTED                  |
     |                                          |
```

---

## 7. Wire Format Examples

### 7.1 PC HEARTBEAT Frame (Full Hex Dump)

```
Byte  Hex   Description
────────────────────────────────────
 0    FD    STX (start marker)
 1    09    LEN (payload = 9 bytes)
 2    00    IFLAGS
 3    00    CFLAGS
 4    00    SEQ (sequence = 0)
 5    FF    SYSID (255 = PC)
 6    00    COMPID (0 = main)
 7    00    MSGID_L (0 = HEARTBEAT)
 8    00    MSGID_M
 9    00    MSGID_H
10    00    custom_mode[0] (uint32 LE)
11    00    custom_mode[1]
12    00    custom_mode[2]
13    00    custom_mode[3]
14    06    type (6 = GCS)
15    00    autopilot (0 = GENERIC)
16    00    base_mode
17    04    system_status (4 = ACTIVE)
18    03    mavlink_version (3)
19    XX    CRC_L
20    XX    CRC_H
────────────────────────────────────
Total: 21 bytes
```

### 7.2 DC Charger HEARTBEAT Frame

```
Byte  Hex   Description
────────────────────────────────────
 0    FD    STX
 1    09    LEN (9)
 2    00    IFLAGS
 3    00    CFLAGS
 4    XX    SEQ
 5    01    SYSID (1 = Charger)
 6    01    COMPID (1)
 7    00    MSGID_L (0 = HEARTBEAT)
 8    00    MSGID_M
 9    00    MSGID_H
10    XX    custom_mode[0]
11    XX    custom_mode[1]
12    XX    custom_mode[2]
13    XX    custom_mode[3]
14    1F    type (31 = CHARGING_STATION)
15    00    autopilot
16    XX    base_mode
17    04    system_status (4 = ACTIVE)
18    03    mavlink_version (3)
19    XX    CRC_L
20    XX    CRC_H
────────────────────────────────────
Total: 21 bytes
```

---

## 8. Implementation Notes

### 8.1 Parser State Machine

수신 측은 byte-by-byte state machine으로 프레임을 파싱한다:

```
IDLE → GOT_STX → GOT_LEN → GOT_IFLAGS → GOT_CFLAGS → GOT_SEQ
  → GOT_SYSID → GOT_COMPID → GOT_MSGID1 → GOT_MSGID2 → GOT_MSGID3
  → GOT_PAYLOAD (LEN bytes) → GOT_CRC1 → (CRC verify) → Message Complete
```

- STX(0xFD) 이외의 바이트가 IDLE 상태에서 수신되면 무시
- CRC 불일치 시 해당 프레임 폐기 후 IDLE로 복귀
- 알 수 없는 MSGID는 CRC Extra = 0으로 처리

### 8.2 Sequence Number

- 각 송신자는 독립적으로 0~255 순환하는 SEQ를 관리
- SEQ 불연속은 패킷 손실을 의미하지만 프레임 자체는 유효

### 8.3 Endianness

- 모든 multi-byte 필드: **Little-Endian**
- float: IEEE 754 single-precision, Little-Endian

---

## 9. Error Handling

| Condition | Action |
|-----------|--------|
| STX != 0xFD | 바이트 무시, IDLE 유지 |
| Payload length > 255 | 프레임 폐기, IDLE 복귀 |
| CRC mismatch | 프레임 폐기, crcErrorCount++ |
| Unknown MSG ID | 프레임 수신 가능 (CRC Extra = 0) |
| Heartbeat timeout (>3s) | 연결 끊김 판정 |

---

## 10. Reference Implementation

| Component | Language | Location |
|-----------|----------|----------|
| Firmware encoder/decoder | C | `drivers/serial_link/serial_link_protocol.c` |
| Firmware message definitions | C | `drivers/_include/serial_link_protocol.h` |
| Firmware CRC | C | `header/lib/crc.h` |
| PC Protocol layer | TypeScript | `electron/protocol/` (parser, encoder, crc16) |
| PC Serial layer | TypeScript | `electron/serial/` (SerialPortManager, HeartbeatManager) |
| Python test tool | Python | `test/test_mavlink_protocol.py` |
