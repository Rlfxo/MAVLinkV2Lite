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
| 0 | HEARTBEAT | 142 |
| 10001 | CHARGER_STATUS | 66 |
| 10002 | SENSOR_DATA | 120 |
| 10100 | CHARGER_COMMAND | 193 |
| 10101 | MANUAL_CONTROL | 239 |
| 10200 | CONFIG_REQUEST | 142 |
| 10201 | CONFIG_RESPONSE | 128 |

### CRC Pseudocode

```
// CRC-16-CCITT-FALSE with 256-entry lookup table
function crc16_accumulate(crc: uint16, byte: uint8) -> uint16:
    tmp = byte ^ (crc >> 8)
    return ((crc << 8) ^ CRC16_TABLE[tmp]) & 0xFFFF

function crc16_calculate(data: byte[], crc_extra: uint8) -> uint16:
    crc = 0xFFFF
    for each byte in data:
        crc = crc16_accumulate(crc, byte)
    crc = crc16_accumulate(crc, crc_extra)
    return crc
```

CRC16_TABLE은 CRC-16-CCITT (poly=0x1021)의 표준 256-entry lookup table이다.

### CRC Verification Example

HEARTBEAT 메시지 (PC → Charger, SEQ=0):
```
Frame:  FD 02 00 00 00 FF 00 00 00 00  03 03  19 6A
        |  |                              |pld|  |CRC|
        |  +-- LEN=2                              |
        +-- STX                                   |
                                                  |
CRC Input: [02 00 00 00 FF 00 00 00 00] + [03 03] + [8E]
           |--- header (9 bytes) ---|     |2 B|    |CRC Extra=142(0x8E)|

Result:  CRC = 0x6A19 → CRC_L=0x19, CRC_H=0x6A
```

---

## 4. Message Definitions

### 4.1 HEARTBEAT (MSG_ID: 0)

연결 상태 확인 및 Keep-alive. 양방향 1Hz 전송.
응답 없이 각자 독립적으로 전송하며, 상대방의 생존 여부만 판단한다.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Bidirectional | 1 Hz | 2 bytes |

#### Payload Structure

```
Offset  Size    Type        Field             Description
───────────────────────────────────────────────────────────────
0       1       uint8_t     system_status     시스템 상태 (MAV_STATE)
1       1       uint8_t     mavlink_version   프로토콜 버전 (항상 3)
───────────────────────────────────────────────────────────────
Total: 2 bytes
```

#### MAV_STATE Values

| Value | Name | Description |
|-------|------|-------------|
| 0 | UNINIT | 미초기화 |
| 1 | BOOT | 부팅 중 |
| 2 | STANDBY | 대기 (idle) |
| 3 | RUN | 정상 동작 |
| 4 | ERROR | 에러 |
| 5 | SHUTDOWN | RUN → STANDBY 전환 (종료 절차) |

#### PC Heartbeat (TX)

```
system_status   = 3 (RUN)
mavlink_version = 3
```

#### DC Charger Heartbeat (RX)

```
system_status   = 3 (RUN) or others
mavlink_version = 3
```

#### Connection Monitoring

- **Timeout**: 3초 이내 HEARTBEAT 미수신 시 연결 끊김 판정
- **Check interval**: 100ms 주기로 timeout 검사

---

### 4.2 CHARGER_STATUS (MSG_ID: 10001) - Phase 3

충전기 운영 상태. DC Charger → PC, 10Hz.
방전(SECC)/재충전(EVCC) 상태, BMS 정보, 릴레이, 진단 정보를 포함한다.
실시간 전기 측정값(voltage, current)은 SENSOR_DATA(10002)에서 전송한다.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Board → PC | 10 Hz | 16 bytes |

#### Payload Structure

