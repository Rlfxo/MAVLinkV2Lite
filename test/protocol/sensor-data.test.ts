/**
 * SENSOR_DATA Encoder/Decoder Unit Tests
 *
 * Tests encode/decode for SENSOR_DATA (MSG_ID: 10002, 52 bytes payload).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  encodeSensorData,
  decodeSensorDataPayload,
} from '../../electron/protocol/encoder';
import { MAVLinkParser } from '../../electron/protocol/parser';
import { MAVLINK_MSG_ID_SENSOR_DATA } from '../../electron/protocol/constants';
import type { SensorDataPayload } from '../../electron/protocol/types';

const samplePayload: SensorDataPayload = {
  temperatureC: 25.5,
  humidityPct: 60.0,
  accelXMps2: 0.1,
  accelYMps2: -0.2,
  accelZMps2: 9.81,
  gyroXDps: 0.5,
  gyroYDps: -1.0,
  gyroZDps: 0.0,
  dcgfFault: 0,
  dcgfVolt1: 48000,
  dcgfVolt2: 48100,
  meterVoltage: 220000,
  meterCurrent: 30000,
  meterEnergy: 1500,
  imdStopMode: 0,
  reserved: 0,
};

describe('SENSOR_DATA Encoder/Decoder', () => {
  describe('Frame Structure', () => {
    it('should produce correct frame length (STX+9+52+CRC=64)', () => {
      const frame = encodeSensorData({ sysid: 1, compid: 0, seq: 0, ...samplePayload });
      expect(frame.length).toBe(64);
    });

    it('should have correct STX, LEN, and MSG_ID', () => {
      const frame = encodeSensorData({ sysid: 1, compid: 0, seq: 0, ...samplePayload });
      expect(frame[0]).toBe(0xFD);       // STX
      expect(frame[1]).toBe(52);         // LEN = 52
      const msgid = frame[7] | (frame[8] << 8) | (frame[9] << 16);
      expect(msgid).toBe(MAVLINK_MSG_ID_SENSOR_DATA);
    });
  });

  describe('Round-trip Encoding/Decoding', () => {
    it('should preserve data through encode → payload-slice → decode', () => {
      const frame = encodeSensorData({ sysid: 1, compid: 0, seq: 0, ...samplePayload });
      const payload = frame.subarray(10, 10 + 52);
      const decoded = decodeSensorDataPayload(payload);

      // float comparison with tolerance
      expect(decoded.temperatureC).toBeCloseTo(samplePayload.temperatureC, 5);
      expect(decoded.humidityPct).toBeCloseTo(samplePayload.humidityPct, 5);
      expect(decoded.accelXMps2).toBeCloseTo(samplePayload.accelXMps2, 5);
      expect(decoded.accelYMps2).toBeCloseTo(samplePayload.accelYMps2, 5);
      expect(decoded.accelZMps2).toBeCloseTo(samplePayload.accelZMps2, 5);
      expect(decoded.gyroXDps).toBeCloseTo(samplePayload.gyroXDps, 5);
      expect(decoded.gyroYDps).toBeCloseTo(samplePayload.gyroYDps, 5);
      expect(decoded.gyroZDps).toBeCloseTo(samplePayload.gyroZDps, 5);

      // integer fields exact
      expect(decoded.dcgfFault).toBe(samplePayload.dcgfFault);
      expect(decoded.dcgfVolt1).toBe(samplePayload.dcgfVolt1);
      expect(decoded.dcgfVolt2).toBe(samplePayload.dcgfVolt2);
      expect(decoded.meterVoltage).toBe(samplePayload.meterVoltage);
      expect(decoded.meterCurrent).toBe(samplePayload.meterCurrent);
      expect(decoded.meterEnergy).toBe(samplePayload.meterEnergy);
      expect(decoded.imdStopMode).toBe(samplePayload.imdStopMode);
      expect(decoded.reserved).toBe(samplePayload.reserved);
    });

    it('should handle all-zero payload', () => {
      const zeros: SensorDataPayload = {
        temperatureC: 0, humidityPct: 0,
        accelXMps2: 0, accelYMps2: 0, accelZMps2: 0,
        gyroXDps: 0, gyroYDps: 0, gyroZDps: 0,
        dcgfFault: 0, dcgfVolt1: 0, dcgfVolt2: 0,
        meterVoltage: 0, meterCurrent: 0, meterEnergy: 0,
        imdStopMode: 0, reserved: 0,
      };
      const frame = encodeSensorData({ sysid: 1, compid: 0, seq: 0, ...zeros });
      const decoded = decodeSensorDataPayload(frame.subarray(10, 62));
      expect(decoded).toEqual(zeros);
    });
  });

  describe('Invalid Payload Length', () => {
    it('should throw on too-short payload', () => {
      expect(() => decodeSensorDataPayload(new Uint8Array(51))).toThrow(
        'Invalid SENSOR_DATA payload length: 51 (expected 52)'
      );
    });

    it('should throw on too-long payload', () => {
      expect(() => decodeSensorDataPayload(new Uint8Array(53))).toThrow(
        'Invalid SENSOR_DATA payload length: 53 (expected 52)'
      );
    });
  });

  describe('Boundary Values', () => {
    it('should handle uint16 max (65535) for dcgf fields', () => {
      const p = { ...samplePayload, dcgfFault: 0xFFFF, dcgfVolt1: 0xFFFF, dcgfVolt2: 0xFFFF };
      const frame = encodeSensorData({ sysid: 1, compid: 0, seq: 0, ...p });
      const decoded = decodeSensorDataPayload(frame.subarray(10, 62));
      expect(decoded.dcgfFault).toBe(0xFFFF);
      expect(decoded.dcgfVolt1).toBe(0xFFFF);
      expect(decoded.dcgfVolt2).toBe(0xFFFF);
    });

    it('should handle uint32 max for meter fields', () => {
      const p = {
        ...samplePayload,
        meterVoltage: 0xFFFFFFFF,
        meterCurrent: 0xFFFFFFFF,
        meterEnergy: 0xFFFFFFFF,
      };
      const frame = encodeSensorData({ sysid: 1, compid: 0, seq: 0, ...p });
      const decoded = decodeSensorDataPayload(frame.subarray(10, 62));
      expect(decoded.meterVoltage).toBe(0xFFFFFFFF);
      expect(decoded.meterCurrent).toBe(0xFFFFFFFF);
      expect(decoded.meterEnergy).toBe(0xFFFFFFFF);
    });

    it('should handle negative float values', () => {
      const p = {
        ...samplePayload,
        temperatureC: -40.0,
        accelXMps2: -9.81,
        gyroZDps: -500.0,
      };
      const frame = encodeSensorData({ sysid: 1, compid: 0, seq: 0, ...p });
      const decoded = decodeSensorDataPayload(frame.subarray(10, 62));
      expect(decoded.temperatureC).toBeCloseTo(-40.0, 5);
      expect(decoded.accelXMps2).toBeCloseTo(-9.81, 5);
      expect(decoded.gyroZDps).toBeCloseTo(-500.0, 5);
    });

    it('should handle float special values (Infinity, -Infinity)', () => {
      const p = { ...samplePayload, temperatureC: Infinity, humidityPct: -Infinity };
      const frame = encodeSensorData({ sysid: 1, compid: 0, seq: 0, ...p });
      const decoded = decodeSensorDataPayload(frame.subarray(10, 62));
      expect(decoded.temperatureC).toBe(Infinity);
      expect(decoded.humidityPct).toBe(-Infinity);
    });

    it('should handle float NaN', () => {
      const p = { ...samplePayload, temperatureC: NaN };
      const frame = encodeSensorData({ sysid: 1, compid: 0, seq: 0, ...p });
      const decoded = decodeSensorDataPayload(frame.subarray(10, 62));
      expect(decoded.temperatureC).toBeNaN();
    });
  });

  describe('Little-Endian Byte Order', () => {
    it('should write dcgfVolt1 in LE at payload offset 34', () => {
      const p = { ...samplePayload, dcgfVolt1: 0xABCD };
      const frame = encodeSensorData({ sysid: 1, compid: 0, seq: 0, ...p });
      expect(frame[10 + 34]).toBe(0xCD); // low byte
      expect(frame[10 + 35]).toBe(0xAB); // high byte
    });

    it('should write meterVoltage in LE at payload offset 38', () => {
      const p = { ...samplePayload, meterVoltage: 0x12345678 };
      const frame = encodeSensorData({ sysid: 1, compid: 0, seq: 0, ...p });
      expect(frame[10 + 38]).toBe(0x78);
      expect(frame[10 + 39]).toBe(0x56);
      expect(frame[10 + 40]).toBe(0x34);
      expect(frame[10 + 41]).toBe(0x12);
    });

    it('should write temperatureC as LE float32 at payload offset 0', () => {
      const p = { ...samplePayload, temperatureC: 25.5 };
      const frame = encodeSensorData({ sysid: 1, compid: 0, seq: 0, ...p });
      // 25.5f = 0x41CC0000 in IEEE 754
      const payloadSlice = frame.subarray(10, 14);
      const dv = new DataView(payloadSlice.buffer, payloadSlice.byteOffset, 4);
      expect(dv.getFloat32(0, true)).toBeCloseTo(25.5, 5);
    });
  });

  describe('Parser Round-trip', () => {
    let parser: MAVLinkParser;

    beforeEach(() => {
      parser = new MAVLinkParser();
    });

    it('should encode → parse → decode successfully', () => {
      const frame = encodeSensorData({ sysid: 1, compid: 0, seq: 99, ...samplePayload });
      const messages = parser.parseBuffer(frame);

      expect(messages.length).toBe(1);
      expect(messages[0].msgid).toBe(MAVLINK_MSG_ID_SENSOR_DATA);
      expect(messages[0].sysid).toBe(1);
      expect(messages[0].seq).toBe(99);
      expect(messages[0].payload.length).toBe(52);

      const decoded = decodeSensorDataPayload(messages[0].payload);
      expect(decoded.temperatureC).toBeCloseTo(samplePayload.temperatureC, 5);
      expect(decoded.meterVoltage).toBe(samplePayload.meterVoltage);
    });
  });
});
