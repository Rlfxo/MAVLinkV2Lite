/**
 * MAVLink Message Encoder Unit Tests
 *
 * Tests the encoder implementation against Python reference frames
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
  MAV_TYPE,
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
    it('should match Python reference frame exactly', () => {
      // Python reference frame (from test_mavlink_protocol.py):
      // FD 09 00 00 00 01 01 00 00 00 00 00 00 00 1F 00 00 04 03 D8 68
      const pythonFrame = new Uint8Array([
        0xFD, 0x09, 0x00, 0x00, 0x00, 0x01, 0x01, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x04, 0x03, 0xD8, 0x68
      ]);

      const frame = encodeHeartbeat({
        sysid: 1,
        compid: 1,
        seq: 0,
        customMode: 0,
        type: 31, // MAV_TYPE_CHARGING_STATION
        autopilot: 0,
        baseMode: 0,
        systemStatus: 4, // MAV_STATE_ACTIVE
        mavlinkVersion: 3,
      });

      // Frame should match Python output byte-for-byte
      expect(frame.length).toBe(pythonFrame.length);
      expect(Array.from(frame)).toEqual(Array.from(pythonFrame));
    });

    it('should encode PC heartbeat correctly', () => {
      const frame = encodeHeartbeat({
        sysid: 255,
        compid: 0,
        seq: 0,
        type: MAV_TYPE.GCS,
        systemStatus: MAV_STATE.ACTIVE,
        mavlinkVersion: MAVLINK_VERSION,
      });

      expect(frame.length).toBe(21); // STX(1) + Header(9) + Payload(9) + CRC(2)
      expect(frame[0]).toBe(0xFD);   // STX
      expect(frame[1]).toBe(9);      // LEN = 9
      expect(frame[5]).toBe(255);    // SYSID = 255
      expect(frame[6]).toBe(0);      // COMPID = 0

      // MSG_ID = 0 (HEARTBEAT)
      expect(frame[7]).toBe(0);
      expect(frame[8]).toBe(0);
      expect(frame[9]).toBe(0);

      // Payload should be 9 bytes
      const payload = frame.subarray(10, 19);
      expect(payload.length).toBe(9);
    });

    it('should use default values for optional parameters', () => {
      const frame = encodeHeartbeat({
        sysid: 1,
        compid: 0,
        seq: 0,
        type: MAV_TYPE.GCS,
        systemStatus: MAV_STATE.ACTIVE,
        mavlinkVersion: MAVLINK_VERSION,
      });

      // Decode payload to check defaults
      const payload = frame.subarray(10, 19);
      const decoded = decodeHeartbeatPayload(payload);

      expect(decoded.customMode).toBe(0);
      expect(decoded.autopilot).toBe(0);
      expect(decoded.baseMode).toBe(0);
    });

    it('should handle sequence number wraparound', () => {
      const frame = encodeHeartbeat({
        sysid: 1,
        compid: 0,
        seq: 255,
        type: MAV_TYPE.GCS,
        systemStatus: MAV_STATE.ACTIVE,
        mavlinkVersion: MAVLINK_VERSION,
      });

      expect(frame[4]).toBe(255); // SEQ = 255
    });
  });

  describe('decodeHeartbeatPayload', () => {
    it('should decode HEARTBEAT payload correctly', () => {
      // Create and encode a heartbeat
      const frame = encodeHeartbeat({
        sysid: 1,
        compid: 1,
        seq: 0,
        customMode: 12345,
        type: 31,
        autopilot: 8,
        baseMode: 5,
        systemStatus: 4,
        mavlinkVersion: 3,
      });

      // Extract and decode payload
      const payload = frame.subarray(10, 19);
      const decoded = decodeHeartbeatPayload(payload);

      expect(decoded.customMode).toBe(12345);
      expect(decoded.type).toBe(31);
      expect(decoded.autopilot).toBe(8);
      expect(decoded.baseMode).toBe(5);
      expect(decoded.systemStatus).toBe(4);
      expect(decoded.mavlinkVersion).toBe(3);
    });

    it('should throw error for invalid payload length', () => {
      const invalidPayload = new Uint8Array(8); // Should be 9
      expect(() => {
        decodeHeartbeatPayload(invalidPayload);
      }).toThrow('Invalid HEARTBEAT payload length');
    });

    it('should handle little-endian uint32 correctly', () => {
      // custom_mode = 0x12345678 (305419896 decimal)
      const frame = encodeHeartbeat({
        sysid: 1,
        compid: 0,
        seq: 0,
        customMode: 0x12345678,
        type: MAV_TYPE.GCS,
        systemStatus: MAV_STATE.ACTIVE,
        mavlinkVersion: MAVLINK_VERSION,
      });

      const payload = frame.subarray(10, 19);
      const decoded = decodeHeartbeatPayload(payload);

      expect(decoded.customMode).toBe(0x12345678);

      // Check little-endian byte order in payload
      expect(payload[0]).toBe(0x78); // Low byte
      expect(payload[1]).toBe(0x56);
      expect(payload[2]).toBe(0x34);
      expect(payload[3]).toBe(0x12); // High byte
    });
  });

  describe('Helper Functions', () => {
    it('createPcHeartbeat should create valid PC heartbeat', () => {
      const frame = createPcHeartbeat(5, 255, 0);

      expect(frame[0]).toBe(0xFD);   // STX
      expect(frame[4]).toBe(5);      // SEQ
      expect(frame[5]).toBe(255);    // SYSID
      expect(frame[6]).toBe(0);      // COMPID

      // Decode payload
      const payload = frame.subarray(10, 19);
      const decoded = decodeHeartbeatPayload(payload);

      expect(decoded.type).toBe(MAV_TYPE.GCS);
      expect(decoded.systemStatus).toBe(MAV_STATE.ACTIVE);
      expect(decoded.mavlinkVersion).toBe(MAVLINK_VERSION);
    });

    it('createPcHeartbeat should use default sysid/compid', () => {
      const frame = createPcHeartbeat(0);

      expect(frame[5]).toBe(255);    // Default SYSID for PC
      expect(frame[6]).toBe(0);      // Default COMPID
    });

    it('createChargerHeartbeat should create valid charger heartbeat', () => {
      const frame = createChargerHeartbeat(10, 1, 0, MAV_STATE.STANDBY);

      expect(frame[0]).toBe(0xFD);   // STX
      expect(frame[4]).toBe(10);     // SEQ
      expect(frame[5]).toBe(1);      // SYSID
      expect(frame[6]).toBe(0);      // COMPID

      // Decode payload
      const payload = frame.subarray(10, 19);
      const decoded = decodeHeartbeatPayload(payload);

      expect(decoded.type).toBe(MAV_TYPE.CHARGING_STATION);
      expect(decoded.systemStatus).toBe(MAV_STATE.STANDBY);
      expect(decoded.mavlinkVersion).toBe(MAVLINK_VERSION);
    });

    it('createChargerHeartbeat should use default sysid/compid/status', () => {
      const frame = createChargerHeartbeat(0);

      expect(frame[5]).toBe(1);      // Default SYSID for charger
      expect(frame[6]).toBe(0);      // Default COMPID

      const payload = frame.subarray(10, 19);
      const decoded = decodeHeartbeatPayload(payload);

      expect(decoded.systemStatus).toBe(MAV_STATE.ACTIVE); // Default status
    });
  });

  describe('Round-trip Encoding/Decoding', () => {
    it('should preserve data through encode-decode cycle', () => {
      const original = {
        customMode: 999,
        type: MAV_TYPE.CHARGING_STATION,
        autopilot: 5,
        baseMode: 3,
        systemStatus: MAV_STATE.CALIBRATING,
        mavlinkVersion: MAVLINK_VERSION,
      };

      const frame = encodeHeartbeat({
        sysid: 1,
        compid: 0,
        seq: 0,
        ...original,
      });

      const payload = frame.subarray(10, 19);
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
      expect(frame[1]).toBeGreaterThanOrEqual(0);  // LEN
      expect(frame[1]).toBeLessThanOrEqual(255);
      expect(frame[2]).toBe(0);  // INC_FLAGS
      expect(frame[3]).toBe(0);  // CMP_FLAGS

      // Message ID should be 0 for HEARTBEAT
      const msgid = frame[7] | (frame[8] << 8) | (frame[9] << 16);
      expect(msgid).toBe(MAVLINK_MSG_ID_HEARTBEAT);

      // CRC should be last 2 bytes
      const crcOffset = frame.length - 2;
      const crc = frame[crcOffset] | (frame[crcOffset + 1] << 8);
      expect(crc).toBeGreaterThan(0);
    });
  });
});
