/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

class Logger {
  private static instance: Logger;
  private level: LogLevel = LogLevel.DEBUG;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  debug(...args: unknown[]) {
    if (this.level >= LogLevel.DEBUG) {
      console.debug(...args);
    }
  }

  info(...args: unknown[]) {
    if (this.level >= LogLevel.INFO) {
      console.info(...args);
    }
  }

  warn(...args: unknown[]) {
    if (this.level >= LogLevel.WARN) {
      console.warn(...args);
    }
  }

  error(...args: unknown[]) {
    if (this.level >= LogLevel.ERROR) {
      console.error(...args);
    }
  }
}

export const logger = Logger.getInstance();

export type ILogger = Logger;
