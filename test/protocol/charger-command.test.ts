/**
 * CHARGER_COMMAND & COMMAND_ACK Encoder/Decoder Unit Tests
 *
 * Tests encode/decode for:
 * - CHARGER_COMMAND (MSG_ID: 10100, 3 bytes payload)
 * - COMMAND_ACK (MSG_ID: 10102, 3 bytes payload)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  encodeChargerCommand,
  decodeChargerCommandPayload,
  encodeCommandAck,
  decodeCommandAckPayload,
} from '../../electron/protocol/encoder';
import { MAVLinkParser } from '../../electron/protocol/parser';
import {
  MAVLINK_MSG_ID_CHARGER_COMMAND,
  MAVLINK_MSG_ID_COMMAND_ACK,
} from '../../electron/protocol/constants';
import type { ChargerCommandPayload, CommandAckPayload } from '../../electron/protocol/types';

// ============================================================================
// CHARGER_COMMAND (MSG_ID: 10100)
// ============================================================================

const sampleCommand: ChargerCommandPayload = {
  maxPowerKw: 150,
  command: 1, // DISCHARGE
};

describe('CHARGER_COMMAND Encoder/Decoder', () => {
  describe('Frame Structure', () => {
    it('should produce correct frame length (STX+9+3+CRC=15)', () => {
      const frame = encodeChargerCommand({ sysid: 255, compid: 0, seq: 0, ...sampleCommand });
      expect(frame.length).toBe(15);
    });

    it('should have correct STX, LEN, and MSG_ID', () => {
      const frame = encodeChargerCommand({ sysid: 255, compid: 0, seq: 0, ...sampleCommand });
      expect(frame[0]).toBe(0xFD);       // STX
      expect(frame[1]).toBe(3);          // LEN = 3
      const msgid = frame[7] | (frame[8] << 8) | (frame[9] << 16);
      expect(msgid).toBe(MAVLINK_MSG_ID_CHARGER_COMMAND);
    });
  });

  describe('Round-trip Encoding/Decoding', () => {
    it('should preserve data through encode → payload-slice → decode', () => {
      const frame = encodeChargerCommand({ sysid: 255, compid: 0, seq: 0, ...sampleCommand });
      const payload = frame.subarray(10, 10 + 3);
      const decoded = decodeChargerCommandPayload(payload);
      expect(decoded).toEqual(sampleCommand);
    });

    it('should handle all-zero payload', () => {
      const zeros: ChargerCommandPayload = { maxPowerKw: 0, command: 0 };
      const frame = encodeChargerCommand({ sysid: 255, compid: 0, seq: 0, ...zeros });
      const decoded = decodeChargerCommandPayload(frame.subarray(10, 13));
      expect(decoded).toEqual(zeros);
    });
  });

  describe('Invalid Payload Length', () => {
    it('should throw on too-short payload', () => {
      expect(() => decodeChargerCommandPayload(new Uint8Array(2))).toThrow(
        'Invalid CHARGER_COMMAND payload length: 2 (expected 3)'
      );
    });

    it('should throw on too-long payload', () => {
      expect(() => decodeChargerCommandPayload(new Uint8Array(4))).toThrow(
        'Invalid CHARGER_COMMAND payload length: 4 (expected 3)'
      );
    });
  });

  describe('Boundary Values', () => {
    it('should handle uint8 max (255) for command', () => {
      const p: ChargerCommandPayload = { maxPowerKw: 0, command: 255 };
      const frame = encodeChargerCommand({ sysid: 255, compid: 0, seq: 0, ...p });
      const decoded = decodeChargerCommandPayload(frame.subarray(10, 13));
      expect(decoded.command).toBe(255);
    });

    it('should handle uint16 max (65535) for maxPowerKw', () => {
      const p: ChargerCommandPayload = { maxPowerKw: 0xFFFF, command: 0 };
      const frame = encodeChargerCommand({ sysid: 255, compid: 0, seq: 0, ...p });
      const decoded = decodeChargerCommandPayload(frame.subarray(10, 13));
      expect(decoded.maxPowerKw).toBe(0xFFFF);
    });
  });

  describe('Little-Endian Byte Order', () => {
    it('should write maxPowerKw in LE at offset 0', () => {
      const p: ChargerCommandPayload = { maxPowerKw: 0x1234, command: 0 };
      const frame = encodeChargerCommand({ sysid: 255, compid: 0, seq: 0, ...p });
      // payload starts at offset 10
      expect(frame[10 + 0]).toBe(0x34); // low byte
      expect(frame[10 + 1]).toBe(0x12); // high byte
    });
  });

  describe('Parser Round-trip', () => {
    let parser: MAVLinkParser;

    beforeEach(() => {
      parser = new MAVLinkParser();
    });

    it('should encode → parse → decode successfully', () => {
      const frame = encodeChargerCommand({ sysid: 255, compid: 0, seq: 42, ...sampleCommand });
      const messages = parser.parseBuffer(frame);

      expect(messages.length).toBe(1);
      expect(messages[0].msgid).toBe(MAVLINK_MSG_ID_CHARGER_COMMAND);
      expect(messages[0].sysid).toBe(255);
      expect(messages[0].seq).toBe(42);
      expect(messages[0].payload.length).toBe(3);

      const decoded = decodeChargerCommandPayload(messages[0].payload);
      expect(decoded).toEqual(sampleCommand);
    });
  });
});

// ============================================================================
// COMMAND_ACK (MSG_ID: 10102)
// ============================================================================

const sampleAck: CommandAckPayload = {
  targetMsgId: 10100,
  result: 0, // ACCEPTED
};

describe('COMMAND_ACK Encoder/Decoder', () => {
  describe('Frame Structure', () => {
    it('should produce correct frame length (STX+9+3+CRC=15)', () => {
      const frame = encodeCommandAck({ sysid: 1, compid: 0, seq: 0, ...sampleAck });
      expect(frame.length).toBe(15);
    });

    it('should have correct STX, LEN, and MSG_ID', () => {
      const frame = encodeCommandAck({ sysid: 1, compid: 0, seq: 0, ...sampleAck });
      expect(frame[0]).toBe(0xFD);       // STX
      expect(frame[1]).toBe(3);          // LEN = 3
      const msgid = frame[7] | (frame[8] << 8) | (frame[9] << 16);
      expect(msgid).toBe(MAVLINK_MSG_ID_COMMAND_ACK);
    });
  });

  describe('Round-trip Encoding/Decoding', () => {
    it('should preserve data through encode → payload-slice → decode', () => {
      const frame = encodeCommandAck({ sysid: 1, compid: 0, seq: 0, ...sampleAck });
      const payload = frame.subarray(10, 10 + 3);
      const decoded = decodeCommandAckPayload(payload);
      expect(decoded).toEqual(sampleAck);
    });

    it('should handle all result codes', () => {
      for (const result of [0, 1, 2, 3]) {
        const ack: CommandAckPayload = { targetMsgId: 10100, result };
        const frame = encodeCommandAck({ sysid: 1, compid: 0, seq: 0, ...ack });
        const decoded = decodeCommandAckPayload(frame.subarray(10, 13));
        expect(decoded.result).toBe(result);
      }
    });
  });

  describe('Invalid Payload Length', () => {
    it('should throw on too-short payload', () => {
      expect(() => decodeCommandAckPayload(new Uint8Array(2))).toThrow(
        'Invalid COMMAND_ACK payload length: 2 (expected 3)'
      );
    });

    it('should throw on too-long payload', () => {
      expect(() => decodeCommandAckPayload(new Uint8Array(4))).toThrow(
        'Invalid COMMAND_ACK payload length: 4 (expected 3)'
      );
    });
  });

  describe('Boundary Values', () => {
    it('should handle uint8 max (255) for result', () => {
      const p: CommandAckPayload = { targetMsgId: 0, result: 255 };
      const frame = encodeCommandAck({ sysid: 1, compid: 0, seq: 0, ...p });
      const decoded = decodeCommandAckPayload(frame.subarray(10, 13));
      expect(decoded.result).toBe(255);
    });

    it('should handle uint16 max (65535) for targetMsgId', () => {
      const p: CommandAckPayload = { targetMsgId: 0xFFFF, result: 0 };
      const frame = encodeCommandAck({ sysid: 1, compid: 0, seq: 0, ...p });
      const decoded = decodeCommandAckPayload(frame.subarray(10, 13));
      expect(decoded.targetMsgId).toBe(0xFFFF);
    });
  });

  describe('Little-Endian Byte Order', () => {
    it('should write targetMsgId in LE at offset 0', () => {
      const p: CommandAckPayload = { targetMsgId: 0x2774, result: 0 }; // 10100 = 0x2774
      const frame = encodeCommandAck({ sysid: 1, compid: 0, seq: 0, ...p });
      expect(frame[10 + 0]).toBe(0x74); // low byte
      expect(frame[10 + 1]).toBe(0x27); // high byte
    });
  });

  describe('Parser Round-trip', () => {
    let parser: MAVLinkParser;

    beforeEach(() => {
      parser = new MAVLinkParser();
    });

    it('should encode → parse → decode successfully', () => {
      const frame = encodeCommandAck({ sysid: 1, compid: 0, seq: 7, ...sampleAck });
      const messages = parser.parseBuffer(frame);

      expect(messages.length).toBe(1);
      expect(messages[0].msgid).toBe(MAVLINK_MSG_ID_COMMAND_ACK);
      expect(messages[0].sysid).toBe(1);
      expect(messages[0].seq).toBe(7);
      expect(messages[0].payload.length).toBe(3);

      const decoded = decodeCommandAckPayload(messages[0].payload);
      expect(decoded).toEqual(sampleAck);
    });
  });
});
