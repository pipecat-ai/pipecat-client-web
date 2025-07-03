/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { BotNotReadyError } from "../rtvi";
import { PipecatClient } from ".";

export function transportReady<T extends PipecatClient>(
  _target: T,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor
): PropertyDescriptor | void {
  const originalMethod = descriptor.value;

  descriptor.value = function (this: T, ...args: unknown[]) {
    if (this.state === "ready") {
      return originalMethod.apply(this, args);
    } else {
      throw new BotNotReadyError(
        `Attempt to call ${propertyKey.toString()} when transport not in ready state. Await connect() first.`
      );
    }
  };

  return descriptor;
}
export function transportInState<T extends PipecatClient>(states: string[]) {
  return function (
    _target: T,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor | void {
    const originalMethod = descriptor.value;

    descriptor.get = function (this: T, ...args: unknown[]) {
      if (states.includes(this.state)) {
        return originalMethod.apply(this, args);
      } else {
        throw new BotNotReadyError(
          `Attempt to call ${propertyKey.toString()} when transport not in ${states}.`
        );
      }
    };

    return descriptor;
  };
}

export function getIfTransportInState<T extends PipecatClient>(
  ...states: string[]
) {
  states = ["ready", ...states];

  return function (
    _target: T,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor | void {
    const originalGetter = descriptor.get;

    descriptor.get = function (this: T) {
      if (states.includes(this.state)) {
        return originalGetter?.apply(this);
      } else {
        throw new BotNotReadyError(
          `Attempt to call ${propertyKey.toString()} when transport not in ${states}. Await connect() first.`
        );
      }
    };

    return descriptor;
  };
}
