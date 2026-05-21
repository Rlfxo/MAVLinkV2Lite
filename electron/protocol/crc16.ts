/**
 * CRC-16/MODBUS Implementation
 *
 * Polynomial: 0x8005 (reflected: 0xA001)
 * Initial value: 0xFFFF
 * Input reflected: yes
 * Output reflected: yes
 * Final XOR: 0x0000
 * Wire format: 2 bytes little-endian
 *
 * The EVAR MAVLink V2 Lite dialect computes this CRC over the payload bytes
 * only (no header, no per-message extra seed) and appends the result in LE.
 */

/**
 * CRC-16/MODBUS lookup table (256 entries)
 *
 * Precomputed for byte-by-byte streaming. Built at module load with the
 * standard reflected MODBUS recurrence (poly 0xA001).
 */
const CRC16_MODBUS_TABLE: Readonly<Uint16Array> = (() => {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0xA001) : (crc >>> 1);
    }
    table[i] = crc & 0xFFFF;
  }
  return table;
})();

/**
 * Initialize CRC-16/MODBUS accumulator.
 *
 * @returns Initial CRC value (0xFFFF)
 */
export function crc16Init(): number {
  return 0xFFFF;
}

/**
 * Accumulate one byte into a CRC-16/MODBUS checksum.
 *
 * Reflected MODBUS recurrence: `crc = (crc >> 8) ^ TABLE[(crc ^ byte) & 0xFF]`.
 *
 * @param crc - Current CRC accumulator value
 * @param byte - Byte to accumulate (0-255)
 * @returns Updated CRC value
 */
export function crc16Accumulate(crc: number, byte: number): number {
  return ((crc >>> 8) ^ CRC16_MODBUS_TABLE[(crc ^ byte) & 0xFF]) & 0xFFFF;
}

/**
 * Calculate CRC-16/MODBUS over a complete data buffer.
 *
 * Convenience wrapper around the accumulator. Typically called once per
 * frame with `payload` as input.
 *
 * @param data - Data buffer to calculate CRC for
 * @returns 16-bit CRC value
 *
 * @example
 * ```typescript
 * const data = new TextEncoder().encode("123456789");
 * const crc = crc16Calculate(data);  // 0x4B37 (MODBUS standard test vector)
 * ```
 */
export function crc16Calculate(data: Uint8Array): number {
  let crc = crc16Init();
  for (let i = 0; i < data.length; i++) {
    crc = crc16Accumulate(crc, data[i]);
  }
  return crc;
}

/**
 * Verify a buffer of the form `[data..., crc_lo, crc_hi]`.
 *
 * The last 2 bytes are expected to be the little-endian CRC over the
 * preceding bytes.
 *
 * @param buffer - Buffer ending in a 2-byte LE CRC
 * @returns true if CRC matches, false otherwise
 */
export function crc16Verify(buffer: Uint8Array): boolean {
  if (buffer.length < 2) return false;
  const dataLen = buffer.length - 2;
  const calculatedCrc = crc16Calculate(buffer.subarray(0, dataLen));
  const receivedCrc = buffer[dataLen] | (buffer[dataLen + 1] << 8);
  return calculatedCrc === receivedCrc;
}
