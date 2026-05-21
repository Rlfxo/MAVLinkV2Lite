/**
 * CHARGER_STATUS Encoder/Decoder Unit Tests
 *
 * Tests encode/decode for CHARGER_STATUS (MSG_ID: 10001, 10 B payload).
 * Layout: state(u8) + relay_bitmap(u32 LE) + uptime_sec(u32 LE) + storage_soc(u8)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  encodeChargerStatus,
  decodeChargerStatusPayload,
} from '../../electron/protocol/encoder';
import { MAVLinkParser } from '../../electron/protocol/parser';
import {
  MAVLINK_MSG_ID_CHARGER_STATUS,
  MAV_STATE,
} from '../../electron/protocol/constants';
import type { ChargerStatusPayload } from '../../electron/protocol/types';

const samplePayload: ChargerStatusPayload = {
  state: MAV_STATE.RUN,
  relayBitmap: 0x0000_010F,  // RY1-4 + MC
  uptimeSec: 12345,
  storageSoc: 80,
};

describe('CHARGER_STATUS Encoder/Decoder (V2 Lite, 10 B)', () => {
  describe('Frame Structure', () => {
    it('should produce correct frame length (STX+7+10+CRC=20)', () => {
      const frame = encodeChargerStatus({ sysid: 1, compid: 1, seq: 0, ...samplePayload });
      expect(frame.length).toBe(20);
    });

    it('should have correct STX, LEN, and MSG_ID', () => {
      const frame = encodeChargerStatus({ sysid: 1, compid: 1, seq: 0, ...samplePayload });
      expect(frame[0]).toBe(0xFC);       // STX (V2 Lite)
      expect(frame[1]).toBe(10);         // LEN = 10
      const msgid = frame[5] | (frame[6] << 8) | (frame[7] << 16);
      expect(msgid).toBe(MAVLINK_MSG_ID_CHARGER_STATUS);
    });
  });

  describe('Round-trip Encoding/Decoding', () => {
    it('should preserve data through encode → payload-slice → decode', () => {
      const frame = encodeChargerStatus({ sysid: 1, compid: 1, seq: 0, ...samplePayload });
      const payload = frame.subarray(8, 8 + 10);
      const decoded = decodeChargerStatusPayload(payload);
      expect(decoded).toEqual(samplePayload);
    });

    it('should handle all-zero payload', () => {
      const zeros: ChargerStatusPayload = {
        state: 0,
        relayBitmap: 0,
        uptimeSec: 0,
        storageSoc: 0,
      };
      const frame = encodeChargerStatus({ sysid: 1, compid: 1, seq: 0, ...zeros });
      const decoded = decodeChargerStatusPayload(frame.subarray(8, 18));
      expect(decoded).toEqual(zeros);
    });

    it('should round-trip every MAV_STATE value', () => {
      for (const state of [MAV_STATE.UNINIT, MAV_STATE.BOOT, MAV_STATE.STANDBY,
                           MAV_STATE.RUN, MAV_STATE.ERROR, MAV_STATE.SHUTDOWN,
                           MAV_STATE.FW_OTA, MAV_STATE.PLC_OTA]) {
        const p = { ...samplePayload, state };
        const frame = encodeChargerStatus({ sysid: 1, compid: 1, seq: 0, ...p });
        const decoded = decodeChargerStatusPayload(frame.subarray(8, 18));
        expect(decoded.state).toBe(state);
      }
    });
  });

  describe('Invalid Payload Length', () => {
    it('should throw on too-short payload', () => {
      expect(() => decodeChargerStatusPayload(new Uint8Array(9))).toThrow(
        'Invalid CHARGER_STATUS payload length: 9 (expected 10)',
      );
    });

    it('should throw on too-long payload', () => {
      expect(() => decodeChargerStatusPayload(new Uint8Array(11))).toThrow(
        'Invalid CHARGER_STATUS payload length: 11 (expected 10)',
      );
    });
  });

  describe('Little-Endian Byte Order', () => {
    it('should write relay_bitmap in LE at payload offset 1', () => {
      const p = { ...samplePayload, relayBitmap: 0xDEADBEEF };
      const frame = encodeChargerStatus({ sysid: 1, compid: 1, seq: 0, ...p });
      // payload starts at offset 8 (V2 Lite); relay_bitmap at payload offset 1
      expect(frame[8 + 1]).toBe(0xEF);
      expect(frame[8 + 2]).toBe(0xBE);
      expect(frame[8 + 3]).toBe(0xAD);
      expect(frame[8 + 4]).toBe(0xDE);
    });

    it('should write uptime_sec in LE at payload offset 5', () => {
      const p = { ...samplePayload, uptimeSec: 0x12345678 };
      const frame = encodeChargerStatus({ sysid: 1, compid: 1, seq: 0, ...p });
      expect(frame[8 + 5]).toBe(0x78);
      expect(frame[8 + 6]).toBe(0x56);
      expect(frame[8 + 7]).toBe(0x34);
      expect(frame[8 + 8]).toBe(0x12);
    });
  });

  describe('Boundary Values', () => {
    it('should handle u32 max for relay_bitmap and uptime_sec', () => {
      const p = { ...samplePayload, relayBitmap: 0xFFFFFFFF, uptimeSec: 0xFFFFFFFF };
      const frame = encodeChargerStatus({ sysid: 1, compid: 1, seq: 0, ...p });
      const decoded = decodeChargerStatusPayload(frame.subarray(8, 18));
      expect(decoded.relayBitmap).toBe(0xFFFFFFFF);
      expect(decoded.uptimeSec).toBe(0xFFFFFFFF);
    });

    it('should handle storage_soc 100%', () => {
      const p = { ...samplePayload, storageSoc: 100 };
      const frame = encodeChargerStatus({ sysid: 1, compid: 1, seq: 0, ...p });
      const decoded = decodeChargerStatusPayload(frame.subarray(8, 18));
      expect(decoded.storageSoc).toBe(100);
    });
  });

  describe('Parser Round-trip', () => {
    let parser: MAVLinkParser;
    beforeEach(() => {
      parser = new MAVLinkParser();
    });

    it('should encode → parse → decode successfully', () => {
      const frame = encodeChargerStatus({ sysid: 1, compid: 1, seq: 42, ...samplePayload });
      const messages = parser.parseBuffer(frame);

      expect(messages.length).toBe(1);
      expect(messages[0].msgid).toBe(MAVLINK_MSG_ID_CHARGER_STATUS);
      expect(messages[0].sysid).toBe(1);
      expect(messages[0].compid).toBe(1);
      expect(messages[0].seq).toBe(42);
      expect(messages[0].payload.length).toBe(10);

      const decoded = decodeChargerStatusPayload(messages[0].payload);
      expect(decoded).toEqual(samplePayload);
    });
  });
});
