# MAVLink V2 Lite Protocol Specification

DC Charger ↔ Host (PC Android / PC Windows / JIG / App Tester) UART serial protocol specification.

**Version**: 2.1
**Date**: 2026-05-21
**Status**: V2 Lite dialect (header 8 bytes, STX 0xFC). **CRC switched to CRC-16/MODBUS over payload only** (no header coverage, no per-message extra seed). EVCC (20xxx) message family removed.

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
DC Charger (UART5)          USB-UART Adapter          Host
 TX (PC12) ──────────────── RX                  Serial Port
 RX (PD2)  ──────────────── TX                  (e.g. /dev/ttyUSB0, COM3)
 GND       ──────────────── GND
```

Supported USB-UART chips: FTDI FT232, CP2102, CH340.

---

## 2. Frame Structure

MAVLink V2 Lite frames are composed of an 8-byte prefix (STX + 7-byte header), a 0–255 byte payload, and a 2-byte CRC. This is a simplified dialect of upstream MAVLink V2: the `INCOMPAT_FLAGS` / `COMPAT_FLAGS` bytes (always 0 in this project) are removed, and the STX is changed from `0xFD` to `0xFC` to make the two dialects distinguishable at frame-sync time.

```
 Byte:  0     1     2     3       4       5        6        7        8..N    N+1   N+2
      +-----+-----+-----+-------+-------+--------+--------+--------+-------+-----+-----+
      | STX | LEN | SEQ | SYSID | COMPID| MSGID_L| MSGID_M| MSGID_H|PAYLOAD| CRC_L|CRC_H|
      +-----+-----+-----+-------+-------+--------+--------+--------+-------+-----+-----+
      |0xFC |0-255|0-255|  any  |  any  |      24-bit MSG ID       | 0~255B|  CRC-16   |
```

### Field Description

| Offset | Field | Size | Description |
|--------|-------|------|-------------|
| 0 | STX | 1 | Start-of-frame marker. Always `0xFC` (distinguishes V2 Lite from upstream V2 0xFD) |
| 1 | LEN | 1 | Payload length (0–255 bytes) |
| 2 | SEQ | 1 | Packet sequence number (0–255, wrap-around) |
| 3 | SYSID | 1 | Sender system ID |
| 4 | COMPID | 1 | Sender component ID |
| 5 | MSGID_L | 1 | Message ID low byte |
| 6 | MSGID_M | 1 | Message ID mid byte |
| 7 | MSGID_H | 1 | Message ID high byte |
| 8 | PAYLOAD | LEN | Message-specific payload data |
| 8+LEN | CRC_L | 1 | CRC-16 checksum low byte |
| 9+LEN | CRC_H | 1 | CRC-16 checksum high byte |

- **Minimum frame size**: 10 bytes (payload 0 bytes)
- **Maximum frame size**: 265 bytes (payload 255 bytes)

### System ID Convention

Single-charger ↔ multi-host topology: one charger may talk to several hosts, so each host advertises a distinct SYSID.

| SYSID | Role | Description |
|-------|------|-------------|
| 1   | Charger     | DC Charger main controller |
| 100 | PC Android  | PC Android operator app |
| 101 | PC Windows  | PC Windows operator app |
| 200 | JIG         | JIG tester (production/QA fixture) |
| 201 | AppTester   | App-side test/monitoring app (this Electron project) |
| 255 | Broadcast   | Target all listeners |

### Component ID Convention

COMPID identifies the *charger model* on the charger side. Hosts that are not a charger model send `COMPID=0` (ALL). The model is observable from the very first frame, before any CONFIG_RESPONSE arrives, so the UI can route by model immediately.

| COMPID | Name  | Description |
|--------|-------|-------------|
| 0 | ALL   | Host that is not a charger model, or "address all components" |
| 1 | DURA  | Charger model: DURA |
| 2 | MOOEV | Charger model: MOOEV |
| 3 | Parky | Charger model: Parky |

---

## 3. CRC Calculation

### Algorithm: CRC-16/MODBUS

| Parameter | Value |
|-----------|-------|
| Polynomial | 0x8005 (reflected: 0xA001) |
| Initial Value | 0xFFFF |
| Input Reflection | Yes |
| Output Reflection | Yes |
| Final XOR | 0x0000 |
| Wire encoding | 2 bytes, little-endian |

### CRC Scope

CRC is computed over the **payload bytes only** — no header bytes, no STX, no per-message extra seed.

```
CRC Input = [PAYLOAD]   (LEN bytes, 0..255)
```

- For a 0-byte payload (e.g. CONFIG_REQUEST) the CRC is the MODBUS initial value `0xFFFF`.
- The header (LEN, SEQ, SYSID, COMPID, MSGID) is **not** covered by the CRC. A corrupted header byte will still produce a structurally-valid frame; protect against this at the application layer if needed (e.g. validate SYSID/MSGID against expected ranges before acting on a message).
- There is no per-message CRC extra table in V2 Lite. Schema drift detection (if needed) must come from a different mechanism such as explicit version fields in the payload, CONFIG_RESPONSE comparison, etc.

### CRC Pseudocode

```
// CRC-16/MODBUS, reflected
function crc16_modbus(payload: byte[]) -> uint16:
    crc = 0xFFFF
    for each b in payload:
        crc ^= b
        for j = 0..7:
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc = crc >> 1
    return crc & 0xFFFF