```
Offset  Size    Type        Field           Description              Unit
──────────────────────────────────────────────────────────────────────────
0       1       uint8_t     discharging     방전 상태 (SECC)          0=off, 1~255
1       1       uint8_t     recharging      재충전 상태 (EVCC)        0=off, 1~255
2       1       uint8_t     bms_vendor      BMS 벤더                  enum
3       2       uint16_t    bms_cap         BMS 용량                  kWh
5       1       uint8_t     out_cap         아웃풋 컨버터 최대 용량     kW
6       1       uint8_t     bms_soc         SOC                       %
7       1       uint8_t     diagnosis       진단 플래그                bitmask
8       4       uint32_t    relay_bitmap    릴레이 비트맵              bitmask
12      4       uint32_t    uptime_sec      시스템 업타임              sec
──────────────────────────────────────────────────────────────────────────
Total: 16 bytes
```

#### discharging (SECC State Values)

| Value | Description |
|-------|-------------|
| 0 | OFF (방전 비활성) |
| 1~255 | SECC 상태 코드 (프로토콜별 정의) |

#### recharging (EVCC State Values)

| Value | Description |
|-------|-------------|
| 0 | OFF (재충전 비활성) |
| 1~255 | EVCC 상태 코드 (프로토콜별 정의) |

#### bms_vendor Values

