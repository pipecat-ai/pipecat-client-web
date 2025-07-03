/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { useContext } from "react";

import { PipecatClientContext } from "./PipecatClientProvider";

export const usePipecatClient = () => {
  const { client } = useContext(PipecatClientContext);
  return client;
};