```

Table-driven equivalent (recommended for streaming):

```
crc = (crc >> 8) ^ MODBUS_TABLE[(crc ^ byte) & 0xFF]
```

where `MODBUS_TABLE[i]` is the standard reflected MODBUS 256-entry table.

### CRC Verification Example

App Tester HEARTBEAT (SYSID=201, COMPID=0, SEQ=0, payload `03 03`):

```
Frame:  FC 02 00 C9 00 00 00 00  03 03  41 41
        |  |                      |pld|  |CRC|
        |  +-- LEN=2                     |
        +-- STX (V2 Lite)                |

CRC Input: [03 03]   ← payload only
Result:    crc16_modbus([0x03, 0x03]) = 0x4141 → CRC_L=0x41, CRC_H=0x41
```

> **Note**: Because the CRC only covers the payload, two frames with the same payload (e.g. any two HEARTBEATs with `system_status=RUN, mavlink_version=3`) will share the same trailing CRC bytes regardless of sender SYSID/COMPID/SEQ.

### Standard MODBUS Reference Vectors

To validate implementations:

| Input | Expected CRC |
|-------|-------------|
| (empty) | `0xFFFF` |
| `"123456789"` (ASCII) | `0x4B37` |
| `[0x00]` | `0x40BF` |
| `[0x03, 0x03]` | `0x4141` |

---

## 4. Message Definitions

### 4.1 HEARTBEAT (MSG_ID: 0)

Liveness keep-alive. Bidirectional, 1000 ms. Each side transmits independently; no acknowledgement is expected.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Bidirectional | 1000 ms | 2 bytes |

#### Payload Structure

```
Offset  Size    Type        Field             Description
───────────────────────────────────────────────────────────────
0       1       uint8_t     system_status     MAV_STATE
1       1       uint8_t     mavlink_version   Protocol version (always 3)
───────────────────────────────────────────────────────────────
Total: 2 bytes
```

#### MAV_STATE Values

| Value | Name | Description |
|-------|------|-------------|
| 0 | UNINIT | Not initialized |
| 1 | BOOT | Booting |
| 2 | STANDBY | Idle |
| 3 | RUN | Normal operation |
| 4 | ERROR | Error |
| 5 | SHUTDOWN | RUN → STANDBY transition (shutdown sequence) |

#### Connection Monitoring

- **Timeout**: connection lost if no HEARTBEAT received for 3 seconds
- **Check interval**: 100 ms

---

### 4.2 CHARGER_STATUS (MSG_ID: 10001)

Charger operational state. Charger → Host, 500 ms.
Discharge / recharge state, BMS info, relay bitmap, diagnostics.
Real-time electrical measurements (voltage, current) are carried in SENSOR_DATA (10002).

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Board → Host | 500 ms | 16 bytes |

#### Payload Structure

```
Offset  Size    Type        Field           Description              Unit
──────────────────────────────────────────────────────────────────────────
0       1       uint8_t     discharging     Discharge state           0=off, 1~255
1       1       uint8_t     recharging      Recharge state            0=off, 1~255
2       1       uint8_t     bms_vendor      BMS vendor                enum
3       2       uint16_t    bms_cap         BMS capacity              kWh
5       1       uint8_t     out_cap         Output converter max cap. kW
6       1       uint8_t     bms_soc         SOC                       %
7       1       uint8_t     diagnosis       Diagnosis flags           bitmask
8       4       uint32_t    relay_bitmap    Relay bitmap              bitmask
12      4       uint32_t    uptime_sec      System uptime             sec
──────────────────────────────────────────────────────────────────────────
Total: 16 bytes
```

#### relay_bitmap Bit Assignments

| Bit | Relay | Description |
|-----|-------|-------------|
| 0 | RY1 | Relay 1 |
| 1 | RY2 | Relay 2 |
| ... | ... | ... |
| 15 | RY16 | Relay 16 |
| 16 | MC | Main Contactor |

---

### 4.3 SENSOR_DATA (MSG_ID: 10002)

Sensor readings. Charger → Host, 1000 ms.
Environment (temp/humidity), IMU (accel/gyro), DCGF, power meter, IMD.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Board → Host | 1000 ms | 52 bytes |

#### Payload Structure

```
Offset  Size    Type        Field             Description              Unit
──────────────────────────────────────────────────────────────────────────────
0       4       float       temperature_C     Temperature              degC
4       4       float       humidity_pct      Humidity                 %
8       4       float       accel_x_mps2      Accel X                  m/s^2
12      4       float       accel_y_mps2      Accel Y                  m/s^2
16      4       float       accel_z_mps2      Accel Z                  m/s^2
20      4       float       gyro_x_dps        Gyro X                   deg/s
24      4       float       gyro_y_dps        Gyro Y                   deg/s
28      4       float       gyro_z_dps        Gyro Z                   deg/s
32      2       uint16_t    dcgf_fault        DCGF fault code
34      2       uint16_t    dcgf_volt1        DCGF voltage 1           mV
36      2       uint16_t    dcgf_volt2        DCGF voltage 2           mV
38      4       uint32_t    meter_voltage     Power-meter voltage      mV
42      4       uint32_t    meter_current     Power-meter current      mA
46      4       uint32_t    meter_energy      Power-meter energy       Wh
50      1       uint8_t     imd_stop_mode     IMD stop mode
51      1       uint8_t     reserved          Reserved (alignment)
──────────────────────────────────────────────────────────────────────────────
Total: 52 bytes
```

---

### 4.4 CHARGER_COMMAND (MSG_ID: 10100)

Charger control command. Host → Charger, on-demand.
Charger responds with COMMAND_ACK (10102).

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Host → Board | On command | 3 bytes |

#### Payload Structure

```
Offset  Size    Type        Field             Description              Unit
──────────────────────────────────────────────────────────────────────────────
0       2       uint16_t    max_power_kw      Max power                kW
2       1       uint8_t     command           Command type
──────────────────────────────────────────────────────────────────────────────
Total: 3 bytes
```

#### command Values

| Value | Name | Description |
|-------|------|-------------|
| 0 | STOP | Stop |
| 1 | DISCHARGE | Discharge (vehicle charging) |
| 2 | RECHARGE | ESS recharge |

---

### 4.5 COMMAND_ACK (MSG_ID: 10102)

Command acknowledgement. Charger → Host. Issued in response to CHARGER_COMMAND (10100).

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Board → Host | On ACK | 3 bytes |

#### Payload Structure

```
Offset  Size    Type        Field             Description
──────────────────────────────────────────────────────────────────
0       2       uint16_t    target_msg_id     ACK target MSG_ID
2       1       uint8_t     result            Processing result
──────────────────────────────────────────────────────────────────
Total: 3 bytes
```

#### result Values

| Value | Name | Description |
|-------|------|-------------|
| 0 | ACCEPTED | Accepted, executing |
| 1 | DENIED | Rejected (not allowed in current state) |
| 2 | ERROR | Processing error |
| 3 | UNSUPPORTED | Command not supported |

#### Sequence Diagram

```
App Tester (SYSID=201, COMPID=0)             DC Charger (SYSID=1, COMPID=DURA/MOOEV/Parky)
     |                                          |
     |--- CHARGER_COMMAND (10100) ------------>|
     |    max_power_kw=150, command=1           |
     |                                          |  (process)
     |<-- COMMAND_ACK (10102) -----------------|
     |    target_msg_id=10100, result=0         |
     |    (ACCEPTED)                            |
     |                                          |
