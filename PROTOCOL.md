# MAVLink V2 Lite Protocol Specification

DC Charger ↔ Host (PC Android / PC Windows / JIG / App Tester) UART serial protocol specification. This document tracks the firmware-side authoritative spec at `evar-dc-charger/docs/protocol/mavlink_protocol.md`.

**Version**: 2.2
**Date**: 2026-05-21
**Status**: V2 Lite dialect (header 8 B, STX 0xFC). CRC-16/MODBUS over payload only.

**Highlights of 2.2 vs 2.1**:
- `fixed_t` (int32 value + int8 exp, 5 B) introduced for all physical quantities (V/A/W/Wh/°C/%/m·s⁻²/°·s⁻¹). Real value = `value × 10^exp`, SI base units.
- `CHARGER_STATUS` slimmed 16 B → **10 B** (state + relay_bitmap + uptime_sec + storage_soc). Rate 500 ms → **100 ms** (10 Hz).
- New `METER_DATA` (10003, 50 B, 2 Hz) — SPM90 meter1/meter2 V/I/P/E + firmware-summed total_power/total_energy.
- `SENSOR_DATA` redesigned to 53 B with all fixed_t; meter fields removed (moved to METER_DATA).
- `uuid` (u32) added to CHARGER_COMMAND / COMMAND_ACK / CONFIG_REQUEST / CONFIG_RESPONSE. PC assigns monotonic uuid per request, firmware echoes it. `COMMAND_ACK.target_msg_id` removed (uuid replaces it).
- `MAV_STATE` extended: 6 = FW_OTA, 7 = PLC_OTA.

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

### 4.0 fixed_t — wire format for physical quantities

SENSOR_DATA and METER_DATA fields are encoded as `fixed_t`:

```
Offset  Size  Type   Field
───────────────────────────
0       4     i32 LE value
4       1     i8     exp
───────────────────────────
Total: 5 bytes
```

The physical value (in SI base unit) is `value × 10^exp`. The encoder writes peripheral raw values + a constant `exp` per field, so PCs can decode without knowing the peripheral. `(value=0, exp=0)` is the conventional "not measured / not present" sentinel.

---

### 4.1 HEARTBEAT (MSG_ID: 0) — 2 B

Liveness keep-alive. Bidirectional, 1000 ms. Each side transmits independently; no acknowledgement is expected.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Bidirectional | 1000 ms | 2 bytes |

#### Payload Structure

```
Offset  Size  Type   Field             Description
───────────────────────────────────────────────────────
0       1     uint8  system_status     MAV_STATE (§4.10.1)
1       1     uint8  mavlink_version   Protocol version (always 3)
───────────────────────────────────────────────────────
Total: 2 bytes
```

#### Connection Monitoring

- **Timeout**: connection lost if no HEARTBEAT received for 3 seconds
- **Check interval**: 100 ms

---

### 4.2 CHARGER_STATUS (MSG_ID: 10001) — 10 B, 10 Hz

Slim "control-critical" snapshot: state + relay topology + uptime + storage SOC. All peripheral measurements live in METER_DATA (V/I/P/E) and SENSOR_DATA (environment/IMU/DCGF/IMD).

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Board → Host | 100 ms | 10 bytes |

#### Payload Structure

```
Offset  Size    Type        Field           Description
─────────────────────────────────────────────────────────────────────
0       1       uint8       state           MAV_STATE (§4.10.1)
1       4       uint32 LE   relay_bitmap    bit 0..15=RY1..RY16, bit 16=MC
5       4       uint32 LE   uptime_sec      Charger uptime (s)
9       1       uint8       storage_soc     0..100 % (battery models). DURA: 0 = N/A
─────────────────────────────────────────────────────────────────────
Total: 10 bytes
```

#### relay_bitmap Bit Assignments

| Bit | Relay |
|-----|-------|
| 0–15 | RY1..RY16 |
| 16 | Main Contactor (MC) |

---

### 4.3 SENSOR_DATA (MSG_ID: 10002) — 53 B, 2 Hz

Environment + IMU + DCGF + IMD. Physical quantities are `fixed_t` (5 B each) in SI base units. Default peripheral exponents:

| Source | Quantity | exp |
|--------|----------|-----|
| SHT3X | temperature (°C), humidity (%) | −2 |
| LSM6DSO32 | accel (m/s²), gyro (°/s) | −3 |
| DCGF | voltage (V) | −1 |

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Board → Host | 500 ms | 53 bytes |

#### Payload Structure

```
Offset  Size  Type       Field                    Notes
─────────────────────────────────────────────────────────────────────
0       5     fixed_t    temperature              °C
5       5     fixed_t    humidity                 %
10      5     fixed_t    accel_x                  m/s²
15      5     fixed_t    accel_y
20      5     fixed_t    accel_z
25      5     fixed_t    gyro_x                   °/s
30      5     fixed_t    gyro_y
35      5     fixed_t    gyro_z
40      2     uint16 LE  dcgf_fault               DCGF fault bitmask
42      5     fixed_t    dcgf_volt1               V
47      5     fixed_t    dcgf_volt2               V
52      1     uint8      imd_stop_mode            MOOEV only; DURA: 0
─────────────────────────────────────────────────────────────────────
Total: 53 bytes
```

Power-meter readings used to live here — moved to METER_DATA (§4.4).

---

### 4.4 METER_DATA (MSG_ID: 10003) — 50 B, 2 Hz

SPM90 meter measurements. `total_*` are firmware-summed (intra-frame consistency between meter1 and meter2). DURA exposes both meters; MOOEV has no meter2 and reports it as `(value=0, exp=0)`.

**SPM90 native exponents** (encoder uses these as-is):

| Quantity | exp | LSB |
|----------|-----|-----|
| voltage | −1 | 100 mV |
| current | −2 | 10 mA |
| power   |  0 | 1 W |
| energy  | +1 | 10 Wh |

**Sign convention**: positive `current`/`power` = charger → external (charging); negative = V2G / external → charger (reverse).

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Board → Host | 500 ms | 50 bytes |

#### Payload Structure

```
Offset  Size  Type     Field
─────────────────────────────────────────────
0       5     fixed_t  total_power      (W)
5       5     fixed_t  total_energy     (Wh)
10      5     fixed_t  meter1_voltage   (V)
15      5     fixed_t  meter1_current   (A)
20      5     fixed_t  meter1_power     (W)
25      5     fixed_t  meter1_energy    (Wh)
30      5     fixed_t  meter2_voltage   (DURA only; MOOEV: (0,0))
35      5     fixed_t  meter2_current
40      5     fixed_t  meter2_power
45      5     fixed_t  meter2_energy
─────────────────────────────────────────────
Total: 50 bytes
```

`(value=0, exp=0)` is the sentinel for "not measured / not present". PC distinguishes DURA vs MOOEV by frame COMPID and treats meter2 accordingly. For MOOEV, `total_*` equals `meter1_*`.

---

### 4.5 CHARGER_COMMAND (MSG_ID: 10100) — 7 B

Charger control command. Host → Charger, on-demand. The charger responds with COMMAND_ACK (10102) echoing the same `uuid`.

The `uuid` is a PC-assigned 32-bit id per command instance (monotonic counter is fine — does not need to be cryptographic). Firmware caches recent uuids and **re-sends the prior ACK without re-executing** on a duplicate uuid, so retrying a lost ACK is safe.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Host → Board | On command | 7 bytes |

#### Payload Structure

```
Offset  Size  Type       Field          Description
─────────────────────────────────────────────────────────────────────
0       4     uint32 LE  uuid           PC-assigned command instance id
4       2     uint16 LE  max_power_kW   Max power (kW)
6       1     uint8      command        CHARGER_CMD (§4.10.2)
─────────────────────────────────────────────────────────────────────
Total: 7 bytes
```

---

### 4.6 COMMAND_ACK (MSG_ID: 10102) — 5 B

Acknowledgement of CHARGER_COMMAND. The legacy `target_msg_id` field is gone — `uuid` (echoed from the request) is the sole correlation key.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Board → Host | On ACK | 5 bytes |

#### Payload Structure

