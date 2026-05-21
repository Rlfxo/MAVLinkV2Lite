/**
 * CONFIG_REQUEST & CONFIG_RESPONSE Encoder/Decoder Unit Tests
 *
 * Tests encode/decode for:
 * - CONFIG_REQUEST (MSG_ID: 10200, 0 bytes payload)
 * - CONFIG_RESPONSE (MSG_ID: 10201, 36 bytes payload)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  encodeConfigRequest,
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
// CONFIG_REQUEST (MSG_ID: 10200)
// ============================================================================

describe('CONFIG_REQUEST Encoder', () => {
  describe('Frame Structure', () => {
    it('should produce correct frame length (STX+7+0+CRC=10)', () => {
      const frame = encodeConfigRequest({ sysid: 255, compid: 0, seq: 0 });
      expect(frame.length).toBe(10);
    });

    it('should have correct STX, LEN, and MSG_ID', () => {
      const frame = encodeConfigRequest({ sysid: 255, compid: 0, seq: 5 });
      expect(frame[0]).toBe(0xFC);       // STX (V2 Lite)
      expect(frame[1]).toBe(0);          // LEN = 0
      const msgid = frame[5] | (frame[6] << 8) | (frame[7] << 16);
      expect(msgid).toBe(MAVLINK_MSG_ID_CONFIG_REQUEST);
    });
  });

  describe('Parser Round-trip', () => {
    let parser: MAVLinkParser;

    beforeEach(() => {
      parser = new MAVLinkParser();
    });

    it('should encode → parse successfully', () => {
      const frame = encodeConfigRequest({ sysid: 255, compid: 0, seq: 10 });
      const messages = parser.parseBuffer(frame);

      expect(messages.length).toBe(1);
      expect(messages[0].msgid).toBe(MAVLINK_MSG_ID_CONFIG_REQUEST);
      expect(messages[0].sysid).toBe(255);
      expect(messages[0].seq).toBe(10);
      expect(messages[0].payload.length).toBe(0);
    });
  });
});

// ============================================================================
// CONFIG_RESPONSE (MSG_ID: 10201)
// ============================================================================

const sampleResponse: ConfigResponsePayload = {
  fwVersion: 0x00010203,   // 1.2.3
  hwVersion: 0x00020000,   // 2.0.0
  modelName: 'EVAR-DC-50kW',
  buildDate: '202602101430',
};

describe('CONFIG_RESPONSE Encoder/Decoder', () => {
  describe('Frame Structure', () => {
    it('should produce correct frame length (STX+7+36+CRC=46)', () => {
      const frame = encodeConfigResponse({ sysid: 1, compid: 0, seq: 0, ...sampleResponse });
      expect(frame.length).toBe(46);
    });

    it('should have correct STX, LEN, and MSG_ID', () => {
      const frame = encodeConfigResponse({ sysid: 1, compid: 0, seq: 0, ...sampleResponse });
      expect(frame[0]).toBe(0xFC);       // STX (V2 Lite)
      expect(frame[1]).toBe(36);         // LEN = 36
      const msgid = frame[5] | (frame[6] << 8) | (frame[7] << 16);
      expect(msgid).toBe(MAVLINK_MSG_ID_CONFIG_RESPONSE);
    });
  });

  describe('Round-trip Encoding/Decoding', () => {
    it('should preserve data through encode → payload-slice → decode', () => {
      const frame = encodeConfigResponse({ sysid: 1, compid: 0, seq: 0, ...sampleResponse });
      const payload = frame.subarray(8, 8 + 36);
      const decoded = decodeConfigResponsePayload(payload);
      expect(decoded).toEqual(sampleResponse);
    });

    it('should handle empty model name', () => {
      const resp: ConfigResponsePayload = { ...sampleResponse, modelName: '' };
      const frame = encodeConfigResponse({ sysid: 1, compid: 0, seq: 0, ...resp });
      const decoded = decodeConfigResponsePayload(frame.subarray(8, 44));
      expect(decoded.modelName).toBe('');
    });

    it('should handle max-length model name (15 chars + null)', () => {
      const resp: ConfigResponsePayload = { ...sampleResponse, modelName: '123456789012345' };
      const frame = encodeConfigResponse({ sysid: 1, compid: 0, seq: 0, ...resp });
      const decoded = decodeConfigResponsePayload(frame.subarray(8, 44));
      expect(decoded.modelName).toBe('123456789012345');
    });
  });

  describe('Invalid Payload Length', () => {
    it('should throw on too-short payload', () => {
      expect(() => decodeConfigResponsePayload(new Uint8Array(35))).toThrow(
        'Invalid CONFIG_RESPONSE payload length: 35 (expected 36)'
      );
    });

    it('should throw on too-long payload', () => {
      expect(() => decodeConfigResponsePayload(new Uint8Array(37))).toThrow(
        'Invalid CONFIG_RESPONSE payload length: 37 (expected 36)'
      );
    });
  });

  describe('Boundary Values', () => {
    it('should handle uint32 max (0xFFFFFFFF) for fwVersion', () => {
      const resp: ConfigResponsePayload = { ...sampleResponse, fwVersion: 0xFFFFFFFF };
      const frame = encodeConfigResponse({ sysid: 1, compid: 0, seq: 0, ...resp });
      const decoded = decodeConfigResponsePayload(frame.subarray(8, 44));
      expect(decoded.fwVersion).toBe(0xFFFFFFFF);
    });

    it('should handle uint32 max (0xFFFFFFFF) for hwVersion', () => {
      const resp: ConfigResponsePayload = { ...sampleResponse, hwVersion: 0xFFFFFFFF };
      const frame = encodeConfigResponse({ sysid: 1, compid: 0, seq: 0, ...resp });
      const decoded = decodeConfigResponsePayload(frame.subarray(8, 44));
      expect(decoded.hwVersion).toBe(0xFFFFFFFF);
    });
  });

  describe('String Encoding & Null-termination', () => {
    it('should null-terminate model_name', () => {
      const resp: ConfigResponsePayload = { ...sampleResponse, modelName: 'ABC' };
      const frame = encodeConfigResponse({ sysid: 1, compid: 0, seq: 0, ...resp });
      // V2 Lite: payload starts at offset 8, model_name at payload offset 8 → frame offset 16
      expect(frame[16]).toBe(0x41); // 'A'
      expect(frame[17]).toBe(0x42); // 'B'
      expect(frame[18]).toBe(0x43); // 'C'
      expect(frame[19]).toBe(0x00); // null
    });

    it('should truncate model_name longer than 15 chars', () => {
      const longName = 'ABCDEFGHIJKLMNOP'; // 16 chars
      const resp: ConfigResponsePayload = { ...sampleResponse, modelName: longName };
      const frame = encodeConfigResponse({ sysid: 1, compid: 0, seq: 0, ...resp });
      const decoded = decodeConfigResponsePayload(frame.subarray(8, 44));
      expect(decoded.modelName).toBe('ABCDEFGHIJKLMNO'); // 15 chars
    });
  });

  describe('Little-Endian Byte Order', () => {
    it('should write fwVersion in LE at offset 0', () => {
      const resp: ConfigResponsePayload = { ...sampleResponse, fwVersion: 0x00010203 };
      const frame = encodeConfigResponse({ sysid: 1, compid: 0, seq: 0, ...resp });
      // V2 Lite: payload starts at offset 8
      expect(frame[8]).toBe(0x03);  // low byte
      expect(frame[9]).toBe(0x02);
      expect(frame[10]).toBe(0x01);
      expect(frame[11]).toBe(0x00); // high byte
    });
  });

  describe('Parser Round-trip', () => {
    let parser: MAVLinkParser;

    beforeEach(() => {
      parser = new MAVLinkParser();
    });

    it('should encode → parse → decode successfully', () => {
      const frame = encodeConfigResponse({ sysid: 1, compid: 0, seq: 3, ...sampleResponse });
      const messages = parser.parseBuffer(frame);

      expect(messages.length).toBe(1);
      expect(messages[0].msgid).toBe(MAVLINK_MSG_ID_CONFIG_RESPONSE);
      expect(messages[0].sysid).toBe(1);
      expect(messages[0].seq).toBe(3);
      expect(messages[0].payload.length).toBe(36);

      const decoded = decodeConfigResponsePayload(messages[0].payload);
      expect(decoded).toEqual(sampleResponse);
    });
  });
});