```

---

### 4.6 MANUAL_CONTROL (MSG_ID: 10101) — Defined

JIG / test forced control. Host → Charger, on-demand. While manual mode is on, the board overrides its autonomous logic and applies the relay bitmap and force command directly.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Host → Board | On command | 6 bytes |

#### Payload Structure

```
Offset  Size    Type        Field             Description
──────────────────────────────────────────────────────────────
0       1       uint8_t     manual_mode       Manual mode (0=OFF, 1=ON)
1       4       uint32_t    relay_bitmap      Relay force-control bitmap
5       1       uint8_t     force_command     Force command
──────────────────────────────────────────────────────────────
Total: 6 bytes
```

#### manual_mode / force_command Values

| Field | Value | Name | Description |
|-------|-------|------|-------------|
| manual_mode  | 0 | OFF | Release manual mode (return to autonomous control) |
| manual_mode  | 1 | ON  | Enter manual mode (apply the fields below) |
| force_command| 0 | NONE | No force command (relays only) |
| force_command| 1 | FORCE_DISCHARGE | Force discharge |
| force_command| 2 | FORCE_RECHARGE  | Force recharge |

---

### 4.7 CONFIG_REQUEST (MSG_ID: 10200)

Request configuration. Host → Charger, on-demand.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Host → Board | On request | 0 bytes |

No payload. The frame alone triggers a CONFIG_RESPONSE reply.

---

### 4.8 CONFIG_RESPONSE (MSG_ID: 10201)

Configuration response. Charger → Host, in reply to CONFIG_REQUEST.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Board → Host | On request | 36 bytes |

#### Payload Structure

```
Offset  Size    Type         Field             Description
──────────────────────────────────────────────────────────────────
0       4       uint32_t     fw_version        FW version (0x00XXYYZZ)
4       4       uint32_t     hw_version        HW version
8       16      char[16]     model_name        Model name (null-terminated)
24      12      char[12]     build_date        Build date (YYYYMMDDHHMM)
──────────────────────────────────────────────────────────────────
Total: 36 bytes
```

#### Version Format

`fw_version = 0x00XXYYZZ` → Major.Minor.Patch = `XX.YY.ZZ`

Example: `0x00010203` → v1.2.3

---

### 4.9 Reserved Messages (TBD)

Reserved MSG IDs declared in firmware without a defined payload yet:

| MSG ID | Name | Direction | Description |
|--------|------|-----------|-------------|
| 10004 | ERROR_STATUS | Board → Host | Error status report |
| 10202 | PARAM_SET | Host → Board | Parameter set |
| 10203 | PARAM_GET | Host → Board | Parameter get |

---

## 5. Message Summary

(There are no per-message CRC extra seeds in V2 Lite — the CRC is plain CRC-16/MODBUS over the payload bytes.)

| MSG ID | Name | Direction | Rate | Payload | Status |
|--------|------|-----------|------|---------|--------|
| 0     | HEARTBEAT       | Bidirectional | 1000 ms | 2 B  | Implemented |
| 10001 | CHARGER_STATUS  | Board → Host  | 500 ms  | 16 B | Implemented |
| 10002 | SENSOR_DATA     | Board → Host  | 1000 ms | 52 B | Implemented |
| 10100 | CHARGER_COMMAND | Host → Board  | On cmd  | 3 B  | Implemented |
| 10102 | COMMAND_ACK     | Board → Host  | On ACK  | 3 B  | Implemented |
| 10101 | MANUAL_CONTROL  | Host → Board  | On cmd  | 6 B  | Defined |
| 10200 | CONFIG_REQUEST  | Host → Board  | On req  | 0 B  | Implemented |
| 10201 | CONFIG_RESPONSE | Board → Host  | On req  | 36 B | Implemented |

---

## 6. Communication Sequence

### 6.1 Connection Establishment

```
App Tester (SYSID=201)                       DC Charger (SYSID=1, COMPID=model)
     |                                          |
     |------- HEARTBEAT (1000 ms) ------------->|
     |                                          |
     |<------ HEARTBEAT (1000 ms) --------------|
     |                                          |
     |  (Both sides receive HEARTBEAT)          |
     |  => Connection ESTABLISHED               |
     |  => Host learns charger model from       |
     |     the COMPID of the first HEARTBEAT    |
