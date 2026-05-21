/**
 * METER_DATA Encoder/Decoder Unit Tests
 *
 * Tests encode/decode for METER_DATA (MSG_ID: 10003, 50 B).
 * Layout: 10 × fixed_t (5 B each) — total_power/energy + meter1{V/I/P/E}
 *         + meter2{V/I/P/E}. SPM90 exponents: V=-1, I=-2, P=0, E=+1.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  encodeMeterData,
  decodeMeterDataPayload,
  fixedToFloat,
} from '../../electron/protocol/encoder';
import { MAVLinkParser } from '../../electron/protocol/parser';
import { MAVLINK_MSG_ID_METER_DATA } from '../../electron/protocol/constants';
import type { MeterDataPayload, FixedT } from '../../electron/protocol/types';

const ft = (value: number, exp: number): FixedT => ({ value, exp });

// Sample DURA reading: 400 V, 100 A on meter1; 400 V, 50 A on meter2
//   meter1: V=400.0  (4000, -1)  I=100.00 (10000, -2)  P=40000W  E=12345 (1234, +1) Wh
//   meter2: V=400.0  (4000, -1)  I= 50.00 ( 5000, -2)  P=20000W  E= 6789 ( 679, +1) Wh
//   total : P=60000W  E≈19120Wh (1912, +1)
const sampleDura: MeterDataPayload = {
  totalPower:    ft(60000, 0),
  totalEnergy:   ft(1912, 1),
  meter1Voltage: ft(4000, -1),
  meter1Current: ft(10000, -2),
  meter1Power:   ft(40000, 0),
  meter1Energy:  ft(1234, 1),
  meter2Voltage: ft(4000, -1),
  meter2Current: ft(5000, -2),
  meter2Power:   ft(20000, 0),
  meter2Energy:  ft(679, 1),
};

// MOOEV reading: only meter1; meter2 fields zero-valued sentinel
const sampleMooev: MeterDataPayload = {
  totalPower:    ft(40000, 0),
  totalEnergy:   ft(1234, 1),
  meter1Voltage: ft(4000, -1),
  meter1Current: ft(10000, -2),
  meter1Power:   ft(40000, 0),
  meter1Energy:  ft(1234, 1),
  meter2Voltage: ft(0, 0),
  meter2Current: ft(0, 0),
  meter2Power:   ft(0, 0),
  meter2Energy:  ft(0, 0),
};

describe('METER_DATA Encoder/Decoder (V2 Lite, 50 B)', () => {
  describe('Frame Structure', () => {
    it('should produce correct frame length (STX+7+50+CRC=60)', () => {
      const frame = encodeMeterData({ sysid: 1, compid: 1, seq: 0, ...sampleDura });
      expect(frame.length).toBe(60);
    });

    it('should have correct STX, LEN, and MSG_ID', () => {
      const frame = encodeMeterData({ sysid: 1, compid: 1, seq: 0, ...sampleDura });
      expect(frame[0]).toBe(0xFC);   // STX (V2 Lite)
      expect(frame[1]).toBe(50);     // LEN = 50
      const msgid = frame[5] | (frame[6] << 8) | (frame[7] << 16);
      expect(msgid).toBe(MAVLINK_MSG_ID_METER_DATA);
    });
  });

  describe('Round-trip Encoding/Decoding', () => {
    it('DURA sample should round-trip', () => {
      const frame = encodeMeterData({ sysid: 1, compid: 1, seq: 0, ...sampleDura });
      const decoded = decodeMeterDataPayload(frame.subarray(8, 8 + 50));
      expect(decoded).toEqual(sampleDura);
    });

    it('MOOEV sample (meter2 zeroed) should round-trip', () => {
      const frame = encodeMeterData({ sysid: 1, compid: 2, seq: 0, ...sampleMooev });
      const decoded = decodeMeterDataPayload(frame.subarray(8, 8 + 50));
      expect(decoded).toEqual(sampleMooev);
    });
  });

  describe('Invalid Payload Length', () => {
    it('should throw on too-short payload', () => {
      expect(() => decodeMeterDataPayload(new Uint8Array(49))).toThrow(
        'Invalid METER_DATA payload length: 49 (expected 50)',
      );
    });

    it('should throw on too-long payload', () => {
      expect(() => decodeMeterDataPayload(new Uint8Array(51))).toThrow(
        'Invalid METER_DATA payload length: 51 (expected 50)',
      );
    });
  });

  describe('FixedT Layout (each at +5 B stride)', () => {
    it('total_power at payload [0..4], total_energy at [5..9]', () => {
      const frame = encodeMeterData({ sysid: 1, compid: 1, seq: 0, ...sampleDura });
      // total_power.value=60000 (0x0000EA60), exp=0
      expect(frame[8 + 0]).toBe(0x60);
      expect(frame[8 + 1]).toBe(0xEA);
      expect(frame[8 + 2]).toBe(0x00);
      expect(frame[8 + 3]).toBe(0x00);
      expect(frame[8 + 4]).toBe(0x00);
    });

    it('meter1 fields at [10..29], meter2 fields at [30..49]', () => {
      const frame = encodeMeterData({ sysid: 1, compid: 1, seq: 0, ...sampleDura });
      // meter1_voltage at offset 10..14, value=4000 (0x0FA0), exp=-1 (0xFF)
      expect(frame[8 + 10]).toBe(0xA0);
      expect(frame[8 + 11]).toBe(0x0F);
      expect(frame[8 + 12]).toBe(0x00);
      expect(frame[8 + 13]).toBe(0x00);
      expect(frame[8 + 14]).toBe(0xFF);

      // meter2_voltage at offset 30..34, value=4000, exp=-1
      expect(frame[8 + 30]).toBe(0xA0);
      expect(frame[8 + 31]).toBe(0x0F);
      expect(frame[8 + 34]).toBe(0xFF);
    });
  });

  describe('fixedToFloat conversion (physical values)', () => {
    it('should compute DURA sample physical values', () => {
      expect(fixedToFloat(sampleDura.meter1Voltage)).toBeCloseTo(400.0, 5);
      expect(fixedToFloat(sampleDura.meter1Current)).toBeCloseTo(100.0, 5);
      expect(fixedToFloat(sampleDura.meter1Power)).toBe(40000);
      expect(fixedToFloat(sampleDura.meter1Energy)).toBe(12340);  // 1234 × 10^1
      expect(fixedToFloat(sampleDura.totalPower)).toBe(60000);
    });

    it('should treat (0,0) sentinel as 0', () => {
      expect(fixedToFloat(sampleMooev.meter2Voltage)).toBe(0);
    });
  });

  describe('Parser Round-trip', () => {
    let parser: MAVLinkParser;
    beforeEach(() => {
      parser = new MAVLinkParser();
    });

    it('should encode → parse → decode successfully', () => {
      const frame = encodeMeterData({ sysid: 1, compid: 1, seq: 17, ...sampleDura });
      const messages = parser.parseBuffer(frame);

      expect(messages.length).toBe(1);
      expect(messages[0].msgid).toBe(MAVLINK_MSG_ID_METER_DATA);
      expect(messages[0].seq).toBe(17);
      expect(messages[0].payload.length).toBe(50);

      const decoded = decodeMeterDataPayload(messages[0].payload);
      expect(decoded).toEqual(sampleDura);
    });
  });
});
