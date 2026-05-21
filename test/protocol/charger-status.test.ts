/**
 * CHARGER_STATUS Encoder/Decoder Unit Tests
 *
 * Tests encode/decode for CHARGER_STATUS (MSG_ID: 10001, 16 bytes payload).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  encodeChargerStatus,
  decodeChargerStatusPayload,
} from '../../electron/protocol/encoder';
import { MAVLinkParser } from '../../electron/protocol/parser';
import { MAVLINK_MSG_ID_CHARGER_STATUS } from '../../electron/protocol/constants';
import type { ChargerStatusPayload } from '../../electron/protocol/types';

const samplePayload: ChargerStatusPayload = {
  discharging: 1,
  recharging: 0,
  bmsVendor: 3,
  bmsCap: 60,
  outCap: 50,
  bmsSoc: 80,
  diagnosis: 0,
  relayBitmap: 0x0000_000F,
  uptimeSec: 12345,
};

describe('CHARGER_STATUS Encoder/Decoder', () => {
  describe('Frame Structure', () => {
    it('should produce correct frame length (STX+7+16+CRC=26)', () => {
      const frame = encodeChargerStatus({ sysid: 1, compid: 0, seq: 0, ...samplePayload });
      expect(frame.length).toBe(26);
    });

    it('should have correct STX, LEN, and MSG_ID', () => {
      const frame = encodeChargerStatus({ sysid: 1, compid: 0, seq: 0, ...samplePayload });
      expect(frame[0]).toBe(0xFC);       // STX (V2 Lite)
      expect(frame[1]).toBe(16);         // LEN = 16
      const msgid = frame[5] | (frame[6] << 8) | (frame[7] << 16);
      expect(msgid).toBe(MAVLINK_MSG_ID_CHARGER_STATUS);
    });
  });

  describe('Round-trip Encoding/Decoding', () => {
    it('should preserve data through encode → payload-slice → decode', () => {
      const frame = encodeChargerStatus({ sysid: 1, compid: 0, seq: 0, ...samplePayload });
      const payload = frame.subarray(8, 8 + 16);
      const decoded = decodeChargerStatusPayload(payload);
      expect(decoded).toEqual(samplePayload);
    });

    it('should handle all-zero payload', () => {
      const zeros: ChargerStatusPayload = {
        discharging: 0, recharging: 0, bmsVendor: 0, bmsCap: 0,
        outCap: 0, bmsSoc: 0, diagnosis: 0, relayBitmap: 0, uptimeSec: 0,
      };
      const frame = encodeChargerStatus({ sysid: 1, compid: 0, seq: 0, ...zeros });
      const decoded = decodeChargerStatusPayload(frame.subarray(8, 24));
      expect(decoded).toEqual(zeros);
    });
  });

  describe('Invalid Payload Length', () => {
    it('should throw on too-short payload', () => {
      expect(() => decodeChargerStatusPayload(new Uint8Array(15))).toThrow(
        'Invalid CHARGER_STATUS payload length: 15 (expected 16)'
      );
    });

    it('should throw on too-long payload', () => {
      expect(() => decodeChargerStatusPayload(new Uint8Array(17))).toThrow(
        'Invalid CHARGER_STATUS payload length: 17 (expected 16)'
      );
    });
  });

  describe('Boundary Values', () => {
    it('should handle uint8 max (255)', () => {
      const p: ChargerStatusPayload = {
        discharging: 255, recharging: 255, bmsVendor: 255,
        bmsCap: 0, outCap: 255, bmsSoc: 255, diagnosis: 255,
        relayBitmap: 0, uptimeSec: 0,
      };
      const frame = encodeChargerStatus({ sysid: 1, compid: 0, seq: 0, ...p });
      const decoded = decodeChargerStatusPayload(frame.subarray(8, 24));
      expect(decoded.discharging).toBe(255);
      expect(decoded.recharging).toBe(255);
      expect(decoded.bmsVendor).toBe(255);
      expect(decoded.outCap).toBe(255);
      expect(decoded.bmsSoc).toBe(255);
      expect(decoded.diagnosis).toBe(255);
    });

    it('should handle uint16 max (65535) for bmsCap', () => {
      const p = { ...samplePayload, bmsCap: 0xFFFF };
      const frame = encodeChargerStatus({ sysid: 1, compid: 0, seq: 0, ...p });
      const decoded = decodeChargerStatusPayload(frame.subarray(8, 24));
      expect(decoded.bmsCap).toBe(0xFFFF);
    });

    it('should handle uint32 max (4294967295) for relayBitmap and uptimeSec', () => {
      const p = { ...samplePayload, relayBitmap: 0xFFFFFFFF, uptimeSec: 0xFFFFFFFF };
      const frame = encodeChargerStatus({ sysid: 1, compid: 0, seq: 0, ...p });
      const decoded = decodeChargerStatusPayload(frame.subarray(8, 24));
      expect(decoded.relayBitmap).toBe(0xFFFFFFFF);
      expect(decoded.uptimeSec).toBe(0xFFFFFFFF);
    });
  });

  describe('Little-Endian Byte Order', () => {
    it('should write bmsCap in LE at offset 3', () => {
      const p = { ...samplePayload, bmsCap: 0x1234 };
      const frame = encodeChargerStatus({ sysid: 1, compid: 0, seq: 0, ...p });
      // payload starts at offset 8 (V2 Lite: STX+7-byte header); bmsCap is at payload offset 3
      expect(frame[8 + 3]).toBe(0x34); // low byte
      expect(frame[8 + 4]).toBe(0x12); // high byte
    });

    it('should write relayBitmap in LE at offset 8', () => {
      const p = { ...samplePayload, relayBitmap: 0xDEADBEEF };
      const frame = encodeChargerStatus({ sysid: 1, compid: 0, seq: 0, ...p });
      expect(frame[8 + 8]).toBe(0xEF);
      expect(frame[8 + 9]).toBe(0xBE);
      expect(frame[8 + 10]).toBe(0xAD);
      expect(frame[8 + 11]).toBe(0xDE);
    });

    it('should write uptimeSec in LE at offset 12', () => {
      const p = { ...samplePayload, uptimeSec: 0x12345678 };
      const frame = encodeChargerStatus({ sysid: 1, compid: 0, seq: 0, ...p });
      expect(frame[8 + 12]).toBe(0x78);
      expect(frame[8 + 13]).toBe(0x56);
      expect(frame[8 + 14]).toBe(0x34);
      expect(frame[8 + 15]).toBe(0x12);
    });
  });

  describe('Parser Round-trip', () => {
    let parser: MAVLinkParser;

    beforeEach(() => {
      parser = new MAVLinkParser();
    });

    it('should encode → parse → decode successfully', () => {
      const frame = encodeChargerStatus({ sysid: 1, compid: 0, seq: 42, ...samplePayload });
      const messages = parser.parseBuffer(frame);

      expect(messages.length).toBe(1);
      expect(messages[0].msgid).toBe(MAVLINK_MSG_ID_CHARGER_STATUS);
      expect(messages[0].sysid).toBe(1);
      expect(messages[0].seq).toBe(42);
      expect(messages[0].payload.length).toBe(16);

      const decoded = decodeChargerStatusPayload(messages[0].payload);
      expect(decoded).toEqual(samplePayload);
    });
  });
});
