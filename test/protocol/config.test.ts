/**
 * CONFIG_REQUEST & CONFIG_RESPONSE Encoder/Decoder Unit Tests
 *
 * Tests encode/decode for:
 * - CONFIG_REQUEST  (MSG_ID: 10200,  4 B — uuid)
 * - CONFIG_RESPONSE (MSG_ID: 10201, 40 B — uuid + fw_version + hw_version + model_name + build_date)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  encodeConfigRequest,
  decodeConfigRequestPayload,
  encodeConfigResponse,
  decodeConfigResponsePayload,
} from '../../electron/protocol/encoder';
import { MAVLinkParser } from '../../electron/protocol/parser';
import {
  MAVLINK_MSG_ID_CONFIG_REQUEST,
  MAVLINK_MSG_ID_CONFIG_RESPONSE,
} from '../../electron/protocol/constants';
import type { ConfigResponsePayload } from '../../electron/protocol/types';

// ============================================================================
// CONFIG_REQUEST (MSG_ID: 10200, 4 B)
// ============================================================================

describe('CONFIG_REQUEST Encoder (V2 Lite, 4 B)', () => {
  describe('Frame Structure', () => {
    it('should produce correct frame length (STX+7+4+CRC=14)', () => {
      const frame = encodeConfigRequest({ sysid: 201, compid: 0, seq: 0, uuid: 1 });
      expect(frame.length).toBe(14);
    });

    it('should have correct STX, LEN, and MSG_ID', () => {
      const frame = encodeConfigRequest({ sysid: 201, compid: 0, seq: 5, uuid: 1 });
      expect(frame[0]).toBe(0xFC);
      expect(frame[1]).toBe(4);
      const msgid = frame[5] | (frame[6] << 8) | (frame[7] << 16);
      expect(msgid).toBe(MAVLINK_MSG_ID_CONFIG_REQUEST);
    });

    it('should encode uuid in LE at payload offset 0..3', () => {
      const frame = encodeConfigRequest({ sysid: 201, compid: 0, seq: 0, uuid: 0xCAFEBABE });
      expect(frame[8 + 0]).toBe(0xBE);
      expect(frame[8 + 1]).toBe(0xBA);
      expect(frame[8 + 2]).toBe(0xFE);
      expect(frame[8 + 3]).toBe(0xCA);
    });
  });

  describe('Round-trip', () => {
    it('should decode uuid', () => {
      const frame = encodeConfigRequest({ sysid: 201, compid: 0, seq: 0, uuid: 0x12345678 });
      const decoded = decodeConfigRequestPayload(frame.subarray(8, 8 + 4));
      expect(decoded.uuid).toBe(0x12345678);
    });
  });

  describe('Invalid Payload Length', () => {
    it('should throw on wrong length', () => {
      expect(() => decodeConfigRequestPayload(new Uint8Array(3))).toThrow(
        'Invalid CONFIG_REQUEST payload length: 3 (expected 4)',
      );
      expect(() => decodeConfigRequestPayload(new Uint8Array(5))).toThrow(
        'Invalid CONFIG_REQUEST payload length: 5 (expected 4)',
      );
    });
  });

  describe('Parser Round-trip', () => {
    it('should encode → parse successfully', () => {
      const parser = new MAVLinkParser();
      const frame = encodeConfigRequest({ sysid: 201, compid: 0, seq: 10, uuid: 42 });
      const messages = parser.parseBuffer(frame);

      expect(messages.length).toBe(1);
      expect(messages[0].msgid).toBe(MAVLINK_MSG_ID_CONFIG_REQUEST);
      expect(messages[0].sysid).toBe(201);
      expect(messages[0].seq).toBe(10);
      expect(messages[0].payload.length).toBe(4);
      expect(decodeConfigRequestPayload(messages[0].payload).uuid).toBe(42);
    });
  });
});

// ============================================================================
// CONFIG_RESPONSE (MSG_ID: 10201, 40 B)
// ============================================================================

const sampleResponse: ConfigResponsePayload = {
  uuid: 0xAABBCCDD,
  fwVersion: 0x00010203,   // 1.2.3
  hwVersion: 0x00020000,   // 2.0.0
  modelName: 'DURASLIM',
  buildDate: '202602101430',
};

describe('CONFIG_RESPONSE Encoder/Decoder (V2 Lite, 40 B)', () => {
  describe('Frame Structure', () => {
    it('should produce correct frame length (STX+7+40+CRC=50)', () => {
      const frame = encodeConfigResponse({ sysid: 1, compid: 1, seq: 0, ...sampleResponse });
      expect(frame.length).toBe(50);
    });

    it('should have correct STX, LEN, and MSG_ID', () => {
      const frame = encodeConfigResponse({ sysid: 1, compid: 1, seq: 0, ...sampleResponse });
      expect(frame[0]).toBe(0xFC);
      expect(frame[1]).toBe(40);
      const msgid = frame[5] | (frame[6] << 8) | (frame[7] << 16);
      expect(msgid).toBe(MAVLINK_MSG_ID_CONFIG_RESPONSE);
    });
  });

  describe('Round-trip Encoding/Decoding', () => {
    it('should preserve data through encode → payload-slice → decode', () => {
      const frame = encodeConfigResponse({ sysid: 1, compid: 1, seq: 0, ...sampleResponse });
      const decoded = decodeConfigResponsePayload(frame.subarray(8, 8 + 40));
      expect(decoded).toEqual(sampleResponse);
    });

    it('should handle empty model name', () => {
      const resp: ConfigResponsePayload = { ...sampleResponse, modelName: '' };
      const frame = encodeConfigResponse({ sysid: 1, compid: 1, seq: 0, ...resp });
      const decoded = decodeConfigResponsePayload(frame.subarray(8, 48));
      expect(decoded.modelName).toBe('');
    });

    it('should handle max-length model name (15 chars + null)', () => {
      const resp: ConfigResponsePayload = { ...sampleResponse, modelName: '123456789012345' };
      const frame = encodeConfigResponse({ sysid: 1, compid: 1, seq: 0, ...resp });
      const decoded = decodeConfigResponsePayload(frame.subarray(8, 48));
      expect(decoded.modelName).toBe('123456789012345');
    });
  });

  describe('Invalid Payload Length', () => {
    it('should throw on too-short payload', () => {
      expect(() => decodeConfigResponsePayload(new Uint8Array(39))).toThrow(
        'Invalid CONFIG_RESPONSE payload length: 39 (expected 40)',
      );
    });

    it('should throw on too-long payload', () => {
      expect(() => decodeConfigResponsePayload(new Uint8Array(41))).toThrow(
        'Invalid CONFIG_RESPONSE payload length: 41 (expected 40)',
      );
    });
  });

  describe('Boundary Values', () => {
    it('should handle u32 max for uuid', () => {
      const resp: ConfigResponsePayload = { ...sampleResponse, uuid: 0xFFFFFFFF };
      const frame = encodeConfigResponse({ sysid: 1, compid: 1, seq: 0, ...resp });
      const decoded = decodeConfigResponsePayload(frame.subarray(8, 48));
      expect(decoded.uuid).toBe(0xFFFFFFFF);
    });

    it('should handle u32 max for fwVersion', () => {
      const resp: ConfigResponsePayload = { ...sampleResponse, fwVersion: 0xFFFFFFFF };
      const frame = encodeConfigResponse({ sysid: 1, compid: 1, seq: 0, ...resp });
      const decoded = decodeConfigResponsePayload(frame.subarray(8, 48));
      expect(decoded.fwVersion).toBe(0xFFFFFFFF);
    });

    it('should handle u32 max for hwVersion', () => {
      const resp: ConfigResponsePayload = { ...sampleResponse, hwVersion: 0xFFFFFFFF };
      const frame = encodeConfigResponse({ sysid: 1, compid: 1, seq: 0, ...resp });
      const decoded = decodeConfigResponsePayload(frame.subarray(8, 48));
      expect(decoded.hwVersion).toBe(0xFFFFFFFF);
    });
  });

  describe('String Encoding & Null-termination', () => {
    it('should null-terminate model_name at payload offset 12', () => {
      const resp: ConfigResponsePayload = { ...sampleResponse, modelName: 'ABC' };
      const frame = encodeConfigResponse({ sysid: 1, compid: 1, seq: 0, ...resp });
      // payload starts at frame offset 8; model_name at payload offset 12 → frame offset 20
      expect(frame[20]).toBe(0x41); // 'A'
      expect(frame[21]).toBe(0x42); // 'B'
      expect(frame[22]).toBe(0x43); // 'C'
      expect(frame[23]).toBe(0x00); // null
    });

    it('should truncate model_name longer than 15 chars', () => {
      const resp: ConfigResponsePayload = { ...sampleResponse, modelName: 'ABCDEFGHIJKLMNOP' };
      const frame = encodeConfigResponse({ sysid: 1, compid: 1, seq: 0, ...resp });
      const decoded = decodeConfigResponsePayload(frame.subarray(8, 48));
      expect(decoded.modelName).toBe('ABCDEFGHIJKLMNO'); // 15 chars
    });
  });

  describe('Little-Endian Byte Order', () => {
    it('should write uuid in LE at payload offset 0..3', () => {
      const resp: ConfigResponsePayload = { ...sampleResponse, uuid: 0xDEADBEEF };
      const frame = encodeConfigResponse({ sysid: 1, compid: 1, seq: 0, ...resp });
      expect(frame[8 + 0]).toBe(0xEF);
      expect(frame[8 + 1]).toBe(0xBE);
      expect(frame[8 + 2]).toBe(0xAD);
      expect(frame[8 + 3]).toBe(0xDE);
    });

    it('should write fwVersion in LE at payload offset 4..7', () => {
      const resp: ConfigResponsePayload = { ...sampleResponse, fwVersion: 0x00010203 };
      const frame = encodeConfigResponse({ sysid: 1, compid: 1, seq: 0, ...resp });
      expect(frame[8 + 4]).toBe(0x03);
      expect(frame[8 + 5]).toBe(0x02);
      expect(frame[8 + 6]).toBe(0x01);
      expect(frame[8 + 7]).toBe(0x00);
    });
  });

  describe('Parser Round-trip', () => {
    let parser: MAVLinkParser;
    beforeEach(() => {
      parser = new MAVLinkParser();
    });

    it('should encode → parse → decode successfully', () => {
      const frame = encodeConfigResponse({ sysid: 1, compid: 1, seq: 3, ...sampleResponse });
      const messages = parser.parseBuffer(frame);

      expect(messages.length).toBe(1);
      expect(messages[0].msgid).toBe(MAVLINK_MSG_ID_CONFIG_RESPONSE);
      expect(messages[0].sysid).toBe(1);
      expect(messages[0].seq).toBe(3);
      expect(messages[0].payload.length).toBe(40);

      const decoded = decodeConfigResponsePayload(messages[0].payload);
      expect(decoded).toEqual(sampleResponse);
    });
  });
});
