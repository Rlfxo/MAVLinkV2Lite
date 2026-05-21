/**
 * MAVLink V2 Lite Message Encoder Unit Tests
 *
 * Verifies the V2 Lite wire format: STX=0xFC, 7-byte header (no INCOMPAT/COMPAT).
 * Frame layout: STX(1) + LEN(1) + SEQ(1) + SYSID(1) + COMPID(1) + MSGID(3) + PAYLOAD(n) + CRC(2)
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
  SYSID_CHARGER,
  SYSID_APP_TESTER,
  COMPID_ALL,
} from '../../electron/protocol/constants';
import { MAVLinkParser } from '../../electron/protocol/parser';

describe('MAVLink V2 Lite Encoder', () => {
  describe('encodeMavlink - Generic Encoder', () => {
    it('should encode a message with empty payload', () => {
      const frame = encodeMavlink(1, 0, 0, 0, new Uint8Array(0));

      // Frame should be: STX(1) + Header(7) + Payload(0) + CRC(2) = 10 bytes
      expect(frame.length).toBe(10);
      expect(frame[0]).toBe(0xFC); // STX
      expect(frame[1]).toBe(0);    // LEN = 0
    });

    it('should encode a message with small payload', () => {
      const payload = new Uint8Array([0x01, 0x02, 0x03]);
      const frame = encodeMavlink(1, 0, 5, 100, payload);

      // Frame should be: STX(1) + Header(7) + Payload(3) + CRC(2) = 13 bytes
      expect(frame.length).toBe(13);
      expect(frame[0]).toBe(0xFC);  // STX
      expect(frame[1]).toBe(3);     // LEN = 3
      expect(frame[2]).toBe(5);     // SEQ = 5
      expect(frame[3]).toBe(1);     // SYSID = 1
      expect(frame[4]).toBe(0);     // COMPID = 0
      expect(frame[5]).toBe(100);   // MSGID low = 100

      // Payload
      expect(frame[8]).toBe(0x01);
      expect(frame[9]).toBe(0x02);
      expect(frame[10]).toBe(0x03);
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

      // Extract msgid from frame (now at offsets 5..7)
      const extractedMsgid = frame[5] | (frame[6] << 8) | (frame[7] << 16);
      expect(extractedMsgid).toBe(msgid);
    });
  });

  describe('encodeHeartbeat - HEARTBEAT Encoder', () => {
    it('should encode 2-byte HEARTBEAT payload', () => {
      const frame = encodeHeartbeat({
        sysid: SYSID_APP_TESTER,
        compid: COMPID_ALL,
        seq: 0,
        systemStatus: MAV_STATE.RUN,
        mavlinkVersion: MAVLINK_VERSION,
      });

      // STX(1) + Header(7) + Payload(2) + CRC(2) = 12 bytes
      expect(frame.length).toBe(12);
      expect(frame[0]).toBe(0xFC);            // STX
      expect(frame[1]).toBe(2);               // LEN = 2
      expect(frame[3]).toBe(SYSID_APP_TESTER); // SYSID = 201 (App Tester)
      expect(frame[4]).toBe(COMPID_ALL);       // COMPID = 0 (ALL)

      // MSG_ID = 0 (HEARTBEAT)
      expect(frame[5]).toBe(0);
      expect(frame[6]).toBe(0);
      expect(frame[7]).toBe(0);

      // Payload (2 bytes)
      expect(frame[8]).toBe(MAV_STATE.RUN);      // system_status
      expect(frame[9]).toBe(MAVLINK_VERSION);    // mavlink_version
    });

    it('should encode charger HEARTBEAT with SYSID=1', () => {
      const frame = encodeHeartbeat({
        sysid: 1,
        compid: 0,
        seq: 0,
        systemStatus: MAV_STATE.RUN,
        mavlinkVersion: 3,
      });

      expect(frame.length).toBe(12);
      expect(frame[3]).toBe(1);   // SYSID = 1
      expect(frame[4]).toBe(0);   // COMPID = 0
      expect(frame[8]).toBe(MAV_STATE.RUN);
      expect(frame[9]).toBe(3);
    });

    it('should handle sequence number wraparound', () => {
      const frame = encodeHeartbeat({
        sysid: 1,
        compid: 0,
        seq: 255,
        systemStatus: MAV_STATE.RUN,
        mavlinkVersion: MAVLINK_VERSION,
      });

      expect(frame[2]).toBe(255); // SEQ = 255
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
      const frame = createPcHeartbeat(5, SYSID_APP_TESTER, COMPID_ALL);

      expect(frame[0]).toBe(0xFC);            // STX
      expect(frame[1]).toBe(2);               // LEN = 2
      expect(frame[2]).toBe(5);               // SEQ
      expect(frame[3]).toBe(SYSID_APP_TESTER);    // SYSID
      expect(frame[4]).toBe(COMPID_ALL); // COMPID

      // Decode payload
      const payload = frame.subarray(8, 10);
      const decoded = decodeHeartbeatPayload(payload);

      expect(decoded.systemStatus).toBe(MAV_STATE.RUN);
      expect(decoded.mavlinkVersion).toBe(MAVLINK_VERSION);
    });

    it('createPcHeartbeat should use default sysid/compid', () => {
      const frame = createPcHeartbeat(0);

      expect(frame[3]).toBe(SYSID_APP_TESTER); // Default SYSID for App Tester = 201
      expect(frame[4]).toBe(COMPID_ALL);       // Default COMPID = 0 (ALL)
    });

    it('createChargerHeartbeat should create valid charger heartbeat', () => {
      const frame = createChargerHeartbeat(10, SYSID_CHARGER, COMPID_ALL, MAV_STATE.STANDBY);

      expect(frame[0]).toBe(0xFC);            // STX
      expect(frame[2]).toBe(10);              // SEQ
      expect(frame[3]).toBe(SYSID_CHARGER);   // SYSID = 1
      expect(frame[4]).toBe(COMPID_ALL); // COMPID

      // Decode payload
      const payload = frame.subarray(8, 10);
      const decoded = decodeHeartbeatPayload(payload);

      expect(decoded.systemStatus).toBe(MAV_STATE.STANDBY);
      expect(decoded.mavlinkVersion).toBe(MAVLINK_VERSION);
    });

    it('createChargerHeartbeat should use default sysid/compid/status', () => {
      const frame = createChargerHeartbeat(0);

      expect(frame[3]).toBe(SYSID_CHARGER);      // Default SYSID for charger = 1
      expect(frame[4]).toBe(COMPID_ALL); // Default COMPID = 0

      const payload = frame.subarray(8, 10);
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

      const payload = frame.subarray(8, 10);
      const decoded = decodeHeartbeatPayload(payload);

      expect(decoded).toEqual(original);
    });

    it('encoded HEARTBEAT frame should round-trip through MAVLinkParser', () => {
      // Validates that encoder output, including CRC, is accepted by the parser.
      const frame = createPcHeartbeat(7, SYSID_APP_TESTER, COMPID_ALL);
      const parser = new MAVLinkParser();
      const messages = parser.parseBuffer(frame);

      expect(messages).toHaveLength(1);
      const m = messages[0];
      expect(m.seq).toBe(7);
      expect(m.sysid).toBe(SYSID_APP_TESTER);
      expect(m.compid).toBe(COMPID_ALL);
      expect(m.msgid).toBe(MAVLINK_MSG_ID_HEARTBEAT);
      const decoded = decodeHeartbeatPayload(m.payload);
      expect(decoded.systemStatus).toBe(MAV_STATE.RUN);
      expect(decoded.mavlinkVersion).toBe(MAVLINK_VERSION);
    });
  });

  describe('Frame Structure Validation', () => {
    it('should have correct frame structure', () => {
      const frame = createPcHeartbeat(0);

      // STX
      expect(frame[0]).toBe(0xFC);

      // Header fields (no INCOMPAT/COMPAT bytes in V2 Lite)
      expect(frame[1]).toBe(2);    // LEN = 2

      // Message ID should be 0 for HEARTBEAT (offsets 5..7)
      const msgid = frame[5] | (frame[6] << 8) | (frame[7] << 16);
      expect(msgid).toBe(MAVLINK_MSG_ID_HEARTBEAT);

      // CRC should be last 2 bytes
      const crcOffset = frame.length - 2;
      const crc = frame[crcOffset] | (frame[crcOffset + 1] << 8);
      expect(crc).toBeGreaterThan(0);
    });
  });
});