| Value | Name | Description |
|-------|------|-------------|
| 0 | UNKNOWN | 미지정 |
| 1~ | TBD | 벤더별 코드 (추후 정의) |

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
환경 센서(온습도), IMU(가속도/자이로), DCGF, 전력량계, IMD 데이터를 포함한다.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Board → PC | 2 Hz | 52 bytes |

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
38      4       uint32_t    meter_voltage     전력량계 전압              mV
42      4       uint32_t    meter_current     전력량계 전류              mA
46      4       uint32_t    meter_energy      전력량계 누적량             Wh
50      1       uint8_t     imd_stop_mode     IMD 정지 모드
51      1       uint8_t     reserved          예약 (alignment)
──────────────────────────────────────────────────────────────────────────────
Total: 52 bytes
```

---

### 4.4 CHARGER_COMMAND (MSG_ID: 10100) - Phase 4

충전기 제어 명령. PC → DC Charger, On-demand.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| PC → Board | On command | 3 bytes |

#### Payload Structure

```
Offset  Size    Type        Field             Description              Unit
──────────────────────────────────────────────────────────────────────────────
0       2       uint16_t    max_power_kW      최대 전력                  kW
2       1       uint8_t     command           명령 타입
──────────────────────────────────────────────────────────────────────────────
Total: 3 bytes
```

#### Command Types

| Value | Name | Description |
|-------|------|-------------|
| 0 | STOP | 정지 |
| 1 | DISCHARGE | 방전 (차량 충전) |
| 2 | RECHARGE | ESS 재충전 |

---

### 4.5 MANUAL_CONTROL (MSG_ID: 10101) - Phase 4

JIG/테스트용 강제 제어 명령. PC → DC Charger, On-demand.
매뉴얼 모드 진입 시 보드의 자율 제어를 무시하고 릴레이 및 충방전을 강제 제어한다.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| PC → Board | On command | 6 bytes |

#### Payload Structure

```
Offset  Size    Type        Field             Description
──────────────────────────────────────────────────────────────
0       1       uint8_t     manual_mode       매뉴얼 모드 (0=OFF, 1=ON)
1       4       uint32_t    relay_bitmap      릴레이 강제 제어 비트맵
5       1       uint8_t     force_command     강제 명령
──────────────────────────────────────────────────────────────
Total: 6 bytes
```

#### manual_mode Values

| Value | Name | Description |
|-------|------|-------------|
| 0 | OFF | 매뉴얼 모드 해제 (보드 자율 제어 복귀) |
| 1 | ON | 매뉴얼 모드 진입 (이하 필드 적용) |

#### force_command Values

| Value | Name | Description |
|-------|------|-------------|
| 0 | NONE | 강제 명령 없음 (릴레이만 제어) |
| 1 | FORCE_DISCHARGE | 강제 방전 |
| 2 | FORCE_RECHARGE | 강제 재충전 |

#### relay_bitmap

manual_mode=ON일 때 릴레이 직접 제어 (bit=1: ON, bit=0: OFF)

| Bit | Relay | Description |
|-----|-------|-------------|
| 0 | RY1 | Relay 1 |
| 1 | RY2 | Relay 2 |
| ... | ... | ... |
| 15 | RY16 | Relay 16 |
| 16 | MC | Main Contactor |

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
| Board → PC | On request | 36 bytes |

#### Payload Structure

```
Offset  Size    Type         Field             Description
──────────────────────────────────────────────────────────────────
0       4       uint32_t     fw_version        FW 버전 (0x00XXYYZZ)
4       4       uint32_t     hw_version        HW 버전
8       16      char[16]     model_name        모델명 (null-terminated)
24      12      char[12]     build_date        빌드 날짜 (YYYYMMDDHHSS)
──────────────────────────────────────────────────────────────────
Total: 36 bytes
```

#### Version Format

`fw_version = 0x00XXYYZZ` → Major.Minor.Patch = `XX.YY.ZZ`

Example: `0x00010203` → v1.2.3

---

### 4.8 Reserved Messages (TBD)

아래 메시지는 펌웨어에 MSG ID만 선언되어 있으며, payload 구조는 미정의 상태이다.
필요 시 추후 정의한다.

| MSG ID | Name | Direction | Description |
|--------|------|-----------|-------------|
| 10004 | ERROR_STATUS | Board → PC | 에러 상태 보고 |
| 10202 | PARAM_SET | PC → Board | 파라미터 설정 |
| 10203 | PARAM_GET | PC → Board | 파라미터 조회 |

---

## 5. Message Summary

| MSG ID | Name | Direction | Rate | Payload | CRC Extra | Status |
|--------|------|-----------|------|---------|-----------|--------|
| 0 | HEARTBEAT | Bidirectional | 1 Hz | 2 B | 142 | Defined |
| 10001 | CHARGER_STATUS | Board → PC | 10 Hz | 16 B | 66 | Defined |
| 10002 | SENSOR_DATA | Board → PC | 2 Hz | 52 B | 120 | Defined |
| 10100 | CHARGER_COMMAND | PC → Board | On cmd | 3 B | 193 | Defined |
| 10101 | MANUAL_CONTROL | PC → Board | On cmd | 6 B | 239 | Defined |
| 10200 | CONFIG_REQUEST | PC → Board | On req | 0 B | 142 | Defined |
| 10201 | CONFIG_RESPONSE | Board → PC | On req | 36 B | 128 | Defined |

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
     |------- MANUAL_CONTROL (on demand) ----->|
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
 1    02    LEN (payload = 2 bytes)
 2    00    IFLAGS
 3    00    CFLAGS
 4    00    SEQ (sequence = 0)
 5    FF    SYSID (255 = PC)
 6    00    COMPID (0 = main)
 7    00    MSGID_L (0 = HEARTBEAT)
 8    00    MSGID_M
 9    00    MSGID_H
10    03    system_status (3 = RUN)
11    03    mavlink_version (3)
12    19    CRC_L (0x6A19)
13    6A    CRC_H
────────────────────────────────────
Total: 14 bytes
```

### 7.2 DC Charger HEARTBEAT Frame

```
Byte  Hex   Description
────────────────────────────────────
 0    FD    STX
 1    02    LEN (2)
 2    00    IFLAGS
 3    00    CFLAGS
 4    00    SEQ (sequence = 0)
 5    01    SYSID (1 = Charger)
 6    01    COMPID (1)
 7    00    MSGID_L (0 = HEARTBEAT)
 8    00    MSGID_M
 9    00    MSGID_H
10    03    system_status (3 = RUN)
11    03    mavlink_version (3)
12    E4    CRC_L (0x01E4)
13    01    CRC_H
────────────────────────────────────
Total: 14 bytes
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
