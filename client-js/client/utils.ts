import Bowser from "bowser";

import {
  name as packageName,
  version as packageVersion,
} from "../package.json";
import { MediaSupport } from "../rtvi/common_types";
import { AboutClientData, BotCapabilities } from "../rtvi/messages";

interface JSAboutClientData extends AboutClientData {
  platform_details: {
    browser?: string;
    browser_version?: string;
    platform_type?: string;
    engine?: string;
    device_memory?: number;
    language?: string;
    connection?: {
      effectiveType?: string;
      downlink?: number;
    };
  };
}

export function learnAboutClient() {
  let about: JSAboutClientData = {
    library: packageName,
    library_version: packageVersion,
    platform_details: {},
  };
  // This uses legacy browser user agent parsing, which we still fall
  // back to if the User Agent Hints API is not available
  let navAgentInfo = null;
  if (window?.navigator?.userAgent) {
    try {
      navAgentInfo = Bowser.parse(window.navigator.userAgent);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      // void
    }
  }

  if (navAgentInfo?.browser?.name) {
    about.platform_details.browser = navAgentInfo.browser.name;
  }
  if (
    navAgentInfo?.browser?.name === "Safari" &&
    !navAgentInfo.browser.version
  ) {
    about.platform_details.browser_version = "Web View";
  } else if (navAgentInfo?.browser?.version) {
    about.platform_details.browser_version = navAgentInfo.browser.version;
  }

  if (navAgentInfo?.platform?.type) {
    about.platform_details.platform_type = navAgentInfo.platform.type;
  }

  if (navAgentInfo?.engine?.name) {
    about.platform_details.engine = navAgentInfo.engine.name;
  }

  if (navAgentInfo?.os) {
    about.platform = navAgentInfo.os.name;
    about.platform_version = navAgentInfo.os.version;
  }
  return about;
}

export function messageSizeWithinLimit(
  message: unknown,
  maxSize: number
): boolean {
  const getSizeInBytes = (obj: unknown) => {
    const jsonString = JSON.stringify(obj);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(jsonString);
    return bytes.length;
  };
  const size = getSizeInBytes(message);
  return size <= maxSize;
}

/**
 * Combine what a transport and a bot each support into what can flow in the
 * session. A kind of media is `false` if either side rules it out, `true` only
 * if every side is known and supports it, and `undefined` otherwise.
 */
export function combineMediaSupport(
  transport: MediaSupport,
  bot: BotCapabilities | undefined
): MediaSupport {
  const combine = (...values: (boolean | undefined)[]): boolean | undefined => {
    if (values.includes(false)) return false;
    if (values.every((value) => value === true)) return true;
    return undefined;
  };
  return {
    mic: combine(transport.mic, bot?.audio_in),
    cam: combine(transport.cam, bot?.video_in),
    screenShare: combine(transport.screenShare, bot?.video_in, bot?.screen_in),
    botAudio: combine(transport.botAudio, bot?.audio_out),
    botVideo: combine(transport.botVideo, bot?.video_out),
  };
}
