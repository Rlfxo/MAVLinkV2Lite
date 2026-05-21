/**
 * CRC-16/MODBUS Unit Tests
 *
 * Verifies the V2 Lite CRC implementation:
 *   poly 0x8005 reflected (0xA001), init 0xFFFF, reflect in/out, no XOR-out.
 *
 * The "123456789" → 0x4B37 case is the standard MODBUS reference vector and
 * is what aligns this implementation with firmware/test tooling.
 */

import { describe, it, expect } from 'vitest';
import {
  crc16Init,
  crc16Accumulate,
  crc16Calculate,
  crc16Verify
} from '../../electron/protocol/crc16';

describe('CRC-16/MODBUS', () => {
  describe('crc16Init', () => {
    it('should return initial CRC value 0xFFFF', () => {
      expect(crc16Init()).toBe(0xFFFF);
    });
  });

  describe('crc16Calculate - Known Test Vectors', () => {
    const testVectors: Array<[string | Uint8Array, number, string]> = [
      // [data, expected_crc, description]
      ['123456789', 0x4B37, 'Standard MODBUS reference vector'],
      ['', 0xFFFF, 'Empty input (initial value)'],
      [new Uint8Array([0x00]), 0x40BF, 'Single null byte'],
      [new Uint8Array([0xFF]), 0x00FF, 'Single 0xFF byte'],
      ['A', 0x707F, "Single ASCII 'A'"],
      ['ABC', 0x8550, 'ABC string'],
      ['abcdefghijklmnopqrstuvwxyz', 0x7A7F, 'Lowercase alphabet'],
      [new Uint8Array([0x03, 0x03]), 0x4141, 'HEARTBEAT payload (RUN, version=3)'],
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
      const testData = new TextEncoder().encode('123456789');

      // Method 1: Full calculation
      const crcFull = crc16Calculate(testData);

      // Method 2: Byte-by-byte accumulation
      let crcAccumulated = crc16Init();
      for (const byte of testData) {
        crcAccumulated = crc16Accumulate(crcAccumulated, byte);
      }

      expect(crcAccumulated).toBe(crcFull);
      expect(crcAccumulated).toBe(0x4B37);
    });

    it('should correctly accumulate "ABC" byte by byte', () => {
      let crc = crc16Init();
      crc = crc16Accumulate(crc, 0x41); // 'A'
      crc = crc16Accumulate(crc, 0x42); // 'B'
      crc = crc16Accumulate(crc, 0x43); // 'C'
      expect(crc).toBe(0x8550);
    });
  });

  describe('crc16Verify', () => {
    it('should verify valid CRC in buffer (little-endian)', () => {
      const data = new TextEncoder().encode('ABC');
      const crc = crc16Calculate(data);

      const buffer = new Uint8Array(data.length + 2);
      buffer.set(data, 0);
      buffer[data.length] = crc & 0xFF;           // Low byte
      buffer[data.length + 1] = (crc >> 8) & 0xFF; // High byte

      expect(crc16Verify(buffer)).toBe(true);
    });

    it('should reject invalid CRC', () => {
      const data = new TextEncoder().encode('ABC');
      const buffer = new Uint8Array(data.length + 2);
      buffer.set(data, 0);
      buffer[data.length] = 0x00;
      buffer[data.length + 1] = 0x00;

      expect(crc16Verify(buffer)).toBe(false);
    });

    it('should return false for buffer too short', () => {
      const buffer = new Uint8Array([0x01]);
      expect(crc16Verify(buffer)).toBe(false);
    });

    it('should handle empty data with CRC=0xFFFF', () => {
      // Zero-length input MODBUS CRC is the init value 0xFFFF.
      const buffer = new Uint8Array([0xFF, 0xFF]);
      expect(crc16Verify(buffer)).toBe(true);
    });
  });

  describe('V2 Lite Frame CRC (payload only)', () => {
    it('HEARTBEAT payload [0x03, 0x03] → 0x4141 (LE bytes 0x41 0x41)', () => {
      // V2 Lite computes CRC over payload only (no header, no per-msg extra).
      const payload = new Uint8Array([0x03, 0x03]);
      const crc = crc16Calculate(payload);
      expect(crc).toBe(0x4141);
      // Little-endian wire bytes
      expect(crc & 0xFF).toBe(0x41);
      expect((crc >> 8) & 0xFF).toBe(0x41);
    });

    it('Zero-byte payload (e.g. CONFIG_REQUEST) → CRC=0xFFFF', () => {
      const crc = crc16Calculate(new Uint8Array(0));
      expect(crc).toBe(0xFFFF);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single byte correctly', () => {
      const data = new Uint8Array([0x42]); // 'B'
      const crc = crc16Calculate(data);
      expect(crc).toBeGreaterThanOrEqual(0);
      expect(crc).toBeLessThanOrEqual(0xFFFF);
    });

    it('should handle 255-byte buffer (max MAVLink payload)', () => {
      const data = new Uint8Array(255);
      for (let i = 0; i < 255; i++) data[i] = i;
      const crc = crc16Calculate(data);
      expect(crc).toBeGreaterThanOrEqual(0);
      expect(crc).toBeLessThanOrEqual(0xFFFF);
    });

    it('should be deterministic for same input', () => {
      const data = new TextEncoder().encode('test data');
      expect(crc16Calculate(data)).toBe(crc16Calculate(data));
    });
  });

  describe('Type Safety', () => {
    it('should handle byte values 0-255', () => {
      let crc = crc16Init();
      for (let i = 0; i <= 255; i++) {
        crc = crc16Accumulate(crc, i);
      }
      expect(crc).toBeGreaterThanOrEqual(0);
      expect(crc).toBeLessThanOrEqual(0xFFFF);
    });

    it('should mask result to 16 bits', () => {
      const data = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]);
      const crc = crc16Calculate(data);
      expect(crc).toBeGreaterThanOrEqual(0);
      expect(crc).toBeLessThanOrEqual(0xFFFF);
    });
  });
});
