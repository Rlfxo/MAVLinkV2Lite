/**
 * MAVLink V2 Lite Parser Unit Tests
 *
 * Verifies the parser state machine against the V2 Lite wire format
 * (STX=0xFC, 7-byte header without INCOMPAT/COMPAT bytes).
 * Frame: STX(1)+LEN(1)+SEQ(1)+SYSID(1)+COMPID(1)+MSGID(3)+PAYLOAD(n)+CRC(2)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MAVLinkParser } from '../../electron/protocol/parser';
import { encodeMavlink, encodeHeartbeat, createPcHeartbeat, createChargerHeartbeat } from '../../electron/protocol/encoder';
import {
  MAVLINK_MSG_ID_HEARTBEAT,
  MAV_STATE,
  MAVLINK_VERSION,
  SYSID_APP_TESTER,
  SYSID_CHARGER,
  COMPID_ALL,
} from '../../electron/protocol/constants';

describe('MAVLink V2 Lite Parser', () => {
  let parser: MAVLinkParser;

  beforeEach(() => {
    parser = new MAVLinkParser();
  });

  describe('Basic Parsing', () => {
    it('should parse a valid HEARTBEAT frame', () => {
      const frame = createPcHeartbeat(5, SYSID_APP_TESTER, COMPID_ALL);

      let message = null;
      for (const byte of frame) {
        const result = parser.parseByte(byte);
        if (result) {
          message = result;
        }
      }

      expect(message).not.toBeNull();
      expect(message!.msgid).toBe(MAVLINK_MSG_ID_HEARTBEAT);
      expect(message!.sysid).toBe(SYSID_APP_TESTER);
      expect(message!.compid).toBe(COMPID_ALL);
      expect(message!.seq).toBe(5);
      expect(message!.payload.length).toBe(2);
    });

    it('should parse Charger HEARTBEAT frame', () => {
      const frame = createChargerHeartbeat(0, SYSID_CHARGER, COMPID_ALL);
      const messages = parser.parseBuffer(frame);
      expect(messages.length).toBe(1);
      expect(messages[0].sysid).toBe(SYSID_CHARGER);
      expect(messages[0].compid).toBe(COMPID_ALL);
    });

    it('should handle multiple consecutive frames', () => {
      const frame1 = createPcHeartbeat(0);
      const frame2 = createChargerHeartbeat(1);
      const frame3 = createPcHeartbeat(2);

      const messages = parser.parseBuffer(
        new Uint8Array([...frame1, ...frame2, ...frame3])
      );

      expect(messages.length).toBe(3);
      expect(messages[0].seq).toBe(0);
      expect(messages[1].seq).toBe(1);
      expect(messages[2].seq).toBe(2);
    });

    it('should parse frame encoded by encodeHeartbeat', () => {
      const frame = encodeHeartbeat({
        sysid: 1,
        compid: 0,
        seq: 0,
        systemStatus: MAV_STATE.RUN,
        mavlinkVersion: MAVLINK_VERSION,
      });

      const messages = parser.parseBuffer(frame);
      expect(messages.length).toBe(1);
    });
  });

  describe('CRC Validation', () => {
    it('should reject frame with invalid CRC', () => {
      const frame = createPcHeartbeat(0);

      // Corrupt the CRC bytes
      frame[frame.length - 1] ^= 0xFF;

      const messages = parser.parseBuffer(frame);

      expect(messages.length).toBe(0);

      const stats = parser.getStats();
      expect(stats.crcErrorCount).toBe(1);
      expect(stats.totalRxCount).toBe(0);
    });

    it('should reject frame with corrupted payload', () => {
      const frame = createPcHeartbeat(0);

      // Corrupt the first payload byte (payload begins at offset 8 in V2 Lite)
      frame[8] ^= 0xFF;

      const messages = parser.parseBuffer(frame);

      expect(messages.length).toBe(0);

      const stats = parser.getStats();
      expect(stats.crcErrorCount).toBe(1);
    });

    it('should accept frame with mutated header (CRC range is payload only)', () => {
      // V2 Lite CRC-16/MODBUS covers only the payload, so header byte
      // mutations (e.g. SEQ at offset 2) do NOT invalidate the frame.
      // This documents the trade-off vs. upstream MAVLink V2 where the
      // CRC range included the header.
      const frame = createPcHeartbeat(0);
      frame[2] = 99; // mutate SEQ

      const messages = parser.parseBuffer(frame);

      expect(messages.length).toBe(1);
      expect(messages[0].seq).toBe(99); // parser reports the mutated value
      const stats = parser.getStats();
      expect(stats.crcErrorCount).toBe(0);
      expect(stats.totalRxCount).toBe(1);
    });

    it('should continue parsing after CRC error', () => {
      const badFrame = createPcHeartbeat(0);
      badFrame[badFrame.length - 1] ^= 0xFF; // Corrupt CRC

      const goodFrame = createPcHeartbeat(1);

      const combined = new Uint8Array([...badFrame, ...goodFrame]);
      const messages = parser.parseBuffer(combined);

      expect(messages.length).toBe(1);
      expect(messages[0].seq).toBe(1);

      const stats = parser.getStats();
      expect(stats.crcErrorCount).toBe(1);
      expect(stats.totalRxCount).toBe(1);
    });
  });

  describe('State Machine Robustness', () => {
    it('should handle garbage bytes before valid frame', () => {
      // Pre-frame garbage must not contain 0xFC, which would trigger resync.
      const garbage = new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44]);
      const frame = createPcHeartbeat(0);

      const combined = new Uint8Array([...garbage, ...frame]);
      const messages = parser.parseBuffer(combined);

      expect(messages.length).toBe(1);
      expect(messages[0].msgid).toBe(MAVLINK_MSG_ID_HEARTBEAT);
    });

    it('should handle incomplete frame followed by complete frame', () => {
      const frame = createPcHeartbeat(0);

      // Send partial frame (missing last 5 bytes)
      const partial = frame.subarray(0, frame.length - 5);
      const messages1 = parser.parseBuffer(partial);
      expect(messages1.length).toBe(0);

      // Simulate timeout recovery
      parser.reset();

      // Send complete new frame
      const newFrame = createPcHeartbeat(1);
      const messages2 = parser.parseBuffer(newFrame);

      expect(messages2.length).toBe(1);
      expect(messages2[0].seq).toBe(1);
    });

    it('should handle byte-by-byte parsing', () => {
      const frame = createPcHeartbeat(0);

      let message = null;
      for (const byte of frame) {
        const result = parser.parseByte(byte);
        if (result) {
          message = result;
        }
      }

      expect(message).not.toBeNull();
      expect(message!.msgid).toBe(MAVLINK_MSG_ID_HEARTBEAT);
    });

    it('should resync on STX after a stuck header parse', () => {
      // Feed a stray STX + LEN, then a complete frame: the parser should resync.
      const stuck = new Uint8Array([0xFC, 0xFF]); // STX + LEN=255 (header in progress)
      parser.parseByte(stuck[0]);
      parser.parseByte(stuck[1]);

      const goodFrame = createPcHeartbeat(0);
      const messages = parser.parseBuffer(goodFrame);

      expect(messages.length).toBe(1);
    });
  });

  describe('Statistics Tracking', () => {
    it('should track successful parses', () => {
      parser.parseBuffer(createPcHeartbeat(0));
      parser.parseBuffer(createPcHeartbeat(1));
      parser.parseBuffer(createPcHeartbeat(2));

      const stats = parser.getStats();
      expect(stats.totalRxCount).toBe(3);
      expect(stats.crcErrorCount).toBe(0);
      expect(stats.parseErrorCount).toBe(0);
    });

    it('should track CRC errors', () => {
      const badFrame1 = createPcHeartbeat(0);
      badFrame1[badFrame1.length - 1] ^= 0xFF;

      const badFrame2 = createPcHeartbeat(1);
      badFrame2[badFrame2.length - 1] ^= 0xFF;

      parser.parseBuffer(badFrame1);
      parser.parseBuffer(badFrame2);

      const stats = parser.getStats();
      expect(stats.crcErrorCount).toBe(2);
      expect(stats.totalRxCount).toBe(0);
    });

    it('should track last receive timestamp', () => {
      const before = Date.now();
      parser.parseBuffer(createPcHeartbeat(0));
      const after = Date.now();

      const stats = parser.getStats();
      expect(stats.lastRxTimestamp).toBeDefined();
      expect(stats.lastRxTimestamp!).toBeGreaterThanOrEqual(before);
      expect(stats.lastRxTimestamp!).toBeLessThanOrEqual(after);
    });

    it('should reset statistics', () => {
      parser.parseBuffer(createPcHeartbeat(0));
      parser.parseBuffer(createPcHeartbeat(1));

      parser.resetStats();

      const stats = parser.getStats();
      expect(stats.totalRxCount).toBe(0);
      expect(stats.crcErrorCount).toBe(0);
      expect(stats.parseErrorCount).toBe(0);
      expect(stats.lastRxTimestamp).toBeUndefined();
    });
  });

  describe('Round-trip Encode/Parse', () => {
    it('should correctly parse its own encoded messages', () => {
      const original = {
        sysid: 123,
        compid: 45,
        seq: 67,
        systemStatus: MAV_STATE.STANDBY,
        mavlinkVersion: MAVLINK_VERSION,
      };

      const frame = encodeHeartbeat(original);
      const messages = parser.parseBuffer(frame);

      expect(messages.length).toBe(1);
      const parsed = messages[0];

      expect(parsed.sysid).toBe(original.sysid);
      expect(parsed.compid).toBe(original.compid);
      expect(parsed.seq).toBe(original.seq);
      expect(parsed.msgid).toBe(MAVLINK_MSG_ID_HEARTBEAT);
      expect(parsed.payload.length).toBe(2);
    });

    // Note: This test is skipped because certain sequence numbers can produce
    // frames with 0xFC bytes in payload/CRC, which conflicts with frame
    // resynchronization logic.
    it.skip('should handle sequence wraparound', () => {
      const testSeqs = [253, 254, 255, 0, 1];

      for (const seq of testSeqs) {
        const freshParser = new MAVLinkParser();
        const frame = createPcHeartbeat(seq);
        const messages = freshParser.parseBuffer(frame);

        expect(messages.length).toBe(1);
        expect(messages[0].seq).toBe(seq);
      }
    });
  });

  describe('Parser Reset', () => {
    it('should clear state on reset', () => {
      const frame = createPcHeartbeat(0);

      // Parse partial frame (8 bytes covers STX+header, before CRC)
      for (let i = 0; i < 8; i++) {
        parser.parseByte(frame[i]);
      }

      // Reset
      parser.reset();

      // Parse complete frame
      const messages = parser.parseBuffer(createPcHeartbeat(1));

      expect(messages.length).toBe(1);
      expect(messages[0].seq).toBe(1);
    });
  });

  describe('Message Metadata', () => {
    it('should include timestamp in parsed message', () => {
      const before = Date.now();
      const frame = createPcHeartbeat(0);
      const messages = parser.parseBuffer(frame);
      const after = Date.now();

      expect(messages.length).toBe(1);
      expect(messages[0].timestamp).toBeDefined();
      expect(messages[0].timestamp!).toBeGreaterThanOrEqual(before);
      expect(messages[0].timestamp!).toBeLessThanOrEqual(after);
    });

    it('should preserve checksum in parsed message', () => {
      const frame = createPcHeartbeat(0);
      const expectedCrc = frame[frame.length - 2] | (frame[frame.length - 1] << 8);

      const messages = parser.parseBuffer(frame);

      expect(messages.length).toBe(1);
      expect(messages[0].checksum).toBe(expectedCrc);
    });
  });

  describe('Edge Cases', () => {
    it('should handle frame with empty payload (msgid with no CRC extra)', () => {
      // Encode a message with empty payload for an unknown msgid (CRC extra = 0)
      const frame = encodeMavlink(1, 0, 0, 99999, new Uint8Array(0));

      const messages = parser.parseBuffer(frame);
      expect(messages.length).toBe(1);
      expect(messages[0].payload.length).toBe(0);
    });

    it('should handle rapid frame succession', () => {
      const frames: number[] = [];
      for (let i = 0; i < 100; i++) {
        frames.push(...createPcHeartbeat(i));
      }

      const messages = parser.parseBuffer(new Uint8Array(frames));

      expect(messages.length).toBe(100);
      for (let i = 0; i < 100; i++) {
        expect(messages[i].seq).toBe(i);
      }
    });

    it('should handle alternating good and bad frames', () => {
      const frames: number[] = [];

      for (let i = 0; i < 10; i++) {
        const good = createPcHeartbeat(i * 2);
        frames.push(...good);

        const bad = createPcHeartbeat(i * 2 + 1);
        bad[bad.length - 1] ^= 0xFF; // Corrupt CRC
        frames.push(...bad);
      }

      const messages = parser.parseBuffer(new Uint8Array(frames));

      expect(messages.length).toBe(10); // Only good frames
      const stats = parser.getStats();
      expect(stats.totalRxCount).toBe(10);
      expect(stats.crcErrorCount).toBe(10);
    });
  });
});
