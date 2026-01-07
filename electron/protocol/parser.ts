/**
 * MAVLink V2 Parser
 *
 * State machine-based parser for MAVLink V2 protocol.
 * Processes incoming bytes one at a time and emits complete messages.
 */

import { crc16Init, crc16Accumulate } from './crc16';
import {
  MAVLINK_STX_V2,
  MAVLINK_HEADER_LEN,
  MAVLINK_CHECKSUM_LEN,
  MAVLINK_MAX_PAYLOAD_LEN,
  getCrcExtra
} from './constants';
import {
  MAVLinkMessage,
  ParseState,
  ParserStats
} from './types';

/**
 * MAVLink V2 Parser
 *
 * Implements a byte-by-byte state machine parser for MAVLink V2 frames.
 * Handles CRC validation and maintains parsing statistics.
 *
 * @example
 * ```typescript
 * const parser = new MAVLinkParser();
 *
 * serialPort.on('data', (data: Buffer) => {
 *   for (const byte of data) {
 *     const message = parser.parseByte(byte);
 *     if (message) {
 *       console.log('Received message:', message);
 *     }
 *   }
 * });
 * ```
 */
export class MAVLinkParser {
  // State machine
  private state: ParseState = ParseState.IDLE;

  // Current frame being parsed
  private payloadLen: number = 0;
  private incFlags: number = 0;
  private cmpFlags: number = 0;
  private seq: number = 0;
  private sysid: number = 0;
  private compid: number = 0;
  private msgid: number = 0;
  private payload: Uint8Array = new Uint8Array(MAVLINK_MAX_PAYLOAD_LEN);
  private payloadIndex: number = 0;
  private receivedCrc: number = 0;

  // CRC calculation
  private crc: number = 0;

  // Statistics
  private stats: ParserStats = {
    totalRxCount: 0,
    crcErrorCount: 0,
    parseErrorCount: 0,
  };

