/**
 * CHARGER_COMMAND & COMMAND_ACK Encoder/Decoder Unit Tests
 *
 * Tests encode/decode for:
 * - CHARGER_COMMAND (MSG_ID: 10100, 7 B payload — uuid + max_power_kW + command)
 * - COMMAND_ACK     (MSG_ID: 10102, 5 B payload — uuid + result)
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
// CHARGER_COMMAND (MSG_ID: 10100, 7 B)
// ============================================================================

const sampleCommand: ChargerCommandPayload = {
  uuid: 0x12345678,
  maxPowerKw: 150,
  command: 1, // DISCHARGE
};

describe('CHARGER_COMMAND Encoder/Decoder (V2 Lite, 7 B)', () => {
  describe('Frame Structure', () => {
    it('should produce correct frame length (STX+7+7+CRC=17)', () => {
      const frame = encodeChargerCommand({ sysid: 201, compid: 0, seq: 0, ...sampleCommand });
      expect(frame.length).toBe(17);
    });

    it('should have correct STX, LEN, and MSG_ID', () => {
      const frame = encodeChargerCommand({ sysid: 201, compid: 0, seq: 0, ...sampleCommand });
      expect(frame[0]).toBe(0xFC);
      expect(frame[1]).toBe(7);
      const msgid = frame[5] | (frame[6] << 8) | (frame[7] << 16);
      expect(msgid).toBe(MAVLINK_MSG_ID_CHARGER_COMMAND);
    });
  });

  describe('Round-trip Encoding/Decoding', () => {
    it('should preserve data through encode → payload-slice → decode', () => {
      const frame = encodeChargerCommand({ sysid: 201, compid: 0, seq: 0, ...sampleCommand });
      const payload = frame.subarray(8, 8 + 7);
      const decoded = decodeChargerCommandPayload(payload);
      expect(decoded).toEqual(sampleCommand);
    });

    it('should handle uuid=0 (sentinel)', () => {
      const p: ChargerCommandPayload = { uuid: 0, maxPowerKw: 0, command: 0 };
      const frame = encodeChargerCommand({ sysid: 201, compid: 0, seq: 0, ...p });
      const decoded = decodeChargerCommandPayload(frame.subarray(8, 15));
      expect(decoded).toEqual(p);
    });
  });

  describe('Invalid Payload Length', () => {
    it('should throw on too-short payload', () => {
      expect(() => decodeChargerCommandPayload(new Uint8Array(6))).toThrow(
        'Invalid CHARGER_COMMAND payload length: 6 (expected 7)',
      );
    });

    it('should throw on too-long payload', () => {
      expect(() => decodeChargerCommandPayload(new Uint8Array(8))).toThrow(
        'Invalid CHARGER_COMMAND payload length: 8 (expected 7)',
      );
    });
  });

  describe('Boundary Values', () => {
    it('should handle u32 max for uuid', () => {
      const p: ChargerCommandPayload = { uuid: 0xFFFFFFFF, maxPowerKw: 0, command: 0 };
      const frame = encodeChargerCommand({ sysid: 201, compid: 0, seq: 0, ...p });
      const decoded = decodeChargerCommandPayload(frame.subarray(8, 15));
      expect(decoded.uuid).toBe(0xFFFFFFFF);
    });

    it('should handle u16 max for maxPowerKw', () => {
      const p: ChargerCommandPayload = { uuid: 1, maxPowerKw: 0xFFFF, command: 0 };
      const frame = encodeChargerCommand({ sysid: 201, compid: 0, seq: 0, ...p });
      const decoded = decodeChargerCommandPayload(frame.subarray(8, 15));
      expect(decoded.maxPowerKw).toBe(0xFFFF);
    });
  });

  describe('Little-Endian Byte Order', () => {
    it('should write uuid in LE at payload offset 0..3', () => {
      const p: ChargerCommandPayload = { uuid: 0xDEADBEEF, maxPowerKw: 0, command: 0 };
      const frame = encodeChargerCommand({ sysid: 201, compid: 0, seq: 0, ...p });
      // payload starts at offset 8 (V2 Lite)
      expect(frame[8 + 0]).toBe(0xEF);
      expect(frame[8 + 1]).toBe(0xBE);
      expect(frame[8 + 2]).toBe(0xAD);
      expect(frame[8 + 3]).toBe(0xDE);
    });

    it('should write maxPowerKw in LE at payload offset 4..5', () => {
      const p: ChargerCommandPayload = { uuid: 0, maxPowerKw: 0x1234, command: 0 };
      const frame = encodeChargerCommand({ sysid: 201, compid: 0, seq: 0, ...p });
      expect(frame[8 + 4]).toBe(0x34);
      expect(frame[8 + 5]).toBe(0x12);
    });
  });

  describe('Parser Round-trip', () => {
    let parser: MAVLinkParser;
    beforeEach(() => {
      parser = new MAVLinkParser();
    });

    it('should encode → parse → decode successfully', () => {
      const frame = encodeChargerCommand({ sysid: 201, compid: 0, seq: 42, ...sampleCommand });
      const messages = parser.parseBuffer(frame);

      expect(messages.length).toBe(1);
      expect(messages[0].msgid).toBe(MAVLINK_MSG_ID_CHARGER_COMMAND);
      expect(messages[0].sysid).toBe(201);
      expect(messages[0].seq).toBe(42);
      expect(messages[0].payload.length).toBe(7);

      const decoded = decodeChargerCommandPayload(messages[0].payload);
      expect(decoded).toEqual(sampleCommand);
    });
  });
});

// ============================================================================
// COMMAND_ACK (MSG_ID: 10102, 5 B)
// ============================================================================

const sampleAck: CommandAckPayload = {
  uuid: 0x12345678,
  result: 0, // ACCEPTED
};

describe('COMMAND_ACK Encoder/Decoder (V2 Lite, 5 B)', () => {
  describe('Frame Structure', () => {
    it('should produce correct frame length (STX+7+5+CRC=15)', () => {
      const frame = encodeCommandAck({ sysid: 1, compid: 1, seq: 0, ...sampleAck });
      expect(frame.length).toBe(15);
    });

    it('should have correct STX, LEN, and MSG_ID', () => {
      const frame = encodeCommandAck({ sysid: 1, compid: 1, seq: 0, ...sampleAck });
      expect(frame[0]).toBe(0xFC);
      expect(frame[1]).toBe(5);
      const msgid = frame[5] | (frame[6] << 8) | (frame[7] << 16);
      expect(msgid).toBe(MAVLINK_MSG_ID_COMMAND_ACK);
    });
  });

  describe('Round-trip Encoding/Decoding', () => {
    it('should preserve data through encode → payload-slice → decode', () => {
      const frame = encodeCommandAck({ sysid: 1, compid: 1, seq: 0, ...sampleAck });
      const decoded = decodeCommandAckPayload(frame.subarray(8, 8 + 5));
      expect(decoded).toEqual(sampleAck);
    });

    it('should round-trip all result codes', () => {
      for (const result of [0, 1, 2, 3]) {
        const p: CommandAckPayload = { uuid: 0xAA55AA55, result };
        const frame = encodeCommandAck({ sysid: 1, compid: 1, seq: 0, ...p });
        const decoded = decodeCommandAckPayload(frame.subarray(8, 13));
        expect(decoded.result).toBe(result);
        expect(decoded.uuid).toBe(0xAA55AA55);
      }
    });
  });

  describe('Invalid Payload Length', () => {
    it('should throw on too-short payload', () => {
      expect(() => decodeCommandAckPayload(new Uint8Array(4))).toThrow(
        'Invalid COMMAND_ACK payload length: 4 (expected 5)',
      );
    });

    it('should throw on too-long payload', () => {
      expect(() => decodeCommandAckPayload(new Uint8Array(6))).toThrow(
        'Invalid COMMAND_ACK payload length: 6 (expected 5)',
      );
    });
  });

  describe('Little-Endian Byte Order', () => {
    it('should write uuid in LE at payload offset 0..3', () => {
      const p: CommandAckPayload = { uuid: 0xDEADBEEF, result: 0 };
      const frame = encodeCommandAck({ sysid: 1, compid: 1, seq: 0, ...p });
      expect(frame[8 + 0]).toBe(0xEF);
      expect(frame[8 + 1]).toBe(0xBE);
      expect(frame[8 + 2]).toBe(0xAD);
      expect(frame[8 + 3]).toBe(0xDE);
    });
  });

  describe('Parser Round-trip', () => {
    let parser: MAVLinkParser;
    beforeEach(() => {
      parser = new MAVLinkParser();
    });

    it('should encode → parse → decode successfully', () => {
      const frame = encodeCommandAck({ sysid: 1, compid: 1, seq: 7, ...sampleAck });
      const messages = parser.parseBuffer(frame);

      expect(messages.length).toBe(1);
      expect(messages[0].msgid).toBe(MAVLINK_MSG_ID_COMMAND_ACK);
      expect(messages[0].sysid).toBe(1);
      expect(messages[0].seq).toBe(7);
      expect(messages[0].payload.length).toBe(5);

      const decoded = decodeCommandAckPayload(messages[0].payload);
      expect(decoded).toEqual(sampleAck);
    });
  });
});
