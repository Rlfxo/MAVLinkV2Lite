/**
 * MAVLink Message Encoder Unit Tests
 *
 * Tests the encoder implementation for the new 2-byte HEARTBEAT format
 * and verifies proper message encoding.
 */

import { describe, it, expect } from 'vitest';
import {
  encodeMavlink,
  encodeHeartbeat,
  decodeHeartbeatPayload,
  createPcHeartbeat,
  createChargerHeartbeat,
} from '../../electron/protocol/encoder';
import {
  MAVLINK_MSG_ID_HEARTBEAT,
  MAV_STATE,
  MAVLINK_VERSION,
} from '../../electron/protocol/constants';

describe('MAVLink Encoder', () => {
  describe('encodeMavlink - Generic Encoder', () => {
    it('should encode a message with empty payload', () => {
      const frame = encodeMavlink(1, 0, 0, 0, new Uint8Array(0));

      // Frame should be: STX(1) + Header(9) + Payload(0) + CRC(2) = 12 bytes
      expect(frame.length).toBe(12);
      expect(frame[0]).toBe(0xFD); // STX
      expect(frame[1]).toBe(0);    // LEN = 0
    });

    it('should encode a message with small payload', () => {
      const payload = new Uint8Array([0x01, 0x02, 0x03]);
      const frame = encodeMavlink(1, 0, 5, 100, payload);

      // Frame should be: STX(1) + Header(9) + Payload(3) + CRC(2) = 15 bytes
      expect(frame.length).toBe(15);
      expect(frame[0]).toBe(0xFD);  // STX
      expect(frame[1]).toBe(3);     // LEN = 3
      expect(frame[4]).toBe(5);     // SEQ = 5
      expect(frame[5]).toBe(1);     // SYSID = 1
      expect(frame[6]).toBe(0);     // COMPID = 0
      expect(frame[7]).toBe(100);   // MSGID low = 100

      // Payload
      expect(frame[10]).toBe(0x01);
      expect(frame[11]).toBe(0x02);
      expect(frame[12]).toBe(0x03);
    });

    it('should throw error for payload too large', () => {
      const payload = new Uint8Array(256); // Max is 255
      expect(() => {
        encodeMavlink(1, 0, 0, 0, payload);
      }).toThrow('Payload too large');
    });

    it('should handle 24-bit message ID correctly', () => {
      const msgid = 0x123456; // 24-bit message ID
      const frame = encodeMavlink(1, 0, 0, msgid, new Uint8Array(0));

      // Extract msgid from frame
      const extractedMsgid = frame[7] | (frame[8] << 8) | (frame[9] << 16);
      expect(extractedMsgid).toBe(msgid);
    });
  });

  describe('encodeHeartbeat - HEARTBEAT Encoder', () => {
    it('should encode 2-byte HEARTBEAT payload', () => {
      const frame = encodeHeartbeat({
        sysid: 255,
        compid: 0,
        seq: 0,
        systemStatus: MAV_STATE.RUN,
        mavlinkVersion: MAVLINK_VERSION,
      });

      // STX(1) + Header(9) + Payload(2) + CRC(2) = 14 bytes
      expect(frame.length).toBe(14);
      expect(frame[0]).toBe(0xFD);   // STX
      expect(frame[1]).toBe(2);      // LEN = 2
      expect(frame[5]).toBe(255);    // SYSID = 255
      expect(frame[6]).toBe(0);      // COMPID = 0

      // MSG_ID = 0 (HEARTBEAT)
      expect(frame[7]).toBe(0);
      expect(frame[8]).toBe(0);
      expect(frame[9]).toBe(0);

      // Payload (2 bytes)
      expect(frame[10]).toBe(MAV_STATE.RUN);      // system_status
      expect(frame[11]).toBe(MAVLINK_VERSION);     // mavlink_version
    });

    it('should encode charger HEARTBEAT with SYSID=1', () => {
      const frame = encodeHeartbeat({
        sysid: 1,
        compid: 1,
        seq: 0,
        systemStatus: MAV_STATE.RUN,
        mavlinkVersion: 3,
      });

      expect(frame.length).toBe(14);
      expect(frame[5]).toBe(1);   // SYSID = 1
      expect(frame[6]).toBe(1);   // COMPID = 1
      expect(frame[10]).toBe(MAV_STATE.RUN);
      expect(frame[11]).toBe(3);
    });

    it('should handle sequence number wraparound', () => {
      const frame = encodeHeartbeat({
        sysid: 1,
        compid: 0,
        seq: 255,
        systemStatus: MAV_STATE.RUN,
        mavlinkVersion: MAVLINK_VERSION,
      });

      expect(frame[4]).toBe(255); // SEQ = 255
    });
  });

  describe('decodeHeartbeatPayload', () => {
    it('should decode HEARTBEAT payload correctly', () => {
      const payload = new Uint8Array([MAV_STATE.ERROR, 3]);
      const decoded = decodeHeartbeatPayload(payload);

      expect(decoded.systemStatus).toBe(MAV_STATE.ERROR);
      expect(decoded.mavlinkVersion).toBe(3);
    });

    it('should throw error for invalid payload length', () => {
      const invalidPayload = new Uint8Array(9); // Should be 2
      expect(() => {
        decodeHeartbeatPayload(invalidPayload);
      }).toThrow('Invalid HEARTBEAT payload length');
    });

    it('should throw error for 1-byte payload', () => {
      expect(() => {
        decodeHeartbeatPayload(new Uint8Array(1));
      }).toThrow('Invalid HEARTBEAT payload length');
    });

    it('should decode all MAV_STATE values', () => {
      const states = [
        MAV_STATE.UNINIT,
        MAV_STATE.BOOT,
        MAV_STATE.STANDBY,
        MAV_STATE.RUN,
        MAV_STATE.ERROR,
        MAV_STATE.SHUTDOWN,
      ];

      for (const state of states) {
        const payload = new Uint8Array([state, 3]);
        const decoded = decodeHeartbeatPayload(payload);
        expect(decoded.systemStatus).toBe(state);
      }
    });
  });

  describe('Helper Functions', () => {
    it('createPcHeartbeat should create valid PC heartbeat', () => {
      const frame = createPcHeartbeat(5, 255, 0);

      expect(frame[0]).toBe(0xFD);   // STX
      expect(frame[1]).toBe(2);      // LEN = 2
      expect(frame[4]).toBe(5);      // SEQ
      expect(frame[5]).toBe(255);    // SYSID
      expect(frame[6]).toBe(0);      // COMPID

      // Decode payload
      const payload = frame.subarray(10, 12);
      const decoded = decodeHeartbeatPayload(payload);

      expect(decoded.systemStatus).toBe(MAV_STATE.RUN);
      expect(decoded.mavlinkVersion).toBe(MAVLINK_VERSION);
    });

    it('createPcHeartbeat should use default sysid/compid', () => {
      const frame = createPcHeartbeat(0);

      expect(frame[5]).toBe(255);    // Default SYSID for PC
      expect(frame[6]).toBe(0);      // Default COMPID
    });

    it('createChargerHeartbeat should create valid charger heartbeat', () => {
      const frame = createChargerHeartbeat(10, 1, 1, MAV_STATE.STANDBY);

      expect(frame[0]).toBe(0xFD);   // STX
      expect(frame[4]).toBe(10);     // SEQ
      expect(frame[5]).toBe(1);      // SYSID
      expect(frame[6]).toBe(1);      // COMPID

      // Decode payload
      const payload = frame.subarray(10, 12);
      const decoded = decodeHeartbeatPayload(payload);

      expect(decoded.systemStatus).toBe(MAV_STATE.STANDBY);
      expect(decoded.mavlinkVersion).toBe(MAVLINK_VERSION);
    });

    it('createChargerHeartbeat should use default sysid/compid/status', () => {
      const frame = createChargerHeartbeat(0);

      expect(frame[5]).toBe(1);      // Default SYSID for charger
      expect(frame[6]).toBe(1);      // Default COMPID

      const payload = frame.subarray(10, 12);
      const decoded = decodeHeartbeatPayload(payload);

      expect(decoded.systemStatus).toBe(MAV_STATE.RUN); // Default status
    });
  });

  describe('Round-trip Encoding/Decoding', () => {
    it('should preserve data through encode-decode cycle', () => {
      const original = {
        systemStatus: MAV_STATE.SHUTDOWN,
        mavlinkVersion: MAVLINK_VERSION,
      };

      const frame = encodeHeartbeat({
        sysid: 1,
        compid: 0,
        seq: 0,
        ...original,
      });

      const payload = frame.subarray(10, 12);
      const decoded = decodeHeartbeatPayload(payload);

      expect(decoded).toEqual(original);
    });
  });

  describe('Frame Structure Validation', () => {
    it('should have correct frame structure', () => {
      const frame = createPcHeartbeat(0);

      // STX
      expect(frame[0]).toBe(0xFD);

      // Header fields
      expect(frame[1]).toBe(2);    // LEN = 2
      expect(frame[2]).toBe(0);    // INC_FLAGS
      expect(frame[3]).toBe(0);    // CMP_FLAGS

      // Message ID should be 0 for HEARTBEAT
      const msgid = frame[7] | (frame[8] << 8) | (frame[9] << 16);
      expect(msgid).toBe(MAVLINK_MSG_ID_HEARTBEAT);

      // CRC should be last 2 bytes
      const crcOffset = frame.length - 2;
      const crc = frame[crcOffset] | (frame[crcOffset + 1] << 8);
      expect(crc).toBeGreaterThan(0);
    });

    it('should match PROTOCOL.md wire format example', () => {
      // PC HEARTBEAT: SEQ=0, SYSID=255, COMPID=0, status=RUN(3), version=3
      // Expected CRC: 0x6A19 (CRC_L=0x19, CRC_H=0x6A)
      const frame = createPcHeartbeat(0, 255, 0);

      expect(Array.from(frame)).toEqual([
        0xFD, 0x02, 0x00, 0x00, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00,
        0x03, 0x03,
        0x19, 0x6A
      ]);
    });
  });
});
