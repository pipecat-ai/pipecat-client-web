/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { usePipecatClientAudioElement } from "./usePipecatClientAudioElement";

export const PipecatClientAudio = () => {
  const botAudioRef = usePipecatClientAudioElement();

  return (
    <>
      <audio ref={botAudioRef} autoPlay />
    </>
  );
};
PipecatClientAudio.displayName = "PipecatClientAudio";