  /**
   * Parse a single byte
   *
   * @param byte - Byte to parse (0-255)
   * @returns Complete MAVLinkMessage if frame is complete and valid, null otherwise
   */
  public parseByte(byte: number): MAVLinkMessage | null {
    // Frame resynchronization: Only in early parsing stages (before payload/CRC)
    // If we receive STX in header parsing states, assume a new frame is starting
    // Note: We don't resync during payload or CRC states because 0xFD can appear
    // legitimately in those fields
    if (byte === MAVLINK_STX_V2 && this.state !== ParseState.IDLE) {
      // Only resync in header states (not in payload/CRC states)
      const headerStates = [
        ParseState.GOT_STX,
        ParseState.GOT_LEN,
        ParseState.GOT_INCOMPAT,
        ParseState.GOT_COMPAT,
        ParseState.GOT_SEQ,
        ParseState.GOT_SYSID,
        ParseState.GOT_COMPID,
        ParseState.GOT_MSGID1,
        ParseState.GOT_MSGID2,
      ];

      if (headerStates.includes(this.state)) {
        // Reset and start new frame
        this.reset();
        this.state = ParseState.GOT_STX;
        return null;
      }
    }

    // State machine
    switch (this.state) {
      case ParseState.IDLE:
        if (byte === MAVLINK_STX_V2) {
          this.state = ParseState.GOT_STX;
        }
        break;

      case ParseState.GOT_STX:
        // Payload length
        this.payloadLen = byte;
        if (this.payloadLen > MAVLINK_MAX_PAYLOAD_LEN) {
          // Invalid payload length
          this.stats.parseErrorCount++;
          this.reset();
          break;
        }

        // Start CRC calculation (include LEN)
        this.crc = crc16Init();
        this.crc = crc16Accumulate(this.crc, byte);

        this.state = ParseState.GOT_LEN;
        break;

      case ParseState.GOT_LEN:
        // Incompatibility flags
        this.incFlags = byte;
        this.crc = crc16Accumulate(this.crc, byte);
        this.state = ParseState.GOT_INCOMPAT;
        break;

      case ParseState.GOT_INCOMPAT:
        // Compatibility flags
        this.cmpFlags = byte;
        this.crc = crc16Accumulate(this.crc, byte);
        this.state = ParseState.GOT_COMPAT;
        break;

      case ParseState.GOT_COMPAT:
        // Sequence number
        this.seq = byte;
        this.crc = crc16Accumulate(this.crc, byte);
        this.state = ParseState.GOT_SEQ;
        break;

      case ParseState.GOT_SEQ:
        // System ID
        this.sysid = byte;
        this.crc = crc16Accumulate(this.crc, byte);
        this.state = ParseState.GOT_SYSID;
        break;

      case ParseState.GOT_SYSID:
        // Component ID
        this.compid = byte;
        this.crc = crc16Accumulate(this.crc, byte);
        this.state = ParseState.GOT_COMPID;
        break;

      case ParseState.GOT_COMPID:
        // Message ID byte 1 (low)
        this.msgid = byte;
        this.crc = crc16Accumulate(this.crc, byte);
        this.state = ParseState.GOT_MSGID1;
        break;

      case ParseState.GOT_MSGID1:
        // Message ID byte 2 (mid)
        this.msgid |= byte << 8;
        this.crc = crc16Accumulate(this.crc, byte);
        this.state = ParseState.GOT_MSGID2;
        break;

      case ParseState.GOT_MSGID2:
        // Message ID byte 3 (high)
        this.msgid |= byte << 16;
        this.crc = crc16Accumulate(this.crc, byte);

        // Prepare for payload
        this.payloadIndex = 0;

        if (this.payloadLen === 0) {
          // No payload, go directly to CRC
          this.state = ParseState.GOT_PAYLOAD;
        } else {
          this.state = ParseState.GOT_MSGID3;
        }
        break;

      case ParseState.GOT_MSGID3:
        // Payload bytes
        this.payload[this.payloadIndex++] = byte;
        this.crc = crc16Accumulate(this.crc, byte);

        if (this.payloadIndex >= this.payloadLen) {
          // All payload received
          this.state = ParseState.GOT_PAYLOAD;
        }
        break;

      case ParseState.GOT_PAYLOAD:
        // Accumulate CRC extra before receiving CRC bytes
        const crcExtra = getCrcExtra(this.msgid);
        this.crc = crc16Accumulate(this.crc, crcExtra);

        // CRC byte 1 (low)
        this.receivedCrc = byte;
        this.state = ParseState.GOT_CRC1;
        break;

      case ParseState.GOT_CRC1:
        // CRC byte 2 (high)
        this.receivedCrc |= byte << 8;

        // Validate CRC
        if (this.crc === this.receivedCrc) {
          // CRC valid - emit message
          const message = this.buildMessage();
          this.stats.totalRxCount++;
          this.stats.lastRxTimestamp = Date.now();
          this.reset();
          return message;
        } else {
          // CRC error
          this.stats.crcErrorCount++;
          this.reset();
        }
        break;

      default:
        // Unknown state - reset
        this.stats.parseErrorCount++;
        this.reset();
        break;
    }

    return null;
  }

  /**
   * Parse multiple bytes at once
   *
   * Convenience method to parse a buffer of bytes.
   *
   * @param buffer - Buffer of bytes to parse
   * @returns Array of successfully parsed messages
   */
  public parseBuffer(buffer: Uint8Array): MAVLinkMessage[] {
    const messages: MAVLinkMessage[] = [];

    for (const byte of buffer) {
      const message = this.parseByte(byte);
      if (message) {
        messages.push(message);
      }
    }

    return messages;
  }

  /**
   * Reset parser state
   *
   * Clears the current frame and returns to IDLE state.
   */
  public reset(): void {
    this.state = ParseState.IDLE;
    this.payloadLen = 0;
    this.incFlags = 0;
    this.cmpFlags = 0;
    this.seq = 0;
    this.sysid = 0;
    this.compid = 0;
    this.msgid = 0;
    this.payloadIndex = 0;
    this.receivedCrc = 0;
    this.crc = 0;
  }

  /**
   * Get parsing statistics
   *
   * @returns Current parser statistics
   */
  public getStats(): ParserStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   *
   * Clears all statistics counters.
   */
  public resetStats(): void {
    this.stats = {
      totalRxCount: 0,
      crcErrorCount: 0,
      parseErrorCount: 0,
    };
  }

  /**
   * Build MAVLinkMessage from current state
   *
   * @private
   */
  private buildMessage(): MAVLinkMessage {
    // Copy payload (only the used portion)
    const payload = new Uint8Array(this.payloadLen);
    payload.set(this.payload.subarray(0, this.payloadLen));

    return {
      seq: this.seq,
      sysid: this.sysid,
      compid: this.compid,
      msgid: this.msgid,
      incFlags: this.incFlags,
      cmpFlags: this.cmpFlags,
      payload,
      checksum: this.receivedCrc,
      timestamp: Date.now(),
    };
  }
}