```

### 6.2 Normal Operation

```
App Tester                                   DC Charger
     |                                          |
     |<------ HEARTBEAT (1000 ms) --------------|
     |<------ CHARGER_STATUS (500 ms) ----------|
     |<------ SENSOR_DATA (1000 ms) ------------|
     |                                          |
     |------- HEARTBEAT (1000 ms) ------------->|
     |------- CHARGER_COMMAND (on demand) ----->|
     |<------ COMMAND_ACK (response) -----------|
     |------- MANUAL_CONTROL (on demand) ------>|
```

### 6.3 Connection Loss Detection

```
App Tester                                   DC Charger
     |                                          |
     |<------ HEARTBEAT -----------------------|
     |                                          |
     |         (3 seconds, no HEARTBEAT)        |
     |                                          X  (power off / cable disconnected)
     |                                          |
     |  => Connection TIMEOUT                   |
     |  => State: DISCONNECTED                  |
```

---

## 7. Wire Format Examples

### 7.1 App Tester HEARTBEAT Frame (Full Hex Dump)

```
Byte  Hex   Description
────────────────────────────────────
 0    FC    STX (V2 Lite start marker)
 1    02    LEN (payload = 2 bytes)
 2    00    SEQ (sequence = 0)
 3    C9    SYSID (201 = App Tester)
 4    00    COMPID (0 = ALL)
 5    00    MSGID_L (0 = HEARTBEAT)
 6    00    MSGID_M
 7    00    MSGID_H
 8    03    system_status (3 = RUN)
 9    03    mavlink_version (3)
