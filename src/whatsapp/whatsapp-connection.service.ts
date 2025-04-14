// ./src/whatsapp/whatsapp-connection.service.ts

import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  // BaileysEvent, // Not explicitly used here now
  makeInMemoryStore, // Use in-memory store for simple presence tracking
} from 'baileys';
import P from 'pino';
import { Boom } from '@hapi/boom';
import { ConfigService } from '@nestjs/config';
import * as qrcode from 'qrcode-terminal';
import * as fs from 'fs';
import { EventEmitter } from 'events';

// Define constants for backoff strategy
const INITIAL_RECONNECT_DELAY = 5000; // 5 seconds
const MAX_RECONNECT_DELAY = 60000; // 60 seconds
const RECONNECT_FACTOR = 2; // Double the delay each time

// Define constants for connection timeout
const CONNECTION_TIMEOUT_MS = 90000; // 90 seconds (increased from 60)

@Injectable()
export class WhatsappConnectionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WhatsappConnectionService.name);
  private sock: WASocket | null = null;
  private readonly sessionPath: string;
  private isConnecting = false;
  private connectionAttemptTimeout: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null; // Store reconnect timeout handle
  private reconnectAttempts = 0; // Track attempts for backoff
  public readonly eventEmitter = new EventEmitter(); // Keep this!
  private store: ReturnType<typeof makeInMemoryStore> | null = null; // Optional store for presence etc.

  constructor(private readonly configService: ConfigService) {
    this.sessionPath = this.configService.get<string>('whatsapp.sessionPath')!;
    this.ensureSessionDirectory();
  }

  async onModuleInit() {
    this.logger.log('Initializing WhatsApp Connection Service...');
    await this.connectToWhatsApp();
  }

  onModuleDestroy() {
    this.logger.log('Closing WhatsApp connection...');
    this.clearConnectionAttemptTimeout();
    this.clearReconnectTimeout();
    this.isConnecting = false; // Prevent reconnects during shutdown
    this.sock?.ev.removeAllListeners('connection.update'); // Clean up listeners
    this.sock?.end(undefined);
  }

  private ensureSessionDirectory() {
    if (!fs.existsSync(this.sessionPath)) {
      fs.mkdirSync(this.sessionPath);
    }
  }

  getSocket(): WASocket | null {
    return this.sock;
  }

  isConnected(): boolean {
    // Presence in store is a good indicator after initial connection
    // Or check sock.user after initial auth
    return (
      !!this.sock?.user ||
      (!!this.store && Object.keys(this.store.contacts).length > 0)
    );
    // Note: This might briefly show false during reconnects until 'open' fires again.
    // Relying on sock.user might be sufficient after first connect.
  }

  private async connectToWhatsApp() {
    if (this.isConnecting) {
      this.logger.warn('WhatsApp connection attempt already in progress.');
      return;
    }
    this.isConnecting = true;
    this.clearConnectionAttemptTimeout(); // Clear previous timeout if any
    this.clearReconnectTimeout(); // Clear pending reconnect schedule

    this.logger.log(
      `Attempting to connect to WhatsApp (Attempt ${this.reconnectAttempts + 1})...`,
    );

    // Clean up old socket / listeners *before* creating a new one
    if (this.sock) {
      this.logger.debug(
        'Cleaning up previous socket instance before reconnecting.',
      );
      this.eventEmitter.emit('pre-disconnect'); // Emit event for registry service
      try {
        // this.sock.ev.removeAllListeners(); // Remove all listeners from old socket
        await this.sock.logout(); // Try graceful logout
      } catch (e) {
        this.logger.warn(
          'Could not logout from previous socket, forcing close.',
          e,
        );
        this.sock.end(undefined); // Force close if logout fails
      } finally {
        this.sock = null; // Ensure old socket is nullified
      }
    }

    try {
      const { state, saveCreds } = await useMultiFileAuthState(
        this.sessionPath,
      );

      // Optional: Use store for better presence handling etc.
      this.store = makeInMemoryStore({
        logger: prettyLogger.child({ module: 'WAStore' }),
      });

      if (this.sock && this.store) {
        const socket = this.sock as WASocket;
        this.store.bind(socket.ev);
      }

      this.sock = makeWASocket({
        logger: prettyLogger.child({ module: 'WASocket' }),
        printQRInTerminal: false, // We handle QR manually now
        auth: state,
        // syncFullHistory: false, // Consider disabling if not needed
      });

      // Re-bind store events to the new socket instance
      this.store?.bind(this.sock.ev);

      this.setupInternalListeners(this.sock, saveCreds); // Setup listeners for the new socket

      // Timeout for the *current* connection attempt
      this.connectionAttemptTimeout = setTimeout(() => {
        if (!this.isConnected() && this.isConnecting) {
          this.logger.warn(
            `WhatsApp connection attempt ${this.reconnectAttempts + 1} timed out after ${CONNECTION_TIMEOUT_MS / 1000}s.`,
          );
          // Don't schedule reconnect here, the 'close' event triggered by end() should handle it
          this.sock?.end(new Error('Connection Timeout')); // Force close to trigger 'close' event
        }
      }, CONNECTION_TIMEOUT_MS);
    } catch (error) {
      this.logger.error(
        `Error initializing Baileys socket (Attempt ${this.reconnectAttempts + 1})`,
        error,
      );
      this.isConnecting = false; // Reset flag on error
      this.reconnectAttempts++; // Increment *after* failure
      this.scheduleReconnect(); // Schedule a retry
    }
  }

  private setupInternalListeners(
    sock: WASocket,
    saveCreds: () => Promise<void>,
  ) {
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      // Clear connection timeout once an update is received
      this.clearConnectionAttemptTimeout();

      if (qr) {
        this.logger.log('QR code received, scan please! Logging to console:');
        qrcode.generate(qr, { small: true });
        this.eventEmitter.emit('qr', qr); // Emit QR event for potential external use
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect =
          statusCode !== (DisconnectReason.loggedOut as number); // Don't reconnect if logged out

        this.logger.error(
          `Connection closed. Reason: ${DisconnectReason[statusCode] || 'Unknown'} (${statusCode}). Should Reconnect: ${shouldReconnect}`,
          lastDisconnect?.error,
        );

        this.isConnecting = false; // Ensure flag is reset
        this.sock = null; // Clear the socket reference on close
        this.store = null; // Clear the store

        this.eventEmitter.emit('pre-disconnect'); // Ensure this fires on close too
        this.eventEmitter.emit('connection.close', {
          reason: lastDisconnect?.error,
          statusCode: statusCode,
        }); // Emit close event

        if (shouldReconnect) {
          this.reconnectAttempts++; // Increment attempts *after* failure (close)
          this.scheduleReconnect();
        } else {
          this.logger.error(
            'Logged out. Session data needs to be deleted manually.',
          );
          // Optional: Trigger handleLogout only if you want automatic session deletion
          // this.handleLogout();
        }
      } else if (connection === 'open') {
        this.isConnecting = false; // Connection successful
        this.reconnectAttempts = 0; // Reset attempts on successful open
        this.logger.log(
          `WhatsApp connection opened successfully. User: ${sock.user?.id}`,
        );
        this.eventEmitter.emit('connection.open'); // Emit open event
      }
    });

    sock.ev.on('creds.update', saveCreds);
  }

  private scheduleReconnect() {
    if (this.isConnecting || this.reconnectTimeout) {
      this.logger.debug('Reconnect already scheduled or in progress.');
      return; // Don't schedule multiple reconnects
    }

    const delay = Math.min(
      INITIAL_RECONNECT_DELAY *
        Math.pow(RECONNECT_FACTOR, this.reconnectAttempts),
      MAX_RECONNECT_DELAY,
    );

    this.logger.log(
      `Scheduling WhatsApp reconnection attempt ${this.reconnectAttempts + 1} in ${delay / 1000} seconds...`,
    );

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null; // Clear the handle *before* attempting connect
      // connectToWhatsApp() increments attempts on failure internally
      void this.connectToWhatsApp();
    }, delay);
  }

  private clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private handleLogout() {
    // Implement if automatic session deletion on logout is desired
    this.logger.warn('Handling logout: attempting to delete session data.');
    try {
      if (fs.existsSync(this.sessionPath)) {
        fs.rmSync(this.sessionPath, { recursive: true, force: true });
        this.logger.log(
          `Session folder ${this.sessionPath} deleted due to logout. Please restart the application.`,
        );
        process.exit(1); // Exit to force a restart with fresh state
      }
    } catch (e) {
      this.logger.error(
        `Failed to delete session folder ${this.sessionPath} after logout`,
        e,
      );
    }
  }

  clearConnectionAttemptTimeout() {
    // Renamed for clarity
    if (this.connectionAttemptTimeout) {
      clearTimeout(this.connectionAttemptTimeout);
      this.connectionAttemptTimeout = null;
    }
  }
}

// Keep the pino-pretty logger setup
const prettyLogger = P({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      singleLine: false,
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname',
    },
  },
});
