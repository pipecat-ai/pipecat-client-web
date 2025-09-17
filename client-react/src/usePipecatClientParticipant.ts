/**
 * Copyright (c) 2025, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { useAtomValue } from "jotai";

import { participantAtom } from "./PipecatClientParticipantManager";

/**
 * Hook to get individual participant data
 */
export const usePipecatClientParticipant = (participantId: string) => {
  return useAtomValue(participantAtom(participantId));
};
