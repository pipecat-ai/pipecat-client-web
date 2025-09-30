/**
 * Copyright (c) 2025, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { useAtomValue } from "jotai";

import { remoteParticipantIdsAtom } from "./PipecatClientParticipantManager";

/**
 * Hook to get all participant IDs
 */
export const usePipecatClientParticipantIds = (
  includeLocal = true,
  includeBot = true
) => {
  const remoteParticipantIds = useAtomValue(remoteParticipantIdsAtom);

  return {
    participantIds: [
      ...(includeLocal ? ["local"] : []),
      ...(includeBot ? ["bot"] : []),
      ...remoteParticipantIds,
    ],
    remoteParticipantIds,
  };
};
