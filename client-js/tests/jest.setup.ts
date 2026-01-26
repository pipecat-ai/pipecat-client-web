/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import "whatwg-fetch";

import { TextDecoder, TextEncoder } from "util";

// Polyfill TextEncoder and TextDecoder for jsdom environment
// @ts-expect-error - Node.js TextEncoder type differs from DOM TextEncoder but is functionally compatible
global.TextEncoder = TextEncoder;
// @ts-expect-error - Node.js TextDecoder type differs from DOM TextDecoder but is functionally compatible
global.TextDecoder = TextDecoder;
