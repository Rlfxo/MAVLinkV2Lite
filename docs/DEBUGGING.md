# MAVLink V2 Lite 디버깅 가이드

## 문제: TX는 되지만 RX가 안됨 (DISCONNECTED)

### 증상
```
[TX] Heartbeat #0 (total sent: 1)
[TX] Heartbeat #1 (total sent: 2)
...
Connection: DISCONNECTED
Heartbeats: TX: 5  RX: 0
```

이것은 **PC → 보드로 전송은 되지만, 보드 → PC 수신이 안되는 상태**입니다.

---

## 체크리스트

### 1. 보드가 하트비트를 전송하고 있는가?

**보드 펌웨어 확인:**
```c
// 보드 코드에서 하트비트 전송 확인
void send_heartbeat(void) {
    // MAVLink HEARTBEAT 메시지 전송 코드
    // 1000ms로 호출되고 있는지 확인
}
```

**디버깅 방법:**
- 보드에서 LED를 깜빡이거나 printf로 전송 확인
- Logic analyzer로 TX 핀에서 데이터 확인

---

### 2. UART 배선이 올바른가?

**올바른 연결 (크로스오버):**
```
DC Charger Board          USB-UART Adapter
-----------------         ----------------
TX (PC12)    ----------->  RX
RX (PD2)     <-----------  TX
GND          -------------  GND
```

**잘못된 연결 (동일 연결):**
```
❌ TX → TX (안됨)
❌ RX → RX (안됨)
```

**확인 방법:**
1. 케이블 연결 재확인
2. TX/RX 핀을 스왑해서 테스트
3. Loopback 테스트 (TX와 RX를 단락시켜서 자기 송신 확인)

---

### 3. Baud Rate가 맞는가?

**PC 측**: 115200 baud (고정)

**보드 측 확인:**
```c
// 보드 UART 설정 확인
huart5.Init.BaudRate = 115200;  // 맞아야 함
huart5.Init.WordLength = UART_WORDLENGTH_8B;
huart5.Init.StopBits = UART_STOPBITS_1;
huart5.Init.Parity = UART_PARITY_NONE;
```

**틀린 경우:**
- 9600 baud: 매우 느린 전송
- 57600 baud: 절반 속도
- 다른 값: 완전히 깨진 데이터

---

### 4. MAVLink V2 Lite 프레임 포맷이 맞는가?

**올바른 V2 Lite HEARTBEAT 프레임 (Charger DURA, SEQ=0):**
```
FC 02 00 01 01 00 00 00 03 03 41 41
^  ^                    ^     ^
STX LEN                MSGID  CRC (CRC-16/MODBUS over payload)
```

V2 Lite는 upstream MAVLink V2와 다음 3가지 점에서 다르다:
1. STX `0xFC` (vs upstream `0xFD`)
2. 헤더 7 B (INCOMPAT/COMPAT 제거 — vs upstream 9 B)
3. CRC: **CRC-16/MODBUS over payload only** (vs upstream CRC-16/CCITT-FALSE + per-msg seed over header+payload)

자세한 사양은 [`PROTOCOL.md`](../PROTOCOL.md) 참조. HEARTBEAT 페이로드가 `[0x03, 0x03]`로 동일하면 송신자(SYSID/COMPID/SEQ)가 달라도 CRC는 항상 `41 41`이라는 점에 유의.

**보드 코드 확인:**
```c
// STX는 반드시 0xFC (V2 Lite)
frame[0] = 0xFC;

// CRC: payload에 대해 한 번만 호출 — extra seed table 없음
uint16_t crc = crc16_modbus(payload, payload_len);
frame[crc_offset]     = crc & 0xFF;        // LE low
frame[crc_offset + 1] = (crc >> 8) & 0xFF; // LE high
```

---

### 5. Logic Analyzer로 확인

**권장 도구:**
- Saleae Logic Analyzer
- OpenLogic (오픈소스)

**확인할 것:**
1. **TX 핀 (PC12)**: 데이터가 나가는지
2. **Baud rate**: 115200인지
3. **프레임 포맷**: 0xFC(V2 Lite)로 시작하는지
4. **프레임 간격**: 1000ms (1초마다)

**예상 파형:**
```
TX: ___█████___█████___█████___  (1초 간격)
RX: (없음 - 문제 있음)
```

---

## 정상 작동 확인

**성공 시 출력:**
```
[TX] Heartbeat #0 (total sent: 1)
[RX] Heartbeat from SYS:1 COMP:1 SEQ:0 STATE:ACTIVE TYPE:31 (total received: 1)
[CONNECTED] Connection established!

Connection: CONNECTED
Heartbeats: TX: 5  RX: 5
```

---

## 추가 디버깅

### Parser 에러 확인
```
Parser: Total: 0  CRC Errors: 5  Parse Errors: 2
```

- **CRC Errors > 0**: 프레임은 받지만 CRC가 틀림 (포맷 문제)
- **Parse Errors > 0**: 프레임 파싱 실패 (길이, 구조 문제)

### Serial RX 확인
```
Serial: TX: 105 bytes  RX: 0 bytes
```

- **RX: 0 bytes**: 아예 데이터를 받지 못함 (배선 문제 가능성 높음)
- **RX: > 0 bytes**: 데이터는 받지만 파싱 실패 (포맷 문제)

---

## 테스트 순서

1. **Loopback 테스트** (TX-RX 단락)
   ```bash
   npm run test:heartbeat
   # TX와 RX를 단락시키면 자기 하트비트를 받아야 함
   ```

2. **보드 펌웨어 확인**
   - 하트비트 전송 코드 활성화 확인
   - 1000ms로 호출되는지 확인

3. **배선 재확인**
   - TX ↔ RX 크로스오버 확인
   - GND 공통 접지 확인

4. **Logic Analyzer**
   - TX 핀에서 데이터 확인
   - 프레임 포맷 확인

---

## 참고: Python 테스트 툴 사용

기존 Python 툴로도 확인 가능:
```bash
cd /Users/gilbert/00_EVAR/01_code/03_DC_Charger/evar-dc-charger/test
python3 test_mavlink_protocol.py
```

Python 툴로 보드와 통신이 되면 → PC 측 소프트웨어는 정상
Python 툴로도 안되면 → 보드 또는 배선 문제