10    41    CRC_L (0x4141)   ← crc16_modbus([0x03, 0x03])
11    41    CRC_H
────────────────────────────────────
Total: 12 bytes
```

### 7.2 DC Charger (DURA) HEARTBEAT Frame

```
Byte  Hex   Description
────────────────────────────────────
 0    FC    STX (V2 Lite)
 1    02    LEN (2)
 2    00    SEQ (0)
 3    01    SYSID (1 = Charger)
 4    01    COMPID (1 = DURA)
 5    00    MSGID_L (0 = HEARTBEAT)
 6    00    MSGID_M
 7    00    MSGID_H
 8    03    system_status (3 = RUN)
 9    03    mavlink_version (3)
10    41    CRC_L (0x4141)   ← same payload as §7.1 → same CRC
11    41    CRC_H
────────────────────────────────────
Total: 12 bytes
```

> Both frames above end in `41 41`. The CRC depends only on the 2-byte payload `[0x03, 0x03]`, which is identical for every HEARTBEAT carrying `(system_status=RUN, mavlink_version=3)` regardless of sender SYSID/COMPID/SEQ.

---

## 8. Implementation Notes

### 8.1 Parser State Machine

The receiver parses byte-by-byte:

```
IDLE → GOT_STX → GOT_LEN → GOT_SEQ → GOT_SYSID → GOT_COMPID
  → GOT_MSGID1 → GOT_MSGID2 → GOT_MSGID3
  → GOT_PAYLOAD (LEN bytes) → GOT_CRC1 → (CRC verify) → Message Complete