```
Offset  Size  Type       Field    Description
──────────────────────────────────────────────────────────────
0       4     uint32 LE  uuid     Echoed from CHARGER_COMMAND.uuid
4       1     uint8      result   CMD_ACK (§4.10.3)
──────────────────────────────────────────────────────────────
Total: 5 bytes
```

#### Sequence Diagram

```
App Tester (SYSID=201, COMPID=0)         DC Charger (SYSID=1, COMPID=DURA/MOOEV/Parky)
     |                                          |
     |--- CHARGER_COMMAND (10100) ------------>|
     |    uuid=A001, max_power_kW=150, cmd=1   |
     |                                          |  (process)
     |<-- COMMAND_ACK (10102) -----------------|
     |    uuid=A001, result=ACCEPTED            |
     |                                          |
     |  (later: ACK retransmit on PC retry)    |
     |--- CHARGER_COMMAND (10100, uuid=A001) ->|
     |                                          |  (de-dupe; re-send ACK only)
     |<-- COMMAND_ACK (10102, uuid=A001) ------|
```

---

### 4.7 MANUAL_CONTROL (MSG_ID: 10101) — Defined

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

### 4.8 CONFIG_REQUEST (MSG_ID: 10200) — 4 B

Request configuration. Host → Charger, on-demand. Firmware replies with CONFIG_RESPONSE echoing the same `uuid`.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Host → Board | On request | 4 bytes |

#### Payload Structure

```
Offset  Size  Type       Field   Description
──────────────────────────────────────────────────────────
0       4     uint32 LE  uuid    PC-assigned request instance id
──────────────────────────────────────────────────────────
Total: 4 bytes
```

---

### 4.9 CONFIG_RESPONSE (MSG_ID: 10201) — 40 B

Configuration response. Charger → Host, in reply to CONFIG_REQUEST.

| Direction | Rate | Payload Size |
|-----------|------|-------------|
| Board → Host | On request | 40 bytes |

#### Payload Structure

```
Offset  Size  Type       Field         Description
─────────────────────────────────────────────────────────────────────
0       4     uint32 LE  uuid          Echoed from CONFIG_REQUEST.uuid
4       4     uint32 LE  fw_version    0x00 MAJOR MINOR PATCH
8       4     uint32 LE  hw_version    HW revision word
12      16    char[16]   model_name    NUL-terminated (e.g. "DURASLIM")
28      12    char[12]   build_date    "YYYYMMDDHHMM" (12 ASCII)
─────────────────────────────────────────────────────────────────────
Total: 40 bytes
```

#### Version Format

`fw_version = 0x00 MAJOR MINOR PATCH` → `MAJOR.MINOR.PATCH`. Example: `0x00010203` → v1.2.3.

---

### 4.10 Enumerations

#### 4.10.1 MAV_STATE (HEARTBEAT.system_status, CHARGER_STATUS.state)

| Value | Name | Description |
|-------|------|-------------|
| 0 | UNINIT | Pre-init; rarely seen in normal operation |
| 1 | BOOT | Powered, peripherals coming up |
| 2 | STANDBY | Init complete; ready to accept commands |
| 3 | RUN | Executing a charge / discharge command |
| 4 | ERROR | Peripheral or situational error; operation halted |
| 5 | SHUTDOWN | Intentional / emergency stop |
| 6 | FW_OTA | MCU firmware OTA in progress; commands rejected |
| 7 | PLC_OTA | PLC modem firmware OTA in progress; commands rejected |

Typical transitions:

```
UNINIT → BOOT → STANDBY ⇌ RUN
                 ↓ ↑       ↓ ↑
                 ERROR ────┘
                 ↓
                 SHUTDOWN

FW_OTA / PLC_OTA can be entered only from STANDBY (rejected during RUN).
At most one OTA may be active. On completion the board reboots → BOOT.
```

#### 4.10.2 CHARGER_CMD (CHARGER_COMMAND.command)

| Value | Name |
|-------|------|
| 0 | STOP |
| 1 | DISCHARGE |
| 2 | RECHARGE |

#### 4.10.3 CMD_ACK (COMMAND_ACK.result)

| Value | Name |
|-------|------|
| 0 | ACCEPTED |
| 1 | DENIED |
| 2 | ERROR |
| 3 | UNSUPPORTED |

---

