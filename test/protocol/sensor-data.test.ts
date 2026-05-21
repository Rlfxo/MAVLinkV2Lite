/**
 * SENSOR_DATA Encoder/Decoder Unit Tests
 *
 * Tests encode/decode for SENSOR_DATA (MSG_ID: 10002, 53 B).
 * Layout: 8 × fixed_t (temp/humidity/accelXYZ/gyroXYZ) + dcgf_fault(u16)
 *         + 2 × fixed_t (dcgf_volt1/2) + imd_stop_mode(u8) = 53 B
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  encodeSensorData,
  decodeSensorDataPayload,
  fixedToFloat,
} from '../../electron/protocol/encoder';
import { MAVLinkParser } from '../../electron/protocol/parser';
import { MAVLINK_MSG_ID_SENSOR_DATA } from '../../electron/protocol/constants';
import type { SensorDataPayload, FixedT } from '../../electron/protocol/types';

const ft = (value: number, exp: number): FixedT => ({ value, exp });

// Sample: 25.5°C, 60.0%, gravity on Z, no rotation, no DCGF fault, 48 V lines
const samplePayload: SensorDataPayload = {
  temperature: ft(2550, -2),     // 25.50 °C
  humidity:    ft(6000, -2),     // 60.00 %
  accelX:      ft(0, -3),
  accelY:      ft(0, -3),
  accelZ:      ft(9810, -3),     // 9.810 m/s²
  gyroX:       ft(0, -3),
  gyroY:       ft(0, -3),
  gyroZ:       ft(0, -3),
  dcgfFault:   0,
  dcgfVolt1:   ft(480, -1),      // 48.0 V
  dcgfVolt2:   ft(481, -1),      // 48.1 V
  imdStopMode: 0,
};

describe('SENSOR_DATA Encoder/Decoder (V2 Lite, 53 B)', () => {
  describe('Frame Structure', () => {
    it('should produce correct frame length (STX+7+53+CRC=63)', () => {
      const frame = encodeSensorData({ sysid: 1, compid: 1, seq: 0, ...samplePayload });
      expect(frame.length).toBe(63);
    });

    it('should have correct STX, LEN, and MSG_ID', () => {
      const frame = encodeSensorData({ sysid: 1, compid: 1, seq: 0, ...samplePayload });
      expect(frame[0]).toBe(0xFC);       // STX (V2 Lite)
      expect(frame[1]).toBe(53);         // LEN = 53
      const msgid = frame[5] | (frame[6] << 8) | (frame[7] << 16);
      expect(msgid).toBe(MAVLINK_MSG_ID_SENSOR_DATA);
    });
  });

  describe('Round-trip Encoding/Decoding', () => {
    it('should preserve data through encode → payload-slice → decode', () => {
      const frame = encodeSensorData({ sysid: 1, compid: 1, seq: 0, ...samplePayload });
      const payload = frame.subarray(8, 8 + 53);
      const decoded = decodeSensorDataPayload(payload);
      expect(decoded).toEqual(samplePayload);
    });

    it('should handle all-zero payload', () => {
      const zeros: SensorDataPayload = {
        temperature: ft(0, 0), humidity: ft(0, 0),
        accelX: ft(0, 0), accelY: ft(0, 0), accelZ: ft(0, 0),
        gyroX:  ft(0, 0), gyroY:  ft(0, 0), gyroZ:  ft(0, 0),
        dcgfFault: 0,
        dcgfVolt1: ft(0, 0), dcgfVolt2: ft(0, 0),
        imdStopMode: 0,
      };
      const frame = encodeSensorData({ sysid: 1, compid: 1, seq: 0, ...zeros });
      const decoded = decodeSensorDataPayload(frame.subarray(8, 8 + 53));
      expect(decoded).toEqual(zeros);
    });
  });

  describe('Invalid Payload Length', () => {
    it('should throw on too-short payload', () => {
      expect(() => decodeSensorDataPayload(new Uint8Array(52))).toThrow(
        'Invalid SENSOR_DATA payload length: 52 (expected 53)',
      );
    });

    it('should throw on too-long payload', () => {
      expect(() => decodeSensorDataPayload(new Uint8Array(54))).toThrow(
        'Invalid SENSOR_DATA payload length: 54 (expected 53)',
      );
    });
  });

  describe('FixedT Layout (5 B each: i32 value + i8 exp)', () => {
    it('should write temperature fixed_t at payload offset 0..4', () => {
      const p = { ...samplePayload, temperature: ft(0x12345678, -2) };
      const frame = encodeSensorData({ sysid: 1, compid: 1, seq: 0, ...p });
      // payload starts at offset 8 (V2 Lite)
      expect(frame[8 + 0]).toBe(0x78); // value LE
      expect(frame[8 + 1]).toBe(0x56);
      expect(frame[8 + 2]).toBe(0x34);
      expect(frame[8 + 3]).toBe(0x12);
      expect(frame[8 + 4]).toBe(0xFE); // exp = -2 (two's complement)
    });

    it('should write dcgf_fault u16 at payload offset 40-41', () => {
      const p = { ...samplePayload, dcgfFault: 0xABCD };
      const frame = encodeSensorData({ sysid: 1, compid: 1, seq: 0, ...p });
      expect(frame[8 + 40]).toBe(0xCD);
      expect(frame[8 + 41]).toBe(0xAB);
    });

    it('should write imd_stop_mode at payload offset 52', () => {
      const p = { ...samplePayload, imdStopMode: 0x77 };
      const frame = encodeSensorData({ sysid: 1, compid: 1, seq: 0, ...p });
      expect(frame[8 + 52]).toBe(0x77);
    });
  });

  describe('fixedToFloat helper', () => {
    it('should compute value × 10^exp', () => {
      expect(fixedToFloat(ft(2550, -2))).toBeCloseTo(25.5, 5);
      expect(fixedToFloat(ft(9810, -3))).toBeCloseTo(9.81, 5);
      expect(fixedToFloat(ft(480, -1))).toBeCloseTo(48.0, 5);
      expect(fixedToFloat(ft(0, 0))).toBe(0);
      expect(fixedToFloat(ft(1234, 2))).toBe(123400);
    });

    it('should handle negative values (current/power)', () => {
      expect(fixedToFloat(ft(-1500, -2))).toBeCloseTo(-15.0, 5);
    });
  });

  describe('Boundary Values', () => {
    it('should handle i32 max for fixed_t.value', () => {
      const p = { ...samplePayload, temperature: ft(0x7FFFFFFF, -2) };
      const frame = encodeSensorData({ sysid: 1, compid: 1, seq: 0, ...p });
      const decoded = decodeSensorDataPayload(frame.subarray(8, 8 + 53));
      expect(decoded.temperature.value).toBe(0x7FFFFFFF);
    });

    it('should handle i32 min for fixed_t.value', () => {
      const p = { ...samplePayload, temperature: ft(-0x80000000, -2) };
      const frame = encodeSensorData({ sysid: 1, compid: 1, seq: 0, ...p });
      const decoded = decodeSensorDataPayload(frame.subarray(8, 8 + 53));
      expect(decoded.temperature.value).toBe(-0x80000000);
    });

    it('should handle i8 max/min for fixed_t.exp', () => {
      const pMax = { ...samplePayload, temperature: ft(1, 127) };
      const fMax = encodeSensorData({ sysid: 1, compid: 1, seq: 0, ...pMax });
      expect(decodeSensorDataPayload(fMax.subarray(8, 8 + 53)).temperature.exp).toBe(127);

      const pMin = { ...samplePayload, temperature: ft(1, -128) };
      const fMin = encodeSensorData({ sysid: 1, compid: 1, seq: 0, ...pMin });
      expect(decodeSensorDataPayload(fMin.subarray(8, 8 + 53)).temperature.exp).toBe(-128);
    });
  });

  describe('Parser Round-trip', () => {
    let parser: MAVLinkParser;
    beforeEach(() => {
      parser = new MAVLinkParser();
    });

    it('should encode → parse → decode successfully', () => {
      const frame = encodeSensorData({ sysid: 1, compid: 1, seq: 99, ...samplePayload });
      const messages = parser.parseBuffer(frame);

      expect(messages.length).toBe(1);
      expect(messages[0].msgid).toBe(MAVLINK_MSG_ID_SENSOR_DATA);
      expect(messages[0].seq).toBe(99);
      expect(messages[0].payload.length).toBe(53);

      const decoded = decodeSensorDataPayload(messages[0].payload);
      expect(decoded).toEqual(samplePayload);
      // Sanity: derived physical values
      expect(fixedToFloat(decoded.temperature)).toBeCloseTo(25.5, 5);
      expect(fixedToFloat(decoded.accelZ)).toBeCloseTo(9.81, 5);
      expect(fixedToFloat(decoded.dcgfVolt1)).toBeCloseTo(48.0, 5);
    });
  });
});