```

- Bytes other than STX (`0xFC`) in IDLE are ignored.
- A second STX received in any header state triggers resync (start a new frame at the new STX).
- On CRC mismatch (payload bytes corrupted) the frame is dropped and the parser returns to IDLE.
- The header is **not** CRC-protected. A flipped bit in SEQ/SYSID/COMPID/MSGID will still pass CRC validation. If your application is sensitive to these fields, validate them at the message-handler layer.
- Unknown MSGID is delivered to the application like any other; the parser does not require a per-message seed table.

### 8.2 Sequence Number

- Each sender maintains its own SEQ, wrapping 0–255.
- SEQ gaps indicate packet loss but do not invalidate individual frames.
- One sender's SEQ counter is shared across **all** outgoing message types, so the SEQ visible on a periodic message stream may jump when other messages are interleaved.

### 8.3 Endianness

- All multi-byte fields: **Little-Endian**.
- `float`: IEEE-754 single-precision, Little-Endian.

### 8.4 Migration Note: Upstream MAVLink V2 → V2 Lite

If you previously implemented upstream MAVLink V2 (STX `0xFD`, 9-byte header, CRC-16/CCITT-FALSE + per-message extra seed):

1. **STX**: `0xFD` → `0xFC`.
2. **Header**: drop INCOMPAT_FLAGS / COMPAT_FLAGS (the two bytes after LEN). All subsequent header field offsets shift by **−2**.
3. **CRC algorithm**: replace CRC-16/CCITT-FALSE with **CRC-16/MODBUS** (poly 0x8005 reflected, init 0xFFFF, reflect in/out, no XOR-out).
4. **CRC range**: now **payload only** — drop header coverage. Drop the per-message `crc_extra` table and the fold-in step. `crc16_modbus(payload, payload_len)` is the only CRC call you need.
5. **CRC wire encoding**: still 2 bytes, little-endian (unchanged).

Payload structs, MSG ID values, transmission rates, and the absence of an ETX byte are unchanged.

---

## 9. Error Handling

| Condition | Action |
|-----------|--------|
| STX != 0xFC | Byte ignored, IDLE retained |
| Payload length > 255 | Frame dropped, return to IDLE |
| Payload CRC mismatch | Frame dropped, `crcErrorCount++` |
| Header byte corruption | Not detected by CRC (header outside CRC range) — validate at message handler |
| Unknown MSG ID | Frame accepted; application decides |
| Heartbeat timeout (>3s) | Connection lost |

---

## 10. Reference Implementation

| Component | Language | Location |
|-----------|----------|----------|
| Firmware encoder/decoder | C | `drivers/serial_link/serial_link_protocol.c` |
| Firmware message definitions | C | `drivers/_include/serial_link_protocol.h` |
| Firmware CRC | C | `header/lib/crc.h` |
| PC protocol layer | TypeScript | `electron/protocol/` (parser, encoder, crc16) |
| PC serial layer | TypeScript | `electron/serial/` (SerialPortManager, HeartbeatManager) |