### 4.11 Reserved Messages (TBD)

Reserved MSG IDs declared in firmware without a defined payload yet:

| MSG ID | Name | Direction | Description |
|--------|------|-----------|-------------|
| 10004 | ERROR_STATUS | Board → Host | Error status report |
| 10202 | PARAM_SET | Host → Board | Parameter set |
| 10203 | PARAM_GET | Host → Board | Parameter get |

---

## 5. Message Summary

(No per-message CRC extra seeds in V2 Lite — CRC is plain CRC-16/MODBUS over the payload bytes.)

| MSG ID | Name | Direction | Rate | Payload | Status |
|--------|------|-----------|------|---------|--------|
| 0     | HEARTBEAT       | Bidirectional | 1000 ms | 2 B  | Implemented |
| 10001 | CHARGER_STATUS  | Board → Host  | 100 ms  | 10 B | Implemented |
| 10002 | SENSOR_DATA     | Board → Host  | 500 ms  | 53 B | Implemented |
| 10003 | METER_DATA      | Board → Host  | 500 ms  | 50 B | Implemented |
| 10100 | CHARGER_COMMAND | Host → Board  | On cmd  | 7 B  | Implemented |
| 10102 | COMMAND_ACK     | Board → Host  | On ACK  | 5 B  | Implemented |
| 10101 | MANUAL_CONTROL  | Host → Board  | On cmd  | 6 B  | Defined |
| 10200 | CONFIG_REQUEST  | Host → Board  | On req  | 4 B  | Implemented |
| 10201 | CONFIG_RESPONSE | Board → Host  | On req  | 40 B | Implemented |

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

### 8.4 Migration Notes

#### From upstream MAVLink V2 → V2 Lite (header + CRC change)

If you previously implemented upstream MAVLink V2 (STX `0xFD`, 9-byte header, CRC-16/CCITT-FALSE + per-message extra seed):

1. **STX**: `0xFD` → `0xFC`.
2. **Header**: drop INCOMPAT_FLAGS / COMPAT_FLAGS (the two bytes after LEN). All subsequent header field offsets shift by **−2**.
3. **CRC algorithm**: replace CRC-16/CCITT-FALSE with **CRC-16/MODBUS** (poly 0x8005 reflected, init 0xFFFF, reflect in/out, no XOR-out).
4. **CRC range**: now **payload only** — drop header coverage. Drop the per-message `crc_extra` table and the fold-in step. `crc16_modbus(payload, payload_len)` is the only CRC call you need.
5. **CRC wire encoding**: still 2 bytes, little-endian (unchanged).

#### From V2 Lite 2.1 → 2.2 (payload restructure)

If you implemented the prior V2 Lite (per-message structs with raw scalar fields):

1. **`fixed_t` type**: replace your float / scaled-integer scalars in SENSOR_DATA and METER_DATA with `{int32 value, int8 exp}` (5 B). `actual = value × 10^exp` (SI base units).
2. **`CHARGER_STATUS`**: was 16 B, now **10 B**. Drop `discharging`/`recharging`/`bms_vendor`/`bms_cap`/`out_cap`/`bms_soc`/`diagnosis`. Keep `state`/`relay_bitmap`/`uptime_sec`/`storage_soc`. Rate increased to 100 ms (10 Hz).
3. **`SENSOR_DATA`**: was 52 B, now **53 B**. All physical fields are now `fixed_t`. Remove `meter_voltage`/`meter_current`/`meter_energy` (moved to METER_DATA).
4. **`METER_DATA` (NEW, 50 B)**: subscribe to MSGID 10003 for SPM90 V/I/P/E (meter1 + meter2 + totals).
5. **`uuid` (u32)**: added at the start of CHARGER_COMMAND (3→7 B), COMMAND_ACK (3→5 B, `target_msg_id` removed), CONFIG_REQUEST (0→4 B), CONFIG_RESPONSE (36→40 B). PC assigns monotonic uuid per request; firmware echoes it for de-dupe and retransmit safety.
6. **`MAV_STATE`**: 6 = FW_OTA, 7 = PLC_OTA added.

Frame format (STX, header layout, CRC algorithm/range) is **unchanged** between 2.1 and 2.2.

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
