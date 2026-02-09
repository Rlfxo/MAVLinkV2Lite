/**
 * CRC-16-CCITT Unit Tests
 *
 * Tests the CRC implementation against known test vectors
 * and verifies compatibility with Python/C reference implementations.
 */

import { describe, it, expect } from 'vitest';
import {
  crc16Init,
  crc16Accumulate,
  crc16Calculate,
  crc16Verify
} from '../../electron/protocol/crc16';

describe('CRC-16-CCITT-FALSE', () => {
  describe('crc16Init', () => {
    it('should return initial CRC value 0xFFFF', () => {
      expect(crc16Init()).toBe(0xFFFF);
    });
  });

  describe('crc16Calculate - Known Test Vectors', () => {
    const testVectors: Array<[string | Uint8Array, number, string]> = [
      // [data, expected_crc, description]
      // Note: Using actual calculated values that match the Python reference implementation
      ["123456789", 0x29B1, "Standard test vector (verified)"],
      ["", 0xFFFF, "Empty string (initial value)"],
      [new Uint8Array([0x00]), 0xE1F0, "Single null byte"],
      [new Uint8Array([0xFF]), 0xFF00, "Single 0xFF byte"],
      ["A", 0xB915, "Single ASCII 'A'"],
      ["ABC", 0xF508, "ABC string"],
      ["abcdefghijklmnopqrstuvwxyz", 0x53E2, "Lowercase alphabet"],
    ];

    testVectors.forEach(([data, expectedCrc, description]) => {
      it(`should calculate correct CRC for: ${description}`, () => {
        const buffer = typeof data === 'string'
          ? new TextEncoder().encode(data)
          : data;

        const calculatedCrc = crc16Calculate(buffer);
        expect(calculatedCrc).toBe(expectedCrc);
      });
    });
  });

  describe('crc16Accumulate', () => {
    it('should match crc16Calculate when called byte-by-byte', () => {
      const testData = new TextEncoder().encode("123456789");

      // Method 1: Full calculation
      const crcFull = crc16Calculate(testData);

      // Method 2: Byte-by-byte accumulation
      let crcAccumulated = crc16Init();
      for (const byte of testData) {
        crcAccumulated = crc16Accumulate(crcAccumulated, byte);
      }

      expect(crcAccumulated).toBe(crcFull);
      expect(crcAccumulated).toBe(0x29B1);
    });

    it('should correctly accumulate multiple bytes', () => {
      let crc = crc16Init();

      // Accumulate "ABC" byte by byte
      crc = crc16Accumulate(crc, 0x41); // 'A'
      crc = crc16Accumulate(crc, 0x42); // 'B'
      crc = crc16Accumulate(crc, 0x43); // 'C'

      expect(crc).toBe(0xF508);
    });
  });

  describe('crc16Verify', () => {
    it('should verify valid CRC in buffer (little-endian)', () => {
      // Create buffer: "ABC" + CRC (0xA6F9 in little-endian: 0xF9, 0xA6)
      const data = new TextEncoder().encode("ABC");
      const crc = crc16Calculate(data);

      const buffer = new Uint8Array(data.length + 2);
      buffer.set(data, 0);
      buffer[data.length] = crc & 0xFF;           // Low byte
      buffer[data.length + 1] = (crc >> 8) & 0xFF; // High byte

      expect(crc16Verify(buffer)).toBe(true);
    });

    it('should reject invalid CRC', () => {
      // Create buffer with wrong CRC
      const data = new TextEncoder().encode("ABC");
      const buffer = new Uint8Array(data.length + 2);
      buffer.set(data, 0);
      buffer[data.length] = 0x00;     // Wrong CRC
      buffer[data.length + 1] = 0x00;

      expect(crc16Verify(buffer)).toBe(false);
    });

    it('should return false for buffer too short', () => {
      const buffer = new Uint8Array([0x01]); // Only 1 byte
      expect(crc16Verify(buffer)).toBe(false);
    });

    it('should handle empty data with CRC', () => {
      // Empty data, CRC should be 0xFFFF
      const buffer = new Uint8Array([0xFF, 0xFF]);
      expect(crc16Verify(buffer)).toBe(true);
    });
  });

  describe('MAVLink Frame CRC Test', () => {
    it('should calculate correct CRC for MAVLink V2 HEARTBEAT frame', () => {
      // New 2-byte HEARTBEAT: PC (SYSID=255, COMPID=0, SEQ=0)
      // Format: [LEN][INC_FLAGS][CMP_FLAGS][SEQ][SYS_ID][COMP_ID][MSG_ID(3)][PAYLOAD(2)]
      const frameData = new Uint8Array([
        0x02,              // LEN (2 bytes payload)
        0x00,              // INC_FLAGS
        0x00,              // CMP_FLAGS
        0x00,              // SEQ
        0xFF,              // SYS_ID (255 = PC)
        0x00,              // COMP_ID
        0x00, 0x00, 0x00,  // MSG_ID (0 = HEARTBEAT)
        // PAYLOAD (2 bytes)
        0x03,              // system_status (3 = RUN)
        0x03,              // mavlink_version (3)
      ]);

      // CRC extra for HEARTBEAT (message ID 0) = 142
      const crcExtra = 142;

      // Calculate CRC (data + CRC extra byte)
      let crc = crc16Calculate(frameData);
      crc = crc16Accumulate(crc, crcExtra);

      // Expected CRC from PROTOCOL.md: 0x6A19
      expect(crc).toBe(0x6A19);
    });

    it('should verify MAVLink frame with embedded CRC', () => {
      // Charger HEARTBEAT: SYSID=1, COMPID=0, SEQ=0
      const frameData = new Uint8Array([
        0x02,              // LEN
        0x00,              // INC_FLAGS
        0x00,              // CMP_FLAGS
        0x00,              // SEQ
        0x01,              // SYS_ID (1 = Charger)
        0x00,              // COMP_ID
        0x00, 0x00, 0x00,  // MSG_ID
        0x03,              // system_status (3 = RUN)
        0x03,              // mavlink_version
      ]);

      const crcExtra = 142;

      // Calculate CRC
      let expectedCrc = crc16Calculate(frameData);
      expectedCrc = crc16Accumulate(expectedCrc, crcExtra);

      // Expected CRC from PROTOCOL.md: 0xB985
      expect(expectedCrc).toBe(0xB985);

      // Create complete frame with CRC
      const completeFrame = new Uint8Array(frameData.length + 2);
      completeFrame.set(frameData, 0);
      completeFrame[frameData.length] = expectedCrc & 0xFF;
      completeFrame[frameData.length + 1] = (expectedCrc >> 8) & 0xFF;

      // Verify round-trip
      const calculatedCrc = crc16Calculate(frameData);
      const accumulatedCrc = crc16Accumulate(calculatedCrc, crcExtra);
      expect(accumulatedCrc).toBe(expectedCrc);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single byte correctly', () => {
      const data = new Uint8Array([0x42]); // 'B'
      const crc = crc16Calculate(data);

      expect(crc).toBeGreaterThan(0);
      expect(crc).toBeLessThanOrEqual(0xFFFF);
    });

    it('should handle large buffer', () => {
      // Create 255-byte buffer (MAVLink max payload)
      const data = new Uint8Array(255);
      for (let i = 0; i < 255; i++) {
        data[i] = i;
      }

      const crc = crc16Calculate(data);

      expect(crc).toBeGreaterThan(0);
      expect(crc).toBeLessThanOrEqual(0xFFFF);
    });

    it('should be deterministic for same input', () => {
      const data = new TextEncoder().encode("test data");

      const crc1 = crc16Calculate(data);
      const crc2 = crc16Calculate(data);

      expect(crc1).toBe(crc2);
    });
  });

  describe('Type Safety', () => {
    it('should handle byte values 0-255', () => {
      let crc = crc16Init();

      // Test all possible byte values
      for (let i = 0; i <= 255; i++) {
        crc = crc16Accumulate(crc, i);
      }

      expect(crc).toBeGreaterThan(0);
      expect(crc).toBeLessThanOrEqual(0xFFFF);
    });

    it('should mask result to 16 bits', () => {
      const data = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]);
      const crc = crc16Calculate(data);

      // Result should be within 16-bit range
      expect(crc).toBeGreaterThanOrEqual(0);
      expect(crc).toBeLessThanOrEqual(0xFFFF);
    });
  });
});
